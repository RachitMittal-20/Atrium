/**
 * src/app/page.tsx
 *
 * Temporary placeholder home page for the ATRIUM scaffold (prompt P01).
 * Its only job right now is to prove the build compiles end to end —
 * Next.js 16 App Router, Tailwind v4, the src/ directory layout.
 *
 * This gets fully replaced by the design-system specimen sheet in P02,
 * and later by the real cinematic landing page (P04-P06). Nothing here
 * is meant to survive past this commit.
 */
export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <h1 className="text-2xl tracking-[0.3em] text-neutral-100">ATRIUM</h1>
    </div>
  );
}
