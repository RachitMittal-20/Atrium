/**
 * src/lib/customRealtime.ts
 *
 * The custom-model session's own realtime layer — src/lib/realtime.ts's
 * sibling, not an extension of it. That file is Postgres Changes +
 * Presence over a project's real annotations/annotation_replies/
 * element_color_overrides tables; a custom-model session has none of
 * those rows to change, so there is nothing for Postgres Changes to
 * stream. What it has instead is Supabase Realtime's other primitive:
 * Broadcast — an ephemeral, no-table-behind-it channel two tabs can send
 * arbitrary payloads over, plus the same Presence feature realtime.ts
 * already uses (Presence isn't Postgres-backed either; both files use it
 * identically). Verified this project's Supabase setup actually supports
 * broadcast+presence with zero schema changes before writing any of
 * this — two real client connections, one sending a broadcast the other
 * received, both showing up in each other's presence state.
 *
 * One channel per session, topic `custom-session:<sessionId>` — the same
 * "everyone on the exact same topic string is one room" rule realtime.ts's
 * own `project:${projectId}` topic follows, just keyed by the session id
 * a shareable /project?session=<id> URL carries instead of a real
 * project's database id (there is no database id here at all — see
 * projectStore.ts's own customSessionId comment).
 *
 * What syncs, deliberately scoped to what was actually asked for this
 * round: presence (who else has this session open) and pin placement
 * (which already carries comment body + author — a CustomAnnotation has
 * no separate "add a reply" concept the way a curated Annotation does, so
 * one broadcast event covers both "a pin was placed" and "here's its
 * comment"). toggleCustomAnnotationStatus is NOT broadcast — out of
 * scope, a status flip staying local-only is an accepted, documented gap,
 * not an oversight.
 *
 * Broadcast alone only ever reaches tabs that are *already* connected
 * when it fires — it has no memory, so a tab that joins after several
 * pins have already been placed would otherwise see presence and every
 * *future* pin, but nothing placed before it arrived. request_state/
 * state_response below is the fix: every tab sends request_state right
 * after subscribing, and every already-connected peer answers with its
 * own full customAnnotations list — no database, no persistence, just
 * asking whoever's already in the room. This was flagged up front as the
 * part most likely to silently not work with a pure broadcast approach,
 * so it gets its own explicit two-tab verification (a second tab joining
 * *after* pins already exist) rather than being assumed to fall out of
 * the pin-sync wiring above.
 *
 * activeChannel is deliberately module-level mutable state, not something
 * threaded through React props — the exact same shape projectStore.ts's
 * own registerAnnotationObject/getAnnotationObject registry already uses
 * for "a live handle a React effect owns, that some other, unrelated part
 * of the tree needs to reach without prop-drilling it down." UploadedAnnotationComposer.tsx
 * (arms a pin) has no reason to know CustomRealtimeProvider.tsx even
 * exists; it just calls broadcastCustomAnnotation and this module either
 * has a channel to send it over or doesn't.
 *
 * Reconnection/backoff logic below is copied in spirit from
 * subscribeToProject, not the code itself — the StrictMode-double-invoke
 * race that comment documents at length applies identically here (same
 * SDK, same channel lifecycle), so the same "await any stale
 * registration's teardown before creating a new channel on this topic"
 * and "ignore a CLOSED re-fire from a channel that isn't the current one
 * any more" guards are both reproduced here rather than skipped as
 * "probably fine for a smaller feature."
 */
import { supabase } from "@/lib/supabase";
import type { CustomAnnotation } from "@/store/projectStore";
import type { ConnectionStatus, Reviewer } from "@/lib/realtime";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type RealtimeChannel = ReturnType<SupabaseClient<Database>["channel"]>;

