# The picker lab

A sandbox for choosing what replaces the fanned envelope spread. It is
**not part of the site** — nothing in `index.html` loads it.

**Outcome (Oct 2026): the Deck won** and is now the real picker, in
`deck.jsx`. The site's version differs from the lab's in a few ways
forced by the real scene: side envelopes darken instead of turning
see-through (the landscape showed through them), the counter and slider
move up while the notification prompt is showing, and the open letter
is shown at 80% on phones as it always was. The lab is kept for
reference; its Deck is not kept in sync with `deck.jsx`.

    python3 -m http.server 8123

then open <http://localhost:8123/picker-lab.html>.

## Why it exists

The fan puts every envelope on the same spot and rotates each one 6°
further than the last. At three letters it's lovely, at five it's tight,
and it has no answer at all for fifty — the outer envelopes rotate off
the screen and nothing scrolls. Letters are never deleted, so the picker
has to work at any number.

## What's in it

Four complete prototypes, all running on the real letters and all
handing off to the **real** letter unfold (`window.Letter` from
`envelope.jsx`), so what you feel after choosing is exactly what she
feels today.

| | | Scales by |
| --- | --- | --- |
| **1 Deck** | one envelope at a time, swipe with your thumb | only ever draws 5 envelopes; the rail at the bottom scrubs to any letter |
| **2 Drawer** | all of them stacked like files, you read the top edges | ordinary scrolling; ~17 letters visible per phone screen |
| **3 Timeline** | a thread of months with a wax seal per letter | scrolling, plus month headings that tell you where you are |
| **4 Wall** | a grid of small envelopes | scrolling; most letters per screen, least feeling |

## The controls along the top

They're developer controls, not part of what she sees — **hide this bar**
gets rid of them, and the ☰ button brings them back.

- **letters** — real (5), 12, 50, 200. The filler letters have believable
  titles and dates so crowding looks honest.
- **order** — newest first, or oldest first like a diary.
- **new-letter glow** — whether unread letters glow and get a "ново" tag.
- **unread** — newest 2 (she's been keeping up) or all (her first visit).
- **frame** — fill the window, or a phone-sized frame on a desktop screen.
- **reset** — forget what you clicked while playing.

Every control is in the address bar, so any state can be linked:

    picker-lab.html#view=drawer&n=50&order=new&glow=1&unread=2&bar=0

## Two things worth knowing before choosing

- **The deck is the only one where reaching an old letter takes work.**
  The rail makes it possible, but at 200 letters the other three are
  faster to search.
- **The timeline needs a real date.** It sorts letters by the `date`
  field so months come out in order. That field is free text today
  ("Jul 25, 2026") and happens to be readable — if the timeline wins, the
  format has to stay that way, or letters should get a proper date field.
  The other three keep the file order, exactly like the site does now.

## Files

- `picker-lab.html` — the page, the styling, the control bar
- `picker-lab.jsx` — the four prototypes and the reader
- `envelope.jsx` — two `window.*` export lines added at the very end so
  the lab can use the real envelope and the real letter. Nothing else in
  that file changed.
