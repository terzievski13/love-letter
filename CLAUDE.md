# Letters, From Me

A personal one-page website for my girlfriend. A 3D interactive mailbox 
where I leave her letters over time. Hosted on Vercel at:
https://lovelettersisa.vercel.app

**She has seen it.** As of August 2026 she has opened the site and read
letters — this changed in the 2026-08-22 session, and the note here used
to say the opposite, so don't trust any older prose claiming she hasn't.
The goal now is adding letters over time, and making sure she finds out
when one arrives (see Notifications below).

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

- **`main`** — the live/deployed version. As of 2026-07-24 (commit
  `7843a57`) **it is identical to `picnic-dome`** — both run the
  Sunset Headland rebuild described below. (The old low-poly cone
  mountains are gone from `main`; that was true in an earlier phase of
  this project but the description sat stale in this file for a while
  — don't assume this section is current without checking. If it
  matters, verify with `git diff main picnic-dome` rather than trusting
  the prose.) This is genuinely all she's ever seen (i.e. nothing — see
  above). Don't edit `main` directly; land finished work here via
  merge/push from `picnic-dome` when ready.
- **`picnic-dome`** (usual working branch) — active development.
  This is the **Day** version: sunset sky, lake/water, and smooth
  quadratic-ridge mountain silhouettes (rounder than the low-poly cones
  of an earlier iteration), warm color palette. Ground is a flat
  `BoxGeometry` — despite the branch name there is no literal dome in
  the current geometry; the name is just history from an earlier
  domed-hill experiment that got replaced. In sync with `main` as of
  2026-07-24 (see above) — expect drift again as soon as new commits
  land here without a matching push to `main`.
- **`picnic-dome-night`** — parked, not merged anywhere. This is the
  **Night** version: dark indigo sky, three layered star fields, a
  glowing moon sprite, cool moonlight replacing the sun, and one warm
  point-light glow at the mailbox itself (a lit window in the dark).
  Reserved for the real-time day/night feature below — don't build
  that feature until asked, but don't discard this branch either.
- **`picnic-dome-no-grass`** — not a separate line of work, just a
  named checkpoint: it's an ancestor commit of `picnic-dome` (not a
  diverging branch), sitting right after grass was cut but *before*
  the flower petal-geometry rework. Grass = removed. Flowers = the
  old flattened-sphere/cone placeholder shapes. Kept as a reference
  point in case the daisy/buttercup/spike rework needs comparing
  against or backing out independently of the grass decision.
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

## Current state of `picnic-dome` (also `main` — in sync as of 2026-07-24)

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
  ripple overlays/streak/boat heights all moved with it). Path (matched
  to the user's AI-render reference image, July 2026): a WIDE worn-dirt
  band (`pathMask`, w ≈ 0.5–0.8) on a CUBIC bezier S-curve
  (`PATH_P0/C1/C2/P3`, `pathBez`) — enters at the frame's bottom edge
  left of the mailbox, bows LEFT, then swings back to arrive at the
  mailbox straight from the FRONT (C2 sits directly in front of P3 in x
  so the final tangent runs along −z; move C2 sideways and the approach
  goes diagonal again), where it opens into a rounded dirt CLEARING the
  mailbox stands on (the `clearing` disc in `pathMask`, a bit wider than
  the path per the reference). P0 sits just past the frame's bottom edge —
  found by PROJECTING through the camera (bottom edge meets ground at
  z≈4.0–4.3 near x=0; the projection helper needs
  camera.updateMatrixWorld(true) first), never eyeballed. Stones are
  flat worn slab pavers embedded in the dirt: `makeStoneGeometry` lathe
  puck profile squashed low (sy = s·0.3), de-indexed for faceted
  shading, x/z-only jitter, gray-tan, arc-length spaced along the curve
  (`tAtFraction`) so they don't bunch; castShadow OFF (flat slabs only
  smear shadow-map blotches). Path pebble speckle kept LOW-contrast —
  at ~11 texels/world-unit any dark blob magnifies into what looks like
  a stray shadow. Earlier looks, in order: "no stones, wide sandy path"
  → "narrow trail + melted sphere pads" → "raised faceted pucks on a
  right-bowing quadratic" → current. The small "path left" rock cluster
  lives at (−2.4, 2.7), clear of the current curve.
  Gray rocks in nestled
  clusters (big anchors at bottom frame corners). NO grass — removed
  entirely (was a real 3D tuft model, grass-tuft.glb; several
  iterations — card billboards, then the tuft model, brightness/contrast
  tuning — ended with the user asking to cut it, so the ground is bare
  between rocks/flowers/path for now). `grass-tuft.glb` is still in the
  project root (the user's modeled asset) but nothing loads it; the
  generated `grass-tuft-data.js` extraction was deleted since it's
  regeneratable from the .glb if grass comes back. Flowers = white
  daisies w/ yellow centers + buttercups + pink spikes, in drifts —
  real 3D petal geometry (not flattened spheres): daisies/buttercups
  are individually-shaped rounded petals fanned around a centre and
  merged into one static geometry (`makePetalFlowerGeometry` /
  `mergeInstances` in three-scene.js — hand-rolled merge, no
  BufferGeometryUtils since this project loads bare three.min.js);
  pink spikes are a tall stem of small lathe-turned bell florets
  (`makeBellGeometry`), foxglove-style. NO
  trees (pines cut on request). All shadow-casters sit inside the sun's
  ±10 shadow box — don't place casters outside it (shadows silently
  vanish), don't widen the box (blurs the mailbox shadow), and blades
  don't cast (shadow-map noise).
