# Letters, From Me

A personal one-page website for my girlfriend. A 3D interactive mailbox
where I leave her letters over time. Hosted on Vercel at:
https://lovelettersisa.vercel.app

The ongoing work is adding letters over time, and making sure she finds
out when one arrives.

## Where the details are — check here first

This file is the overview. Three companion files hold the detail, and
each one is the source of truth for its area. **Read the relevant file
before changing anything in that area** — don't re-derive it from the
code, and don't work from this summary alone:

| If the change touches… | Read first |
| --- | --- |
| Terrain, mountains, water, sky, sun, fog, the path, rocks, flowers, lighting, anything in three-scene.js | **LANDSCAPE.md** |
| Push notifications or email, api/, lib/, sw.js, notify.jsx, vercel.json, .github/workflows/, the "did she get told" question | **NOTIFICATIONS.md** |
| Writing, editing, timing or publishing a letter; letters.jsx | **ADDING-A-LETTER.md** |

Anything not in that table — the mailbox model, the camera, the letter
animation, the React overlay — is covered below.

## Stack

- Vanilla Three.js 0.160.0 (no build step, loaded via unpkg)
- React 18 + ReactDOM (UMD, browser-loaded via unpkg)
- Babel Standalone 7.29 (JSX transpiled in-browser, no bundler)
- Plain CSS in index.html (no Tailwind)
- GitHub → Vercel auto-deploy — **only pushes to `main` go live**

## Running it locally

    python3 -m http.server 8123

then open http://localhost:8123 — no build step, so a refresh is all it
takes to see a change. After a visual change to the scene, actually look
at it (screenshot the page) before calling it done; judging a 3D change
by reading the code doesn't work.

## Branches

`main` is the only branch, and it is what's deployed. Work on it
directly and push when a change is finished — every push to `main` goes
live on Vercel. Commit a working state before a big change so there's a
point to come back to.

Two directions were tried and rejected; don't re-propose them: a
cliffs/pine-trees/chalet "alpine meadow" look, and a standalone
grass-blade rendering prototype (`grass-lab/`).

## Working features (DO NOT modify unless I ask)

These are finished and confirmed good. They have survived every
landscape rebuild untouched. Leave them alone.

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
  has never changed — only the landscape around it has

## Future ideas (don't build yet)

- **Real-time day/night sync** — show a night version of the scene when
  it's actually night for her. A night scene (dark indigo sky, layered
  star fields, moon sprite, cool moonlight, one warm glow at the mailbox)
  used to exist on a branch, but that branch was deleted on 2026-09-17 —
  so this now means rebuilding the night look as well as the switching
  logic. Undecided: what counts as "sunset" (fixed hours vs. actual local
  sunset time), whether it snaps or transitions, and timezone handling.
- Tree to one side of the mailbox (bare winter style or with round foliage)
- Fireflies, ambient sound, wind effect
- Better mailbox model proportions

## Version control

- GitHub repo: https://github.com/terzievski13/love-letter
- Commit at meaningful checkpoints with descriptive messages
- Pushing to `main` deploys — so finish and check a change before
  pushing, rather than pushing to try it out

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

- All files are flat in the project root (no src/ folder), except:
  `api/` (server endpoints), `lib/` (server helpers), `flowers/` and
  `objects/` (.glb models used by the scene)
- 3D scene logic in three-scene.js — see LANDSCAPE.md
- React UI overlay in app.jsx; envelope + letter components in
  envelope.jsx
- Letter content in letters.jsx — see ADDING-A-LETTER.md
- Notification code in api/, lib/, sw.js, notify.jsx — see
  NOTIFICATIONS.md
- tweaks.jsx / tweaks-panel.jsx are a developer tweaking panel, loaded
  on every page load by index.html. Not part of the experience she
  sees; leave alone unless asked
- `grass-tuft.glb` in the root is a modeled asset nothing currently
  loads (grass was cut) — keep it, it's regeneratable work
- Use TypeScript-friendly patterns even though we're in plain JS
