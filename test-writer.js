/* Tests for the writing tool's back end (api/write-letter.js).
 *
 *   node test-writer.js        (or: npm test, which runs this too)
 *
 * Runs offline against a fake GitHub that holds a copy of the real
 * letters.jsx in memory - nothing is committed anywhere.
 */

process.env.WRITER_PASSWORD = "test-password";
process.env.GITHUB_TOKEN = "test-token";

const fs = require("fs");
const path = require("path");
const github = require("./lib/github");
const { parseLettersSource, writeLettersSource, isVisible } = require("./lib/letters");

/* ---------- tiny test harness (same as test-notifications.js) ---------- */
let passed = 0, failed = 0;
const results = [];
function check(name, condition, detail) {
  if (condition) { passed++; results.push(`  PASS  ${name}`); }
  else { failed++; results.push(`  FAIL  ${name}${detail ? "\n          " + detail : ""}`); }
}
function section(t) { results.push(`\n${t}`); }

/* ---------- a fake GitHub holding one file ---------- */
const REAL = fs.readFileSync(path.join(__dirname, "letters.jsx"), "utf8");
const gh = { text: REAL, sha: "sha-0", puts: [], conflictsLeft: 0 };
function resetGitHub() { gh.text = REAL; gh.sha = "sha-0"; gh.puts = []; gh.conflictsLeft = 0; }

github.getFile = async () => ({ text: gh.text, sha: gh.sha });
github.putFile = async (p, text, sha, message) => {
  if (gh.conflictsLeft > 0) {
    // someone else commits first: the file moves on and our sha goes stale
    gh.conflictsLeft--;
    gh.sha = gh.sha + "+other";
    throw new github.ConflictError("changed");
  }
  if (sha !== gh.sha) throw new github.ConflictError("stale sha");
  gh.text = text;
  gh.sha = "sha-" + (gh.puts.length + 1);
  gh.puts.push({ path: p, message });
  return { commit: gh.sha };
};

const writeLetter = require("./api/write-letter");

function mockRes() {
  return {
    code: null, body: null,
    status(c) { this.code = c; return this; },
    json(o) { this.body = o; return this; },
  };
}
async function call(body, { password = "test-password", method = "POST" } = {}) {
  const res = mockRes();
  await writeLetter({ method, headers: password ? { authorization: "Bearer " + password } : {}, body }, res);
  return res;
}

const GOOD = { title: "Проба", body: "Ред едно.\n\nРед две.", envelopeColor: "#e8d4b8", wax: "#7a5a8a" };
const lettersNow = () => parseLettersSource(gh.text).letters;
const originals = parseLettersSource(REAL).letters;

