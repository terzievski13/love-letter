# Letters, From Me

A personal one-page website for my girlfriend. A 3D interactive mailbox 
where I leave her letters over time. Hosted on Vercel at:
https://love-letter-henna.vercel.app

## Stack

- Vanilla Three.js 0.160.0 (no build step, loaded via unpkg)
- React 18 + ReactDOM (UMD, browser-loaded via unpkg)
- Babel Standalone 7.29 (JSX transpiled in-browser, no bundler)
- Plain CSS in index.html (no Tailwind)
- GitHub → Vercel auto-deploy (push to main = live)

## Working features (DO NOT modify unless I ask)

These are confirmed good. Leave them alone.

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

### 3D scene basics (confirmed working)
- Sunset sky gradient on backside sphere with sprite clouds
- Solid olive-green ground (BoxGeometry, top at y=0) — mailbox base sits 
  on it correctly
- Visible shore edge at z=-10 (front face of the ground box)
- Blue lake behind the shore edge with warm sun glitter streak
- Low-poly mountains in the background (5-sided cones, 3 depth layers)
- Fog: starts at 30 units, dense at 200 — gives atmospheric mountain haze
- Warm directional sun light + hemisphere ambient + rim light

## Currently needs work (priority order)

1. **Mountains** — visible but only on the right side of the frame.
   Need to be spread across the full background width and feel like they 
   sit behind the lake, not on top of it. Composition reference: bench 
   by Lake Lucerne photo (warm-toned version). Big dramatic alpine peaks.

2. **Landscape details** — once mountains are right, add a tree to one 
   side (not centred). Possibly gentle slope/hill on the ground. No grass 
   blades (tried, looked terrible from this camera angle).

3. **Mailbox model** — keep red American tube shape. Proportions and 
   material could be improved but not urgent.

## Landscape design decisions (confirmed)

- Scene mood: warm sunset, NOT "A Short Hike" style (too game-y). 
  Composition reference: bench by Lake Lucerne photo.
- Ground fills more of the frame than in the reference photo (user wants this)
- Mailbox stays centred
- Warm sky palette: top #f2a06a → #fbcf9a → #fde6cd → horizon #f6c89a
- Ground: olive-golden #8a9040
- Water: blue (#2a3a52 deep → #7a9eac near shore), warm glitter streak
- Mountains: dark amber near (#7a4828) → lighter warm far (#be8060), 
  atmospheric fog blends them to peach at distance
- No tree yet (next session)
- Grass blades removed — thin PlaneGeometry looks like floating 
  matchsticks from this camera angle at any density

## Version control

- GitHub repo: https://github.com/terzievski13/love-letter
- Deployed to Vercel via GitHub auto-deploy
- Commit at meaningful checkpoints with descriptive messages
- Before big refactors, commit current working state first as a safety net

## Future ideas (don't build yet)

- Add new letters over time without rebuilding
- Tree to one side of the mailbox (bare winter style or with round foliage)
- Fireflies, ambient sound, wind effect
- Better mailbox model proportions

## How I work

- I'm a freelance videographer, not a developer. Explain choices in 
  plain language. No jargon dumps.
- Ask clarifying questions before big changes.
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