export interface CustomSessionHandlers {
  /** A pin (with its comment body/author already attached) broadcast by
   *  some other tab on this session. */
  onAnnotationBroadcast: (annotation: CustomAnnotation) => void;
  onPresenceSync: (reviewers: Reviewer[]) => void;
  onStatusChange: (status: ConnectionStatus) => void;
  /** Broadcast alone doesn't replay history to a late joiner — this is
   *  the other half of that handshake. Called whenever *some other* tab
   *  just asked "what's already here" (request_state, below); returns
   *  this tab's own current customAnnotations so subscribeToCustomSession
   *  can send them back. A plain synchronous getter, not an event this
   *  module reads the store for directly — same "handlers own store
   *  access, this module stays store-agnostic" split realtime.ts already
   *  follows for every one of its own handlers. */
  onStateRequested: () => CustomAnnotation[];
  /** Called once per peer that responds to this tab's own request_state
   *  — may fire more than once (every already-connected peer answers),
   *  each with that peer's own full list. CustomRealtimeProvider.tsx
   *  merges each one through mergeRemoteCustomAnnotation, which
   *  deduplicates by id, so answering twice (or a hundred pins arriving
   *  in two different peers' replies) is exactly as safe as answering
   *  once. */
  onStateReceived: (annotations: CustomAnnotation[]) => void;
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;

// The one channel this tab currently has open for a custom-model session,
// if any — set by subscribeToCustomSession's own connect(), read by
// broadcastCustomAnnotation. Never more than one at a time: a custom
// model session is 1:1 with the currently-active customModelUrl, and
// CUSTOM_MODEL_RESET already tears down everything else scoped to it on
// every model switch.
let activeChannel: RealtimeChannel | null = null;

/**
 * Sends a just-placed pin to every other tab on this session's channel.
 * A silent no-op if no channel is currently open — either Supabase isn't
 * configured, or this session never reached Storage in the first place
 * (customSessionId null; see projectStore.ts), both of which mean there's
 * no one else who could possibly be listening anyway.
 */
export function broadcastCustomAnnotation(annotation: CustomAnnotation): void {
  void activeChannel?.send({ type: "broadcast", event: "pin", payload: annotation });
}

/**
 * Opens (and, on drop, reopens) the one broadcast+presence channel for a
 * custom-model session. Returns a cleanup function —
 * CustomRealtimeProvider.tsx calls it from its effect's own cleanup, the
 * same shape RealtimeProvider.tsx already follows for subscribeToProject.
 */
export function subscribeToCustomSession(
  sessionId: string,
  self: Reviewer,
  handlers: CustomSessionHandlers,
): () => void {
  const client = supabase;
  if (!client) {
    return () => {};
  }

  const topic = `custom-session:${sessionId}`;

  let stopped = false;
  let retryDelay = INITIAL_RETRY_MS;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let channel: RealtimeChannel | null = null;

  const teardownChannel = () => {
    const toRemove = channel;
    channel = null;
    if (channel === activeChannel) activeChannel = null;
    if (toRemove) {
      if (toRemove === activeChannel) activeChannel = null;
      void client.removeChannel(toRemove);
    }
  };

  const scheduleReconnect = () => {
    if (stopped) return;
    teardownChannel();
    handlers.onStatusChange("reconnecting");
    retryTimeout = setTimeout(() => {
      retryTimeout = null;
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
      void connect();
    }, retryDelay);
  };

  async function connect() {
    if (stopped) return;

    const stale = client!.getChannels().find((candidate) => candidate.topic === `realtime:${topic}`);
    if (stale) {
      await client!.removeChannel(stale);
    }
    if (stopped) return;

    const nextChannel: RealtimeChannel = client!.channel(topic, {
      config: { presence: { key: self.id } },
    });
    channel = nextChannel;

    nextChannel
      .on<CustomAnnotation>("broadcast", { event: "pin" }, (message) => {
        handlers.onAnnotationBroadcast(message.payload as CustomAnnotation);
      })
      // A joining tab sends this once, right after subscribing (below) —
      // every *other* tab already on the channel answers with whatever
      // it's got. Broadcast doesn't echo a sender's own messages back to
      // itself by default (verified directly against this project's own
      // Supabase instance, not assumed from the SDK's docs), so this
      // never fires for the tab that sent request_state in the first
      // place — no self-filtering needed here.
      .on("broadcast", { event: "request_state" }, () => {
        const annotations = handlers.onStateRequested();
        // Only answer if there's actually something to report — a
        // channel with nobody's pins yet would otherwise have every
        // already-connected tab broadcast an empty array back at a new
        // joiner for no reason.
        if (annotations.length > 0) {
          void nextChannel.send({ type: "broadcast", event: "state_response", payload: { annotations } });
        }
      })
      .on<{ annotations: CustomAnnotation[] }>("broadcast", { event: "state_response" }, (message) => {
        handlers.onStateReceived(message.payload.annotations);
      })
      .on("presence", { event: "sync" }, () => {
        const state = nextChannel.presenceState<Reviewer>();
        const reviewers = Object.values(state)
          .map((entries) => entries[0])
          .filter(Boolean) as Reviewer[];
        handlers.onPresenceSync(reviewers);
      })
      .subscribe((status) => {
        if (stopped) return;
        if (channel !== nextChannel) return;
        if (status === "SUBSCRIBED") {
          retryDelay = INITIAL_RETRY_MS;
          activeChannel = nextChannel;
          handlers.onStatusChange("connected");
          void nextChannel.track(self);
          // Ask whoever's already here for their current pins — see
          // request_state's own .on() handler above for the reply side.
          void nextChannel.send({ type: "broadcast", event: "request_state" });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleReconnect();
        }
      });
  }

  handlers.onStatusChange("connecting");
  void connect();

  return () => {
    stopped = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    teardownChannel();
  };
}
