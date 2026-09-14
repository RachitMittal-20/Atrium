/**
 * src/lib/realtime.ts
 *
 * The live multi-reviewer sync layer: one Supabase Realtime channel per
 * project, combining Postgres Changes (new annotations, new replies) with
 * Presence (who else is currently looking at this project). This is a
 * plain module, not a component — src/components/RealtimeProvider.tsx is
 * the one caller, from inside a useEffect, so every rule that file's own
 * header explains about client-only, per-session, post-mount state
 * applies to everything this module does too.
 *
 * Imports supabase directly, alongside src/lib/queries.ts — see that
 * file's header for why there are now two direct importers instead of
 * one. mapAnnotation/mapReply are reused from queries.ts rather than
 * duplicated, so a row arriving over the wire is shaped identically to
 * one loaded by getAnnotations on first paint.
 *
 * Typing note: @supabase/supabase-js's public export surface doesn't
 * re-export RealtimeChannel/RealtimePostgresChangesPayload — those types
 * live only in @supabase/realtime-js, a transitive dependency this
 * project's pnpm lockfile doesn't allow importing from directly (phantom
 * dependency). Every type below is instead derived off the already-
 * available SupabaseClient<Database> type via ReturnType, which needs no
 * such import and stays correct automatically if the installed
 * supabase-js version ever changes its channel API.
 *
 * Reconnection: subscribe() below is handed a status callback (SUBSCRIBED
 * / CHANNEL_ERROR / TIMED_OUT / CLOSED). Anything other than SUBSCRIBED
 * reports "reconnecting" to the caller and schedules a fresh connect()
 * after an exponential backoff (capped at 15s), starting the delay back
 * at 1s the next time a connection actually succeeds. There is no
 * "pretend it's fine" state — see src/components/ui/PresenceIndicator.tsx,
 * which renders exactly this status rather than a static "Live" label.
 */
import { supabase } from "@/lib/supabase";
import { mapAnnotation, mapReply, type AnnotationRow, type AnnotationReplyRow } from "@/lib/queries";
import type { Annotation, AnnotationReply } from "@/types/project";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type RealtimeChannel = ReturnType<SupabaseClient<Database>["channel"]>;

/** A connected reviewer's presence identity — tracked on the channel under
 *  its own `id` as the presence key, and read back the same shape by every
 *  other client's presenceState(). A plain type alias, not an interface:
 *  channel.on/presenceState's generics require their type argument satisfy
 *  `{ [key: string]: any }`, which only a type alias gets an implicit
 *  index signature for. */
export type Reviewer = {
  id: string;
  name: string;
  color: string;
};

export type ConnectionStatus = "connecting" | "connected" | "reconnecting";

