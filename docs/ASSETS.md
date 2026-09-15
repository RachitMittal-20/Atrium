# Third-party assets

Every non-code asset in this repository, its source, its licence, and what
it's used for. Keep this file in sync whenever an asset is added, replaced,
or removed — an unattributed or mis-licensed asset is a real risk to this
submission, not a formality.

## Building model

**"Modern apartment interior"** by Katydid

- Source: https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e
- Author: Katydid — https://sketchfab.com/Katydid.
- Licence: CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/
- Used for: the base apartment model rendered in ATRIUM's 3D scene
  (`public/models/apartment.glb`) — the walls, floor, ceiling, doors,
  windows, and furniture the whole product is built around.

CC BY requires attribution. The credit line below (from the model's own
license grant, see "Original license grant" below) is used verbatim in the
submission's README/credits:

> This work is based on "Modern apartment interior"
> (https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e)
> by Katydid (https://sketchfab.com/Katydid.) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

**Optimisation pipeline** (raw download → `public/models/apartment.glb`):
packed to a single binary GLB, Draco-compressed geometry, textures resized
to a maximum of 2048px and converted to WebP, unused nodes/materials
pruned. Raw: 9.7 MB (glTF + .bin + PNG textures). Optimised: 1.3 MB — well
under the 6 MB target, so no further downsizing to 1024px textures was
needed. See `raw-assets/modern-apartment-interior/` for the untouched
original (not deployed; kept for re-optimising if the pipeline changes).

### Original license grant

Copied verbatim from `raw-assets/modern-apartment-interior/license.txt`,
downloaded alongside the model, as a record of the exact terms it was
released under:

```
Model Information:
* title:	Modern apartment interior
* source:	https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e
* author:	Katydid (https://sketchfab.com/Katydid.)

Model License:
* license type:	CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
* requirements:	Author must be credited. Commercial use is allowed.

If you use this 3D model in your project be sure to copy paste this credit wherever you share it:
This work is based on "Modern apartment interior" (https://sketchfab.com/3d-models/modern-apartment-interior-400c9069181a4342a7142433dfa3466e) by Katydid (https://sketchfab.com/Katydid.) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
```

## HDRIs

Both from Poly Haven, both CC0 (public domain — no attribution legally
required, but credited here anyway as good practice).

**"Brown Photostudio 02"**

- Source: https://polyhaven.com/a/brown_photostudio_02
- Author: Poly Haven
- Licence: CC0 — https://creativecommons.org/publicdomain/zero/1.0/
- File: `public/hdri/brown_photostudio_02_2k.exr`
- Used for: scene lighting — image-based lighting/reflections for the 3D
  scene's environment, not shown directly to the viewer.

Downloaded at 2K (2048×1024), not the 4K this asset also ships in on Poly
Haven: this file is used purely for IBL (three.js pre-filters it through
a PMREM generator before using it for diffuse/specular lighting, so
source resolution well above what a screen can show buys nothing), and
the 4K export was, by a wide margin, the single largest asset either page
of this app loaded — see `docs/PERFORMANCE.md` for the full measurement
and a pixel-diffed visual comparison confirming no perceptible quality
loss. Downloaded directly from Poly Haven's own CDN
(`dl.polyhaven.org/file/ph-assets/HDRIs/exr/2k/brown_photostudio_02_2k.exr`),
MD5-verified against Poly Haven's public API before use — same author,
same source, same processing, just the smaller of the resolutions Poly
Haven itself publishes. The original 4K download is kept at
`raw-assets/brown_photostudio_02_4k.exr` alongside the 2K one
(`raw-assets/brown_photostudio_02_2k.exr`) for the record; only the 2K
file is deployed under `public/`.

**"Art Studio"**

- Source: https://polyhaven.com/a/art_studio
- Author: Poly Haven
- Licence: CC0 — https://creativecommons.org/publicdomain/zero/1.0/
- File: `public/hdri/art_studio_4k.jpg`
- Used for: the 360° panorama mode (a later feature) — shown directly to
  the viewer as a background environment.
