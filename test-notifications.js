/* Tests for the notification plumbing.
 *
 *   node test-notifications.js        (or: npm test)
 *
 * Runs entirely offline against in-memory fakes - no Redis, no Vercel, no
 * emails sent, nothing touched. It covers the failure modes that actually
 * matter: announcing the same letter twice, announcing a backlog at her all at
 * once, losing a letter when sending fails, and accepting junk subscriptions.
 */

process.env.NOTIFY_SECRET = "test-secret";
process.env.SITE_ORIGIN = "http://localhost:8123";

const path = require("path");
const store = require("./lib/store");
const send = require("./lib/send");
const letters = require("./lib/letters");

/* ---------- tiny test harness ---------- */
let passed = 0, failed = 0;
const results = [];
function check(name, condition, detail) {
  if (condition) { passed++; results.push(`  PASS  ${name}`); }
  else { failed++; results.push(`  FAIL  ${name}${detail ? "\n          " + detail : ""}`); }
}
function section(t) { results.push(`\n${t}`); }

/* ---------- in-memory fakes ---------- */
const mem = { subs: new Map(), announced: new Set(), pushCalls: [], mailCalls: [] };

function resetStore() {
  mem.subs.clear(); mem.announced.clear();
  mem.pushCalls.length = 0; mem.mailCalls.length = 0;
}

store.isConfigured = () => true;
store.announcedIds = async () => [...mem.announced];
store.claim = async (id) => {
  const k = String(id);
  if (mem.announced.has(k)) return false;
  mem.announced.add(k);
  return true;
};
store.unclaim = async (id) => { mem.announced.delete(String(id)); };
store.listSubs = async () => [...mem.subs.values()];
store.countSubs = async () => mem.subs.size;
store.saveSub = async (s) => { mem.subs.set(s.endpoint, s); };
store.removeSub = async (e) => { mem.subs.delete(e); };

send.pushReady = () => true;
send.mailReady = () => true;
send.sendReceipt = async () => ({ sent: false });

let pushBehaviour = () => ({ sent: 1, failed: 0, dead: [], errors: [] });
let mailBehaviour = () => ({ sent: true });
send.sendPush = async (subs, opts) => { mem.pushCalls.push(opts); return pushBehaviour(subs, opts); };
send.sendMail = async (opts) => { mem.mailCalls.push(opts); return mailBehaviour(opts); };

let fakeLetters = null;
const realFetch = letters.fetchLetters;
letters.fetchLetters = async () => (fakeLetters ? fakeLetters : realFetch());

/* Required only now, on purpose: api/notify-check destructures these functions
   at require time, so the fakes above have to be in place first. */
const notifyCheck = require("./api/notify-check");
const subscribe = require("./api/subscribe");

/* ---------- request helpers ---------- */
function mockRes() {
  return {
    code: null, body: null,
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
async function callCheck(query = "", auth = "Bearer test-secret") {
  const res = mockRes();
  await notifyCheck({ url: "/api/notify-check" + query, method: "GET", headers: auth ? { authorization: auth } : {} }, res);
  return res;
}
async function callSubscribe(body, method = "POST") {
  const res = mockRes();
  await subscribe({ method, headers: {}, body }, res);
  return res;
}

const LIVE = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, title: "letter " + (i + 1) }));
const GOOD_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BLxlIjF7xJ0Y0000000000000000000000000000000", auth: "0123456789abcdef" },
};