export interface RealtimeHandlers {
  /** A brand-new annotation, from an INSERT this client didn't make itself. */
  onAnnotationInsert: (annotation: Annotation) => void;
  /** A brand-new reply on some annotation_id — may or may not be one this
   *  client currently has loaded; projectStore's mergeRemoteReply is what
   *  actually filters that, not this module (see that action's header). */
  onReplyInsert: (annotationId: string, reply: AnnotationReply) => void;
  /** The full set of currently-present reviewers, replacing whatever the
   *  caller was previously showing — called on every presence sync, which
   *  is Supabase's own debounced "join+leave settled" event, not a raw
   *  join/leave stream. */
  onPresenceSync: (reviewers: Reviewer[]) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

// Short, mono-friendly call signs — this app's interface type is IBM Plex
// Mono uppercase-tracked, so these read like radio call signs rather than
// full names, and collisions (two reviewers drawing the same one) are
// fine: the presence chip's colour plus its tooltip still disambiguates.
const REVIEWER_NAMES = ["ASH", "REI", "NOA", "LIN", "KAI", "ODA", "TAM", "IVO", "ZEN", "RIO"];

// Reuses the app's existing three accent colours (see globals.css) rather
// than inventing new hues just for presence chips — "a small palette" that
// stays inside the one-accent-family visual language the rest of the app
// already committed to.
const REVIEWER_COLORS = ["#d4a24c", "#8dae84", "#c97b52"];

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** A fresh, randomly-assigned reviewer identity — called once per browser
 *  tab, from RealtimeProvider's useState lazy initializer, so a reload
 *  gets a new name/colour rather than a persisted one (there's no login,
 *  so there's no real identity to persist anyway). */
export function generateReviewer(): Reviewer {
  return {
    id: crypto.randomUUID(),
    name: pickRandom(REVIEWER_NAMES),
    color: pickRandom(REVIEWER_COLORS),
  };
}

const INITIAL_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;

/**
 * Opens (and, on drop, reopens) the one realtime channel for a project:
 * Postgres Changes on annotations/annotation_replies plus this client's
 * own presence. Returns a cleanup function that tears everything down —
 * RealtimeProvider calls it from its effect's own cleanup.
 *
 * annotation_replies has no project_id column to filter on server-side,
 * so every reply insert for every project reaches every subscribed
 * client; onReplyInsert is handed the raw row regardless, and it's left
 * to the caller (projectStore's mergeRemoteReply) to silently no-op when
 * the annotation_id isn't one it currently has loaded — see that action's
 * own comment. That's an acceptable filter point for a single-project app
 * like this one; a multi-project deployment would need a real column.
 */
export function subscribeToProject(projectId: string, self: Reviewer, handlers: RealtimeHandlers): () => void {
  const client = supabase;
  if (!client) {
    // RealtimeProvider only calls this when isDemoData is false, which
    // implies a working client — this guard is just defense against that
    // invariant ever slipping, not an expected path.
    return () => {};
  }

  // One fixed topic for the whole project, not a unique one per attempt —
  // Presence is scoped per topic (everyone on the same topic is one
  // "room"; different topics never see each other's presence), so every
  // reviewer's tab has to land on the exact same topic string for
  // PresenceIndicator.tsx to ever show more than one chip.
  const topic = `project:${projectId}`;

  let stopped = false;
  let retryDelay = INITIAL_RETRY_MS;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let channel: RealtimeChannel | null = null;

  const teardownChannel = () => {
    if (channel) {
      void client.removeChannel(channel);
      channel = null;
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

    // client.channel(topic) hands back an *existing* channel object,
    // already subscribed, if one registered under this exact topic is
    // still on the client (see RealtimeClient.channel()'s own doc
    // comment) — and client.removeChannel() is async (it awaits the
    // channel's own unsubscribe handshake before deregistering it). Two
    // connect() calls close enough together — React's dev-mode
    // StrictMode double-invoking this effect (mount, cleanup, mount) is
    // exactly that — can otherwise land the second one on the *first*
    // attempt's already-subscribed channel, and calling .on() on an
    // already-subscribed channel throws. Explicitly waiting for any such
    // stale registration to finish tearing down first, before ever
    // calling client.channel() again, makes that race impossible instead
    // of just unlikely.
    const stale = client!.getChannels().find((candidate) => candidate.topic === `realtime:${topic}`);
    if (stale) {
      await client!.removeChannel(stale);
    }
    if (stopped) return;

    const nextChannel: RealtimeChannel = client!.channel(topic, {
      config: { presence: { key: self.id } },
    });

    nextChannel
      .on<AnnotationRow>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "annotations", filter: `project_id=eq.${projectId}` },
        (payload) => handlers.onAnnotationInsert(mapAnnotation(payload.new, [])),
      )
      .on<AnnotationReplyRow>(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "annotation_replies" },
        (payload) => handlers.onReplyInsert(payload.new.annotation_id, mapReply(payload.new)),
      )
      .on("presence", { event: "sync" }, () => {
        const state = nextChannel.presenceState<Reviewer>();
        // Each key's array holds one Presence<Reviewer> per still-open tab
        // tracking under that key (presence_ref plus the tracked Reviewer
        // fields) — this app only ever tracks once per tab, so entries[0]
        // is always the whole story; Presence<Reviewer>'s extra
        // presence_ref field is structurally fine where Reviewer is used.
        const reviewers = Object.values(state)
          .map((entries) => entries[0])
          .filter(Boolean) as Reviewer[];
        handlers.onPresenceSync(reviewers);
      })
      .subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") {
          retryDelay = INITIAL_RETRY_MS;
          handlers.onStatusChange("connected");
          void nextChannel.track(self);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          scheduleReconnect();
        }
      });

    channel = nextChannel;
  }

  handlers.onStatusChange("connecting");
  void connect();

  return () => {
    stopped = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    teardownChannel();
  };
}
