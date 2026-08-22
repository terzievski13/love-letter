/* Stores a push subscription. This one has to be public - her browser calls it
   directly - so it is written defensively: it only accepts things that look
   like real push subscriptions from real push services, and it caps how many
   can ever be stored. */

const store = require("../lib/store");

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

  try {
    // Re-saving an existing subscription is a no-op (keyed by endpoint), so
    // only genuinely new ones count against the cap.
    const existing = await store.listSubs();
    const known = existing.some((s) => s.endpoint === sub.endpoint);
    if (!known && existing.length >= store.MAX_SUBS) {
      return res.status(429).json({ ok: false, error: "too many subscriptions stored" });
    }

    await store.saveSub({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    return res.status(200).json({ ok: true, stored: await store.countSubs() });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
