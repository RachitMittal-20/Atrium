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
 * DemoDataBadge.tsx reads it to show the corner label, pinAnnotation()/
 * setElementColor()/clearElementColor() read it to decide whether a
 * write is worth even trying to persist, and src/components/
 * RealtimeProvider.tsx reads it to decide whether there's a real backend
 * worth subscribing to at all.
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
 * `cameraMode` is the ORBIT/WALKTHROUGH/PANORAMA/TOUR toggle
 * CameraModeToggle.tsx displays and drives — orthogonal to `mode` above
 * (review/pin is about what a click *does*; cameraMode is about how the
 * camera itself moves), so the two combine freely: pinning a comment
 * while walking through or looking around in panorama works exactly like
 * pinning one while orbiting. Scene.tsx reads this to decide which
 * controls (OrbitControls, WalkthroughControls, PanoramaControls or
 * TourControls) are driving the camera this frame; nothing about
 * annotations, review mode, or realtime sync reads it at all. Nothing
 * branches on it exhaustively either — every reader asks "is it orbit?"
 * or "is it <one mode>?" — so adding a mode needs no store changes
 * beyond the union below (tour needed two more fields regardless —
 * tourIndex and its actions — but that's tour-specific state, not
 * cameraMode plumbing).
 *
 * `tourIndex`/tourNext/tourPrev/tourGoTo are TOUR mode's own state: which
 * position in `elements` — in whatever order that array currently holds,
 * never re-sorted or grouped by this store — the guided walkthrough is
 * currently framing. TourControls.tsx (inside the Canvas) reads
 * tourIndex to know which element to ease the camera onto and calls
 * tourNext/tourPrev from wheel/swipe input; TourHud.tsx (outside it)
 * reads the same index for its progress readout and calls the same
 * three actions from its Prev/Next buttons — one source of truth for
 * "which element" on both sides of the Canvas boundary, the same
 * pattern every other piece of cross-boundary state in this store
 * already follows. Clamped at both ends, not wrapped: tourNext/tourPrev
 * stop at the first/last element rather than cycling past it, so
 * TourHud's buttons can disable at the boundary (a wrapping tour reads
 * as "did that button just do nothing?" the moment it silently loops).
 * Scene.tsx's Model() resets this to 0 itself, in the same
 * pose-ownership effect described below, every time cameraMode *enters*
 * tour from anything else — so re-entering tour always restarts the walk
 * from the beginning, a deliberate demo-friendliness choice (a presenter
 * re-clicking Tour mid-demo gets a predictable fresh run, not wherever
 * the tour happened to be left).
 *
 * A note on ordering, since it matters for what tour actually shows:
 * `elements` is whatever hydrate() last set it to (see below) — for the
 * local demo data that's src/data/project.ts's ELEMENTS constant, in its
 * curated, architecturally-grouped array order (envelope, architecture,
 * kitchen, furniture, lighting, fixtures); for a live Supabase project
 * it's src/lib/queries.ts's getElements() result, which orders by
 * `name` alphabetically instead. Tour never reorders or groups either
 * one itself — "step through `elements` in whatever order it's already
 * in" is the entire ordering logic — so which experience a demo actually
 * gets depends on which data source is loaded at the time.
 *
 * `hiddenElementIds` is element visibility: the meshNames currently
 * hidden from the 3D scene. Unlike the viewport bridge above this *is*
 * tracked state, deliberately — hiding something has to re-render both
 * sides of the Canvas boundary (BuildingModel.tsx flips that mesh's
 * `visible` and disables its raycast; VisibilityToolbar.tsx and
 * ElementPanel.tsx re-render their chips/buttons), which is exactly what
 * set() is for. It stores what's *hidden*, not what's visible, so the
 * empty default means "everything shown", resetVisibility() is just
 * "empty it", and any element that only appears after hydrate() is
 * visible without anyone having to add it. Category visibility is never
 * stored separately — it's always derived from this one set (a category
 * is "hidden" when every element in it is), so a category chip and a
 * per-element hide can never disagree about the same mesh. Purely
 * client-side for now: nothing here is persisted or synced over realtime.
 *
 * `elementColors` is element recoloring — a Map from meshName to the hex
 * color currently applied, read by BuildingModel.tsx to tint that mesh's
 * cloned material (see that file's own comment on why cloning per mesh
 * makes this safe). Keyed by meshName rather than Element.id, unlike the
 * database table backing it (see ElementColorOverride's own comment in
 * src/types/project.ts) — that's purely for BuildingModel's convenience,
 * since a mesh only ever knows its own id, not the Element row it maps
 * to; setElementColor/clearElementColor and the mergeRemote* actions
 * below all do the meshName<->elementId conversion via `elements`
 * internally, so nothing outside this store ever has to. Unlike
 * hiddenElementIds, this genuinely does persist and sync: setElementColor/
 * clearElementColor follow the *exact* optimistic-write-then-reconcile
 * shape pinAnnotation does (apply locally first, persist after, roll back
 * and offer Retry on failure — see setElementColor's own comment for the
 * one place that shape has to differ, and why). The realtime echo those
 * writes eventually receive back needs no annotations-style exists-dedupe
 * guard the way mergeRemoteAnnotation does: a Map is naturally idempotent
 * under a repeated set() to the same key/value, where mergeRemoteAnnotation
 * dedupes specifically to stop an *array* from growing a duplicate entry —
 * see mergeRemoteColorOverride's own comment for why copying that guard
 * here would just be dead code.
 *
 * Live multi-reviewer sync (mergeRemoteAnnotation, mergeRemoteReply,
 * mergeRemoteColorOverride, mergeRemoteColorOverrideRemoved, remoteToast,
 * presentReviewers, connectionStatus, selfReviewerId) is driven entirely
 * by src/components/RealtimeProvider.tsx from a useEffect — never at
 * module scope or during render, for the same cross-request SSR reason
 * ProjectHydrator.tsx's header explains at length: this store is one
 * Node-process-wide singleton, and Next.js server-renders "use client"
 * components by default.
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
import type { ConnectionStatus, Reviewer } from "@/lib/realtime";
import { ELEMENTS, ANNOTATIONS, ELEMENT_REVISIONS, PROJECT } from "@/data/project";
import type {
  Annotation,
  AnnotationReply,
  Element,
  ElementCategory,
  ElementColorOverride,
  ElementRevisionEntry,
  Project,
  Vec3,
} from "@/types/project";

