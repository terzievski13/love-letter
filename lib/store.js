/* Tiny wrapper over Upstash Redis.

   The keys:
     subs           - hash of her push subscriptions, keyed by endpoint URL
     announced      - set of letter ids we have already told her about
     my-subs        - hash of YOUR push subscriptions (told when she writes)
     from-her       - hash of her letters to you, keyed by id
     from-her:next  - counter that hands out her letter ids

   Everything degrades politely when Redis is not configured, so a dry run
   still works before the database exists. */

const { Redis } = require("@upstash/redis");

const SUBS = "letters:subs";
const ANNOUNCED = "letters:announced";
const MY_SUBS = "letters:my-subs";
const HERS = "letters:from-her";
const HERS_NEXT = "letters:from-her:next";
const HER_ID_BASE = 100000;
const MAX_SUBS = 20; // she has a phone and maybe a laptop; a cap keeps junk out

let client;

function redis() {
  if (client !== undefined) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  client = url && token ? new Redis({ url, token }) : null;
  return client;
}

function isConfigured() {
  return redis() !== null;
}

async function listSubs() {
  const r = redis();
  if (!r) return [];
  const all = await r.hgetall(SUBS);
  if (!all) return [];
  // Upstash parses JSON values automatically; tolerate both shapes.
  return Object.values(all).map((v) => (typeof v === "string" ? JSON.parse(v) : v));
}

async function countSubs() {
  const r = redis();
  if (!r) return 0;
  return (await r.hlen(SUBS)) || 0;
}

async function saveSub(sub) {
  const r = redis();
  if (!r) throw new Error("Redis is not configured");
  await r.hset(SUBS, { [sub.endpoint]: JSON.stringify(sub) });
}

async function removeSub(endpoint) {
  const r = redis();
  if (!r) return;
  await r.hdel(SUBS, endpoint);
}

async function announcedIds() {
  const r = redis();
  if (!r) return [];
  return (await r.smembers(ANNOUNCED)) || [];
}

/* Atomically claim a letter for announcing. Returns true only for the caller
   that got there first - so two triggers firing at the same instant can never
   both send. This is what makes the endpoint safe to call repeatedly. */
async function claim(letterId) {
  const r = redis();
  if (!r) throw new Error("Redis is not configured");
  return (await r.sadd(ANNOUNCED, String(letterId))) === 1;
}

/* Give a claim back, so a later run retries it. Used when sending fails
   completely - better a late notification than none at all. */
async function unclaim(letterId) {
  const r = redis();
  if (!r) return;
  await r.srem(ANNOUNCED, String(letterId));
}

/* ---------- your phone (so you hear when she writes) ----------
   Kept apart from her list: your letters only ever go to `subs`, hers only
   ever to `my-subs`. */

async function listMySubs() {
  const r = redis();
  if (!r) return [];
  const all = await r.hgetall(MY_SUBS);
  if (!all) return [];
  return Object.values(all).map((v) => (typeof v === "string" ? JSON.parse(v) : v));
}

async function saveMySub(sub) {
  const r = redis();
  if (!r) throw new Error("Redis is not configured");
  await r.hset(MY_SUBS, { [sub.endpoint]: JSON.stringify(sub) });
}

async function removeMySub(endpoint) {
  const r = redis();
  if (!r) return;
  await r.hdel(MY_SUBS, endpoint);
}

async function isMySub(endpoint) {
  const r = redis();
  if (!r) return false;
  return Boolean(await r.hexists(MY_SUBS, endpoint));
}

/* ---------- her letters to you ---------- */

async function listHers() {
  const r = redis();
  if (!r) return [];
  const all = await r.hgetall(HERS);
  if (!all) return [];
  return Object.values(all).map((v) => (typeof v === "string" ? JSON.parse(v) : v));
}

async function getHer(id) {
  const r = redis();
  if (!r) return null;
  const v = await r.hget(HERS, String(id));
  if (v == null) return null;
  return typeof v === "string" ? JSON.parse(v) : v;
}

async function saveHer(letter) {
  const r = redis();
  if (!r) throw new Error("Redis is not configured");
  await r.hset(HERS, { [String(letter.id)]: JSON.stringify(letter) });
}

async function deleteHer(id) {
  const r = redis();
  if (!r) return false;
  return Boolean(await r.hdel(HERS, String(id)));
}

async function countHers() {
  const r = redis();
  if (!r) return 0;
  return (await r.hlen(HERS)) || 0;
}

/* Her ids start at 100001 so they can never clash with yours, and come from
   a counter so a deleted letter's id is never handed out again. */
async function nextHerId() {
  const r = redis();
  if (!r) throw new Error("Redis is not configured");
  return HER_ID_BASE + (await r.incr(HERS_NEXT));
}

module.exports = {
  isConfigured, listSubs, countSubs, saveSub, removeSub,
  announcedIds, claim, unclaim, MAX_SUBS,
  listMySubs, saveMySub, removeMySub, isMySub,
  listHers, getHer, saveHer, deleteHer, countHers, nextHerId, HER_ID_BASE,
};
