# The photo lab

A sandbox for choosing how photos look inside a letter. It is **not part
of the site**: nothing in `index.html` loads it, and nothing in it is
uploaded or saved anywhere.

**Decided 2026-10-26: the polaroid, "A · Taped in", on the paper.** It's
built for real in `photos.jsx` plus the "photos in a letter" CSS in
`index.html`. How to add photos to a letter is in ADDING-A-LETTER.md. The
lab doesn't have the final look: it still shows the rounds that led to it,
and stays as a record and a place to try changes.

    python3 -m http.server 8123

then open <http://localhost:8123/photo-lab.html> (or `/photo-lab.html` on
the live site, to try it on a phone).

It runs on the real letters, the real deck and the real reader from
`deck.jsx`. Only the unfolded letter is swapped for a copy that can hold
photos (`window.Letter` is replaced in `photo-lab.jsx`).

## How it was chosen

1. **Four styles** (taped polaroid, album photo corners, vintage deckled
   print, postcard that flips over) and **two places** (stuck on the
   paper, or loose prints sliding out of the envelope). The polaroid won.
   It's still there as "first try"; the other three open from the address
   bar: `#kind=corners`, `#kind=deckled`, `#kind=postcard`.
2. **A critique of the polaroid, and three directions:**
   - **A · candid**: Instax, washi tape, develops on opening;
   - **B · kept for years**: faded, clear tape, a date on the border;
   - **C · placed with care**: the text wraps around the photo.

   The first try was still the favourite.
3. **Claude Design refined the first try** from a brief listing what was
   wrong with it:
   - the tape looked like a striped bar;
   - the print floated above the page;
   - the picture looked like a phone screenshot;
   - the frame was flat;
   - the proportions were squat;
   - the caption was too small on a phone.

   Its version, "A · Taped in", is what the site uses:
   - Polaroid 600 proportions;
   - see-through washi tape tinted from the letter's wax colour, with
     zigzag ends;
   - a contact shadow, so the print lies flat;
   - a grained frame;
   - a ballpoint-blue Caveat caption;
   - small, unequal differences per print.

   Its hand-off notes are in `design-handoff/polaroid/final/` (HANDOFF.md
   and polaroid.css). Its preview.html isn't in the repo: it has real
   photos built in, and the repo is public.
4. **Placement:** on the paper. Each photo goes where you put a `[📷 1]`
   marker in the text, which is how text editors that store plain text
   place images. Photos without a marker are spread between paragraphs.
   "In the envelope" was not taken further.

Two things learned along the way:
- Photos have to be downloaded and decoded **before** the letter opens.
  When they loaded on open, the text visibly reflowed around them, which
  felt glitchy. The deck now fetches the centred letter's photos and its
  neighbours' ahead of time, and each photo's space is reserved from the
  start.
- On a phone the letter is shown at 80%, so a print there is 200px wide.
  That keeps the caption about 14px on screen.

## The controls along the top

Developer controls, not part of what she sees. **hide this bar** hides
them, and ☰ brings them back. Each one is mirrored into the address
(`#kind=…&place=…&n=…`).

- **style**: first try, or the A/B/C directions from round 2
- **where**: on the paper, or in the envelope
- **photos**: 1, 3 or 8 sample photos; **use my photos…** takes your own
  (they stay in the browser)
- **captions**: on or off
- **frame**: fill the window, or a phone-sized frame on a laptop
