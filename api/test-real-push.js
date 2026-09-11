/* TEMPORARY diagnostic route - sends a custom push notification to every
   stored subscription, completely bypassing the real letter-announcement
   bookkeeping in lib/store.js (it never reads or writes the "announced" set).
   Only exists to confirm the push pipeline (VAPID keys + a real subscribed
   phone) actually works end to end. Delete this file once that's confirmed.

   GET /api/test-real-push?text=...   (Authorization: Bearer <NOTIFY_SECRET>, or ?secret=...) */

const webpush = require("web-push");
const store = require("../lib/store");
const { pushReady } = require("../lib/send");

function authorised(req, url) {
  const expected = process.env.NOTIFY_SECRET || process.env.CRON_SECRET;
  if (!expected) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  return bearer === expected || url.searchParams.get("secret") === expected;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (!authorised(req, url)) {
    return res.status(401).json({ ok: false, error: "unauthorised" });
  }

  if (!pushReady()) {
    return res.status(503).json({ ok: false, error: "VAPID keys not set" });
  }

  if (!store.isConfigured()) {
    return res.status(503).json({ ok: false, error: "Redis is not configured" });
  }

  const text = url.searchParams.get("text") || "скоро очаквай писмо";

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const subs = await store.listSubs();
  if (!subs.length) {
    return res.status(200).json({ ok: true, sent: 0, note: "no subscriptions stored" });
  }

  const payload = JSON.stringify({ title: "Тест 🔔", body: text, tag: "test-push" });

  let sent = 0;
  let failed = 0;
  const dead = [];
  const errors = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload, { TTL: 60, urgency: "normal" });
      sent++;
    } catch (err) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) {
        dead.push(sub.endpoint);
      } else {
        errors.push(`${err.statusCode || "?"}: ${err.body || err.message}`);
      }
    }
  }

  for (const endpoint of dead) await store.removeSub(endpoint);

  return res.status(200).json({ ok: true, sent, failed, pruned: dead.length, errors });
};
