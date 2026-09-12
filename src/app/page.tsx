/**
 * src/app/page.tsx
 *
 * The real ATRIUM landing page (P04 onward), replacing the temporary
 * design-system specimen sheet (P02/P03) now that the primitives and
 * motion foundation it was proving are in place. Starts with the Hero;
 * later prompts add sections below it.
 */
import { Hero } from "@/components/Hero";

export default function Home() {
  return (
    <main>
      <Hero />
    </main>
  );
}
