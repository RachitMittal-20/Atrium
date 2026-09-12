/**
 * src/app/page.tsx
 *
 * The real ATRIUM landing page. Hero makes the first impression; Friction,
 * Shift, and Invitation are the scroll narrative that makes the argument
 * for the product before the viewer reaches the tool itself.
 */
import { Hero } from "@/components/Hero";
import { Friction } from "@/components/Friction";
import { Shift } from "@/components/Shift";
import { Invitation } from "@/components/Invitation";

export default function Home() {
  return (
    <main>
      <Hero />
      <Friction />
      <Shift />
      <Invitation />
    </main>
  );
}
