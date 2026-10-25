/* Tests for photos in letters: the upload endpoint (api/letter-photo.js), the
 * photo field in both letter savers (api/write-letter.js for yours,
 * api/her-letters.js for hers), and where photos land on the paper
 * (layoutPhotos in photos.jsx, plus the marker helpers in photo-editor.jsx).
 *
 *   node test-photos.js        (or: npm test, which runs this too)
 *
 * Runs offline: a fake GitHub holds letters.jsx, a fake Redis holds her
 * letters, and a fake photo store records what would have been uploaded or
 * deleted.
 */

process.env.WRITER_PASSWORD = "test-password";
process.env.GITHUB_TOKEN = "test-token";
process.env.BLOB_READ_WRITE_TOKEN = "test-blob";
process.env.HER_SECRET_WORD = "Ябълка Шарена";

const fs = require("fs");
const path = require("path");
const github = require("./lib/github");
const photos = require("./lib/photos");
const store = require("./lib/store");
const { parseLettersSource, writeLettersSource } = require("./lib/letters");

/* ---------- tiny test harness (same as test-writer.js) ---------- */
let passed = 0, failed = 0;
const results = [];
function check(name, condition, detail) {
  if (condition) { passed++; results.push(`  PASS  ${name}`); }
  else { failed++; results.push(`  FAIL  ${name}${detail ? "\n          " + detail : ""}`); }
}
function section(t) { results.push(`\n${t}`); }

/* ---------- a fake GitHub and a fake photo store ---------- */
const FILE_NOW = fs.readFileSync(path.join(__dirname, "letters.jsx"), "utf8");
const REAL = (() => {
  const data = parseLettersSource(FILE_NOW);
  return writeLettersSource(FILE_NOW, { ...data, letters: data.letters.filter((l) => !l.fromApp) });
})();
const gh = { text: REAL, sha: "sha-0", puts: 0 };
github.getFile = async () => ({ text: gh.text, sha: gh.sha });
github.putFile = async (p, text) => { gh.text = text; gh.sha = "sha-" + ++gh.puts; return { commit: gh.sha }; };

const photoLog = { uploaded: [], deleted: [] };
photos.upload = async (buf) => { photoLog.uploaded.push(buf); return `https://abc.public.blob.vercel-storage.com/letters/photo-${photoLog.uploaded.length}.jpg`; };
photos.remove = async (urls) => { photoLog.deleted.push(...urls.filter(photos.isStored)); };
const hers = new Map();
let herNext = 0;
store.isConfigured = () => true;
store.listHers = async () => [...hers.values()].map((l) => ({ ...l }));
store.getHer = async (id) => (hers.has(id) ? { ...hers.get(id) } : null);
store.saveHer = async (l) => { hers.set(l.id, { ...l }); };
store.deleteHer = async (id) => hers.delete(id);
store.countHers = async () => hers.size;
store.nextHerId = async () => store.HER_ID_BASE + ++herNext;
store.listMySubs = async () => []; // nobody to buzz, so nothing is sent

function reset() {
  gh.text = REAL; gh.sha = "sha-0"; gh.puts = 0; photoLog.uploaded = []; photoLog.deleted = [];
  hers.clear(); herNext = 0;
}

const writeLetter = require("./api/write-letter");
const herLetters = require("./api/her-letters");
const letterPhoto = require("./api/letter-photo");

function mockRes() {
  return { code: null, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } };
}
async function call(handler, body, password = "test-password") {
  const res = mockRes();
  await handler({ method: "POST", headers: password ? { authorization: "Bearer " + password } : {}, body }, res);
  return res;
}
// her word travels URI-encoded, the way her screen sends it
const asHer = (handler, body, word = "ябълка шарена") => call(handler, body, encodeURIComponent(word));

const A = "https://abc.public.blob.vercel-storage.com/letters/photo-a.jpg";
const B = "https://abc.public.blob.vercel-storage.com/letters/photo-b.jpg";
const GOOD = { title: "Снимки", body: "Ред едно.\n[📷 1]\n\nРед две.", envelopeColor: "#e8d4b8", wax: "#7a5a8a" };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString("base64");
const lettersNow = () => parseLettersSource(gh.text).letters;

/* the browser-side placement code, lifted out of the .jsx files (the parts
   tested here are plain JavaScript - no JSX) */
