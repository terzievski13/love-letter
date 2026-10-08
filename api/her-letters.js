/* Her letters to you. Kept in Redis (lib/store.js), not in letters.jsx -
   she can't commit to GitHub, and her letters shouldn't sit in a public repo.

   GET  /api/her-letters                 public: every letter, newest first
   POST /api/her-letters                 Authorization: Bearer <secret word>
     { "action": "check" }                              is this the word?
     { "action": "create", "letter": { ...fields } }    a new letter → your phone buzzes
     { "action": "update", "id": 100001, "letter": { ...fields } }
     { "action": "delete", "id": 100001 }

   Fields: title, body, envelopeColor, wax. The word is HER_SECRET_WORD;
   capitals and spaces don't matter. Edits and deletes are silent - only a
   new letter tells you. */

const crypto = require("crypto");
const store = require("../lib/store");
const send = require("../lib/send");

const WRONG_WORD_DELAY = 1200; // slows down anyone guessing
const MAX_TITLE = 120;
const MAX_BODY = 30000;
const MAX_LETTERS = 500;       // years of letters; a cap keeps junk out
const HEX = /^#[0-9a-fA-F]{6}$/;   // envelope.jsx's shade() needs all six digits
const SITE_URL = "https://lovelettersisa.vercel.app/";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "Ябълка Шарена" and " ябълкашарена " count as the same word. */
function normaliseWord(s) {
  return String(s || "").normalize("NFC").toLowerCase().replace(/\s+/g, "");
}

function authorised(req) {
  const expected = normaliseWord(process.env.HER_SECRET_WORD);
  if (!expected) return false;
  const header = req.headers.authorization || "";
  // headers can only carry plain ASCII, so the client URI-encodes the word
  let given = header.startsWith("Bearer ") ? header.slice(7) : "";
  try { given = decodeURIComponent(given); } catch (e) {}
  // compare hashes so the check takes the same time however wrong the guess is
  const a = crypto.createHash("sha256").update(normaliseWord(given)).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/** "Oct 8, 2026" in Sofia time - the same style as your letters. */
function displayDate(ms) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Europe/Sofia",
  }).format(new Date(ms));
}

/** Checks the fields and returns a clean copy, or { error } (in Bulgarian - she sees it). */
function cleanFields(input) {
  if (!input || typeof input !== "object") return { error: "липсва писмото" };
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n") : "";
  if (!title) return { error: "писмото има нужда от заглавие" };
  if (!body.trim()) return { error: "писмото е празно" };
  if (title.length > MAX_TITLE) return { error: `заглавието е над ${MAX_TITLE} знака` };
  if (body.length > MAX_BODY) return { error: `писмото е над ${MAX_BODY} знака` };
  if (!HEX.test(input.envelopeColor || "")) return { error: "непознат цвят на плика" };
  if (!HEX.test(input.wax || "")) return { error: "непознат цвят на восъка" };
  return { title, body, envelopeColor: input.envelopeColor.toLowerCase(), wax: input.wax.toLowerCase() };
}

const forClient = (l) => ({ ...l, fromHer: true });

async function allLetters() {
  const list = await store.listHers();
  return list.sort((a, b) => b.id - a.id).map(forClient); // newest first, like the deck
}

/* Tell your phone. Never allowed to fail her save - a missed buzz is
   better than a lost letter. */
async function tellMe(letter) {
  try {
    const subs = await store.listMySubs();
    if (!subs.length) return { sent: 0, note: "no phone of yours is subscribed" };
    const result = await send.sendPushToMe(subs, { title: letter.title, url: SITE_URL });
    for (const endpoint of result.dead || []) await store.removeMySub(endpoint);
    return result;
  } catch (err) {
    return { sent: 0, error: err.message };
  }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    if (!store.isConfigured()) return res.status(200).json({ ok: true, letters: [] });
    try {
      return res.status(200).json({ ok: true, letters: await allLetters() });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "GET or POST only" });
  }

  if (!process.env.HER_SECRET_WORD) {
    return res.status(503).json({ ok: false, error: "тайната дума още не е зададена" });
  }
  if (!store.isConfigured()) {
    return res.status(503).json({ ok: false, error: "storage not configured" });
  }
  if (!authorised(req)) {
    await sleep(WRONG_WORD_DELAY);
    return res.status(401).json({ ok: false, error: "wrong word" });
  }

  let input = req.body;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { return res.status(400).json({ ok: false, error: "body is not JSON" }); }
  }
  input = input || {};

  try {
    if (input.action === "check") {
      return res.status(200).json({ ok: true });
    }

    if (input.action === "create") {
      const f = cleanFields(input.letter);
      if (f.error) return res.status(400).json({ ok: false, error: f.error });
      if ((await store.countHers()) >= MAX_LETTERS) {
        return res.status(429).json({ ok: false, error: "пощенската кутия е пълна" });
      }
      const now = Date.now();
      const letter = {
        id: await store.nextHerId(),
        date: displayDate(now),
        ...f,
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      };
      await store.saveHer(letter);
      const told = await tellMe(letter);
      return res.status(200).json({ ok: true, letter: forClient(letter), letters: await allLetters(), told });
    }

    if (input.action === "update") {
      const existing = await store.getHer(Number(input.id));
      if (!existing) return res.status(404).json({ ok: false, error: "няма такова писмо" });
      const f = cleanFields(input.letter);
      if (f.error) return res.status(400).json({ ok: false, error: f.error });
      // keeps its id, date and createdAt; edits are silent
      const letter = { ...existing, ...f, updatedAt: new Date().toISOString() };
      await store.saveHer(letter);
      return res.status(200).json({ ok: true, letter: forClient(letter), letters: await allLetters() });
    }

    if (input.action === "delete") {
      const gone = await store.deleteHer(Number(input.id));
      if (!gone) return res.status(404).json({ ok: false, error: "няма такова писмо" });
      return res.status(200).json({ ok: true, letters: await allLetters() });
    }

    return res.status(400).json({ ok: false, error: "unknown action" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
