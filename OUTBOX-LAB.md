# The outbox lab

A sandbox for choosing how her letters to you sit next to your letters to
her inside the mailbox. It is **not part of the site** — nothing in
`index.html` loads it, and nothing in it is sent or saved anywhere except
this browser.

    python3 -m http.server 8123

then open <http://localhost:8123/outbox-lab.html> (or
`/outbox-lab.html` on the live site, to try it on a phone).

## What's in it

Three layouts, all built on the **real** deck (`window.LetterDeck` from
`deck.jsx`), so swiping, opening and the letter unfold behave exactly as
on the site.

| | |
| --- | --- |
| **A · switch** | a "от мен \| от теб" switch at the top flips the whole pile |
| **B · bundle** | your letters stay the main pile; hers are a tied bundle in the bottom-right corner that opens into its own pile |
| **C · shelves** | two shelves, "писма от мен" and "писма от теб", changed with the arrows in the heading |

C changes shelves with arrows rather than a swipe on purpose: a sideways
swipe already moves through the deck, and the two would fight.

Every layout also has:

- **✎ напиши ми** — her writing screen: title, letter, envelope and wax
  colours with a live envelope preview. The first time it asks for the
  secret word (in the lab any word works), then never again on that
  device.
- **edit / delete** on her own letters, floating under the open letter.

## Wording

The mailbox talks in your voice (like "да звънна ли…"), so the piles are
"от мен" (yours) and "от теб" (hers) — that reads right for her, and the
site can't tell which of you is looking anyway. All of it is in `COPY`
at the top of `outbox-lab.jsx`.

## The controls along the top

Developer controls, not part of what she sees — **hide this bar** hides
them, ☰ (bottom-left) brings them back.

- **layout** — A, B or C
- **her letters** — 0, 1, 5 or 20 sample letters
- **bundle size** (layout B only) — a slider from 50% to 180%; the bundle
  grows from its bottom-right corner. `bs=` in the address bar
- **frame** — fill the window, or a phone frame on a desktop screen. The
  phone frame runs the lab inside a real 390px-wide window, so it lays
  itself out exactly as it would on a phone (its controls follow the bar)
- **reset** — forget the secret word and any letters written while playing

Every control is in the address bar, e.g.
`outbox-lab.html#view=bundle&n=20&bar=0`.

## Known lab shortcuts (for the real build, not bugs here)

- Her sample letters are marked "read" so they don't glow on her phone.
  On the real site the same letters *should* glow on yours — the real
  build has to tell the two of you apart.
- The envelope art still says "For my love" on her letters too — fine
  both ways, but it's in `envelope.jsx` if that ever needs to differ.

## Files

- `outbox-lab.html` — the page, styling (deck styles copied from
  `index.html`), control bar
- `outbox-lab.jsx` — the three layouts, the writing screen, sample letters
