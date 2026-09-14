/**
 * src/lib/format.ts
 *
 * Small display-formatting helpers shared across ATRIUM's review UI.
 * Currently just relativeTime, used by both ElementPanel.tsx's comment
 * thread and ReviewList.tsx's row timestamps so "3 days ago" reads
 * identically everywhere a comment's age is shown.
 */

// Coarse but legible — "3 days ago" reads better in a review thread than
// an exact timestamp, and nothing here needs second-level precision.
export function relativeTime(iso: string): string {
  const deltaDays = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (deltaDays <= 0) return "today";
  if (deltaDays === 1) return "1 day ago";
  if (deltaDays < 7) return `${deltaDays} days ago`;
  const deltaWeeks = Math.round(deltaDays / 7);
  if (deltaWeeks < 5) return deltaWeeks === 1 ? "1 week ago" : `${deltaWeeks} weeks ago`;
  const deltaMonths = Math.round(deltaDays / 30);
  return deltaMonths <= 1 ? "1 month ago" : `${deltaMonths} months ago`;
}
