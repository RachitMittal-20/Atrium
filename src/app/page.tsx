/**
 * src/app/page.tsx
 *
 * Design system specimen sheet for ATRIUM (P02). Renders every color token,
 * the full type scale, and every primitive in src/components/ui in both
 * variants where they have variants, so the whole visual system can be
 * checked at a glance in one place.
 *
 * This is a temporary inspection page — it gets fully replaced by the real
 * cinematic landing page later (P04-P06). Nothing here is meant to survive
 * past that point.
 */
import { Label } from "@/components/ui/Label";
import { Rule } from "@/components/ui/Rule";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { FieldRow } from "@/components/ui/FieldRow";

const colorTokens = [
  { name: "ground", value: "#0A0B0C", class: "bg-ground" },
  { name: "surface", value: "#131518", class: "bg-surface" },
  { name: "surface2", value: "#191C20", class: "bg-surface2" },
  { name: "rule", value: "#262A30", class: "bg-rule" },
  { name: "ruleHi", value: "#3A3F47", class: "bg-ruleHi" },
  { name: "ink", value: "#E9E5DC", class: "bg-ink" },
  { name: "muted", value: "#8B9099", class: "bg-muted" },
  { name: "faint", value: "#5E646D", class: "bg-faint" },
  { name: "brass", value: "#D4A24C", class: "bg-brass" },
  { name: "verdigris", value: "#8DAE84", class: "bg-verdigris" },
  { name: "clay", value: "#C97B52", class: "bg-clay" },
];

const typeScale = [
  { name: "3xs", value: "11px", class: "text-3xs" },
  { name: "2xs", value: "13px", class: "text-2xs" },
  { name: "xs", value: "15px", class: "text-xs" },
  { name: "sm", value: "17px", class: "text-sm" },
  { name: "md", value: "21px", class: "text-md" },
  { name: "lg", value: "28px", class: "text-lg" },
  { name: "xl", value: "38px", class: "text-xl" },
  { name: "2xl", value: "52px", class: "text-2xl" },
  { name: "3xl", value: "72px", class: "text-3xl" },
];

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-24">
      {/* Cover mark */}
      <header className="mb-24">
        <Label className="mb-6 block">ATRIUM / Design System</Label>
        <h1 className="font-display text-3xl tracking-wide text-ink">Specimen Sheet</h1>
        <p className="mt-4 max-w-xl text-muted">
          Every token, every type size, every primitive — the visual foundation
          the rest of ATRIUM inherits from.
        </p>
      </header>

      {/* Color tokens */}
      <section className="mb-24">
        <Rule label="Color" className="mb-8" />
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3 md:grid-cols-4">
          {colorTokens.map((token) => (
            <div key={token.name}>
              <div className={`h-20 w-full border border-rule ${token.class}`} />
              <div className="mt-3 flex items-baseline justify-between">
                <Label>{token.name}</Label>
                <span className="font-mono text-3xs tabular-nums text-faint">
                  {token.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Type scale */}
      <section className="mb-24">
        <Rule label="Type Scale" className="mb-8" />
        <div className="flex flex-col gap-6">
          {typeScale.map((step) => (
            <div key={step.name} className="flex items-baseline gap-6">
              <span className="w-16 shrink-0 font-mono text-3xs uppercase tracking-[0.18em] text-faint">
                {step.name}
              </span>
              <span className="w-16 shrink-0 font-mono text-3xs tabular-nums text-faint">
                {step.value}
              </span>
              <span className={`font-display text-ink ${step.class}`}>Aa Elevation</span>
            </div>
          ))}
        </div>
      </section>

      {/* Type families */}
      <section className="mb-24">
        <Rule label="Type Families" className="mb-8" />
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <Label className="mb-3 block">Display — Bodoni Moda</Label>
            <p className="font-display text-lg text-ink">The Atrium</p>
          </div>
          <div>
            <Label className="mb-3 block">Interface — IBM Plex Sans</Label>
            <p className="font-sans text-xs leading-relaxed text-ink">
              Presentations replace static drawings with a navigable model.
            </p>
          </div>
          <div>
            <Label className="mb-3 block">Data — IBM Plex Mono</Label>
            <p className="font-mono text-2xs tabular-nums tracking-[0.18em] text-ink">
              SPEC-042 / 128.400
            </p>
          </div>
        </div>
      </section>

      {/* Label */}
      <section className="mb-24">
        <Rule label="Label" className="mb-8" />
        <div className="flex flex-wrap gap-8">
          <Label>Material</Label>
          <Label>Elevation 04</Label>
          <Label>Status: Approved</Label>
        </div>
      </section>

      {/* Rule */}
      <section className="mb-24">
        <Rule label="Rule" className="mb-8" />
        <div className="flex flex-col gap-8">
          <Rule />
          <Rule label="Section Cut A—A" />
        </div>
      </section>

      {/* Button */}
      <section className="mb-24">
        <Rule label="Button" className="mb-8" />
        <div className="flex flex-wrap items-center gap-6">
          <Button variant="primary">Primary Action</Button>
          <Button variant="ghost">Ghost Action</Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
        </div>
      </section>

      {/* Panel + FieldRow */}
      <section className="mb-24">
        <Rule label="Panel / FieldRow" className="mb-8" />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <Panel header={<Label>Material Specification</Label>}>
            <FieldRow label="Finish" value="Brushed Brass" />
            <FieldRow label="Elevation" value="128.400" />
            <FieldRow label="Status" value="Approved" />
          </Panel>
          <Panel>
            <FieldRow label="Room" value="04 / Atrium" />
            <FieldRow label="Area" value="42.6 m²" />
            <FieldRow label="Revision" value="R03" />
          </Panel>
        </div>
      </section>
    </div>
  );
}
