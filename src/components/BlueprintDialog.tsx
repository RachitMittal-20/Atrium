/**
 * src/components/BlueprintDialog.tsx
 *
 * The "Blueprint to 3D" dialog opened from the landing screen
 * (Invitation.tsx). Two ways to make a model, as tabs:
 *   1. From a blueprint — pick a floor-plan image; Atrium reads the walls
 *      and rooms and works out the scale itself (optionally you can state
 *      the building's real length to make it exact).
 *   2. Manual — type in the rooms (name, size, where it sits, which side
 *      has a door), plus wall height and thickness, with a live 2D
 *      preview of what you are describing.
 * Either way the result is a .glb File handed to `onCreate`, which the
 * landing screen sends down the normal "Try your own model" path.
 */
"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { blueprintImageToModel, layoutFromManual, manualPlanToModel } from "@/lib/blueprintToModel";
import {
  BlueprintError,
  type ManualDoorSide,
  type ManualPlacement,
  type ManualPlanSpec,
  type PlanLayout,
} from "@/types/blueprint";

interface BlueprintDialogProps {
  onClose: () => void;
  /** Receives the generated .glb; resolves once the caller has handled it. */
  onCreate: (file: File) => Promise<void>;
}

type Tab = "image" | "manual";

interface RoomDraft {
  id: number;
  name: string;
  // Kept as strings so a half-typed number ("3.") isn't rewritten under
  // the cursor; parsed only when the plan is built.
  width: string;
  depth: string;
  placement: ManualPlacement;
  x: string;
  z: string;
  door: ManualDoorSide;
}

const inputClass =
  "border border-rule bg-ground px-3 py-2 font-mono text-2xs text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass";
const labelClass = "font-mono text-3xs uppercase tracking-[0.18em] text-faint";

const DEFAULT_ROOMS: RoomDraft[] = [
  { id: 1, name: "Living room", width: "5", depth: "4", placement: "right", x: "0", z: "0", door: "east" },
  { id: 2, name: "Kitchen", width: "3", depth: "4", placement: "right", x: "0", z: "0", door: "south" },
  { id: 3, name: "Bedroom", width: "4", depth: "3.5", placement: "below", x: "0", z: "0", door: "north" },
];

const num = (value: string): number => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

/** Top-down SVG of a layout — what the person is describing, at a glance. */
function PlanPreview({ layout }: { layout: PlanLayout }) {
  const rects = [...layout.walls, ...layout.rooms.flatMap((r) => r.rects)];
  const pad = 0.5;
  const x0 = Math.min(...rects.map((r) => r.x0)) - pad;
  const z0 = Math.min(...rects.map((r) => r.z0)) - pad;
  const x1 = Math.max(...rects.map((r) => r.x1)) + pad;
  const z1 = Math.max(...rects.map((r) => r.z1)) + pad;
  return (
    <svg
      viewBox={`${x0} ${z0} ${x1 - x0} ${z1 - z0}`}
      className="h-full w-full"
      role="img"
      aria-label="Top-down preview of the rooms"
    >
      {layout.rooms.map((room, ri) =>
        room.rects.map((r, i) => (
          <rect key={`${ri}-${i}`} x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} fill={room.color} />
        )),
      )}
      {layout.walls.map((r, i) => (
        <rect key={i} x={r.x0} y={r.z0} width={r.x1 - r.x0} height={r.z1 - r.z0} fill="#e9e5dc" />
      ))}
      {layout.rooms.map((room, ri) => {
        const r = room.rects[0];
        return (
          <text
            key={`t-${ri}`}
            x={(r.x0 + r.x1) / 2}
            y={(r.z0 + r.z1) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={Math.max(0.25, Math.min(0.5, (r.x1 - r.x0) / 9))}
            fill="#0a0b0c"
          >
            {room.name}
          </text>
        );
      })}
    </svg>
  );
}

