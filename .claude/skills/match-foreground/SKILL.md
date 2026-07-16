---
name: match-foreground
description: Iterate the Three.js scene's foreground toward the "FOREGROUND CONCEPT — a cozy place for letters" reference board until they visually match. Run repeatedly; each run makes the scene measurably closer.
---

# Goal: match the foreground concept board

You are iterating `three-scene.js` on branch `picnic-dome` toward the user's
reference board. **The reference image is the ground truth, not your taste.**
If `reference/foreground-concept.png` exists in the repo, Read it at the start
of every run and compare against it directly. If it doesn't exist, ask the
user to save the board there once — then fall back to the checklist below.

## Hard constraints (from CLAUDE.md — re-read it first)

- Never touch: letter flow, camera system, mailbox model/door, raycasting, .jsx files.
- The mailbox plateau is exactly y=0 within r≈2.8 — immovable.
- The mountains, sun, and water palette are APPROVED — do not restyle them.
- Thin PlaneGeometry grass blades are banned; blades are solid thin cones.
- Sea level is y=−0.22; land is clamped ≥ −0.14. Move them together or not at all.
- Shadow casters stay inside the sun's ±10 box; grass blades never cast.

## The target (what the board shows)

1. **Knoll**: the path climbs a gentle hill to the mailbox at the crest;
   land falls away on all sides; grass and rocks silhouette at the lip.
2. **Path**: wide (wider toward the viewer), sandy-tan, pebbly speckle,
   organic wobbled edges, NO stepping stones. It is the eye-line to the mailbox.
3. **Rocks**: neutral GRAY, soft-angular, clustered (one large + smaller
   nestled), big anchors at the bottom frame corners, escorts along the path,
   groups at the cliff lip. Varied sizes, buried ~1/3.
4. **Grass**: spiky tufts everywhere — lush, not sparse. Taller near rocks
   and edges, shorter near the path. Olive → yellow-green, ~10% dry-straw
   blades. Clumped, never uniform sprinkle.
5. **Flowers**: drifts of white daisies (yellow centers) dominant, gold
   buttercups second, occasional pink spikes. Clusters, heaviest flanking
   the path and around the big rocks.
6. **Nothing else**: no trees in the foreground. (Lighthouse + sailboat in
   the water are approved and stay.)
7. **Palette swatches**: dark olive #4a7a1e-ish, yellow-green #a8b832-ish,
   path tan #b58650-ish, rock gray #9a9a96-ish, soft yellow #f5e07a, white.

## Iteration protocol (one run = one loop)

1. Serve: `python3 -m http.server 8123` in the repo root (check it isn't
   already running). Screenshot with system Chrome (no playwright here):
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   --headless=new --disable-gpu-sandbox --no-first-run
   --window-size=1400,900 --virtual-time-budget=9000 --screenshot=<out>.png
   http://localhost:8123` — plus a 390x844 portrait shot.
2. Read the screenshot(s) AND the reference. List the 3 biggest visible
   differences, most important first (composition > color > shape detail).
3. Fix ONLY the top 1–2 differences. Small, targeted edits to the landscape
   functions in `three-scene.js` (`groundHeight`, `pathMask`,
   `makeGroundTexture`, `buildScatter`).
4. Re-screenshot, confirm the difference actually shrank (if it didn't,
   revert that edit rather than stacking guesses).
5. Run one full click-through (mailbox → zoom → letter → back) — the
   puppeteer driver pattern is described in CLAUDE.md's verify memory; at
   minimum confirm no console errors and the mailbox still sits flush at y=0.
6. Commit with a message naming the difference you closed.
7. Report to the user: what you changed, what still differs, screenshot paths.

Stop and ask the user before any change that would alter the approved
mountains/sun/water, move the sea level, or touch a locked system.