- **Story details**: lighthouse islet + tiny village at (1.5, −52) —
  must stay in FRONT of the foothill ridge strip (z ≥ −67) or it gets
  swallowed — and a sailboat drifting across z=−55 on a ~4-min loop.
  Each is one function call in init(); trivial to cut.

Possible next tweaks (now live on `main`, but still not shown to her):
1. Snow caps / rock hues on the main range may want tuning once seen
   on a real screen — bands are relative to each summit (see
   makeRange), tweak the sstep thresholds.
2. Glitter streak is subtle; bump dash alpha in buildWater if wanted.
3. Mailbox model proportions/material — unchanged, not urgent.

## Notifications (added 2026-08-22, branch `notifications`)

Her phone gets a push notification, plus an email as backup, whenever a
letter goes live. This is the first server-side code the project has ever
had — everything before it was static files.

**The one thing to understand:** `/api/notify-check` is *idempotent*. It
works out which letters are visible but not yet announced, announces
exactly those, and records it in Redis. Calling it a hundred times sends
one notification. That is deliberate — three separate triggers call it, so
any one of them failing costs nothing:

- GitHub Action on push to `main` — a letter you upload lands within ~2 min
- GitHub Action every 15 min — catches letters that unlock on a timer
- Vercel cron once a day (`vercel.json`) — backstop, because GitHub disables
  scheduled workflows in repos with no commits for 60 days

**The GitHub Action is switched on** (as of 2026-09-11) — it lives at
`.github/workflows/notify.yml`. Getting there needed `gh auth refresh -h
github.com -s workflow` first, since the laptop's `gh` token originally
lacked the `workflow` scope that pushes into `.github/workflows/` require.
All three triggers listed above are live now; a push-triggered or timed
letter is announced within minutes, not a day.

**It never keeps its own copy of the letters.** It reads the deployed
`letters.jsx` and parses the JSON out of the `/*EDITMODE-BEGIN*/` sentinels
that already wrap it, then applies the same `unlockAt` rule app.jsx uses.
So it can only ever announce letters that are genuinely live. It reads the
file off the function's own disk (`includeFiles` in `vercel.json` puts it
there) rather than over HTTP, because Vercel's Deployment Protection
answers requests to protected deployments with a 302 to a login page — an
HTTP self-fetch works on the production domain but fails on every preview.
The HTTP path survives as a fallback and `lettersFrom` in the endpoint's
response says which one was used.

Files: `api/notify-check.js` (the checker), `api/subscribe.js` (public,
stores her subscription), `lib/letters.js` `lib/store.js` `lib/send.js`,
`sw.js` (service worker), `notify.jsx` (the in-site prompt),
`.github/workflows/notify.yml`, `manifest.json`, `icon-{192,512}.png`.

`api/test-real-push.js` also exists (added 2026-09-11) — a **temporary**
diagnostic route, secret-gated the same way as `notify-check`, that sends
any text you like to every stored subscription without touching the real
"announced" bookkeeping. It's how the push pipeline got verified end to
end (confirmed working on a real iPhone). Unlike the real endpoint it can
send arbitrary text, not just the fixed copy, so it's a bit more exposure
than anything else here if the secret ever leaked — meant to be deleted
once no longer needed, not left forever.

Things that will bite you:

- **`sw.js` must never gain a `fetch` handler.** The site transpiles JSX in
  the browser at runtime; a caching service worker would serve a stale,
  half-broken app that is painful to clear from her phone. It handles
  `push` and `notificationclick` only.
- **Push subscriptions are bound to their origin.** One created on a
  preview URL will never receive a push sent from production. After any
  domain change she must re-subscribe.
- **Run `?seed=1` once against a fresh database**, or the first real run
  finds five unannounced letters and fires them all at her at once. The
  endpoint refuses that case with a 409 rather than doing it, but seeding
  is the intended fix.
- The public VAPID key is hardcoded in `notify.jsx` because there is no
  build step and therefore no way to inject env vars into browser code.
  That is fine — it is public by design. The private half is in Vercel's
  environment variables and in `.vapid-keys.json`, which is gitignored.
  **The repo is public**, so nothing secret may ever be committed.
- Wording for the prompt and the notifications lives in `NOTIFY_COPY` at
  the top of `notify.jsx` and `COPY` at the top of `lib/send.js`. It is in
  Bulgarian and deliberately never names the letter — some titles are
  spoilers.

Run `npm test` for the offline test suite (40 checks, no network, nothing
sent): duplicate suppression, the backlog guard, simultaneous triggers,
timed unlocks, dead-subscription pruning, delivery failure and retry, and
the subscribe endpoint's validation.

Environment variables (Vercel): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `NOTIFY_SECRET`, `CRON_SECRET` (same value),
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `HER_EMAIL`, `MY_EMAIL`, plus Upstash's
own two. `NOTIFY_SECRET` also goes in GitHub → Secrets → Actions.

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
