# Letters from her

She can write back. Inside the mailbox there's a **"✎ напиши ми"** button
(top right) and a **tied bundle** of her letters (bottom right). Tapping the
bundle swaps the deck to her pile; "← обратно към моите" swaps back. Added
2026-10-08, designed in `outbox-lab.html` (layout B · bundle). Read this
before touching `reply.jsx`, `api/her-letters.js`, or the her-letters parts
of `lib/store.js`, `api/subscribe.js` and `app.jsx`.

## How it works

- **Her writing screen** (`reply.jsx`, `HerComposer`): title, letter,
  envelope and wax colour, live envelope preview. The first time on a device
  it asks for the **secret word**, checks it with the server, and remembers
  it (localStorage `mailbox:her-word`). It never asks again on that device
  unless the word changes. An unsent letter is kept in `mailbox:her-draft`.
- **Edit / delete**: buttons under her open letter, but **only on a device
  that knows the word**. Delete takes two taps.
- **Saved in Redis**, not in letters.jsx: she can't commit to GitHub, and
  her letters shouldn't sit in a public repo. Keys:
  - `letters:from-her`: a hash, id → letter JSON
    `{id, date, title, body, envelopeColor, wax, createdAt, updatedAt}`
  - `letters:from-her:next`: a counter. Her ids are 100000 + counter, so
    they never clash with yours (`EnvelopeSVG` needs numeric, unique ids),
    and a deleted id is never reused.
- **Endpoint**: `api/her-letters.js`.
  - `GET` is public. It returns her letters newest first, the same
    openness as yours.
  - `POST` takes the word as `Authorization: Bearer <encodeURIComponent(word)>`.
    The word is URI-encoded because headers can't carry Cyrillic.
  - Actions are `check`, `create`, `update` and `delete`.
  - Capitals and spaces in the word don't matter. A wrong word waits
    1.2 s, then gets a 401.
  - Limits: title 120 characters, letter 30,000, at most 500 letters.
- **"ново"**: her letters glow on your phone until you open them, the same
  `letters:read` list your letters use. The bundle shows a "ново" tag while
  any are unopened. On a device that knows the word they never glow,
  because she wrote them.

## Your phone is told

A **new** letter from her pushes to your phone: `Писмо от нея 💌` /
`„<title>“ те чака в пощенската кутия.` (wording: `COPY.toMe*` in
`lib/send.js`). Edits and deletes are silent. A failed push never fails her
save.

To switch it on: on your phone, hold the mailbox → writer →
**"🔔 звънни ми, когато тя ми пише"** (wording: `NOTIFY_ME_COPY` in
`writer.jsx`). That subscribes the phone to
`/api/subscribe?who=me` (it needs your writer password). The phone is stored
in its own list, `letters:my-subs`, and removed from her list (`letters:subs`).
After that:

- your letters only ever push to her list
- her letters only ever push to yours
- her prompt re-sending your phone's subscription is ignored, so your
  phone can't drift back into her list

## Setup

| Vercel env var | What |
| --- | --- |
| `HER_SECRET_WORD` | The word she types once. Without it, reading still works but writing answers "тайната дума още не е зададена". |

Changing the word logs every device out. Their next save asks for the new
word, and nothing she wrote is lost.

Wording she sees is in `HER_COPY` at the top of `reply.jsx` (Bulgarian).
Tests: `node test-her-letters.js` (part of `npm test`, offline).
