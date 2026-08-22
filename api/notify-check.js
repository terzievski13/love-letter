/* Works out which letters are live but not yet announced, announces them, and
   records that it did. Safe to call as often as you like: it is the repeatable
   bit that lets three separate triggers overlap without her phone buzzing twice.

   GET /api/notify-check            announce anything outstanding
   GET /api/notify-check?dry=1      report what it would do, send nothing
   GET /api/notify-check?seed=1     mark everything currently live as already
                                    announced, send nothing (run this once,
                                    before going live, so the five letters she
                                    already has do not all fire at her)

   Requires: Authorization: Bearer <NOTIFY_SECRET>   (or ?secret=...) */

const { fetchLetters, isVisible, publicOrigin } = require("../lib/letters");
const store = require("../lib/store");
const { sendPush, sendMail, sendReceipt, pushReady, mailReady } = require("../lib/send");

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

  const dry = url.searchParams.get("dry") === "1";
  const seed = url.searchParams.get("seed") === "1";

  try {
    const now = Date.now();
    const letters = await fetchLetters();
    const live = letters.filter((l) => isVisible(l, now));

    const configured = store.isConfigured();
    const already = configured ? (await store.announcedIds()).map(String) : [];
    const pending = live.filter((l) => !already.includes(String(l.id)));

    const state = {
      ok: true,
      now: new Date(now).toISOString(),
      total: letters.length,
      live: live.map((l) => l.id),
      locked: letters.filter((l) => !isVisible(l, now)).map((l) => ({ id: l.id, unlockAt: l.unlockAt })),
      alreadyAnnounced: already,
      pending: pending.map((l) => l.id),
      redis: configured ? "connected" : "NOT CONFIGURED",
      push: pushReady() ? "ready" : "VAPID keys not set",
      email: mailReady() ? "ready" : "Gmail credentials not set",
    };

    if (dry) return res.status(200).json({ ...state, dryRun: true, wouldAnnounce: state.pending });

    if (!configured) {
      return res.status(503).json({ ...state, error: "Redis is not configured; cannot record what was sent" });
    }

    if (seed) {
      for (const l of live) await store.claim(l.id);
      return res.status(200).json({ ...state, seeded: live.map((l) => l.id), sent: 0 });
    }

    if (!pending.length) return res.status(200).json({ ...state, announced: [], sent: 0 });

    /* Guard against the worst outcome: an empty database plus a backlog of
       letters would fire "5 new letters" at her. That is nearly always a first
       run or a wiped database, never something we should announce. */
    if (!already.length && pending.length > 1) {
      return res.status(409).json({
        ...state,
        error: `refusing to announce ${pending.length} letters at once with an empty history - run ?seed=1 first if this is a first run`,
      });
    }

    // Claim first, so a simultaneous second trigger finds nothing left to do.
    const claimed = [];
    for (const l of pending) {
      if (await store.claim(l.id)) claimed.push(l);
    }
    if (!claimed.length) return res.status(200).json({ ...state, announced: [], sent: 0, note: "another run claimed these first" });

    const target = publicOrigin();
    const subs = await store.listSubs();
    const pushResult = await sendPush(subs, { count: claimed.length, url: target });

    for (const endpoint of pushResult.dead) await store.removeSub(endpoint);

    let mailResult;
    try {
      mailResult = await sendMail({ count: claimed.length, url: target });
    } catch (err) {
      mailResult = { sent: false, error: err.message };
    }

    /* If nothing at all got through, hand the claims back so the next run
       tries again - a late notification beats a lost one. */
    const delivered = pushResult.sent > 0 || mailResult.sent;
    if (!delivered) {
      for (const l of claimed) await store.unclaim(l.id);
    }

    const summary = {
      ...state,
      announced: claimed.map((l) => l.id),
      delivered,
      pushResult,
      mailResult,
      prunedSubscriptions: pushResult.dead.length,
      retryScheduled: !delivered,
    };

    try { await sendReceipt(summary); } catch { /* a failed receipt must never fail the run */ }

    return res.status(delivered ? 200 : 500).json(summary);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
