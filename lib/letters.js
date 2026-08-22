/* Shared letter helpers for the notification functions.

   The site has no build step, so there is no bundle to import letter data from -
   the browser just loads letters.jsx as a plain script. Rather than keeping a
   second copy of the letters here (which would quietly drift out of sync), we
   fetch the letters.jsx that is actually deployed and parse the JSON out of the
   EDITMODE sentinels that already wrap it. That means this can only ever
   announce letters that are genuinely live on the site. */

const BEGIN = "/*EDITMODE-BEGIN*/";
const END = "/*EDITMODE-END*/";

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

async function fetchLetters() {
  const url = `${selfOrigin()}/letters.jsx`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`could not fetch ${url} (HTTP ${res.status})`);
  const src = await res.text();

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

module.exports = { fetchLetters, isVisible, selfOrigin, publicOrigin };
