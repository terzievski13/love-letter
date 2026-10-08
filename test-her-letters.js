/* Tests for her letters (api/her-letters.js) and the "tell me when she
 * writes" half of api/subscribe.js.
 *
 *   node test-her-letters.js        (or: npm test, which runs this too)
 *
 * Runs offline against an in-memory stand-in for Redis and a fake push -
 * nothing is stored or sent anywhere.
 */

process.env.HER_SECRET_WORD = "Ябълка Шарена";
process.env.WRITER_PASSWORD = "test-password";

const store = require("./lib/store");
const send = require("./lib/send");

/* ---------- tiny test harness (same as the other suites) ---------- */
let passed = 0, failed = 0;
const results = [];
function check(name, condition, detail) {
  if (condition) { passed++; results.push(`  PASS  ${name}`); }
  else { failed++; results.push(`  FAIL  ${name}${detail ? "\n          " + detail : ""}`); }
}
function section(t) { results.push(`\n${t}`); }

/* ---------- in-memory fakes ---------- */
const mem = { hers: new Map(), next: 0, subs: new Map(), mySubs: new Map(), pushes: [], pushToHer: 0 };
function reset() {
  mem.hers = new Map(); mem.next = 0; mem.subs = new Map(); mem.mySubs = new Map();
  mem.pushes = []; mem.pushToHer = 0; pushFails = false; deadEndpoints = [];
}
let pushFails = false;
let deadEndpoints = [];

store.isConfigured = () => true;
store.listHers = async () => [...mem.hers.values()].map((l) => ({ ...l }));
store.getHer = async (id) => (mem.hers.has(id) ? { ...mem.hers.get(id) } : null);
store.saveHer = async (l) => { mem.hers.set(l.id, { ...l }); };
store.deleteHer = async (id) => mem.hers.delete(id);
store.countHers = async () => mem.hers.size;
store.nextHerId = async () => store.HER_ID_BASE + ++mem.next;
store.listSubs = async () => [...mem.subs.values()];
store.countSubs = async () => mem.subs.size;
store.saveSub = async (s) => { mem.subs.set(s.endpoint, s); };
store.removeSub = async (e) => { mem.subs.delete(e); };
store.listMySubs = async () => [...mem.mySubs.values()];
store.saveMySub = async (s) => { mem.mySubs.set(s.endpoint, s); };
store.removeMySub = async (e) => { mem.mySubs.delete(e); };
store.isMySub = async (e) => mem.mySubs.has(e);

send.sendPushToMe = async (subs, opts) => {
  if (pushFails) throw new Error("push service down");
  mem.pushes.push({ to: subs.map((s) => s.endpoint), ...opts });
  return { sent: subs.length, failed: 0, dead: deadEndpoints };
};
send.sendPush = async () => { mem.pushToHer++; return { sent: 0, dead: [] }; };

const herLetters = require("./api/her-letters");
const subscribe = require("./api/subscribe");