export function BlueprintDialog({ onClose, onCreate }: BlueprintDialogProps) {
  const [tab, setTab] = useState<Tab>("image");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Image tab
  // The file and its preview URL live together, so the URL is made in the
  // change handler and only *revoked* in an effect (no setState in effects).
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const image = picked?.file ?? null;
  const previewUrl = picked?.url ?? null;
  const [knownLength, setKnownLength] = useState("");
  const [imageWallHeight, setImageWallHeight] = useState("2.7");

  // Manual tab
  const [wallHeight, setWallHeight] = useState("2.7");
  const [wallThickness, setWallThickness] = useState("0.15");
  const [rooms, setRooms] = useState<RoomDraft[]>(DEFAULT_ROOMS);
  const nextId = useRef(DEFAULT_ROOMS.length + 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  useEffect(() => {
    if (!picked) return;
    const { url } = picked;
    return () => URL.revokeObjectURL(url);
  }, [picked]);

  const spec: ManualPlanSpec = useMemo(
    () => ({
      wallHeight: num(wallHeight) || 2.7,
      wallThickness: Math.min(0.6, Math.max(0.05, num(wallThickness) || 0.15)),
      rooms: rooms.map((r) => ({
        name: r.name,
        width: num(r.width),
        depth: num(r.depth),
        placement: r.placement,
        x: num(r.x),
        z: num(r.z),
        door: r.door,
      })),
    }),
    [wallHeight, wallThickness, rooms],
  );

  const { layout: previewLayout, problem } = useMemo(() => {
    try {
      return { layout: layoutFromManual(spec), problem: null as string | null };
    } catch (e) {
      return { layout: null, problem: e instanceof BlueprintError ? e.message : "Check the room sizes." };
    }
  }, [spec]);

  const updateRoom = (id: number, patch: Partial<RoomDraft>) =>
    setRooms((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addRoom = () =>
    setRooms((list) => [
      ...list,
      { id: nextId.current++, name: `Room ${list.length + 1}`, width: "3", depth: "3", placement: "right", x: "0", z: "0", door: "none" },
    ]);

  const run = async (make: () => Promise<File>) => {
    setBusy(true);
    setError(null);
    try {
      await onCreate(await make());
    } catch (e) {
      console.error("[blueprint] failed", e);
      setError(
        e instanceof BlueprintError
          ? e.message
          : "Something went wrong building the model. Try a different image or check the values.",
      );
      setBusy(false);
    }
  };

  const createFromImage = () => {
    if (!image) return;
    const length = num(knownLength);
    void run(() =>
      blueprintImageToModel(image, {
        buildingLength: length > 0 ? length : undefined,
        wallHeight: num(imageWallHeight) || 2.7,
      }),
    );
  };

  const createManual = () => void run(() => manualPlanToModel(spec));

  const tabClass = (active: boolean) =>
    `px-4 py-2 font-mono text-3xs uppercase tracking-[0.18em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass ${
      active ? "border-b border-brass text-ink" : "border-b border-transparent text-faint hover:text-ink"
    }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="blueprint-title"
        className="flex max-h-[92vh] w-full max-w-3xl flex-col border border-rule bg-surface text-left"
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <h2 id="blueprint-title" className="font-display text-2xl text-ink">
              Blueprint to 3D
            </h2>
            <p className="mt-1 font-mono text-3xs uppercase tracking-[0.18em] text-faint">
              Drop in a plan. Walk through it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="font-mono text-xs text-faint transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-40"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 flex gap-2 border-b border-rule px-4" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "image"} className={tabClass(tab === "image")} onClick={() => setTab("image")}>
            From a blueprint
          </button>
          <button type="button" role="tab" aria-selected={tab === "manual"} className={tabClass(tab === "manual")} onClick={() => setTab("manual")}>
            Enter manually
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === "image" ? (
            <div className="flex flex-col gap-5">
              <p className="font-mono text-3xs leading-relaxed text-muted">
                Upload a floor plan (PNG or JPG). Atrium finds the walls and rooms and works out the measurements on its own.
                It reads thick dark lines as walls; thin door and window marks become open gaps. Rooms are named Room 1, 2, …
                and you can rename, recolor, comment and categorize them afterwards.
              </p>
              <label
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-ruleHi bg-surface2 p-4 text-center hover:border-brass ${
                  busy ? "pointer-events-none opacity-60" : ""
                }`}
              >
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local blob URL preview; next/image can't optimise it
                  <img src={previewUrl} alt="Selected floor plan" className="max-h-56 w-auto object-contain" />
                ) : null}
                <span className={labelClass}>{image ? image.name : "Choose a floor-plan image"}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setPicked(file ? { file, url: URL.createObjectURL(file) } : null);
                    setError(null);
                    e.target.value = "";
                  }}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Real building length, metres (optional)">
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    placeholder="Auto-detect"
                    value={knownLength}
                    onChange={(e) => setKnownLength(e.target.value)}
                  />
                </Field>
                <Field label="Wall height, metres">
                  <input className={inputClass} inputMode="decimal" value={imageWallHeight} onChange={(e) => setImageWallHeight(e.target.value)} />
                </Field>
              </div>
              <p className="font-mono text-3xs text-faint">
                Leave the length empty and Atrium estimates the scale from the wall thickness — enter the real length of the longest side for exact sizes.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-[1fr_260px]">
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Wall height, metres">
                    <input className={inputClass} inputMode="decimal" value={wallHeight} onChange={(e) => setWallHeight(e.target.value)} />
                  </Field>
                  <Field label="Wall thickness, metres">
                    <input className={inputClass} inputMode="decimal" value={wallThickness} onChange={(e) => setWallThickness(e.target.value)} />
                  </Field>
                </div>

                <div className="flex flex-col gap-3">
                  {rooms.map((room, i) => (
                    <div key={room.id} className="flex flex-col gap-3 border border-rule bg-surface2 p-3">
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`Room ${i + 1} name`}
                          className={`${inputClass} flex-1`}
                          value={room.name}
                          onChange={(e) => updateRoom(room.id, { name: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => setRooms((list) => list.filter((r) => r.id !== room.id))}
                          disabled={rooms.length <= 1}
                          aria-label={`Remove ${room.name || `room ${i + 1}`}`}
                          className="font-mono text-3xs uppercase tracking-[0.18em] text-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass disabled:opacity-30"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Field label="Width (m)">
                          <input className={inputClass} inputMode="decimal" value={room.width} onChange={(e) => updateRoom(room.id, { width: e.target.value })} />
                        </Field>
                        <Field label="Depth (m)">
                          <input className={inputClass} inputMode="decimal" value={room.depth} onChange={(e) => updateRoom(room.id, { depth: e.target.value })} />
                        </Field>
                        <Field label="Placed">
                          <select
                            className={inputClass}
                            value={i === 0 ? "custom" : room.placement}
                            disabled={i === 0}
                            onChange={(e) => updateRoom(room.id, { placement: e.target.value as ManualPlacement })}
                          >
                            {i === 0 ? <option value="custom">Start</option> : null}
                            <option value="right">Right of previous</option>
                            <option value="below">Below previous</option>
                            <option value="custom">At X / Z</option>
                          </select>
                        </Field>
                        <Field label="Door">
                          <select
                            className={inputClass}
                            value={room.door}
                            onChange={(e) => updateRoom(room.id, { door: e.target.value as ManualDoorSide })}
                          >
                            <option value="none">None</option>
                            <option value="north">North wall</option>
                            <option value="east">East wall</option>
                            <option value="south">South wall</option>
                            <option value="west">West wall</option>
                          </select>
                        </Field>
                      </div>
                      {i > 0 && room.placement === "custom" ? (
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="X from first room (m)">
                            <input className={inputClass} inputMode="decimal" value={room.x} onChange={(e) => updateRoom(room.id, { x: e.target.value })} />
                          </Field>
                          <Field label="Z from first room (m)">
                            <input className={inputClass} inputMode="decimal" value={room.z} onChange={(e) => updateRoom(room.id, { z: e.target.value })} />
                          </Field>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div>
                  <Button variant="ghost" type="button" onClick={addRoom}>
                    Add room
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className={labelClass}>Preview (top view)</span>
                <div className="aspect-square border border-rule bg-ground p-2">
                  {previewLayout ? <PlanPreview layout={previewLayout} /> : <p className="p-2 font-mono text-3xs text-clay">{problem}</p>}
                </div>
                <p className="font-mono text-3xs text-faint">
                  Walls are drawn along every room edge; shared edges become one wall. North is up.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-rule px-6 py-4">
          {error ? (
            <p role="alert" className="font-mono text-3xs text-clay">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="ghost" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {tab === "image" ? (
              <Button type="button" onClick={createFromImage} disabled={busy || !image}>
                {busy ? "Building…" : "Create 3D model"}
              </Button>
            ) : (
              <Button type="button" onClick={createManual} disabled={busy || !previewLayout}>
                {busy ? "Building…" : "Create 3D model"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
