Anything that renders inside a react-three-fiber <Canvas>. Scene setup,
loaded models, markers, panorama mode. Never imports DOM-only libraries.

Exception: SceneLoader.tsx. It reads loading progress via drei's
useProgress (a plain store, readable from anywhere) but renders as a DOM
overlay alongside the Canvas, not inside it — a Suspense fallback inside
the Canvas can't be styled HTML/CSS, so the loading UI has to live here as
a sibling instead.
