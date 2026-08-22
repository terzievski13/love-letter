/* Shared letter helpers for the notification functions.

   The site has no build step, so there is no bundle to import letter data from -
   the browser just loads letters.jsx as a plain script. Rather than keeping a
   second copy of the letters here (which would quietly drift out of sync), we
   fetch the letters.jsx that is actually deployed and parse the JSON out of the
   EDITMODE sentinels that already wrap it. That means this can only ever
   announce letters that are genuinely live on the site. */

const fs = require("fs");
const path = require("path");

const BEGIN = "/*EDITMODE-BEGIN*/";
const END = "/*EDITMODE-END*/";

let lastSource = "none";

/** Where to fetch letters.jsx from - the deployment this code is running in. */
function selfOrigin() {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Where to send HER - the real domain, not a one-off deployment URL. */
function publicOrigin() {
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod) return `https://${prod}`;
  return selfOrigin();
}

/* letters.jsx ships inside the function bundle (see includeFiles in
   vercel.json), so read it straight off disk. Fetching it over HTTP instead
   would break on any deployment with Vercel's Deployment Protection turned on -
   previews get a 302 to a login page rather than the file. The HTTP path is
   kept only as a fallback. */
function readLocal() {
  for (const candidate of [
    path.join(process.cwd(), "letters.jsx"),
    path.join(__dirname, "..", "letters.jsx"),
  ]) {
    try {
      return fs.readFileSync(candidate, "utf8");
    } catch (e) {
      // not here; try the next candidate
    }
  }
  return null;
}

async function readRemote() {
  const url = `${selfOrigin()}/letters.jsx`;
  const res = await fetch(url, { cache: "no-store", redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`fetching ${url} was redirected (HTTP ${res.status}) - Deployment Protection is probably on`);
  }
  if (!res.ok) throw new Error(`could not fetch ${url} (HTTP ${res.status})`);
  return res.text();
}

async function fetchLetters() {
  let src = readLocal();
  lastSource = "filesystem";
  if (src === null) {
    src = await readRemote();
    lastSource = "http";
  }

  const start = src.indexOf(BEGIN);
  const end = src.indexOf(END);
  if (start === -1 || end === -1) {
    throw new Error("letters.jsx fetched but the EDITMODE sentinels are missing");
  }

  const data = JSON.parse(src.slice(start + BEGIN.length, end));
  if (!data || !Array.isArray(data.letters)) {
    throw new Error("letters.jsx parsed but has no letters array");
  }
  return data.letters;
}

/* Same rule as app.jsx: a letter is live once its unlockAt instant has passed.
   Compares absolute time, so it fires at the same moment in any timezone. */
function isVisible(letter, now = Date.now()) {
  return !letter.unlockAt || now >= new Date(letter.unlockAt).getTime();
}

module.exports = { fetchLetters, isVisible, selfOrigin, publicOrigin, lettersSource: () => lastSource };
