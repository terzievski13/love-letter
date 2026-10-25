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

### Photos

A letter can carry any number of photos (up to 20). In the letter they
are polaroids taped onto the paper, tilted a little, with a handwritten
caption, and she can tap one to see it full screen and swipe through the rest.
Her writing screen has exactly the same photo section, in Bulgarian, so
her letters to you can carry photos too (see LETTERS-FROM-HER.md). Both
screens share it from `photo-editor.jsx`.

1. **Tap in the text where a photo belongs**, then **+ photo** and pick one
   or several. Each one gets a marker like `[📷 1]` on its own line at that
   spot, which is where its polaroid will sit. A tap in the middle of a word
   moves on to the end of the word, so a sentence isn't cut in half.
2. **Two markers on one line** (`[📷 2] [📷 3]`) become an overlapping pair.
3. Under each thumbnail:
   - **drag the photo** to choose what the square shows (polaroids are
     square, so the top/bottom or the sides of the photo are cut off);
   - type a **caption** (optional, a few words);
   - **move to cursor** puts it wherever you last tapped in the text;
   - **×** removes it.
4. A photo without a marker (you deleted it, or picked one before tapping
   in the text) still goes in. It's spread between paragraphs, never after
   the signature.
5. **preview the letter** opens the real letter, exactly as she'll see it.

Numbers always follow the order the photos appear in the text, so they
may change as you move things. That's expected. Each photo is shrunk on
the phone to about 400 KB before it's uploaded, and the send button
waits until every upload has finished. If one fails, tap it to try again.

The photos live in **Vercel Blob** (the project's Storage tab), not in
the repo. Removing a photo from a sent letter deletes it from there when
the edit is saved. A photo that any letter still uses is never deleted.
The free plan holds 1 GB, roughly 16 years at a weekly letter with three
photos. Going over doesn't cost anything, but Vercel switches the photo
storage off, so keep an eye on usage in the Storage tab.

Your letters from the app are listed in the tool — tap one to change it.
At the bottom of the list, **"🔔 звънни ми, когато тя ми пише"** makes
that phone buzz when she writes you a letter (see LETTERS-FROM-HER.md).
On an iPhone the tool's paper moves up with the keyboard, so the field
you're typing in is never hidden behind it.
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

**It needs two settings on Vercel** (Settings → Environments →
Production; redeploy after adding one):

| Name | What |
| --- | --- |
| `WRITER_PASSWORD` | the password the tool asks for — make it long; the repo is public, so the endpoint is findable |
| `GITHUB_TOKEN` | a fine-grained GitHub token for **this repo only**, permission **Contents: Read and write**, nothing else |

Without them the tool stays locked (it answers "not set on Vercel"), so
nothing breaks.

**Photos also need a Blob store connected to the project** (Storage tab →
Create → Blob → connect to this project, **Public** access). Connecting it
adds `BLOB_READ_WRITE_TOKEN` (or `BLOB_STORE_ID` on newer stores) on its
own; redeploy afterwards. Without it, "+ photo" answers "no photo store
yet", and everything else works as before. Uploads go through
`api/letter-photo.js` (`lib/photos.js` talks to the store).

**⚠ After the tool has published something, run `git pull` before
editing letters.jsx by hand** — GitHub has a newer copy than your laptop.
If you forget, `git push` refuses and tells you to pull; do that, and
it's fine.

`npm test` checks the tool's back end offline (`test-writer.js`: the
password, the file staying byte-identical, only app letters editable,
two commits landing at once; `test-photos.js`: uploads, the photo field,
deleting only unused photos, and where markers put each photo).

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
| `wax` | Wax seal color, hex. It also colours the engraved stamp (its shading, heart and "С ЛЮБОВ" banner), so seal and stamp always match. The lighter/darker shades are all worked out from this one value. |
| `body` | The letter itself. `\n` starts a new line, `\n\n` leaves a blank line between paragraphs. The text reveals line by line, so short paragraphs read better than one long block. |
| `unlockAt` | Optional. Hides the letter until a moment in time — see below. |
| `photos` | Optional. Polaroids on the paper — see "Photos by hand" below. |
| `fromApp` | Set by the writing tool on letters it made — leave it alone. |

### Photos by hand

The easy way is the writing tool. By hand it looks like this:

```json
"body": "Първи ред.\n[📷 1]\n\nВтори абзац.\n[📷 2] [📷 3]",
"photos": [
  { "src": "https://….public.blob.vercel-storage.com/letters/photo-x1.jpg", "caption": "нашата неделя" },
  { "src": "photos/lake.jpg", "pos": "62% 50%" },
  { "src": "photos/bench.jpg" }
]
```

- `src` is any web address, or a file in the repo (keep it small, around
  400 KB, about 1600px on the long side).
- `caption` is optional: a few words on the polaroid's white strip.
- `pos` is optional and moves the square crop: `"0% 50%"` keeps the left
  edge, `"100% 50%"` the right, `"50% 0%"` the top.
- `[📷 2]` in the body puts the second photo on that spot (`[снимка 2]` and
  `[photo 2]` work too). Two on one line make a pair. A photo without a
  marker is spread between paragraphs on its own.

A photo shows up as a polaroid only if the letter has a `photos` list. A
letter without one looks exactly as it always did. The look itself (the
polaroid, its tape and the full-screen view) is in `photos.jsx` and the
"photos in a letter" CSS in `index.html`. See PHOTO-LAB.md for how it was
chosen.

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
