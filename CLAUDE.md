# Letters, From Me

A personal one-page website for my girlfriend. A 3D interactive mailbox
where I leave her letters over time — and, since Oct 2026, where she can
write back to me. Hosted on Vercel at:
https://lovelettersisa.vercel.app
(the same deployment also answers on other Vercel domains, e.g.
mymailbox.vercel.app — push subscriptions belong to the domain they were
made on, see NOTIFICATIONS.md)

The ongoing work is adding letters over time, making sure she finds out
when one arrives, and reading what she sends back.

## Where the details are — check here first

This file is the overview. Four companion files hold the detail, and
each one is the source of truth for its area. **Read the relevant file
before changing anything in that area** — don't re-derive it from the
code, and don't work from this summary alone:

| If the change touches… | Read first |
| --- | --- |
| Terrain, mountains, water, sky, sun, fog, the path, rocks, flowers, lighting, anything in three-scene.js | **LANDSCAPE.md** |
| Push notifications or email, api/, lib/, sw.js, notify.jsx, vercel.json, .github/workflows/, the "did she get told" question | **NOTIFICATIONS.md** |
| Writing, editing, timing or publishing a letter; letters.jsx; the secret writing tool (writer.jsx, api/write-letter.js, lib/github.js, the long-press on the mailbox) | **ADDING-A-LETTER.md** |
| Her letters back to you: the bundle, "✎ напиши ми", the secret word, edit/delete, the push to your phone (reply.jsx, api/her-letters.js) | **LETTERS-FROM-HER.md** |

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
takes to see a change. That server only serves files: the `api/`
endpoints don't run locally, so her bundle shows "още нищо", her writing
screen and the writing tool can't log in, and no push goes anywhere. To
test those screens locally, swap `window.fetch` for a pretend server in
the page (that's how they were checked). `npm test` runs the server code's
offline tests (notifications, the writing tool, her letters) — nothing is
sent or saved. After a visual change to the scene, actually look
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
- "Pick a letter" view: a deck (deck.jsx) — one envelope centred, its
  neighbours tilted and darkened either side. Swipe, arrow buttons,
  arrow keys, or the slider along the bottom move through it; only five
  envelopes are ever drawn, so it works at any number of letters.
  Newest letter first. Replaced the fanned spread in Oct 2026 because
  the fan became impossible to click precisely even at 5 letters
- Letters she hasn't opened glow softly and get a "ново" tag. "Opened"
  is remembered per device in localStorage (`letters:read`); the first
  time a device runs it, everything already in the mailbox counts as read
- Tap the centre envelope → it flies to the middle, flap opens, letter
  unfolds, handwritten text appears line by line (Letter, envelope.jsx)
- "Back to mailbox" button closes letter and returns to the same envelope
- The deck starts from the real screen size. It used to guess a
  laptop-sized screen until it measured, which made the envelopes appear
  too big on phones and visibly shrink (fixed 2026-10-08)
- Envelope art (EnvelopeSVG in envelope.jsx, chosen 2026-10-08 over six
  rounds of designs): the original pointed flap; a raised, hand-poured
  wax seal with a heart pressed in; the handwritten address *below* the
  seal so nothing covers it; a wide engraved stamp ("С ЛЮБОВ" on a
  ribbon banner) stuck on top of the flap. Seal and stamp both take the
  letter's `wax` colour and fade out as the flap opens. Tried and turned
  down — don't re-propose: airmail stripes / painted-scene stamp /
  postmark, visible side and bottom folds on the back (looked strange),
  ribbons, gold foil, twine and flowers. The seal's shadow is a gradient,
  not an SVG filter, on purpose: the seal rides the flap's 3D rotation,
  and Safari draws filters inside 3D-rotated content unreliably
- Handwritten font (Caveat), beautiful Fraunces serif in titles;
  Cormorant Garamond only for the stamp's lettering (Fraunces has no
  Cyrillic letters)

### Her letters back to me (Oct 2026)
- Status: the screens are confirmed good on my phone (2026-10-08). The
  push to my phone has not yet had a real end-to-end test
- A tied bundle bottom-right inside the mailbox opens her pile in the same
  deck; "✎ напиши ми" (top right) is her writing screen; the secret word
  is asked once per device; edit/delete only where the word is known
- Her letters live in Redis, not letters.jsx; a new one pushes to my
  phone. Full detail: LETTERS-FROM-HER.md
- Her writing screen and my writing tool keep their paper above the
  iPhone keyboard (the page can't scroll, so they follow the visible area)

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
- React UI overlay in app.jsx; the letter picker (deck) and reader in
  deck.jsx; envelope art + letter unfold in envelope.jsx. The old fan
  component (`Envelope` in envelope.jsx) is no longer used by the site
- Letter content in letters.jsx — see ADDING-A-LETTER.md. Letters can
  also be written from the site: hold the mailbox ~2s → writer.jsx, which
  commits letters.jsx via GitHub (same file)
- Notification code in api/, lib/, sw.js, notify.jsx — see
  NOTIFICATIONS.md
- Her letters to me in reply.jsx (bundle, writing screen, edit/delete),
  saved in Redis via api/her-letters.js — see LETTERS-FROM-HER.md
- tweaks.jsx / tweaks-panel.jsx are a developer tweaking panel, loaded
  on every page load by index.html. Not part of the experience she
  sees; leave alone unless asked
- `grass-tuft.glb` in the root is a modeled asset nothing currently
  loads (grass was cut) — keep it, it's regeneratable work
- picker-lab.html / picker-lab.jsx are the design sandbox where the deck
  was chosen over three other pickers — not loaded by the site. See
  PICKER-LAB.md
- session-notes.md is a dated snapshot from May 2026 (old site address,
  old to-do list) — history only; this file is the current picture
- outbox-lab.html / outbox-lab.jsx are a design sandbox for where her
  letters to me sit next to mine (three layouts on the real deck) — not
  loaded by the site. B · bundle won and is now built in reply.jsx. See
  OUTBOX-LAB.md
- Use TypeScript-friendly patterns even though we're in plain JS