interface ViewportBridge {
  controls: OrbitControlsImpl | null;
  invalidate: (() => void) | null;
}

export type ProjectMode = "review" | "pin";
export type MobileTab = "spec" | "comments";
/** "panorama" = fixed-point look-around, no translation — see
 *  src/components/three/PanoramaControls.tsx. "tour" = an automatic
 *  guided walkthrough that eases through `elements` one at a time — see
 *  src/components/three/TourControls.tsx and this file's own header for
 *  tourIndex and its actions. */
export type CameraMode = "orbit" | "walkthrough" | "panorama" | "tour";

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
  /** Every element color override currently set on the project — see
   *  buildColorMap below for how this seeds elementColors. The local
   *  demo data (src/data/project.ts) has no equivalent seed constant, so
   *  the fallback path in src/app/project/page.tsx always passes `[]`
   *  here, the same "nothing recolored yet" state a real, freshly-seeded
   *  project would also start from. */
  colorOverrides: ElementColorOverride[];
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

  // --- Toast (surfaced by pinAnnotation's/setElementColor's/
  // clearElementColor's failure paths) ---
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

  // --- Element visibility (see file header) ---
  /** meshNames currently hidden from the scene. Always replaced with a new
   *  Set on change, never mutated in place — zustand only notices a new
   *  reference, so an in-place .add() would never re-render anything. */
  hiddenElementIds: ReadonlySet<string>;
  /** Hides one element if it's showing, shows it if it's hidden — the
   *  Hide/Show button in ElementPanel.tsx. */
  toggleElementVisibility: (meshName: string) => void;
  /** If *any* element in the category is still showing, hides all of
   *  them; only once every one is already hidden does it show them all
   *  again. So a category with one element hidden individually still
   *  reads as "on" (its chip in VisibilityToolbar.tsx stays lit), and one
   *  click takes the rest of it away rather than first un-hiding the one. */
  toggleCategoryVisibility: (category: ElementCategory) => void;
  /** Shows everything again — VisibilityToolbar.tsx's Reset. */
  resetVisibility: () => void;

  // --- Element color overrides (see file header) ---
  /** meshName -> hex color currently applied. A key's absence means "use
   *  the model's original material color" — same "absence, not a null/
   *  sentinel value, is what original means" convention the database
   *  table backing this uses (see ElementColorOverride's own comment).
   *  Always replaced with a new Map on change, same reference-identity
   *  reasoning as hiddenElementIds above. */
  elementColors: ReadonlyMap<string, string>;
  /**
   * Sets (or replaces) one element's color. Applies it to local state
   * synchronously first — the same "feels instant" reasoning
   * pinAnnotation's own comment gives — then, unless this is demo data,
   * persists it via src/lib/queries.ts's setColorOverride. On failure the
   * map entry is rolled back to whatever it held immediately before this
   * call (captured up front as `previous`), not simply deleted the way
   * pinAnnotation's own rollback deletes its optimistic row outright —
   * pinAnnotation's optimistic write is always a brand-new row with
   * nothing to restore to, where this one can just as easily be *replacing*
   * an already-successfully-set color, and rolling back to "no override at
   * all" would be wrong if one was already there. A toast then offers
   * Retry, which calls this same action again — identical shape to
   * pinAnnotation's own failure path otherwise.
   */
  setElementColor: (meshName: string, color: string) => Promise<void>;
  /**
   * Clears one element's color override — "reset to original." Same
   * optimistic-then-persist-then-roll-back-on-failure shape as
   * setElementColor, with `previous` always defined here (there being
   * nothing to clear when it isn't is handled by the early return below,
   * before any state changes).
   */
  clearElementColor: (meshName: string) => Promise<void>;

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

  // --- Camera mode: orbit / walkthrough / panorama / tour (see file header) ---
  cameraMode: CameraMode;
  setCameraMode: (mode: CameraMode) => void;

  // --- Tour mode: position in `elements` (see file header) ---
  tourIndex: number;
  /** Advances one element, clamped at `elements.length - 1` — a no-op
   *  once already there (see TourHud.tsx, which disables its Next
   *  button at exactly this boundary rather than relying on this being
   *  silently harmless, though it is). */
  tourNext: () => void;
  /** Steps back one element, clamped at 0 — same shape as tourNext. */
  tourPrev: () => void;
  /** Jumps straight to an index, clamped into range. Scene.tsx's Model()
   *  calls this with 0 on every orbit/walkthrough/panorama -> tour
   *  transition; nothing else calls it with anything but 0 today, but
   *  it's the general primitive tourNext/tourPrev are both built from
   *  rather than three independent clamping implementations. */
  tourGoTo: (index: number) => void;

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
  /** Merges one element_color_overrides INSERT/UPDATE from a Postgres
   *  Changes payload — src/lib/realtime.ts's onColorOverrideUpsert,
   *  called for both events identically (see that module's own comment
   *  on why they need no separate handling). Resolves the row's
   *  element_id to a meshName via `elements` and no-ops if none matches
   *  (an override for an element this client hasn't loaded — the same
   *  posture mergeRemoteReply takes for an unmatched annotation_id).
   *  Unlike mergeRemoteAnnotation, there is no exists-dedupe check here:
   *  this client's own optimistic write echoing back through Realtime
   *  just calls Map.set() with the same key and value again, which is
   *  already a no-op in every way that matters (no duplicate entry is
   *  possible in a Map the way one is in an array, and there's no flash/
   *  toast/animation tied to a color change for a dedupe to protect). */
  mergeRemoteColorOverride: (elementId: string, color: string) => void;
  /** Merges one element_color_overrides DELETE — "someone reset this
   *  element's color." Same element_id -> meshName resolution and
   *  same-element no-op posture as mergeRemoteColorOverride above. */
  mergeRemoteColorOverrideRemoved: (elementId: string) => void;
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

