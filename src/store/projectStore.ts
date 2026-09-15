/**
 * src/store/projectStore.ts
 *
 * The single store for everything project-related. Starts seeded from
 * the local demo data in src/data/project.ts (see the bottom of this
 * file) purely as a safe pre-hydration default — src/components/
 * ProjectHydrator.tsx overwrites it with server-fetched data via
 * hydrate() during the very first client render, before anything else
 * reads the store. If hydration somehow never ran, the app would still
 * show the local demo data rather than an empty one; in practice it
 * always runs, synchronously, so that fallback is never visible.
 *
 * `isDemoData` says which of those two the store is currently holding —
 * DemoDataBadge.tsx reads it to show the corner label, pinAnnotation()
 * reads it to decide whether a new pin is worth even trying to persist,
 * and src/components/RealtimeProvider.tsx reads it to decide whether
 * there's a real backend worth subscribing to at all.
 *
 * Still the one bridge across the Canvas boundary — BuildingModel writes
 * hoveredElementId/selectedElementId from inside the Canvas, any DOM UI
 * (an inspector panel, a comment thread) reads them and the underlying
 * Element/Annotation data from outside it.
 *
 * Also carries the "viewport bridge": the OrbitControls instance (Scene.tsx
 * registers it once mounted) and each interactive mesh's/annotation's live
 * Object3D (BuildingModel.tsx and AnnotationMarker.tsx register one each
 * as they mount). ElementPanel.tsx and ReviewList.tsx read these, entirely
 * from outside the Canvas, to ease the camera onto whatever got selected.
 * These are imperative three.js handles, not UI state — kept in closed-over
 * plain objects rather than store state, so registering one on every
 * mesh/marker mount never triggers a re-render the way calling set() would.
 *
 * Spatial annotation: `mode` is the review/pin toggle ModeIndicator.tsx
 * displays and drives from "C"/Escape, and ElementPanel.tsx's "Pin a
 * comment" button drives via enterPinMode(). `pendingPin` is the
 * point+normal+mesh a click captured while in pin mode, read by
 * AnnotationComposer.tsx to render the composer and, on submit, turned
 * into a real Annotation via pinAnnotation() — see that action's own
 * comment for the full optimistic-write story, which is the reason this
 * store talks to src/lib/queries.ts at all.
 *
 * `hoveredAnnotationId` is the two-way hover bridge between
 * AnnotationMarker.tsx (a 3D ring) and ReviewList.tsx (a DOM row) — either
 * side writes it, both sides read it, so hovering one always highlights
 * the other regardless of which one the pointer is actually over.
 *
 * `mobileTab` is the one piece of layout state ElementPanel.tsx and
 * ReviewList.tsx coordinate on below PIN_BREAKPOINT, where they share a
 * single bottom sheet (SPEC/COMMENTS tabs) rather than stacking two —
 * see ReviewList.tsx's file header for the full mobile layout rationale.
 *
 * `cameraMode` is the ORBIT/WALKTHROUGH toggle CameraModeToggle.tsx
 * displays and drives — orthogonal to `mode` above (review/pin is about
 * what a click *does*; cameraMode is about how the camera itself moves),
 * so the two combine freely: pinning a comment while walking through
 * works exactly like pinning one while orbiting. Scene.tsx reads this to
 * decide which controls (OrbitControls vs WalkthroughControls) are
 * driving the camera this frame; nothing about annotations, review mode,
 * or realtime sync reads it at all.
 *
 * Live multi-reviewer sync (mergeRemoteAnnotation, mergeRemoteReply,
 * remoteToast, presentReviewers, connectionStatus, selfReviewerId) is
 * driven entirely by src/components/RealtimeProvider.tsx from a
 * useEffect — never at module scope or during render, for the same
 * cross-request SSR reason ProjectHydrator.tsx's header explains at
 * length: this store is one Node-process-wide singleton, and Next.js
 * server-renders "use client" components by default.
 *
 * mergeRemoteAnnotation is also this store's dedupe point for a client's
 * own optimistic writes: pinAnnotation always appends the optimistic row
 * (with a client-generated id) to `annotations` before any network call,
 * so by the time that same insert echoes back over realtime, its id is
 * already present — mergeRemoteAnnotation sees `exists === true` and
 * quietly refreshes the row in place instead of appending a duplicate or
 * firing the arrival toast/pulse a second time. Only a genuinely new id
 * (someone else's pin) takes the "append + announce" branch.
 *
 * getElementRevisions reads src/data/project.ts's ELEMENT_REVISIONS —
 * seeded, static field-change history for a handful of elements, not live
 * data threaded through hydrate() like everything else above. There's no
 * write path (no UI edits an Element's status/spec fields today), so
 * there's nothing to hydrate from a live backend yet; see that constant's
 * own comment for why. ElementPanel.tsx's History affordance is the one
 * reader.
 */
