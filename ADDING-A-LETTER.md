# Adding a letter

Everything a letter needs lives in one file: **letters.jsx**. There is no
build step — you edit that file, push it, and it's live. Nothing else has
to change, and nothing in the 3D scene or the letter animation needs
touching to add a letter.

## The short version

1. Open `letters.jsx`.
2. Copy one of the existing letter blocks and change the values.
3. Give it a new `id` — one higher than the last letter.
4. Check it (below), then commit and push to `main`.
5. Vercel deploys in a minute or two, and her phone gets a notification
   on its own — see NOTIFICATIONS.md. You don't have to do anything for
   that to happen.

## What a letter looks like

```json
{
  "id": 6,
  "date": "Sep 17, 2026",
  "title": "Заглавие",
  "envelopeColor": "#e8d4b8",
  "wax": "#7a5a8a",
  "body": "Първи ред.\n\nВтори абзац."
}
```

| Field | What it does |
| --- | --- |
| `id` | Any number, but it must be unique. It also picks which paper-grain pattern the envelope gets (`id % 9`), so two letters with the same id look identical and break the click handling. |
| `date` | Free text, printed on the envelope and at the top of the letter. It is **decoration only** — it does not control when the letter appears. |
| `title` | Handwritten label on the envelope. |
| `envelopeColor` | Paper color, hex. |
| `wax` | Wax seal color, hex. The lighter/darker shades of the seal are worked out from this one value. |
| `body` | The letter itself. `\n` starts a new line, `\n\n` leaves a blank line between paragraphs. The text reveals line by line, so short paragraphs read better than one long block. |
| `unlockAt` | Optional. Hides the letter until a moment in time — see below. |

## Making a letter appear later

Add `unlockAt` with a UTC timestamp:

```json
"unlockAt": "2026-07-25T06:00:00Z"
```

The `Z` means UTC, **not** Sofia time. Bulgaria is UTC+3 in summer and
UTC+2 in winter, so:

- `06:00Z` = 9:00 in Sofia in summer (late March – late October)
- `07:00Z` = 9:00 in Sofia in winter

Until that moment the letter isn't in the mailbox at all — it isn't
hidden behind anything she could click, it simply isn't there. At that
moment it appears, and the notification goes out within about 15 minutes
without you doing anything.

You can push a timed letter days in advance. That's the point of it.

## Rules you can't break

- **Everything between `/*EDITMODE-BEGIN*/` and `/*EDITMODE-END*/` must
  stay strict JSON.** Double quotes around every key and string, no
  trailing comma after the last item in a list, no `//` comments. The
  notification system runs `JSON.parse` on exactly that block
  (`lib/letters.js`), so a single stray comma means letters still show on
  the site — the browser is more forgiving — but **the notification fails**:
  the endpoint errors out instead of sending anything.
- **Don't rename or delete the two sentinel comments.** They're how the
  server finds the letters.
- **Keep the settings after the letters list** (`"scene"`, `"palette"`,
  `"handwriting"`, `"showFlag"`) — they belong to the same block.
- Letters appear in the mailbox in the order they're written in the file.

## Check before you push

Run this in the project folder. It reads the file exactly the way the
notification system does, so if it prints OK, notifications will work:

```bash
node -e 'const s=require("fs").readFileSync("letters.jsx","utf8"),a=s.indexOf("/*EDITMODE-BEGIN*/")+18,b=s.indexOf("/*EDITMODE-END*/");const d=JSON.parse(s.slice(a,b));console.log("OK —",d.letters.length,"letters:",d.letters.map(l=>l.id).join(","))'
```

To actually look at it first:

```bash
python3 -m http.server 8123
```

then open `http://localhost:8123`. A timed letter won't show up locally
until its `unlockAt` passes — to preview one, temporarily set its
`unlockAt` to a date in the past, look at it, then set it back before
pushing. (Editing the value keeps the block valid JSON; commenting the
line out does not.)

## Then

```bash
git add letters.jsx
git commit -m "Add letter: <title>"
git push
```

Pushing to `main` is what publishes it. There's no separate deploy step.