/**
 * The state patch every visibility change applies: the new hidden set,
 * plus clearing hoveredElementId if the hovered mesh just disappeared.
 * A hidden mesh can no longer be hit (BuildingModel.tsx disables its
 * raycast), so r3f would never deliver the pointerout that normally
 * clears hover — without this, the hover label could be left pointing at
 * something that's no longer on screen. Shared by both toggle actions
 * below; resetVisibility doesn't need it, since showing things can never
 * strand a hover.
 */
function applyHidden(
  hidden: Set<string>,
  hoveredElementId: string | null,
): Pick<ProjectState, "hiddenElementIds" | "hoveredElementId"> {
  return {
    hiddenElementIds: hidden,
    hoveredElementId: hoveredElementId !== null && hidden.has(hoveredElementId) ? null : hoveredElementId,
  };
}

/**
 * Builds the meshName -> color map hydrate() seeds elementColors with,
 * from a HydrationData's elementId-keyed colorOverrides array — the one
 * place that elementId -> meshName conversion happens for the *initial*
 * load; every write path (setElementColor, clearElementColor, the two
 * mergeRemoteColorOverride* actions) does the same conversion itself,
 * inline, against whatever `elements` currently holds. An override whose
 * elementId matches nothing in `elements` (a stale row referencing an
 * element this project no longer has) is silently skipped, the same
 * no-op posture every other remote-data-meets-local-state mismatch in
 * this store already takes.
 */