import { create } from "zustand";
import type * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { createAnnotation } from "@/lib/queries";
import type { ConnectionStatus, Reviewer } from "@/lib/realtime";
import { ELEMENTS, ANNOTATIONS, ELEMENT_REVISIONS, PROJECT } from "@/data/project";
import type { Annotation, AnnotationReply, Element, ElementRevisionEntry, Project, Vec3 } from "@/types/project";

interface ViewportBridge {
  controls: OrbitControlsImpl | null;
  invalidate: (() => void) | null;
}

export type ProjectMode = "review" | "pin";
export type MobileTab = "spec" | "comments";
export type CameraMode = "orbit" | "walkthrough";

export interface PendingPin {
  position: Vec3;
  normal: Vec3;
  /** The mesh id the pinning click landed on — null in the (currently
   *  theoretical) case of a click that doesn't resolve to a mapped mesh. */
  meshName: string | null;
}

export interface HydrationData {
  project: Project;
  elements: Element[];
  annotations: Annotation[];
  isDemoData: boolean;
}

export interface PinAnnotationInput {
  elementId: string | null;
  position: Vec3;
  normal: Vec3;
  author: string;
  body: string;
}

export interface ToastState {
  message: string;
  onRetry: () => void;
}

/** Just enough to render "New comment from X" — see RemoteCommentToast.tsx. */
export interface RemoteToastState {
  author: string;
}

interface ProjectState {
  // --- Project data ---
  project: Project;
  elements: Element[];
  annotations: Annotation[];
  /** True until src/components/ProjectHydrator.tsx's first-render call to
   *  hydrate() replaces this with server-fetched data — see file header. */
  isDemoData: boolean;
  /** The one call ProjectHydrator.tsx makes, once, on mount. */
  hydrate: (data: HydrationData) => void;

  /**
   * Pins a new annotation. Applies it to local state — and thus renders
   * its marker — synchronously, before any network call is made: pinning
   * a comment has to feel instant, and a 3D marker appearing the instant
   * you click Pin is the whole point. What happens next depends on
   * isDemoData:
   *   - Demo data: there's no real backend to persist to (Supabase was
   *     never reachable this session), so the optimistic row simply *is*
   *     the final one. Attempting a write here would only fail again and
   *     roll back a marker the user has no way to actually save — this
   *     is exactly the "insurance for the day you record the video" case,
   *     and the insurance only works if pinning still behaves like a
   *     real feature in demo mode instead of visibly failing every time.
   *   - Live data: persists via src/lib/queries.ts's createAnnotation,
   *     using the *same* client-generated id the optimistic row already
   *     has (never a swapped-in server id) so a successful save never
   *     remounts the marker. On failure, the optimistic row is removed —
   *     never leave a marker on screen that isn't actually saved — and a
   *     toast offers Retry, which just calls this same action again.
   */
  pinAnnotation: (input: PinAnnotationInput) => Promise<void>;

  // --- Toast (surfaced by pinAnnotation's failure path) ---
  toast: ToastState | null;
  showToast: (message: string, onRetry: () => void) => void;
  dismissToast: () => void;

  // --- Selection (formerly selectionStore) ---
  hoveredElementId: string | null;
  selectedElementId: string | null;
  setHovered: (id: string) => void;
  clearHovered: () => void;
  setSelected: (id: string) => void;
  /** Also resets mobileTab to "spec" — the next panel that opens (from a
   *  fresh mesh click) should always start on its spec, never stranded on
   *  whatever tab a previous, now-closed panel was left on. */
  clearSelected: () => void;

  // --- Spatial annotation: pin mode ---
  mode: ProjectMode;
  pendingPin: PendingPin | null;
  /** Closes any open element panel and arms pin mode for the next click. */
  enterPinMode: () => void;
  /** Back to Review, discarding any captured-but-unsubmitted pin. */
  exitPinMode: () => void;
  togglePinMode: () => void;
  setPendingPin: (pin: PendingPin) => void;
  /** Drops the captured point without leaving pin mode — "wrong spot,
   *  let me click again" rather than "get me out of this entirely". */
  clearPendingPin: () => void;

  // --- Review list: hover bridge, new-row flash, mobile tab ---
  hoveredAnnotationId: string | null;
  setHoveredAnnotation: (id: string) => void;
  clearHoveredAnnotation: () => void;
  /** Set by pinAnnotation *and* mergeRemoteAnnotation; ReviewList.tsx
   *  clears it itself after its flash animation finishes — see that file
   *  for why the timeout lives there. Reused as-is for a remote arrival's
   *  row flash rather than adding a second, parallel "flash this row"
   *  field. */
  recentlyAddedAnnotationId: string | null;
  clearRecentlyAdded: () => void;
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;

  // --- Camera mode: orbit vs walkthrough (see file header) ---
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;

