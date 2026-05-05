# Session Notes — 6 May 2026

## Where we got to

The site is live at https://love-letter-henna.vercel.app
GitHub: https://github.com/terzievski13/love-letter
Auto-deploys every time you push to main.

## What's done and you're happy with

- The letter experience (spread, open, unfold, text reveal) — perfect, don't touch
- Camera zoom animation — reworked this session (see below)
- Door animation — spring with damping 0.84, slows clearly at fully open, no bounce
- Ground, shore edge, blue lake, mountains, atmospheric haze — all good
- Git + GitHub + Vercel all set up and working
- Localhost testing: run `python3 -m http.server 8000`, kill with `kill $(lsof -ti :8000)`

## Camera animation — fully reworked this session (confirmed working)

- **Arc direction**: clockwise sweep (positive sweep value) — camera arcs around the 
  left side of the mailbox mid-journey before settling at the front
- **Arc size**: 0.6 radians (up from 0.22), using sin²(k·π) bell curve for smooth start
- **Easing**: easeInOutCubic for the position lerp — softer start and end than quad
- **Duration**: 3000ms, set in app.jsx line 25 (NOT the default in cameraTo — 
  the default is ignored because app.jsx always passes an explicit value)
- **Timings in app.jsx**:
  - `250ms` delay before camera starts moving (lets door begin opening first)
  - `3000ms` camera animation duration
  - `3300ms` letters appear (must be after camera finishes, so > 250 + 3000)
- **End positions** (in three-scene.js, CAM.inside):
  - Desktop: pos [0, 2.2, 3], look [0, 1.65, 0]
  - Mobile (portrait): pos [0, 2.5, 5], look [0, 1.65, 0]
- **Outside start**: pos [4, 2.6, 8.2], look [0, 1.7, 0]
- **Camera jump fix**: onResize now skips if canvas dimensions haven't changed —
  prevents the ResizeObserver from nudging the camera when the letter overlay mounts

## Motion blur — tried and removed

Tried CSS canvas blur (easy, no dependencies) but it blurred the mailbox too.
No clean way to exclude the mailbox without post-processing. Removed entirely.
The cubic easing gives enough cinematic feel without blur.

## What still needs fixing next session

1. **Mountains** — still only on the right side of the frame. Need to be spread 
   across the full width behind the lake. Reference: bench by Lake Lucerne photo,
   dramatic peaks spanning the horizon, mailbox centred in front.

2. **Tree** — one tree to one side (not centred). Style TBD (bare or leafy).

3. **Mailbox model** — low priority, proportions could be nicer eventually.

## Reminder of what you want

- Warm sunset colours throughout (keep)
- Blue water
- Big dramatic mountains like the Alps/Lucerne reference
- Ground fills more of the frame than the reference photo
- Mailbox centred
- Soft + round style, not hard-edged low-poly game art
