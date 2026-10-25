/* Photos for a letter being written - yours (the writing tool) or hers (her
   writing screen): uploads one photo to the Blob store, or deletes one that
   was added and then taken out before the letter was sent. Takes your
   password (as api/write-letter.js) or her secret word (as api/her-letters.js,
   URI-encoded).

   POST /api/letter-photo     Authorization: Bearer <password or her word>
     { "action": "upload", "data": "<base64 JPEG>" }   -> { ok, url }
     { "action": "delete", "url": "https://…" }        -> { ok }

   The tool shrinks each photo on the phone first (to ~400 KB), so an upload
   stays far below Vercel's 4.5 MB request limit. A delete is refused while
   any letter still uses that photo - yours in letters.jsx or hers in Redis -
   so a sent letter can't lose one by accident. Photos taken out of a sent
   letter are deleted by api/write-letter.js / api/her-letters.js once the
   edit is saved. */

const github = require("../lib/github");
const photos = require("../lib/photos");
const store = require("../lib/store");
const { authorised: isYou } = require("./write-letter");
const { authorised: isHer } = require("./her-letters");
const { parseLettersSource } = require("../lib/letters");

const WRONG_PASSWORD_DELAY = 1200;
const MAX_BYTES = 3 * 1024 * 1024;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Every photo address any letter uses: yours on GitHub, and hers. */
async function photosInUse() {
  const { text } = await github.getFile("letters.jsx");
  const used = photos.photosIn(parseLettersSource(text).letters);
  if (store.isConfigured()) photos.photosIn(await store.listHers()).forEach((src) => used.add(src));
  return used;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  if (!process.env.WRITER_PASSWORD && !process.env.HER_SECRET_WORD) {
    return res.status(503).json({ ok: false, error: "WRITER_PASSWORD is not set on Vercel" });
  }
  if (!isYou(req) && !isHer(req)) {
    await sleep(WRONG_PASSWORD_DELAY);
    return res.status(401).json({ ok: false, error: "wrong password" });
  }
  if (!photos.isConfigured()) {
    return res.status(503).json({ ok: false, error: "no photo store yet - connect a Blob store to the project on Vercel" });
  }

  let input = req.body;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { return res.status(400).json({ ok: false, error: "body is not JSON" }); }
  }
  input = input || {};

  try {
    if (input.action === "upload") {
      const data = typeof input.data === "string" ? Buffer.from(input.data, "base64") : null;
      if (!data || !data.length) return res.status(400).json({ ok: false, error: "no photo" });
      if (data.length > MAX_BYTES) return res.status(413).json({ ok: false, error: "that photo is too big" });
      // JPEG files start FF D8 FF - the tool always sends JPEG
      if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
        return res.status(400).json({ ok: false, error: "that isn't a JPEG" });
      }
      return res.status(200).json({ ok: true, url: await photos.upload(data) });
    }

    if (input.action === "delete") {
      const url = typeof input.url === "string" ? input.url : "";
      if (!photos.isStored(url)) return res.status(400).json({ ok: false, error: "not one of the stored photos" });
      // without GitHub there's no way to check the letters, so nothing is deleted
      if (!github.isConfigured()) {
        return res.status(503).json({ ok: false, error: "GITHUB_TOKEN is not set on Vercel" });
      }
      if ((await photosInUse()).has(url)) {
        return res.status(409).json({ ok: false, error: "a letter still uses that photo" });
      }
      await photos.remove([url]);
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: "action must be upload or delete" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