  // --- Selectors ---
  /** The Element whose meshName matches a BuildingModel mesh id, if any. */
  getElementByMeshId: (meshId: string) => Element | undefined;
  /** Every Annotation pinned to a given Element, in no particular order. */
  getAnnotationsForElement: (elementId: string) => Annotation[];
  /** A given Element's seeded field-change history, newest first — keyed
   *  by meshName, not id (see ElementRevisionEntry's own comment for why).
   *  Empty for every element except the handful seeded with one. */
  getElementRevisions: (meshName: string) => ElementRevisionEntry[];

  // --- Viewport bridge (see file header) ---
  registerViewport: (viewport: Partial<ViewportBridge>) => void;
  getViewport: () => ViewportBridge;
  /** Called from BuildingModel's mesh ref callback on mount/unmount. */
  registerElementObject: (meshId: string, object: THREE.Object3D | null) => void;
  getElementObject: (meshId: string) => THREE.Object3D | null;
  /** Called from AnnotationMarker's ref effect on mount/unmount. */
  registerAnnotationObject: (annotationId: string, object: THREE.Object3D | null) => void;
  getAnnotationObject: (annotationId: string) => THREE.Object3D | null;

  // --- Live multi-reviewer sync (see file header) ---
  /** Set only on a genuinely new remote annotation (never on your own
   *  optimistic echo) — the one-shot signal AnnotationMarker.tsx snapshots
   *  at mount to decide whether *this* marker plays its fade-in +
   *  brass-pulse arrival animation. Cleared by that same marker once its
   *  animation finishes, mirroring how recentlyAddedAnnotationId is
   *  cleared by ReviewList rather than by whoever set it. */
  remotelyArrivedAnnotationId: string | null;
  clearRemotelyArrived: () => void;
  /** Merges one annotation from a Postgres Changes payload (insert or
   *  update) into local state. An id already present is treated as this
   *  client's own optimistic write echoing back — updated in place,
   *  silently, with no toast/pulse/flash. An id not yet present is a
   *  genuinely new remote pin — appended, and flagged for the row flash,
   *  the marker's arrival animation, and the corner toast all at once. */
  mergeRemoteAnnotation: (annotation: Annotation) => void;
  /** Merges one reply from a Postgres Changes payload into whichever
   *  annotation it belongs to. annotation_replies carries no project_id
   *  (see src/lib/realtime.ts's header), so every project's reply inserts
   *  reach this action — a reply whose annotation_id isn't in local state
   *  simply matches nothing in the .map below and is silently dropped,
   *  which is this store's client-side stand-in for the server-side
   *  project filter the table doesn't support. Also dedupes a reply this
   *  client authored itself the same way mergeRemoteAnnotation does. */
  mergeRemoteReply: (annotationId: string, reply: AnnotationReply) => void;
  /** The corner "New comment from X" toast — see RemoteCommentToast.tsx,
   *  which owns the auto-dismiss timer itself (the same split Toast.tsx
   *  uses: this store just holds the current message). */
  remoteToast: RemoteToastState | null;
  dismissRemoteToast: () => void;
  /** Every reviewer currently present on the project's realtime channel,
   *  replaced wholesale on each presence sync — see
   *  src/components/ui/PresenceIndicator.tsx. Defaults to `[]`, not
   *  undefined, so that component never needs to null-check it. */
  presentReviewers: Reviewer[];
  setPresentReviewers: (reviewers: Reviewer[]) => void;
  /** This browser tab's own presence id, set once by RealtimeProvider —
   *  lets PresenceIndicator.tsx tell "you" apart from other chips without
   *  threading the Reviewer object itself through the store. */
  selfReviewerId: string | null;
  setSelfReviewer: (id: string) => void;
  /** "connecting" until the channel first subscribes, "connected" while
   *  live, "reconnecting" the moment it drops — see src/lib/realtime.ts's
   *  header for the backoff behind this. Never silently stays
   *  "connected" once a real drop has happened. */
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const viewport: ViewportBridge = { controls: null, invalidate: null };
  const elementObjects: Record<string, THREE.Object3D | null> = {};
  const annotationObjects: Record<string, THREE.Object3D | null> = {};

