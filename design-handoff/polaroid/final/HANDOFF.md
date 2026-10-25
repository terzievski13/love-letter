# Polaroid photos in letters: final design, ready to implement

Chosen direction: **"A · Taped in", unfiltered.** This replaces the current
`.pp-*` polaroid styling. Open `preview.html` in a browser to see the target
at laptop size, phone size, tapped open and in the envelope.

## Files

- `polaroid.css`: the complete CSS for the print and its placement. It replaces
  the old `.pp`, `.pp-polaroid`, `.pp-img`, `.pp-cap`, `.pp-tape` and
  `.pl-slot` / `.pl-item` rules.
- `preview.html`: a self-contained demo. The CSS inside it is identical to
  `polaroid.css`.

## Task for Claude Code

1. Replace the existing polaroid CSS in the site with `polaroid.css`. Do not
   change anything else on the page (paper, lines, letter handwriting, dark
   background, envelope).
2. Update the markup that renders a photo to the structure below. The class
   `pp-polaroid` is no longer used, and the caption is now a `<figcaption>`.
3. Set `--wax` to the letter's wax-seal colour (one hex) on the letter's paper
   element **and** on the tapped-open viewer. The tape colour is derived from
   it in CSS.
4. Give every print small, unequal differences, generated **deterministically**
   from the photo's index (or id), so a photo looks the same on every visit.
   Use the helper below.
5. On phones, make in-letter prints **200px** wide (previously 173px), so the
   caption is about 14–15px on screen at the 80% letter scale. Laptop sizes
   stay the same: 241px single, 172px in a pair.
6. Keep the tape when a photo is tapped open (the `.viewer` rules handle it).
   Prints peeking out of the envelope get **no tape and an empty caption**.

## Markup

```html
<div class="pl-slot left">            <!-- left | right | many (a pair) -->
  <div class="pl-item" style="--w: 241px">
    <figure class="pp" style="--tilt: -2.4deg; --cr: -1.5deg">
      <span class="pp-tape" style="--tx: 47%; --tr: -4deg; --tl: .4"></span>
      <div class="pp-img"><img src="…" alt=""></div>
      <figcaption class="pp-cap">нашата неделя</figcaption>
    </figure>
  </div>
</div>
```

Envelope (small, 100px): leave out the `.pp-tape` span and leave the
`figcaption` empty.

Slots keep alternating left and right as today. In a pair (`.pl-slot.many`),
the second print overlaps the first by 10% and sits a little lower. The first
print sits on top, so its caption is never covered.

## Per-photo variation helper

The tape must stay **near the centre**: `--tx` within 47–53%. Further off
centre looked wrong.

```js
// Deterministic "random" in [0,1) from a photo index or id
function seeded(n, salt) {
  const x = Math.sin((n + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const lerp = (a, b, t) => a + (b - a) * t;

// i = photo index within the letter (or a numeric hash of its id)
function polaroidVars(i) {
  const side = i % 2 === 0 ? -1 : 1; // alternate the lean, like the left/right slots
  return {
    figure: `--tilt: ${(side * lerp(1.6, 3.2, seeded(i, 1))).toFixed(1)}deg;` +
            ` --cr: ${lerp(-2, 0.5, seeded(i, 2)).toFixed(1)}deg`,
    tape:   `--tx: ${lerp(47, 53, seeded(i, 3)).toFixed(1)}%;` +
            ` --tr: ${lerp(-4.5, 3.5, seeded(i, 4)).toFixed(1)}deg;` +
            ` --tl: ${lerp(0.34, 0.40, seeded(i, 5)).toFixed(2)}`,
  };
}
```

When tapped open, use a near-flat tilt for the figure (about −0.8deg) but keep
that photo's tape variables.

## Rules to keep

- Everything inside a print is a fraction of `--w`. The only exception is the
  frame grain, which uses fixed 3–5px dots on purpose so it stays crisp at
  any size.
- No image files except the photo. No filters on the photo: it is shown
  unfiltered.
- Photos are cropped to a square with `object-fit: cover`. For a wide group
  photo, `object-position` on the `<img>` can shift the crop (the preview uses
  `62% 50%` on the group photo).
- The caption font is Caveat 600, in ink `#2c3a5a`. Caveat is already loaded by
  the site. The 600 weight must be included in the Google Fonts link.
- `color-mix()` needs iOS 16.2 or newer. Older devices fall back to a neutral
  tape through the `@supports` rule at the end of the CSS.
