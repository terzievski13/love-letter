# Notifications

How she finds out a letter has arrived: a push notification to her phone,
plus an email as backup. Added 2026-08-22. Read this before touching
anything in api/, lib/, sw.js, notify.jsx, vercel.json or
.github/workflows/. Writing a letter itself needs none of this — see
ADDING-A-LETTER.md.

This is the first server-side code the project has ever had — everything
before it was static files.

**The one thing to understand:** `/api/notify-check` is *idempotent*. It
works out which letters are visible but not yet announced, announces
exactly those, and records it in Redis. Calling it a hundred times sends
one notification. That is deliberate — three separate triggers call it, so
any one of them failing costs nothing:

- GitHub Action on push to `main` — a letter you upload lands within ~2 min
- GitHub Action every 15 min — catches letters that unlock on a timer
- Vercel cron once a day (`vercel.json`) — backstop, because GitHub disables
  scheduled workflows in repos with no commits for 60 days

**The GitHub Action is switched on** (as of 2026-09-11) — it lives at
`.github/workflows/notify.yml`. Getting there needed `gh auth refresh -h
github.com -s workflow` first, since the laptop's `gh` token originally
lacked the `workflow` scope that pushes into `.github/workflows/` require.
All three triggers listed above are live now; a push-triggered or timed
letter is announced within minutes, not a day.

**It never keeps its own copy of the letters.** It reads the deployed
`letters.jsx` and parses the JSON out of the `/*EDITMODE-BEGIN*/` sentinels
that already wrap it, then applies the same `unlockAt` rule app.jsx uses.
So it can only ever announce letters that are genuinely live. It reads the
file off the function's own disk (`includeFiles` in `vercel.json` puts it
there) rather than over HTTP, because Vercel's Deployment Protection
answers requests to protected deployments with a 302 to a login page — an
HTTP self-fetch works on the production domain but fails on every preview.
The HTTP path survives as a fallback and `lettersFrom` in the endpoint's
response says which one was used.

Files: `api/notify-check.js` (the checker), `api/subscribe.js` (public,
stores her subscription), `lib/letters.js` `lib/store.js` `lib/send.js`,
`sw.js` (service worker), `notify.jsx` (the in-site prompt),
`.github/workflows/notify.yml`, `manifest.json`, `icon-{192,512}.png`.

`api/test-real-push.js` also exists (added 2026-09-11) — a **temporary**
diagnostic route, secret-gated the same way as `notify-check`, that sends
any text you like to every stored subscription without touching the real
"announced" bookkeeping. It's how the push pipeline got verified end to
end (confirmed working on a real iPhone). Unlike the real endpoint it can
send arbitrary text, not just the fixed copy, so it's a bit more exposure
than anything else here if the secret ever leaked — meant to be deleted
once no longer needed, not left forever.

Things that will bite you:

- **`sw.js` must never gain a `fetch` handler.** The site transpiles JSX in
  the browser at runtime; a caching service worker would serve a stale,
  half-broken app that is painful to clear from her phone. It handles
  `push` and `notificationclick` only.
- **Push subscriptions are bound to their origin.** One created on a
  preview URL will never receive a push sent from production. After any
  domain change she must re-subscribe.
- **Run `?seed=1` once against a fresh database**, or the first real run
  finds five unannounced letters and fires them all at her at once. The
  endpoint refuses that case with a 409 rather than doing it, but seeding
  is the intended fix.
- The public VAPID key is hardcoded in `notify.jsx` because there is no
  build step and therefore no way to inject env vars into browser code.
  That is fine — it is public by design. The private half is in Vercel's
  environment variables and in `.vapid-keys.json`, which is gitignored.
  **The repo is public**, so nothing secret may ever be committed.
- Wording for the prompt and the notifications lives in `NOTIFY_COPY` at
  the top of `notify.jsx` and `COPY` at the top of `lib/send.js`. It is in
  Bulgarian and deliberately never names the letter — some titles are
  spoilers.

Run `npm test` for the offline test suite (40 checks, no network, nothing
sent): duplicate suppression, the backlog guard, simultaneous triggers,
timed unlocks, dead-subscription pruning, delivery failure and retry, and
the subscribe endpoint's validation.

Environment variables (Vercel): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`, `NOTIFY_SECRET`, `CRON_SECRET` (same value),
`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `HER_EMAIL`, `MY_EMAIL`, plus Upstash's
own two. `NOTIFY_SECRET` also goes in GitHub → Secrets → Actions.
