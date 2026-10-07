/* The writing tool's back end: lists, adds and edits letters by committing
   letters.jsx to GitHub. Only the person with WRITER_PASSWORD can use it.

   POST /api/write-letter     Authorization: Bearer <WRITER_PASSWORD>
     { "action": "list" }                               letters made in the app
     { "action": "create", "letter": { ...fields } }    add one
     { "action": "update", "id": 7, "letter": { ...fields } }
                                                        change one made in the app

   Fields: title, body, envelopeColor, wax, unlockAt (ISO time, or null for
   "now"). The original letters, written by hand before this existed, can
   never be changed from here - only ones carrying "fromApp": true. */

const crypto = require("crypto");
const github = require("../lib/github");
const { parseLettersSource, writeLettersSource } = require("../lib/letters");

const FILE = "letters.jsx";
const WRONG_PASSWORD_DELAY = 1200; // slows down anyone guessing
const MAX_TITLE = 120;
const MAX_BODY = 30000;
const HEX = /^#[0-9a-fA-F]{6}$/;   // envelope.jsx's shade() needs all six digits

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authorised(req) {
  const expected = process.env.WRITER_PASSWORD;
  if (!expected) return false;
  const header = req.headers.authorization || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  // compare hashes so the check takes the same time however wrong the guess is
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** "Oct 7, 2026" in Sofia time - the same style as the hand-written letters. */
function displayDate(ms) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Europe/Sofia",
  }).format(new Date(ms));
}

/** Checks the fields and returns a clean copy, or { error }. */
function cleanFields(input, now) {
  if (!input || typeof input !== "object") return { error: "missing letter" };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n") : "";
  if (!title) return { error: "the letter needs a title" };
  if (!body.trim()) return { error: "the letter is empty" };
  if (title.length > MAX_TITLE) return { error: `the title is over ${MAX_TITLE} characters` };
  if (body.length > MAX_BODY) return { error: `the letter is over ${MAX_BODY} characters` };
  if (!HEX.test(input.envelopeColor || "")) return { error: "envelope colour must look like #e8d4b8" };
  if (!HEX.test(input.wax || "")) return { error: "wax colour must look like #7a5a8a" };

  let unlockAt = null;
  if (input.unlockAt) {
    const t = new Date(input.unlockAt).getTime();
    if (Number.isNaN(t)) return { error: "the delivery time isn't a valid time" };
    // a moment that has already passed simply means "now"
    if (t > now) unlockAt = new Date(t).toISOString().replace(".000Z", "Z");
  }

  return { title, body, envelopeColor: input.envelopeColor.toLowerCase(), wax: input.wax.toLowerCase(), unlockAt };
}

/** Builds the letter object with keys in the same order as the hand-written ones. */
function buildLetter(id, f, now) {
  const letter = { id, date: displayDate(f.unlockAt ? Date.parse(f.unlockAt) : now) };
  if (f.unlockAt) letter.unlockAt = f.unlockAt;
  Object.assign(letter, {
    title: f.title,
    envelopeColor: f.envelopeColor,
    wax: f.wax,
    body: f.body,
    fromApp: true,
  });
  return letter;
}

/** What the tool shows in its list: only letters it made. */
function summary(letters) {
  return letters.filter((l) => l.fromApp === true);
}

/* Read the file, change it, commit it. If someone else committed in between,
   read it again and redo the change once rather than overwrite their work. */
async function commitChange(change) {
  for (let attempt = 1; ; attempt++) {
    const { text, sha } = await github.getFile(FILE);
    const data = parseLettersSource(text);
    const result = change(data);
    if (result.error) return result;
    try {
      const { commit } = await github.putFile(FILE, writeLettersSource(text, data), sha, result.message);
      return { ...result, commit, letters: summary(data.letters) };
    } catch (err) {
      if (err instanceof github.ConflictError && attempt < 2) continue;
      throw err;
    }
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  if (!process.env.WRITER_PASSWORD) {
    return res.status(503).json({ ok: false, error: "WRITER_PASSWORD is not set on Vercel" });
  }
  if (!authorised(req)) {
    await sleep(WRONG_PASSWORD_DELAY);
    return res.status(401).json({ ok: false, error: "wrong password" });
  }
  if (!github.isConfigured()) {
    return res.status(503).json({ ok: false, error: "GITHUB_TOKEN is not set on Vercel" });
  }

  let input = req.body;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { return res.status(400).json({ ok: false, error: "body is not JSON" }); }
  }
  input = input || {};
  const now = Date.now();

  try {
    if (input.action === "list") {
      const { text } = await github.getFile(FILE);
      return res.status(200).json({ ok: true, letters: summary(parseLettersSource(text).letters) });
    }

    if (input.action === "create") {
      const f = cleanFields(input.letter, now);
      if (f.error) return res.status(400).json({ ok: false, error: f.error });
      const out = await commitChange((data) => {
        const id = Math.max(0, ...data.letters.map((l) => Number(l.id) || 0)) + 1;
        const letter = buildLetter(id, f, now);
        data.letters.push(letter);
        return { letter, message: `Add letter: ${letter.title} (from the app)` };
      });
      return res.status(200).json({ ok: true, ...out });
    }

    if (input.action === "update") {
      const f = cleanFields(input.letter, now);
      if (f.error) return res.status(400).json({ ok: false, error: f.error });
      const out = await commitChange((data) => {
        const i = data.letters.findIndex((l) => String(l.id) === String(input.id));
        if (i === -1) return { error: "no letter with that id", status: 404 };
        const old = data.letters[i];
        if (old.fromApp !== true) return { error: "only letters written in the app can be changed here", status: 403 };
        // a live letter stays live: editing it never pulls it back out of the mailbox
        const wasLive = !old.unlockAt || Date.parse(old.unlockAt) <= now;
        const keep = wasLive ? { ...f, unlockAt: old.unlockAt || null } : f;
        const letter = buildLetter(old.id, keep, now);
        if (wasLive || keep.unlockAt === (old.unlockAt || null)) letter.date = old.date;
        data.letters[i] = letter;
        return { letter, message: `Edit letter: ${letter.title} (from the app)` };
      });
      if (out.error) return res.status(out.status || 400).json({ ok: false, error: out.error });
      return res.status(200).json({ ok: true, ...out });
    }

    return res.status(400).json({ ok: false, error: "action must be list, create or update" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};

module.exports.displayDate = displayDate;