function mockRes() {
  return {
    code: null, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
// the browser sends the word URI-encoded, since headers can't carry Cyrillic
async function call(body, { word = "Ябълка Шарена", method = "POST" } = {}) {
  const res = mockRes();
  const headers = word === null ? {} : { authorization: "Bearer " + encodeURIComponent(word) };
  await herLetters({ method, headers, body }, res);
  return res;
}
async function sub(endpoint, { me = false, password = null } = {}) {
  const res = mockRes();
  await subscribe({
    method: "POST",
    url: me ? "/api/subscribe?who=me" : "/api/subscribe",
    query: me ? { who: "me" } : {},
    headers: password ? { authorization: "Bearer " + password } : {},
    body: { endpoint, keys: { p256dh: "p", auth: "a" } },
  }, res);
  return res;
}

const GOOD = { title: "Отговор", body: "Ред едно.\n\nРед две.", envelopeColor: "#EDD0D4", wax: "#8c4658" };
const MY_PHONE = "https://web.push.apple.com/my-phone";
const HER_PHONE = "https://fcm.googleapis.com/fcm/send/her-phone";

(async () => {
  /* ============ reading ============ */
  section("Anyone on the site can read her letters");
  reset();
  let r = await call(undefined, { method: "GET", word: null });
  check("GET works without a word", r.code === 200 && Array.isArray(r.body.letters));
  check("and is never cached", r.headers["Cache-Control"] === "no-store");
  check("PUT is refused", (await call({}, { method: "PUT" })).code === 405);

  /* ============ the word ============ */
  section("Only the secret word can write");
  reset();
  check("the right word passes the check", (await call({ action: "check" })).code === 200);
  check("capitals and spaces don't matter", (await call({ action: "check" }, { word: "  ябълкашарена " })).code === 200);
  const t0 = Date.now();
  r = await call({ action: "check" }, { word: "круша" });
  check("a wrong word is refused", r.code === 401);
  check("after a pause that slows down guessing", Date.now() - t0 >= 1000, `${Date.now() - t0} ms`);
  check("no word at all is refused", (await call({ action: "check" }, { word: null })).code === 401);
  check("an empty word is refused", (await call({ action: "check" }, { word: "" })).code === 401);
  r = await call({ action: "create", letter: GOOD }, { word: "круша" });
  check("a wrong word can't create a letter", r.code === 401 && mem.hers.size === 0);

  const saved = process.env.HER_SECRET_WORD;
  delete process.env.HER_SECRET_WORD;
  check("with no word configured, writing is closed (not open)", (await call({ action: "check" }, { word: "" })).code === 503);
  check("but reading still works", (await call(undefined, { method: "GET", word: null })).code === 200);
  process.env.HER_SECRET_WORD = saved;

  /* ============ create ============ */
  section("She writes a letter");
  reset();
  mem.mySubs.set(MY_PHONE, { endpoint: MY_PHONE });
  mem.subs.set(HER_PHONE, { endpoint: HER_PHONE });
  r = await call({ action: "create", letter: GOOD });
  const first = r.body.letter;
  check("it succeeds", r.code === 200, JSON.stringify(r.body));
  check("its id is in her own range (100001)", first && first.id === 100001, first && String(first.id));
  check("it is marked as hers", first && first.fromHer === true);
  check("its date is today in the usual style", first && /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(first.date), first && first.date);
  check("colours are stored lower-case", first && first.envelopeColor === "#edd0d4");
  check("Bulgarian text is kept as-is", first && first.title === "Отговор" && first.body === GOOD.body);
  check("the list comes back with it", r.body.letters.length === 1);
  check("your phone is told", mem.pushes.length === 1 && mem.pushes[0].to.join() === MY_PHONE);
  check("with her title", mem.pushes[0] && mem.pushes[0].title === "Отговор");
  check("her phone is NOT told", mem.pushToHer === 0 && !mem.pushes[0].to.includes(HER_PHONE));
  check("the wording reads right", send.COPY.toMeBody("Отговор") === "„Отговор“ те чака в пощенската кутия.");

  await call({ action: "create", letter: { ...GOOD, title: "Второ" } });
  r = await call(undefined, { method: "GET", word: null });
  check("ids keep counting up", r.body.letters.some((l) => l.id === 100002));
  check("the list is newest first", r.body.letters[0].title === "Второ");

  section("A letter is never lost because the push failed");
  reset();
  mem.mySubs.set(MY_PHONE, { endpoint: MY_PHONE });
  pushFails = true;
  r = await call({ action: "create", letter: GOOD });
  check("the letter is still saved", r.code === 200 && mem.hers.size === 1, `HTTP ${r.code}`);
  reset();
  r = await call({ action: "create", letter: GOOD });
  check("with no phone of yours subscribed it still saves", r.code === 200 && mem.hers.size === 1);
  reset();
  mem.mySubs.set(MY_PHONE, { endpoint: MY_PHONE });
  deadEndpoints = [MY_PHONE];
  await call({ action: "create", letter: GOOD });
  check("a dead subscription of yours is cleaned up", !mem.mySubs.has(MY_PHONE));

  section("Bad input is refused, and nothing is saved");
  reset();
  const bad = [
    ["an empty title", { ...GOOD, title: "  " }],
    ["an empty letter", { ...GOOD, body: "\n\n" }],
    ["a three-digit colour", { ...GOOD, envelopeColor: "#fff" }],
    ["a colour name", { ...GOOD, wax: "red" }],
    ["a giant title", { ...GOOD, title: "x".repeat(500) }],
    ["a giant letter", { ...GOOD, body: "x".repeat(30001) }],
    ["no letter at all", undefined],
  ];
  for (const [name, letter] of bad) {
    check(`${name} is refused`, (await call({ action: "create", letter })).code === 400);
  }
  check("nothing was saved", mem.hers.size === 0);
  check("and nobody was told", mem.pushes.length === 0);
  check("an unknown action is refused", (await call({ action: "delete-everything" })).code === 400);

  section("The mailbox has a limit");
  reset();
  for (let i = 0; i < 500; i++) mem.hers.set(i, { id: i });
  check("the 501st letter is refused", (await call({ action: "create", letter: GOOD })).code === 429);

  /* ============ edit / delete ============ */
  section("She edits a letter");
  reset();
  mem.mySubs.set(MY_PHONE, { endpoint: MY_PHONE });
  const made = (await call({ action: "create", letter: GOOD })).body.letter;
  mem.pushes = [];
  r = await call({ action: "update", id: made.id, letter: { ...GOOD, title: "Поправено" } });
  check("it succeeds", r.code === 200, JSON.stringify(r.body));
  check("the change is saved", mem.hers.get(made.id).title === "Поправено");
  check("it keeps its id and date", r.body.letter.id === made.id && r.body.letter.date === made.date);
  check("edits are silent", mem.pushes.length === 0);
  check("editing a letter that doesn't exist is a 404", (await call({ action: "update", id: 123, letter: GOOD })).code === 404);
  check("a bad edit is refused", (await call({ action: "update", id: made.id, letter: { ...GOOD, body: "" } })).code === 400);

  section("She deletes a letter");
  r = await call({ action: "delete", id: made.id });
  check("it succeeds", r.code === 200 && mem.hers.size === 0);
  check("deletes are silent", mem.pushes.length === 0);
  check("deleting it again is a 404", (await call({ action: "delete", id: made.id })).code === 404);
  r = await call({ action: "create", letter: GOOD });
  check("a deleted id is never handed out again", r.body.letter.id !== made.id, String(r.body.letter.id));

  /* ============ subscribing your phone ============ */
  section("Your phone subscribes to hear when she writes");
  reset();
  mem.subs.set(MY_PHONE, { endpoint: MY_PHONE }); // e.g. from testing her prompt
  r = await sub(MY_PHONE, { me: true });
  check("without your password it's refused", r.code === 401 && !mem.mySubs.has(MY_PHONE));
  r = await sub(MY_PHONE, { me: true, password: "guess" });
  check("with a wrong password it's refused", r.code === 401 && !mem.mySubs.has(MY_PHONE));
  r = await sub(MY_PHONE, { me: true, password: "test-password" });
  check("with your password it's stored as yours", r.code === 200 && mem.mySubs.has(MY_PHONE));
  check("and taken out of her list", !mem.subs.has(MY_PHONE));

  r = await sub(MY_PHONE);
  check("her prompt re-sending your phone doesn't put it back in her list", r.code === 200 && !mem.subs.has(MY_PHONE));
  r = await sub(HER_PHONE);
  check("her own phone still subscribes as before", r.code === 200 && mem.subs.has(HER_PHONE) && !mem.mySubs.has(HER_PHONE));

  /* ---------- report ---------- */
  console.log(results.join("\n"));
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
