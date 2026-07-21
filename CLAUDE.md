# Letters, From Me

A personal one-page website for my girlfriend. A 3D interactive mailbox 
where I leave her letters over time. Hosted on Vercel at:
https://love-letter-henna.vercel.app

**She has not seen this site at all yet.** Nothing has been shown to her —
not the mailbox, not the letters, none of it. The goal right now is to
finish a version worth actually giving her.

## Stack

- Vanilla Three.js 0.160.0 (no build step, loaded via unpkg)
- React 18 + ReactDOM (UMD, browser-loaded via unpkg)
- Babel Standalone 7.29 (JSX transpiled in-browser, no bundler)
- Plain CSS in index.html (no Tailwind)
- GitHub → Vercel auto-deploy — **only pushes to `main` go live**

## Branches — read this first, don't re-derive it from the files

This section is the source of truth for what each branch is. Check here
before exploring the repo — it saves re-discovering the same history
every session.

- **`main`** — the live/deployed version. Sunset sky, lake, low-poly
  triangular cone mountains. This is genuinely all she's ever seen
  (i.e. nothing — see above). Don't edit this directly; land finished
  work here via merge from `picnic-dome` when a landscape is ready.
- **`picnic-dome`** (usual working branch) — active development.
  This is the **Day** version: sunset sky, lake/water, and smooth
  quadratic-ridge mountain silhouettes (rounder, less spiky than
  `main`'s cones), warmer color palette than `main`. Ground is a flat
  `BoxGeometry`, same shape as `main` — despite the branch name there
  is no literal dome in the current geometry; the name is just history
  from an earlier domed-hill experiment that got replaced.
- **`picnic-dome-night`** — parked, not merged anywhere. This is the
  **Night** version: dark indigo sky, three layered star fields, a
  glowing moon sprite, cool moonlight replacing the sun, and one warm
  point-light glow at the mailbox itself (a lit window in the dark).
  Reserved for the real-time day/night feature below — don't build
  that feature until asked, but don't discard this branch either.
- `feature/alpine-meadow` — deleted. Was a cliffs/pine-trees/chalet
  direction, rejected (didn't like it).
- `grass-lab/` folder — deleted. Was a standalone grass-blade
  rendering prototype, abandoned at the time.

## Working features (DO NOT modify unless I ask)

These are confirmed good and identical across all branches above —
only the landscape (sky/ground/water/mountains/lights) differs between
them. Leave these alone.

### Letter flow (perfect — do not touch)
- "Pick a letter" view: fanned envelope spread inside mailbox, each 
  envelope individually clickable, wax seal, handwritten labels
- Click envelope → letter unfolds, handwritten text appears line by line
- "Back to mailbox" button closes letter and returns to spread
- Handwritten font (Caveat), beautiful Fraunces serif in titles

### Camera & navigation (confirmed working)
- Outside view: camera at [4, 2.6, 8.2] looking at [0, 1.7, 0]
- Click mailbox → 3-second clockwise arc zoom (easeInOutCubic), sin²(k·π) bell 
  curve for the sweep so the arc starts and ends smoothly
- Desktop end: pos [0, 2.2, 3] look [0, 1.65, 0] — face-on view of mailbox opening
- Mobile end (portrait): pos [0, 2.5, 5] look [0, 1.65, 0] — pulled back for tall frame
- Duration and timings live in app.jsx (not the cameraTo default):
    250ms delay → cameraTo("inside", 3000) → setStage("inside") at 3300ms
- onResize skips if canvas dimensions unchanged — prevents camera jump when 
  the letter overlay mounts
- Zoom back out with "back outside" button (1900ms, in app.jsx)
- 4-stage state machine: outside → arriving → inside → reading
- No motion blur — CSS blur can't exclude the mailbox, removed entirely

### Mailbox door animation (confirmed working)
- Spring simulation (stiffness 0.045, damping 0.84)
- Decelerates clearly near fully open with no bounce/overshoot
- Mailbox model itself (arch shape, hollow shell, letter props inside)
  is unchanged across every branch — only the landscape around it varies

## Current state of `picnic-dome` (the active branch)

The July 2026 "Sunset Headland" rebuild (7 phases, one commit each)
replaced the whole landscape; the mailbox/letter/camera systems were
untouched. What the scene is now:

- **Terrain**: rolling grassy headland dropping into the sea, shaped by
  a single `groundHeight(x,z)` function in three-scene.js. There is a
  dead-flat plateau (exactly y=0) within r≈2.8 of the origin — the
  mailbox, its shadow, and the camera look-at depend on it. EVERY new
  object placed on the ground must use `groundHeight` for its y.
- **Mountains**: three real 3D displaced-terrain strips (ridged noise,
  lit Lambert with a warm emissive floor; the far range is unlit
  MeshBasic with painted shading so fog fades it predictably). The old
  cardboard-cutout problem is fixed. Composition note: the camera looks
  diagonally, so at mountain depth "screen centre" is world x≈−55 and
  the sun gap lives at x≈−75.
- **Water**: gradient base plane + two tiling ripple overlays scrolling
  via texture offsets + additive fog-free glitter streak + sun disc and
  halo sprites at (−75, −130). All landscape motion runs through the
  `tickers` array → `updateLandscape(t)` (one line in `animate()`).
- **Foreground**: copied from the user's concept board ("FOREGROUND
  CONCEPT — a cozy place for letters"; keep matching it, not taste).
  Knoll: the land dips ~0.5 away from the y=0 plateau (the plateau
  itself can never move) so the mailbox crests a hill — this is why the
  SEA sits at y=−0.22 (dipped lawn clamped at −0.14 must never flood;
  ripple overlays/streak/boat heights all moved with it). Wide sandy
  path with pebble speckle, NO stepping stones. Gray rocks in nestled
  clusters (big anchors at bottom frame corners). NO grass — removed
  entirely (was a real 3D tuft model, grass-tuft.glb; several
  iterations — card billboards, then the tuft model, brightness/contrast
  tuning — ended with the user asking to cut it, so the ground is bare
  between rocks/flowers/path for now). `grass-tuft.glb` is still in the
  project root (the user's modeled asset) but nothing loads it; the
  generated `grass-tuft-data.js` extraction was deleted since it's
  regeneratable from the .glb if grass comes back. Flowers = white
  daisies w/ yellow centers + buttercups + pink spikes, in drifts. NO
  trees (pines cut on request). All shadow-casters sit inside the sun's
  ±10 shadow box — don't place casters outside it (shadows silently
  vanish), don't widen the box (blurs the mailbox shadow), and blades
  don't cast (shadow-map noise).
- **Story details**: lighthouse islet + tiny village at (1.5, −52) —
  must stay in FRONT of the foothill ridge strip (z ≥ −67) or it gets
  swallowed — and a sailboat drifting across z=−55 on a ~4-min loop.
  Each is one function call in init(); trivial to cut.

Possible next tweaks (user has not reviewed the rebuild yet):
1. Snow caps / rock hues on the main range may want tuning once seen
   on a real screen — bands are relative to each summit (see
   makeRange), tweak the sstep thresholds.
2. Glitter streak is subtle; bump dash alpha in buildWater if wanted.
3. Mailbox model proportions/material — unchanged, not urgent.

## Landscape design decisions (confirmed, `picnic-dome`)

- Scene mood: warm sunset, NOT "A Short Hike" style (too game-y).
- Ground fills more of the frame than a typical reference photo would (wanted)
- Mailbox stays centred, on flat ground
- Sky gradient (top → horizon): #b84830 → #e07040 → #f0a868 → #eeb890
- Water: deep blue far (#1e3248) → clean near-shore blue (#68a8c4), warm glitter streak
- Mountains: real lit geometry (see above), warm rock tones, warm-tinted
  snow (#f6ddd0 — never pure white), fog kept at (30, 175)
- Canvas-texture gotcha learned the hard way: THREE.Color stores hex as
  LINEAR; call convertLinearToSRGB() before writing pixels to a canvas
  that becomes an sRGB texture, or every color double-darkens.

## Future ideas (don't build yet)

- **Real-time day/night sync** — the app should detect the real device
  clock and automatically show the Day scene (`picnic-dome`) or Night
  scene (`picnic-dome-night`) depending on whether it's actually day or
  night for her. Not designed yet — needs decisions on: what counts as
  "sunset" (fixed hours vs. actual local sunset time), whether it snaps
  or transitions between states, and timezone handling. Both visual
  states already exist (see Branches above); only the switching logic
  is unbuilt.
- Add new letters over time without rebuilding
- Tree to one side of the mailbox (bare winter style or with round foliage)
- Fireflies, ambient sound, wind effect
- Better mailbox model proportions

## Version control

- GitHub repo: https://github.com/terzievski13/love-letter
- Deployed to Vercel via GitHub auto-deploy — only `main` deploys
- Commit at meaningful checkpoints with descriptive messages
- Before big refactors, commit current working state first as a safety net
- Landscape experiments live on branches precisely so they don't touch
  `main`/Vercel until one is finished and merged — see Branches above

## How I work

- I'm a freelance videographer, not a developer. Explain choices in 
  plain language. No jargon dumps.
- Ask clarifying questions before big changes — and if I don't answer
  in time, don't guess and build anyway. Pause and ask again rather
  than proceeding on a best guess for subjective/creative calls (scene
  mood, colors, direction). Getting this wrong once already cost a
  round trip of confusion this project — better to wait.
- Iterate one piece at a time. Don't refactor multiple things at once.
- When you're not 100% sure about something, say so explicitly.
- Don't make up library APIs or behaviors — verify or admit uncertainty.

## Conventions

- All files are flat in the project root (no src/ folder)
- 3D scene logic in three-scene.js
- React UI overlay in app.jsx
- Envelope + letter components in envelope.jsx
- Letter content in letters.jsx (one object per letter in the LETTERS_DATA array)
- Use TypeScript-friendly patterns even though we're in plain JS
