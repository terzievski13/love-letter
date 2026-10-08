/* Stores a push subscription. This one has to be public - her browser calls it
   directly - so it is written defensively: it only accepts things that look
   like real push subscriptions from real push services, and it caps how many
   can ever be stored.

   POST /api/subscribe            her phone: told when you leave a letter
   POST /api/subscribe?who=me     YOUR phone, told when she writes to you -
                                  needs Authorization: Bearer <WRITER_PASSWORD>

   A phone is in one list or the other, never both: subscribing as "me"
   takes it out of her list, and her list quietly refuses a phone that is
   already yours (the in-site prompt re-sends on every visit, so otherwise
   your phone would drift back into her list). */

const crypto = require("crypto");
const store = require("../lib/store");

const WRONG_PASSWORD_DELAY = 1200;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isWriter(req) {
  const expected = process.env.WRITER_PASSWORD;
  if (!expected) return false;
  const header = req.headers.authorization || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function wantsMe(req) {
  if (req.query && req.query.who) return req.query.who === "me";
  return /[?&]who=me(&|$)/.test(req.url || "");
}

// The hosts real push services actually use. Anything else is junk.
const PUSH_HOSTS = [
  "fcm.googleapis.com",           // Chrome / Android
  "android.googleapis.com",       // older Chrome
  "push.services.mozilla.com",    // Firefox
  "notify.windows.com",           // Edge
  "web.push.apple.com",           // Safari / iOS
];

function looksLikeSubscription(sub) {
  if (!sub || typeof sub.endpoint !== "string") return "missing endpoint";
  let url;
  try {
    url = new URL(sub.endpoint);
  } catch {
    return "endpoint is not a URL";
  }
  if (url.protocol !== "https:") return "endpoint is not https";
  if (!PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith("." + h))) {
    return `endpoint host ${url.hostname} is not a known push service`;
  }
  if (!sub.keys || typeof sub.keys.p256dh !== "string" || typeof sub.keys.auth !== "string") {
    return "missing encryption keys";
  }
  if (sub.endpoint.length > 1000) return "endpoint implausibly long";
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  if (!store.isConfigured()) {
    return res.status(503).json({ ok: false, error: "storage not configured" });
  }

  let sub = req.body;
  if (typeof sub === "string") {
    try { sub = JSON.parse(sub); } catch { return res.status(400).json({ ok: false, error: "body is not JSON" }); }
  }

  const problem = looksLikeSubscription(sub);
  if (problem) return res.status(400).json({ ok: false, error: problem });

  const clean = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };

  if (wantsMe(req)) {
    if (!isWriter(req)) {
      await sleep(WRONG_PASSWORD_DELAY);
      return res.status(401).json({ ok: false, error: "wrong password" });
    }
    try {
      await store.saveMySub(clean);
      await store.removeSub(clean.endpoint); // no more "new letter" pushes meant for her
      return res.status(200).json({ ok: true, who: "me", stored: (await store.listMySubs()).length });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  try {
    // your phone stays out of her list, even when the prompt re-sends it
    if (await store.isMySub(clean.endpoint)) {
      return res.status(200).json({ ok: true, who: "me", note: "this phone is subscribed as yours" });
    }

    // Re-saving an existing subscription is a no-op (keyed by endpoint), so
    // only genuinely new ones count against the cap.
    const existing = await store.listSubs();
    const known = existing.some((s) => s.endpoint === sub.endpoint);
    if (!known && existing.length >= store.MAX_SUBS) {
      return res.status(429).json({ ok: false, error: "too many subscriptions stored" });
    }

    await store.saveSub(clean);
    return res.status(200).json({ ok: true, stored: await store.countSubs() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
