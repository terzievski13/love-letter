/* Tiny wrapper over Upstash Redis.

   Two kinds of key, nothing more:
     subs      - hash of push subscriptions, keyed by their endpoint URL
     announced - set of letter ids we have already told her about

   Everything degrades politely when Redis is not configured, so a dry run
   still works before the database exists. */

const { Redis } = require("@upstash/redis");

const SUBS = "letters:subs";
const ANNOUNCED = "letters:announced";
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

module.exports = {
  isConfigured, listSubs, countSubs, saveSub, removeSub,
  announcedIds, claim, unclaim, MAX_SUBS,
};
