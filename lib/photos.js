/* Where letter photos are kept: a Vercel Blob store connected to the project
   (Storage tab on Vercel). Connecting it gives the functions their access on
   its own - BLOB_READ_WRITE_TOKEN, or BLOB_STORE_ID on newer stores.

   Photos are public files under long random names: nobody can guess one, and
   the only place their addresses appear is inside her letters. They never
   change once uploaded (a new photo gets a new name), so browsers may keep
   them for a year. Tests replace upload/remove with fakes, like lib/github.js. */

const MAX_AGE = 365 * 24 * 60 * 60;
const MAX_PHOTOS = 20;
const MAX_CAPTION = 60;
const POS = /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/; // where the square crop sits, e.g. "62% 50%"

// what's wrong, in English for you (write-letter.js) - her-letters.js passes Bulgarian
const ENGLISH = {
  list: "photos must be a list",
  tooMany: `at most ${MAX_PHOTOS} photos in one letter`,
  src: "a photo has no proper address",
  caption: `a photo caption is over ${MAX_CAPTION} characters`,
};

function isConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

/** Only files in a Vercel Blob store are ever deleted - never anything else a letter points at. */
function isStored(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
  } catch (e) {
    return false;
  }
}

/** A letter's photo list, cleaned: [{ src, caption?, pos? }], or { error }.
 *  An empty caption and a centred crop are left out, so they take no room. */
function cleanPhotos(input, say = ENGLISH) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) return { error: say.list };
  if (input.length > MAX_PHOTOS) return { error: say.tooMany };
  const out = [];
  for (const p of input) {
    const src = p && typeof p.src === "string" ? p.src.trim() : "";
    if (!/^https:\/\/\S+$/.test(src) || src.length > 600) return { error: say.src };
    const caption = typeof p.caption === "string" ? p.caption.replace(/\s+/g, " ").trim() : "";
    if (caption.length > MAX_CAPTION) return { error: say.caption };
    const photo = { src };
    if (caption) photo.caption = caption;
    if (typeof p.pos === "string" && POS.test(p.pos) && p.pos !== "50% 50%") photo.pos = p.pos;
    out.push(photo);
  }
  return out;
}

/** Every photo address used by any of these letters. */
function photosIn(letters) {
  const used = new Set();
  letters.forEach((l) => (l && Array.isArray(l.photos) ? l.photos : []).forEach((p) => p && used.add(p.src)));
  return used;
}

/** Saves one JPEG and returns its public address. */
async function upload(buffer) {
  const { put } = require("@vercel/blob");
  const blob = await put("letters/photo.jpg", buffer, {
    access: "public",
    addRandomSuffix: true,
    contentType: "image/jpeg",
    cacheControlMaxAge: MAX_AGE,
  });
  return blob.url;
}

/** Deletes stored photos; anything that isn't one of ours is ignored. */
async function remove(urls) {
  const ours = urls.filter(isStored);
  if (!ours.length) return 0;
  const { del } = require("@vercel/blob");
  await del(ours);
  return ours.length;
}

module.exports = { isConfigured, isStored, upload, remove, cleanPhotos, photosIn, MAX_PHOTOS, MAX_CAPTION };