function lift(file, from, to, names) {
  const src = fs.readFileSync(path.join(__dirname, file), "utf8");
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a === -1 || b === -1) throw new Error(`can't find the code to test in ${file}`);
  return new Function("window", `${src.slice(a, b)}; return { ${names} };`);
}
const page = lift("photos.jsx", "const PHOTO_MARK", "/** One spot between paragraphs", "PHOTO_MARK, layoutPhotos")({});
const tool = lift("photo-editor.jsx", "const PHOTO_MAX_SIDE", "/* ---------------- the wording", "placeOnOwnLine, renumberMarks, orderPhotos")({ PHOTO_MARK: page.PHOTO_MARK });

(async () => {
  /* ============ uploading ============ */
  section("Uploading a photo");
  reset();
  check("no password is refused", (await call(letterPhoto, { action: "upload", data: JPEG }, null)).code === 401);
  let r = await call(letterPhoto, { action: "upload", data: JPEG });
  check("a JPEG is stored and its address returned", r.code === 200 && r.body.url === `https://abc.public.blob.vercel-storage.com/letters/photo-1.jpg`, JSON.stringify(r.body));
  check("something that isn't a JPEG is refused", (await call(letterPhoto, { action: "upload", data: Buffer.from("<html>").toString("base64") })).code === 400);
  check("an empty upload is refused", (await call(letterPhoto, { action: "upload", data: "" })).code === 400);
  const huge = Buffer.alloc(4 * 1024 * 1024, 0xff); huge[1] = 0xd8;
  check("a photo over 3 MB is refused", (await call(letterPhoto, { action: "upload", data: huge.toString("base64") })).code === 413);
  check("only the one good photo reached the store", photoLog.uploaded.length === 1);

  const saved = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  r = await call(letterPhoto, { action: "upload", data: JPEG });
  check("with no store connected it says so, instead of failing oddly", r.code === 503 && /Blob store/.test(r.body.error), JSON.stringify(r.body));
  process.env.BLOB_READ_WRITE_TOKEN = saved;

  /* ============ letters with photos ============ */
  section("A letter with photos");
  reset();
  r = await call(writeLetter, { action: "create", letter: { ...GOOD, photos: [
    { src: A, caption: "  нашата   неделя ", pos: "62% 50%" },
    { src: B, caption: "", pos: "50% 50%" },
  ] } });
  const made = r.body.letter;
  check("it is saved", r.code === 200, JSON.stringify(r.body));
  check("the photos are kept in order", made.photos.length === 2 && made.photos[0].src === A && made.photos[1].src === B);
  check("a caption is tidied", made.photos[0].caption === "нашата неделя", made.photos[0].caption);
  check("an empty caption and a centred crop are left out", JSON.stringify(made.photos[1]) === JSON.stringify({ src: B }), JSON.stringify(made.photos[1]));
  check("photos come after the text and before fromApp", Object.keys(made).join(",") === "id,date,title,envelopeColor,wax,body,photos,fromApp", Object.keys(made).join(","));
  check("the marker in the text is kept", made.body.includes("[📷 1]"));
  check("the file still parses for the notifier", lettersNow().at(-1).photos.length === 2);

  section("A letter without photos looks exactly as before");
  reset();
  r = await call(writeLetter, { action: "create", letter: { ...GOOD, photos: [] } });
  check("it has no photos field at all", !("photos" in r.body.letter));
  r = await call(writeLetter, { action: "create", letter: GOOD });
  check("nor when photos aren't sent", !("photos" in r.body.letter));

  section("Bad photos are refused, and nothing is committed");
  reset();
  const bad = [
    ["not a list", "nope"],
    ["an address that isn't https", [{ src: "javascript:alert(1)" }]],
    ["no address", [{ caption: "x" }]],
    ["a caption that's far too long", [{ src: A, caption: "я".repeat(61) }]],
    ["more than 20", Array.from({ length: 21 }, () => ({ src: A }))],
  ];
  for (const [what, list] of bad) {
    const res = await call(writeLetter, { action: "create", letter: { ...GOOD, photos: list } });
    check(`${what} is refused`, res.code === 400, `HTTP ${res.code} ${JSON.stringify(res.body)}`);
  }
  r = await call(writeLetter, { action: "create", letter: { ...GOOD, photos: [{ src: A, pos: "left; color: red" }] } });
  check("a strange crop setting is dropped, not stored", r.code === 200 && !("pos" in r.body.letter.photos[0]));
  check("only that last letter was committed", gh.puts === 1, `${gh.puts} commits`);

  /* ============ editing ============ */
  section("Taking a photo out of a sent letter");
  reset();
  await call(writeLetter, { action: "create", letter: { ...GOOD, photos: [{ src: A }, { src: B }] } });
  const id = lettersNow().at(-1).id;
  r = await call(writeLetter, { action: "update", id, letter: { ...GOOD, photos: [{ src: A }] } });
  check("the edit is saved", r.code === 200 && r.body.letter.photos.length === 1);
  check("the photo taken out is deleted from the store", JSON.stringify(photoLog.deleted) === JSON.stringify([B]), JSON.stringify(photoLog.deleted));
  photoLog.deleted = [];
  r = await call(writeLetter, { action: "update", id, letter: { ...GOOD, photos: [{ src: A, caption: "ново" }] } });
  check("editing without taking any out deletes nothing", photoLog.deleted.length === 0);

  section("A photo another letter still uses is never deleted");
  reset();
  await call(writeLetter, { action: "create", letter: { ...GOOD, photos: [{ src: A }] } });
  await call(writeLetter, { action: "create", letter: { ...GOOD, photos: [{ src: A }] } });
  await call(writeLetter, { action: "update", id: lettersNow().at(-1).id, letter: GOOD });
  check("taking it out of one letter keeps it for the other", photoLog.deleted.length === 0, JSON.stringify(photoLog.deleted));

  section("Deleting a photo from the tool (added, then taken out before sending)");
  reset();
  await call(writeLetter, { action: "create", letter: { ...GOOD, photos: [{ src: A }] } });
  r = await call(letterPhoto, { action: "delete", url: A });
  check("a photo in a letter is refused", r.code === 409 && photoLog.deleted.length === 0, `HTTP ${r.code}`);
  r = await call(letterPhoto, { action: "delete", url: B });
  check("a photo no letter uses is deleted", r.code === 200 && JSON.stringify(photoLog.deleted) === JSON.stringify([B]));
  r = await call(letterPhoto, { action: "delete", url: "https://example.com/her-photo.jpg" });
  check("anything outside the photo store is refused", r.code === 400);

  /* ============ her letters ============ */
  section("She can add photos too");
  reset();
  r = await asHer(letterPhoto, { action: "upload", data: JPEG });
  check("her word uploads a photo", r.code === 200 && photoLog.uploaded.length === 1, JSON.stringify(r.body));
  check("a wrong word doesn't", (await asHer(letterPhoto, { action: "upload", data: JPEG }, "круша")).code === 401);
  r = await asHer(herLetters, { action: "create", letter: { ...GOOD, photos: [{ src: A, caption: " ти " }, { src: B }] } });
  check("her letter keeps its photos", r.code === 200 && r.body.letter.photos.length === 2 && r.body.letter.photos[0].caption === "ти", JSON.stringify(r.body));
  check("and they're in the public list the site reads", (await store.listHers())[0].photos.length === 2);
  r = await asHer(herLetters, { action: "create", letter: GOOD });
  check("a letter of hers without photos has no photos field", r.code === 200 && !("photos" in r.body.letter));
  r = await asHer(herLetters, { action: "create", letter: { ...GOOD, photos: [{ src: "nope" }] } });
  check("a broken photo is refused, in Bulgarian", r.code === 400 && /снимки/.test(r.body.error), JSON.stringify(r.body));

  section("Her photos are tidied away when no letter needs them");
  reset();
  r = await asHer(herLetters, { action: "create", letter: { ...GOOD, photos: [{ src: A }, { src: B }] } });
  const herId = r.body.letter.id;
  r = await asHer(letterPhoto, { action: "delete", url: A });
  check("a photo in her letter can't be deleted on its own", r.code === 409 && photoLog.deleted.length === 0, `HTTP ${r.code}`);
  r = await asHer(herLetters, { action: "update", id: herId, letter: { ...GOOD, photos: [{ src: A }] } });
  check("taking one out of her letter deletes it", r.code === 200 && JSON.stringify(photoLog.deleted) === JSON.stringify([B]), JSON.stringify(photoLog.deleted));
  r = await asHer(herLetters, { action: "update", id: herId, letter: GOOD });
  check("taking out the last one removes the field", !("photos" in r.body.letter) && !("photos" in (await store.getHer(herId))));
  reset();
  r = await asHer(herLetters, { action: "create", letter: { ...GOOD, photos: [{ src: A }, { src: B }] } });
  await asHer(herLetters, { action: "create", letter: { ...GOOD, photos: [{ src: B }] } });
  await asHer(herLetters, { action: "delete", id: r.body.letter.id });
  check("deleting her letter deletes its photos, but not one another letter uses",
    JSON.stringify(photoLog.deleted) === JSON.stringify([A]), JSON.stringify(photoLog.deleted));

  /* ============ where they land on the paper ============ */
  section("Where photos land on the paper (photos.jsx)");
  const P = ["a", "b", "c", "d"].map((src) => ({ src }));
  const lines = (s) => s.split("\n");
  let L = page.layoutPhotos(lines("Едно.\n[📷 2]\n\nДве.\n\nС обич,\nХ."), P.slice(0, 2));
  check("a marker places that photo right there", L.at[1] && L.at[1][0].photos[0].src === "b", JSON.stringify(L.at));
  check("the marker's line isn't drawn as text", L.text[1] === null);
  check("a photo without a marker goes between paragraphs", L.at[3] && L.at[3][0].photos[0].src === "a", JSON.stringify(Object.keys(L.at)));
  check("and never after the signature", !L.at[6] && !L.at[5]);
  L = page.layoutPhotos(lines("Едно.\n[📷 1] [📷 2]\nДве."), P.slice(0, 2));
  check("two markers on one line make a pair", L.at[1].length === 1 && L.at[1][0].photos.length === 2);
  L = page.layoutPhotos(lines("Едно.\n[📷 1][📷 2][📷 3]\nДве."), P.slice(0, 3));
  check("three on a line become a pair and a single", L.at[1].length === 2 && L.at[1][1].photos.length === 1);
  L = page.layoutPhotos(lines("Едно [снимка 1] и още.\n[photo 2]"), P.slice(0, 2));
  check("hand-written markers work, and text around one stays", L.text[0] === "Едно  и още." && L.at[0] && L.at[1]);
  L = page.layoutPhotos(lines("Едно.\n[📷 9]\n[📷 1]\n[📷 1]"), P.slice(0, 1));
  check("a marker for a missing photo, or a repeat, shows nothing", Object.keys(L.at).join() === "2", JSON.stringify(Object.keys(L.at)));
  L = page.layoutPhotos(lines("Едно.\n[📷 1]\n\nДве.\n[📷 2]\n\nТри.\n[📷 3]"), P.slice(0, 3));
  check("singles alternate left and right, top to bottom", [1, 4, 7].map((i) => L.at[i][0].k).join() === "0,1,2");

  section("Placing markers while writing (photo-editor.jsx)");
  const text = "Ти се смееше и аз просто снимах.\n\nОще.";
  let p = tool.placeOnOwnLine(text, text.indexOf("снимах") + 3, "[📷 1]");
  check("a tap in the middle of a word puts the photo after the word and its full stop",
    p.body === "Ти се смееше и аз просто снимах.\n[📷 1]\n\nОще.", JSON.stringify(p.body));
  p = tool.placeOnOwnLine(text, text.indexOf("аз"), "[📷 1]");
  check("a tap before a word splits the line there", p.body === "Ти се смееше и\n[📷 1]\nаз просто снимах.\n\nОще.", JSON.stringify(p.body));
  check("removing a marker takes its empty line with it",
    tool.renumberMarks("А.\n[📷 1]\nБ. [📷 2]", (n) => (n === 1 ? 0 : 1)) === "А.\nБ. [📷 1]");
  const o = tool.orderPhotos("А.\n[📷 3]\nБ.\n[📷 1]\n[📷 7]", P.slice(0, 3));
  check("photos are numbered in the order they appear", o.body === "А.\n[📷 1]\nБ.\n[📷 2]" && o.photos.map((x) => x.src).join("") === "cab", JSON.stringify(o));

  /* ---------- report ---------- */
  console.log(results.join("\n"));
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
})();