(async () => {
  /* ============ auth ============ */
  section("Auth - the endpoint must not be open to the internet");
  check("no credentials are rejected", (await callCheck("?dry=1", null)).code === 401);
  check("a wrong secret is rejected", (await callCheck("?dry=1", "Bearer wrong")).code === 401);
  check("the right secret is accepted", (await callCheck("?dry=1")).code === 200);
  check("the secret also works as a query parameter (for Vercel cron)",
    (await callCheck("?dry=1&secret=test-secret", null)).code === 200);

  /* ============ reading the real letters.jsx ============ */
  section("Reading letters.jsx as deployed");
  fakeLetters = null;
  resetStore();
  let r = await callCheck("?dry=1");
  check("parses the live file and finds all five letters", r.body.total === 5, JSON.stringify(r.body.total));
  check("all five currently read as live", r.body.live.length === 5);

  /* ============ the backlog guard ============ */
  section("First run must not fire five letters at her at once");
  fakeLetters = LIVE(5);
  resetStore();
  r = await callCheck();
  check("refuses a backlog with empty history", r.code === 409, `got HTTP ${r.code}`);
  check("nothing was sent", mem.pushCalls.length === 0 && mem.mailCalls.length === 0);
  check("nothing was recorded as announced", mem.announced.size === 0);

  section("Seeding marks the existing letters as already announced");
  r = await callCheck("?seed=1");
  check("seed succeeds", r.code === 200);
  check("all five recorded", mem.announced.size === 5, [...mem.announced].join(","));
  check("but nothing was actually sent", mem.pushCalls.length === 0 && mem.mailCalls.length === 0);

  r = await callCheck();
  check("a run straight after seeding has nothing to do", r.code === 200 && r.body.sent === 0);

  /* ============ the happy path ============ */
  section("A new letter is announced exactly once");
  mem.subs.set(GOOD_SUB.endpoint, GOOD_SUB);
  fakeLetters = LIVE(6);
  r = await callCheck();
  check("letter 6 is announced", r.code === 200 && r.body.announced.join() === "6", JSON.stringify(r.body.announced));
  check("one push was sent", mem.pushCalls.length === 1);
  check("one email was sent", mem.mailCalls.length === 1);
  check("the push says one letter, not six", mem.pushCalls[0].count === 1, String(mem.pushCalls[0].count));

  section("Duplicate suppression - the most important test here");
  const before = mem.pushCalls.length;
  await callCheck();
  await callCheck();
  await callCheck();
  check("three more runs send nothing at all", mem.pushCalls.length === before, `${mem.pushCalls.length - before} extra pushes`);

  section("Two triggers firing at the same instant");
  fakeLetters = LIVE(7);
  const sent0 = mem.pushCalls.length;
  await Promise.all([callCheck(), callCheck(), callCheck()]);
  check("only one of the three announces it", mem.pushCalls.length === sent0 + 1, `${mem.pushCalls.length - sent0} pushes`);

  /* ============ scheduled unlocks ============ */
  section("Letters that unlock on a timer");
  resetStore();
  const future = new Date(Date.now() + 3600e3).toISOString();
  const past = new Date(Date.now() - 3600e3).toISOString();
  fakeLetters = [{ id: 1, title: "old" }, { id: 2, title: "later", unlockAt: future }];
  await callCheck("?seed=1");
  r = await callCheck("?dry=1");
  check("a letter unlocking in an hour is not announced", !r.body.pending.includes(2), JSON.stringify(r.body.pending));
  check("and is reported as locked", r.body.locked.some((l) => l.id === 2));

  fakeLetters = [{ id: 1, title: "old" }, { id: 2, title: "later", unlockAt: past }];
  r = await callCheck();
  check("once its moment passes it is announced", r.body.announced.join() === "2", JSON.stringify(r.body.announced));

  /* ============ dead subscriptions ============ */
  section("Her subscription dying (cleared browser data, reinstall)");
  resetStore();
  mem.subs.set(GOOD_SUB.endpoint, GOOD_SUB);
  fakeLetters = LIVE(1);
  await callCheck("?seed=1");
  pushBehaviour = () => ({ sent: 0, failed: 1, dead: [GOOD_SUB.endpoint], errors: [] });
  fakeLetters = LIVE(2);
  r = await callCheck();
  check("the dead subscription is pruned", mem.subs.size === 0, `${mem.subs.size} left`);
  check("it is reported so you can see it happened", r.body.prunedSubscriptions === 1);
  check("the email still went out, so the letter is not lost", r.body.mailResult.sent === true);

  /* ============ total delivery failure ============ */
  section("Everything fails - the letter must not be silently lost");
  resetStore();
  fakeLetters = LIVE(1);
  await callCheck("?seed=1");
  pushBehaviour = () => ({ sent: 0, failed: 1, dead: [], errors: ["500"] });
  mailBehaviour = () => ({ sent: false, skipped: "no credentials" });
  fakeLetters = LIVE(2);
  r = await callCheck();
  check("the run reports failure", r.code === 500, `HTTP ${r.code}`);
  check("the claim is handed back for a retry", !mem.announced.has("2"), [...mem.announced].join(","));

  pushBehaviour = () => ({ sent: 1, failed: 0, dead: [], errors: [] });
  mailBehaviour = () => ({ sent: true });
  r = await callCheck();
  check("the next run picks it up again", r.body.announced.join() === "2", JSON.stringify(r.body.announced));

  /* ============ the public subscribe endpoint ============ */
  section("The subscribe endpoint is public, so it must be fussy");
  resetStore();
  check("GET is refused", (await callSubscribe(GOOD_SUB, "GET")).code === 405);
  check("empty body is refused", (await callSubscribe({})).code === 400);
  check("a non-push host is refused",
    (await callSubscribe({ endpoint: "https://evil.example.com/x", keys: { p256dh: "a", auth: "b" } })).code === 400);
  check("http (not https) is refused",
    (await callSubscribe({ endpoint: "http://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } })).code === 400);
  check("missing encryption keys are refused",
    (await callSubscribe({ endpoint: "https://fcm.googleapis.com/fcm/send/x" })).code === 400);
  check("a real-looking subscription is accepted", (await callSubscribe(GOOD_SUB)).code === 200);
  check("re-saving the same one does not duplicate it", mem.subs.size === 1);

  const overCap = [];
  for (let i = 0; i < store.MAX_SUBS + 3; i++) {
    overCap.push(await callSubscribe({ ...GOOD_SUB, endpoint: `https://fcm.googleapis.com/fcm/send/n${i}` }));
  }
  check("the cap stops unbounded junk", overCap.some((x) => x.code === 429), `${mem.subs.size} stored`);

  /* ============ real crypto ============ */
  section("Push encryption with the real VAPID keys");
  try {
    const webpush = require("web-push");
    const { generateKeyPairSync, randomBytes } = require("crypto");
    const keys = JSON.parse(require("fs").readFileSync(path.join(__dirname, ".vapid-keys.json"), "utf8"));
    webpush.setVapidDetails("mailto:test@example.com", keys.publicKey, keys.privateKey);

    // a throwaway client keypair, standing in for her browser
    const kp = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = kp.publicKey.export({ format: "jwk" });
    const clientPub = Buffer.concat([
      Buffer.from([4]), Buffer.from(jwk.x, "base64url"), Buffer.from(jwk.y, "base64url"),
    ]).toString("base64url");

    const details = webpush.generateRequestDetails(
      { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: clientPub, auth: randomBytes(16).toString("base64url") } },
      JSON.stringify({ title: "Има ново писмо 💌" }),
      { TTL: send.PUSH_TTL }
    );
    check("the generated VAPID keypair is accepted by web-push", true);
    check("the payload encrypts", Buffer.isBuffer(details.body) && details.body.length > 0);
    check("it is signed with a VAPID header", /vapid/i.test(details.headers.Authorization || ""));
    check("the two-week TTL is set", String(details.headers.TTL) === String(send.PUSH_TTL));
  } catch (err) {
    check("push encryption works", false, err.message);
  }

  /* ---------- report ---------- */
  console.log(results.join("\n"));
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
