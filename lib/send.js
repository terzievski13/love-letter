/* Delivering the news, two ways: a push notification to her phone, and an
   email as the backup for when push quietly dies (which it does).

   All the wording lives in COPY at the top so it can be reworded without
   reading any of the code below it. */

const webpush = require("web-push");
const nodemailer = require("nodemailer");

const PUSH_TTL = 60 * 60 * 24 * 14; // hold it for two weeks if her phone is off

/* Deliberately never names the letter - some of the titles are spoilers. */
const COPY = {
  pushTitle: (n) => (n > 1 ? "Има нови писма 💌" : "Има ново писмо 💌"),
  pushBody: (n) => (n > 1 ? `${n} нови писма те чакат в пощенската кутия.` : "Пощенската кутия те чака."),
  mailSubject: (n) => (n > 1 ? "Има нови писма за теб 💌" : "Има ново писмо за теб 💌"),
  mailBody: (n, url) =>
    `${n > 1 ? `${n} нови писма те чакат` : "Ново писмо те чака"} в пощенската кутия.\n\n${url}\n`,
  fromName: "Пощальонът",
};

function pushReady() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT
  );
}

function mailReady() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD && process.env.HER_EMAIL);
}

/* Push to every stored subscription. Returns the endpoints of any that the
   push service says are gone, so the caller can prune them. */
async function sendPush(subs, { count, url }) {
  if (!pushReady()) return { sent: 0, failed: 0, dead: [], skipped: "VAPID keys not set" };

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const payload = JSON.stringify({
    title: COPY.pushTitle(count),
    body: COPY.pushBody(count),
    url,
    tag: "new-letter",
  });

  let sent = 0;
  let failed = 0;
  const dead = [];
  const errors = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, payload, { TTL: PUSH_TTL, urgency: "normal" });
      sent++;
    } catch (err) {
      failed++;
      // 404/410 mean the subscription is permanently gone, not a transient error.
      if (err.statusCode === 404 || err.statusCode === 410) {
        dead.push(sub.endpoint);
      } else {
        errors.push(`${err.statusCode || "?"}: ${err.body || err.message}`);
      }
    }
  }

  return { sent, failed, dead, errors };
}

function transport() {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

/* Her copy: short, plain, no marketing shapes - that is what keeps it out of
   the spam folder. */
async function sendMail({ count, url }) {
  if (!mailReady()) return { sent: false, skipped: "Gmail credentials or HER_EMAIL not set" };

  await transport().sendMail({
    from: `"${COPY.fromName}" <${process.env.GMAIL_USER}>`,
    to: process.env.HER_EMAIL,
    subject: COPY.mailSubject(count),
    text: COPY.mailBody(count, url),
  });

  return { sent: true, to: process.env.HER_EMAIL };
}

/* Your receipt. If your phone buzzes and hers does not, you know immediately
   that the push half has broken. */
async function sendReceipt(summary) {
  if (!process.env.MY_EMAIL || !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { sent: false };
  }

  await transport().sendMail({
    from: `"${COPY.fromName}" <${process.env.GMAIL_USER}>`,
    to: process.env.MY_EMAIL,
    subject: `[mailbox] announced ${summary.announced.join(", ")}`,
    text: JSON.stringify(summary, null, 2),
  });

  return { sent: true };
}

module.exports = { sendPush, sendMail, sendReceipt, pushReady, mailReady, COPY, PUSH_TTL };