function buildColorMap(elements: Element[], colorOverrides: ElementColorOverride[]): Map<string, string> {
  const elementById = new Map(elements.map((element) => [element.id, element]));
  const colors = new Map<string, string>();
  for (const override of colorOverrides) {
    const element = elementById.get(override.elementId);
    if (element) colors.set(element.meshName, override.color);
  }
  return colors;
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
        elementColors: buildColorMap(data.elements, data.colorOverrides),
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
        // Dynamic, not a top-level import: this module is reachable from
        // BuildingModel.tsx, which the marketing homepage's Hero also
        // renders (interactive={false}) — a static `import { createAnnotation }
        // from "@/lib/queries"` up top pulled queries.ts's own import of
        // src/lib/supabase.ts (and therefore the whole @supabase/supabase-js
        // client, ~740KB on disk before minification) into that homepage's
        // bundle too, even though the hero shot never calls this action.
        // A dynamic import here means that code only ever loads into a
        // browser that actually reaches this line — isDemoData true (the
        // common case with no real backend) never does. See
        // docs/PERFORMANCE.md for the measured before/after.
        const { createAnnotation } = await import("@/lib/queries");
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

    // Element visibility. Selection is deliberately left alone when the
    // selected element is hidden: ElementPanel.tsx stays open on it, so
    // its Hide button flips to Show and one click undoes a mistake.
    // BuildingModel.tsx drops the brass outline for a hidden selection
    // itself, since there's nothing visible left to outline.
    hiddenElementIds: new Set<string>(),
    toggleElementVisibility: (meshName) =>
      set((state) => {
        const hidden = new Set(state.hiddenElementIds);
        if (hidden.has(meshName)) {
          hidden.delete(meshName);
        } else {
          hidden.add(meshName);
        }
        return applyHidden(hidden, state.hoveredElementId);
      }),
    toggleCategoryVisibility: (category) =>
      set((state) => {
        const meshNames = state.elements
          .filter((element) => element.category === category)
          .map((element) => element.meshName);
        const allHidden = meshNames.every((meshName) => state.hiddenElementIds.has(meshName));
        const hidden = new Set(state.hiddenElementIds);
        for (const meshName of meshNames) {
          if (allHidden) {
            hidden.delete(meshName);
          } else {
            hidden.add(meshName);
          }
        }
        return applyHidden(hidden, state.hoveredElementId);
      }),
    resetVisibility: () => set({ hiddenElementIds: new Set<string>() }),

    // Element color overrides — see file header for the full shape.
    elementColors: new Map<string, string>(),
    setElementColor: async (meshName, color) => {
      const previous = get().elementColors.get(meshName) ?? null;
      set((state) => {
        const next = new Map(state.elementColors);
        next.set(meshName, color);
        return { elementColors: next };
      });

      if (get().isDemoData) {
        return;
      }

      // meshName not resolvable to a real Element (shouldn't happen —
      // ElementPanel only ever calls this for the currently-selected
      // element, which came from `elements` in the first place) — nothing
      // to persist against, and the local map write above already applied.
      const element = get().elements.find((candidate) => candidate.meshName === meshName);
      if (!element) return;

      try {
        // Dynamic import for the same bundle-size reason pinAnnotation's
        // own comment explains at length — this module is reachable from
        // the marketing homepage's non-interactive Hero too.
        const { setColorOverride } = await import("@/lib/queries");
        await setColorOverride({ projectId: get().project.id, elementId: element.id, color });
      } catch (error) {
        set((state) => {
          const next = new Map(state.elementColors);
          if (previous === null) {
            next.delete(meshName);
          } else {
            next.set(meshName, previous);
          }
          return { elementColors: next };
        });
        const message = error instanceof Error ? error.message : String(error);
        console.error("setElementColor failed:", message);
        get().showToast("Could not save color — retry", () => {
          get().dismissToast();
          void get().setElementColor(meshName, color);
        });
      }
    },
    clearElementColor: async (meshName) => {
      const previous = get().elementColors.get(meshName);
      if (previous === undefined) return;

      set((state) => {
        const next = new Map(state.elementColors);
        next.delete(meshName);
        return { elementColors: next };
      });

      if (get().isDemoData) {
        return;
      }

      const element = get().elements.find((candidate) => candidate.meshName === meshName);
      if (!element) return;

      try {
        const { deleteColorOverride } = await import("@/lib/queries");
        await deleteColorOverride(element.id);
      } catch (error) {
        set((state) => {
          const next = new Map(state.elementColors);
          next.set(meshName, previous);
          return { elementColors: next };
        });
        const message = error instanceof Error ? error.message : String(error);
        console.error("clearElementColor failed:", message);
        get().showToast("Could not reset color — retry", () => {
          get().dismissToast();
          void get().clearElementColor(meshName);
        });
      }
    },

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

    // Tour mode. Clamped against get().elements.length — the *live*
    // array, not a snapshot taken when tour mode was entered — so if
    // elements ever changed size mid-tour (not something this app's UI
    // can currently trigger, but nothing here assumes it can't) the
    // clamp always reflects reality rather than a stale bound.
    tourIndex: 0,
    tourGoTo: (index) =>
      set((state) => ({
        tourIndex: Math.max(0, Math.min(index, Math.max(state.elements.length - 1, 0))),
      })),
    tourNext: () =>
      set((state) => ({
        tourIndex: Math.min(state.tourIndex + 1, Math.max(state.elements.length - 1, 0)),
      })),
    tourPrev: () => set((state) => ({ tourIndex: Math.max(state.tourIndex - 1, 0) })),

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
    mergeRemoteColorOverride: (elementId, color) =>
      set((state) => {
        const element = state.elements.find((candidate) => candidate.id === elementId);
        if (!element) return state;
        const next = new Map(state.elementColors);
        next.set(element.meshName, color);
        return { elementColors: next };
      }),
    mergeRemoteColorOverrideRemoved: (elementId) =>
      set((state) => {
        const element = state.elements.find((candidate) => candidate.id === elementId);
        if (!element) return state;
        const next = new Map(state.elementColors);
        next.delete(element.meshName);
        return { elementColors: next };
      }),
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
