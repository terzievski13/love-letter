# Adding a letter

There are two ways, and they end up in exactly the same place — the
letters list in **letters.jsx**:

- **From the site** (the easy way): hold the mailbox, write, press send.
- **By hand**: edit letters.jsx and push. Still works exactly as before.

## From the site — the writing tool

1. On the outside view, **press and hold the mailbox for about 2
   seconds**. (A normal tap still opens it as usual.)
2. Enter your password — once per device, it's remembered after that.
3. **Write a new letter**: title, the letter, envelope and wax colours
   (the + takes any colour), and when it **arrives** — *now*, or *later*
   on a date and hour in **Sofia time**. No UTC maths; the tool converts.
4. Press **send it now** (twice — the second tap is the "are you sure",
   because her phone gets told within minutes) or **schedule it**.

It's on the site in about 2 minutes and her notification goes out on its
own. An unsent new letter is kept if you close the tool by accident.

Your letters from the app are listed in the tool — tap one to change it.
A letter already in her mailbox stays there when you edit it (only its
text and colours change). The first five letters were written by hand and
can't be changed from the tool.

**How it works:** the tool sends the letter to `api/write-letter.js`,
which checks the password and commits letters.jsx to GitHub through
`lib/github.js` — exactly as if you'd pushed it — so Vercel redeploys and
the notify Action announces it. Letters made this way carry
`"fromApp": true`; that's what lets the tool edit them and nothing else.
The tool itself is `writer.jsx`; the hold is in `three-scene.js`
(`onMailboxLongPress`).

**It needs two settings on Vercel** (Settings → Environment Variables):

| Name | What |
| --- | --- |
| `WRITER_PASSWORD` | the password the tool asks for — make it long; the repo is public, so the endpoint is findable |
| `GITHUB_TOKEN` | a fine-grained GitHub token for **this repo only**, permission **Contents: Read and write**, nothing else |

Without them the tool stays locked (it answers "not set on Vercel"), so
nothing breaks.

**⚠ After the tool has published something, run `git pull` before
editing letters.jsx by hand** — GitHub has a newer copy than your laptop.
If you forget, `git push` refuses and tells you to pull; do that, and
it's fine.

`npm test` checks the tool's back end offline (`test-writer.js`: the
password, the file staying byte-identical, only app letters editable,
two commits landing at once).

## By hand

### The short version

1. Open `letters.jsx`.
2. Copy one of the existing letter blocks and change the values.
3. Give it a new `id` — one higher than the last letter.
4. Check it (below), then commit and push to `main`.
5. Vercel deploys in a minute or two, and her phone gets a notification
   on its own — see NOTIFICATIONS.md. You don't have to do anything for
   that to happen.

### What a letter looks like

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
| `fromApp` | Set by the writing tool on letters it made — leave it alone. |

### Making a letter appear later

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

### Rules you can't break

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
- The mailbox shows the **last** letter in the file first, so add new
  letters at the end of the list.

### Check before you push

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

### Then

```bash
git add letters.jsx
git commit -m "Add letter: <title>"
git push
```

Pushing to `main` is what publishes it. There's no separate deploy step.
