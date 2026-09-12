/**
 * src/app/layout.tsx
 *
 * Root layout for ATRIUM. Loads the three type families the design system
 * is built on via next/font/google and exposes each as a CSS variable that
 * src/app/globals.css binds to --font-display / --font-sans / --font-mono
 * inside the @theme block. No other file should import next/font directly —
 * this is the one place font loading happens.
 */
import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { SmoothScrollProvider } from "@/components/motion/SmoothScrollProvider";
import "./globals.css";

// Display face — headlines and large numerals only, never body copy.
const bodoni = Bodoni_Moda({
  variable: "--font-bodoni",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

// Interface face — all body copy and UI chrome.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

// Data face — labels, coordinates, IDs, specifications.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "ATRIUM",
  description: "Interactive design presentation for architecture and interior studios.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${bodoni.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SmoothScrollProvider>{children}</SmoothScrollProvider>
      </body>
    </html>
  );
}