(async () => {
  /* ============ the file format ============ */
  section("Rewriting letters.jsx must not disturb anything else in it");
  check("parse then write gives back the exact same bytes", writeLettersSource(REAL, parseLettersSource(REAL)) === REAL);

  /* ============ auth ============ */
  section("Only you can use it");
  check("GET is refused", (await call({ action: "list" }, { method: "GET" })).code === 405);
  check("no password is refused", (await call({ action: "list" }, { password: null })).code === 401);
  check("a wrong password is refused", (await call({ action: "list" }, { password: "guess" })).code === 401);
  check("the right password lists letters", (await call({ action: "list" })).code === 200);

  const saved = process.env.WRITER_PASSWORD;
  delete process.env.WRITER_PASSWORD;
  check("with no password configured it is closed, not open", (await call({ action: "list" }, { password: "" })).code === 503);
  process.env.WRITER_PASSWORD = saved;

  /* ============ list ============ */
  section("The list only shows letters made in the app");
  resetGitHub();
  let r = await call({ action: "list" });
  check("the five hand-written letters are not listed", r.body.letters.length === 0, JSON.stringify(r.body.letters.map((l) => l.id)));

  /* ============ create ============ */
  section("Adding a letter now");
  resetGitHub();
  r = await call({ action: "create", letter: GOOD });
  const added = r.body.letter;
  check("it succeeds", r.code === 200, JSON.stringify(r.body));
  check("it gets the next id (6)", added && added.id === 6, added && String(added.id));
  check("it is marked as made in the app", added && added.fromApp === true);
  check("it has no unlockAt, so it is live straight away", added && !("unlockAt" in added));
  check("its date is today in the usual style", added && /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(added.date), added && added.date);
  check("exactly one commit was made", gh.puts.length === 1);
  check("the commit message names the letter", gh.puts[0].message === "Add letter: Проба (from the app)", gh.puts[0].message);
  check("it is now the last letter in the file", lettersNow().at(-1).title === "Проба");
  check("the five originals are untouched", JSON.stringify(lettersNow().slice(0, 5)) === JSON.stringify(originals));
  check("the code outside the letters block is untouched",
    gh.text.slice(0, gh.text.indexOf("/*EDITMODE-BEGIN*/")) === REAL.slice(0, REAL.indexOf("/*EDITMODE-BEGIN*/")) &&
    gh.text.slice(gh.text.indexOf("/*EDITMODE-END*/")) === REAL.slice(REAL.indexOf("/*EDITMODE-END*/")));
  check("Bulgarian text is stored as-is, not escaped", gh.text.includes('"title": "Проба"'));
  check("the list now shows it", (await call({ action: "list" })).body.letters.length === 1);

  section("Adding a letter for later");
  resetGitHub();
  const future = Date.UTC(2031, 0, 15, 7, 0); // 9:00 in Sofia (winter, UTC+2)
  r = await call({ action: "create", letter: { ...GOOD, unlockAt: new Date(future).toISOString() } });
  const later = r.body.letter;
  check("it keeps its unlock time", later.unlockAt === "2031-01-15T07:00:00Z", later.unlockAt);
  check("its date is the day it arrives", later.date === "Jan 15, 2031", later.date);
  check("the notifier treats it as not yet visible", !isVisible(later));

  section("A time that has already passed means 'now'");
  resetGitHub();
  r = await call({ action: "create", letter: { ...GOOD, unlockAt: "2020-01-01T00:00:00Z" } });
  check("no unlockAt is stored", r.code === 200 && !("unlockAt" in r.body.letter));

  section("Bad input is refused, and nothing is committed");
  resetGitHub();
  const bad = [
    ["an empty title", { ...GOOD, title: "  " }],
    ["an empty letter", { ...GOOD, body: "\n\n" }],
    ["a three-digit colour", { ...GOOD, envelopeColor: "#fff" }],
    ["a colour name", { ...GOOD, wax: "red" }],
    ["a nonsense time", { ...GOOD, unlockAt: "tomorrow-ish" }],
    ["a giant title", { ...GOOD, title: "x".repeat(500) }],
  ];
  for (const [name, letter] of bad) {
    check(`${name} is refused`, (await call({ action: "create", letter })).code === 400);
  }
  check("no commits were made", gh.puts.length === 0);
  check("an unknown action is refused", (await call({ action: "delete-everything" })).code === 400);

  /* ============ update ============ */
  section("Editing a letter made in the app");
  resetGitHub();
  await call({ action: "create", letter: { ...GOOD, unlockAt: new Date(future).toISOString() } });
  r = await call({ action: "update", id: 6, letter: { ...GOOD, title: "Поправено", unlockAt: new Date(future).toISOString() } });
  check("it succeeds", r.code === 200, JSON.stringify(r.body));
  check("the change is saved", lettersNow().find((l) => l.id === 6).title === "Поправено");
  check("it keeps its id", r.body.letter.id === 6);
  check("it is still the only new letter", lettersNow().length === 6);
  check("the commit says it was an edit", gh.puts.at(-1).message.startsWith("Edit letter:"));

  r = await call({ action: "update", id: 6, letter: { ...GOOD, unlockAt: "2031-02-01T07:00:00Z" } });
  check("moving a scheduled letter moves its date too", r.body.letter.date === "Feb 1, 2031", r.body.letter.date);

  section("Editing a letter that is already live never hides it again");
  resetGitHub();
  await call({ action: "create", letter: GOOD });
  const liveDate = lettersNow().at(-1).date;
  r = await call({ action: "update", id: 6, letter: { ...GOOD, body: "нов текст", unlockAt: new Date(future).toISOString() } });
  check("it stays live", isVisible(r.body.letter), JSON.stringify(r.body.letter.unlockAt));
  check("its date stays the same", r.body.letter.date === liveDate);

  section("The original letters can't be changed from the app");
  resetGitHub();
  r = await call({ action: "update", id: 1, letter: GOOD });
  check("editing letter 1 is refused", r.code === 403, `HTTP ${r.code}`);
  check("and nothing was committed", gh.puts.length === 0);
  check("a letter that doesn't exist is a 404", (await call({ action: "update", id: 99, letter: GOOD })).code === 404);

  /* ============ someone else committing at the same moment ============ */
  section("A commit landing in between (e.g. a push from the laptop)");
  resetGitHub();
  gh.conflictsLeft = 1;
  r = await call({ action: "create", letter: GOOD });
  check("it re-reads and saves on the second try", r.code === 200 && gh.puts.length === 1, `HTTP ${r.code}`);

  resetGitHub();
  gh.conflictsLeft = 5;
  r = await call({ action: "create", letter: GOOD });
  check("it gives up after one retry instead of looping", r.code === 500 && gh.puts.length === 0, `HTTP ${r.code}`);

  /* ---------- report ---------- */
  console.log(results.join("\n"));
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