  return {
    project: PROJECT,
    elements: ELEMENTS,
    annotations: ANNOTATIONS,
    isDemoData: true,
    hydrate: (data) =>
      set({
        project: data.project,
        elements: data.elements,
        annotations: data.annotations,
        isDemoData: data.isDemoData,
      }),

    pinAnnotation: async (input) => {
      const id = crypto.randomUUID();
      const optimistic: Annotation = {
        id,
        elementId: input.elementId,
        position: input.position,
        normal: input.normal,
        author: input.author,
        body: input.body,
        createdAt: new Date().toISOString(),
        status: "Open",
        replies: [],
      };

      set((state) => ({
        annotations: [...state.annotations, optimistic],
        recentlyAddedAnnotationId: id,
      }));

      if (get().isDemoData) {
        return;
      }

      try {
        const saved = await createAnnotation({
          id,
          projectId: get().project.id,
          elementId: input.elementId,
          position: input.position,
          normal: input.normal,
          author: input.author,
          body: input.body,
        });
        // Same id throughout, so this only refreshes server-authoritative
        // fields (createdAt) in place — no marker remounts.
        set((state) => ({
          annotations: state.annotations.map((annotation) => (annotation.id === id ? saved : annotation)),
        }));
      } catch (error) {
        set((state) => ({
          annotations: state.annotations.filter((annotation) => annotation.id !== id),
        }));
        const message = error instanceof Error ? error.message : String(error);
        console.error("pinAnnotation failed:", message);
        get().showToast("Could not save comment — retry", () => {
          get().dismissToast();
          void get().pinAnnotation(input);
        });
      }
    },

    toast: null,
    showToast: (message, onRetry) => set({ toast: { message, onRetry } }),
    dismissToast: () => set({ toast: null }),

    hoveredElementId: null,
    selectedElementId: null,
    setHovered: (id) => set({ hoveredElementId: id }),
    clearHovered: () => set({ hoveredElementId: null }),
    setSelected: (id) => set({ selectedElementId: id }),
    clearSelected: () => set({ selectedElementId: null, mobileTab: "spec" }),

    mode: "review",
    pendingPin: null,
    enterPinMode: () => set({ mode: "pin", selectedElementId: null, pendingPin: null }),
    exitPinMode: () => set({ mode: "review", pendingPin: null }),
    togglePinMode: () =>
      set((state) =>
        state.mode === "pin"
          ? { mode: "review", pendingPin: null }
          : { mode: "pin", selectedElementId: null, pendingPin: null },
      ),
    setPendingPin: (pin) => set({ pendingPin: pin }),
    clearPendingPin: () => set({ pendingPin: null }),

    hoveredAnnotationId: null,
    setHoveredAnnotation: (id) => set({ hoveredAnnotationId: id }),
    clearHoveredAnnotation: () => set({ hoveredAnnotationId: null }),
    recentlyAddedAnnotationId: null,
    clearRecentlyAdded: () => set({ recentlyAddedAnnotationId: null }),
    mobileTab: "spec",
    setMobileTab: (tab) => set({ mobileTab: tab }),

    cameraMode: "orbit",
    setCameraMode: (cameraMode) => set({ cameraMode }),

    getElementByMeshId: (meshId) => get().elements.find((element) => element.meshName === meshId),
    getAnnotationsForElement: (elementId) =>
      get().annotations.filter((annotation) => annotation.elementId === elementId),
    getElementRevisions: (meshName) =>
      ELEMENT_REVISIONS.filter((revision) => revision.meshName === meshName).sort((a, b) =>
        b.changedAt.localeCompare(a.changedAt),
      ),

    registerViewport: (partial) => Object.assign(viewport, partial),
    getViewport: () => viewport,
    registerElementObject: (meshId, object) => {
      elementObjects[meshId] = object;
    },
    getElementObject: (meshId) => elementObjects[meshId] ?? null,
    registerAnnotationObject: (annotationId, object) => {
      annotationObjects[annotationId] = object;
    },
    getAnnotationObject: (annotationId) => annotationObjects[annotationId] ?? null,

    remotelyArrivedAnnotationId: null,
    clearRemotelyArrived: () => set({ remotelyArrivedAnnotationId: null }),
    mergeRemoteAnnotation: (annotation) =>
      set((state) => {
        const exists = state.annotations.some((existing) => existing.id === annotation.id);
        if (exists) {
          return {
            annotations: state.annotations.map((existing) => (existing.id === annotation.id ? annotation : existing)),
          };
        }
        return {
          annotations: [...state.annotations, annotation],
          recentlyAddedAnnotationId: annotation.id,
          remotelyArrivedAnnotationId: annotation.id,
          remoteToast: { author: annotation.author },
        };
      }),
    mergeRemoteReply: (annotationId, reply) =>
      set((state) => ({
        annotations: state.annotations.map((annotation) => {
          if (annotation.id !== annotationId) return annotation;
          if (annotation.replies.some((existing) => existing.id === reply.id)) return annotation;
          return { ...annotation, replies: [...annotation.replies, reply] };
        }),
      })),
    remoteToast: null,
    dismissRemoteToast: () => set({ remoteToast: null }),
    presentReviewers: [],
    setPresentReviewers: (reviewers) => set({ presentReviewers: reviewers }),
    selfReviewerId: null,
    setSelfReviewer: (id) => set({ selfReviewerId: id }),
    connectionStatus: "connecting",
    setConnectionStatus: (status) => set({ connectionStatus: status }),
  };
});
