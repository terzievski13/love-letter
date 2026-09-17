# The landscape

Everything about the 3D scene *around* the mailbox: terrain, mountains,
water, the path, rocks, flowers, sun, sky, fog, lighting. All of it lives
in three-scene.js.

Read this before changing anything you can see out of the mailbox's
window. The mailbox model, the letter flow and the camera moves are NOT
in here — those are in CLAUDE.md under "Working features", and they are
not to be touched.

Two rules that break the scene silently if ignored:

1. **Every object placed on the ground must take its y from
   `groundHeight(x,z)`.** Hard-coding a height leaves things floating or
   buried once the terrain changes.
2. **All shadow-casters must sit inside the sun's ±10 shadow box.** Put a
   caster outside it and its shadow just vanishes with no error. Widening
   the box is not the fix — that blurs the mailbox's own shadow.

## What the scene is now

The July 2026 "Sunset Headland" rebuild (7 phases, one commit each)
replaced the whole landscape; the mailbox/letter/camera systems were
untouched. What it left:

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
  the sun gap lives at x≈−95.
- **Water**: one shader-driven plane (`buildWater`) — a depth-based
  color ramp, two slow traveling ripples read as a fake bump normal, and
  a twinkling Blinn-Phong glitter path aimed at the sun's real position.
  An earlier version stacked canvas textures and a separate dashed-streak
  plane; both are gone. Sun disc and halo sprites sit at (−95, −130). All
  landscape motion runs through the `tickers` array → `updateLandscape(t)`
  (one line in `animate()`).
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
  regeneratable from the .glb if grass comes back. Flowers sit in
  drifts between the rocks — daisy, rose and cosmos-daisy (pink, blue,
  orange) loaded from `flowers/*.glb`, plus a lavender built in code;
  all merged into instanced geometry. How each is placed is commented in
  three-scene.js at the flowers section. NO
  trees (pines cut on request). All shadow-casters sit inside the sun's
  ±10 shadow box — don't place casters outside it (shadows silently
  vanish), don't widen the box (blurs the mailbox shadow), and blades
  don't cast (shadow-map noise).
- **Story details**: lighthouse islet + tiny village at (1.5, −52) —
  must stay in FRONT of the foothill ridge strip (z ≥ −67) or it gets
  swallowed — and a sailboat drifting across z=−55 on a ~4-min loop.
  Each is one function call in init(); trivial to cut.

Possible next tweaks:
1. Snow caps / rock hues on the main range may want tuning once seen
   on a real screen — bands are relative to each summit (see
   makeRange), tweak the sstep thresholds.
2. Glitter is subtle. It comes from the specular/twinkle block in
   buildWater's fragment shader now — there is no streak plane to tweak.
3. Mailbox model proportions/material — unchanged, not urgent.

## Landscape design decisions (confirmed)

- Scene mood: warm sunset, NOT "A Short Hike" style (too game-y).
- Ground fills more of the frame than a typical reference photo would (wanted)
- Mailbox stays centred, on flat ground
- Sky gradient (top → horizon): #b84830 → #e07040 → #f0a868 → #eeb890
- Water: deep blue far (#1e3248) → clean near-shore blue (#68a8c4), warm glitter path
- Mountains: real lit geometry (see above), warm rock tones, warm-tinted
  snow (#f6ddd0 — never pure white), fog kept at (30, 175)
- Canvas-texture gotcha learned the hard way: THREE.Color stores hex as
  LINEAR; call convertLinearToSRGB() before writing pixels to a canvas
  that becomes an sRGB texture, or every color double-darkens.
