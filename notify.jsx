/* The little line that asks whether the mailbox may ring her phone.

   Rules it follows, because browsers punish getting these wrong:
     - never asks on page load, only when she taps our own button
     - never asks twice; if Chrome has already blocked us it explains instead
     - remembers a "not now" so it does not nag

   All the wording is in COPY at the top - rewrite it in your own voice. */

const { useState: useNotifyState, useEffect: useNotifyEffect } = React;

const NOTIFY_COPY = {
  ask: "да звънна ли, когато оставя ново писмо?",
  asker: "пощальонът пита:",
  yes: "да, звънни",
  no: "не сега",
  working: "секунда...",
  granted: "готово — вече знам къде да те намеря 💌",
  blocked: "браузърът каза не. ако размислиш: катинарчето до адреса → Известия",
  failed: "нещо се обърка. ще опитам пак друг път.",
};

// Public half of the VAPID pair. Safe to commit - it is public by design.
const VAPID_PUBLIC_KEY = "BMmbx_mCfGu5NB3VWEqMybPnbd1_olVtona888e_1Kb_kSny80cL6efjQvsRBcxN5Hjp2JS5JsDynvPVXisXgp4";

// only set when she says "not now" - a stored subscription is what records a yes
const NOTIFY_DISMISSED = "mailbox:notify-dismissed";
const APPEAR_DELAY = 2600; // let the letters land before asking anything

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function NotifyPrompt() {
  // hidden | asking | working | granted | blocked | failed
  const [state, setState] = useNotifyState("hidden");

  useNotifyEffect(() => {
    if (!pushSupported()) return;

    let cancelled = false;
    let timer = null;

    (async () => {
      /* If this device already has a subscription, quietly send it again and
         never ask. That re-send matters: if she once said yes but the server
         failed to store it (or the store was later wiped) the browser would
         still hold a subscription, so the prompt would hide itself forever
         and she would silently stop getting letters. Retrying on every visit
         heals that without ever bothering her. */
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const existing = reg ? await reg.pushManager.getSubscription() : null;
        if (existing) {
          fetch("/api/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(existing),
          }).catch(() => {});
          return;
        }
      } catch (e) {
        // no registration yet is the normal case, not an error
      }

      // Chrome has permanently blocked us - asking again would do nothing
      if (Notification.permission === "denied") return;

      try {
        if (localStorage.getItem(NOTIFY_DISMISSED) === "1") return;
      } catch (e) {
        // private mode can throw on localStorage; carry on and just ask
      }

      timer = setTimeout(() => {
        if (!cancelled) setState("asking");
      }, APPEAR_DELAY);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  async function enable() {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("blocked");
        return;
      }

      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error("subscribe endpoint said " + res.status);

      setState("granted");
      setTimeout(() => setState("hidden"), 4000);
    } catch (err) {
      console.warn("[mailbox] could not enable notifications:", err);
      setState("failed");
      setTimeout(() => setState("hidden"), 5000);
    }
  }

  function dismiss() {
    try { localStorage.setItem(NOTIFY_DISMISSED, "1"); } catch (e) {}
    setState("hidden");
  }

  if (state === "hidden") return null;

  const wrap = {
    position: "absolute",
    left: "50%",
    bottom: 34,
    transform: "translateX(-50%)",
    zIndex: 210,
    textAlign: "center",
    fontFamily: "Caveat, cursive",
    color: "#fff3e6",
    textShadow: "0 1px 10px rgba(20,10,6,0.7)",
    maxWidth: "min(420px, 86vw)",
    animation: "fadeIn 0.8s ease both",
    pointerEvents: state === "asking" ? "auto" : "none",
  };

  if (state !== "asking") {
    const message =
      state === "working" ? NOTIFY_COPY.working
      : state === "granted" ? NOTIFY_COPY.granted
      : state === "blocked" ? NOTIFY_COPY.blocked
      : NOTIFY_COPY.failed;
    return <div style={{ ...wrap, fontSize: 20, opacity: 0.85 }}>{message}</div>;
  }

  const button = {
    fontFamily: "Caveat, cursive",
    fontSize: 19,
    padding: "7px 18px",
    borderRadius: 999,
    cursor: "pointer",
    border: "1px solid rgba(255,243,230,0.3)",
    background: "rgba(20,10,6,0.55)",
    color: "#fff3e6",
    backdropFilter: "blur(8px)",
  };

  return (
    <div style={wrap}>
      <div style={{ fontSize: 16, opacity: 0.6 }}>{NOTIFY_COPY.asker}</div>
      <div style={{ fontSize: 22, opacity: 0.92, marginBottom: 9 }}>{NOTIFY_COPY.ask}</div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button style={{ ...button, background: "rgba(140,70,88,0.75)" }} onClick={enable}>
          {NOTIFY_COPY.yes}
        </button>
        <button style={button} onClick={dismiss}>{NOTIFY_COPY.no}</button>
      </div>
    </div>
  );
}

window.NotifyPrompt = NotifyPrompt;
