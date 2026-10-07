/* The secret writing tool. Opens when the mailbox is held for ~2 seconds on
   the outside view (three-scene.js → app.jsx), asks for the password once
   per device, and publishes letters through /api/write-letter, which
   commits letters.jsx to GitHub. She never sees any of this.

   Times are entered in Sofia time and converted here, so nobody has to do
   UTC maths. Letters written by hand before this existed are not listed and
   can't be changed from here. */

const { useState: useWS, useEffect: useWE } = React;

const WRITER_KEY = "mailbox:writer-key";     // the password, remembered on this device
const WRITER_DRAFT = "mailbox:writer-draft"; // an unsent new letter survives closing the tool

const WRITER_PAPERS = ["#f4d6c0", "#e8d4b8", "#efe3c8", "#d8e4d0", "#d6e2ea", "#edd0d4", "#e3d6ea"];
const WRITER_WAXES = ["#a5443a", "#8c4658", "#7a5a8a", "#46607a", "#5a7a52", "#8a6a2a"];

/* ---------------- Sofia time ---------------- */

function sofiaParts(ms) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const p = {};
  parts.forEach((x) => { p[x.type] = x.value; });
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** How far Sofia is ahead of UTC at that instant (2h in winter, 3h in summer). */
function sofiaOffset(ms) {
  const { date, time } = sofiaParts(ms);
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  return Date.UTC(y, m - 1, d, h, mi) - Math.floor(ms / 60000) * 60000;
}

/** "2026-10-10" + "09:00" read as Sofia time → the real instant. */
function sofiaToInstant(date, time) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const asIfUtc = Date.UTC(y, m - 1, d, h, mi);
  // second pass gets the summer/winter switch right on the change-over days
  return asIfUtc - sofiaOffset(asIfUtc - sofiaOffset(asIfUtc));
}

function sofiaLabel(ms) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia", weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(ms)) + " (Sofia)";
}

const isScheduled = (l) => l.unlockAt && Date.parse(l.unlockAt) > Date.now();

/* ---------------- talking to the server ---------------- */

async function writerApi(key, body) {
  try {
    const res = await fetch("/api/write-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch (e) { data = { ok: false, error: `the server said ${res.status}` }; }
    return { status: res.status, ...data };
  } catch (e) {
    return { status: 0, ok: false, error: "couldn't reach the server — are you online?" };
  }
}

/** Is there an unsent new letter with something actually written in it? */
function hasDraft() {
  try {
    const d = JSON.parse(recall(WRITER_DRAFT) || "null");
    return Boolean(d && (d.title.trim() || d.body.trim()));
  } catch (e) { return false; }
}

function remember(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) {}
}
function recall(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

/* ---------------- the form ---------------- */

function Swatches({ colors, value, onChange, label }) {
  return (
    <div className="writer-row">
      <div className="writer-label">{label}</div>
      <div className="writer-swatches">
        {colors.map((c) => (
          <button key={c} type="button" aria-label={c} data-on={c === value ? "1" : "0"}
                  style={{ background: c }} onClick={() => onChange(c)} />
        ))}
        {/* any colour at all, for when none of these is right */}
        <label className="writer-custom" title="any colour" data-on={colors.includes(value) ? "0" : "1"}
               style={{ background: colors.includes(value) ? undefined : value }}>
          +
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

function tomorrowAtNine() {
  const { date } = sofiaParts(Date.now() + 86400000);
  return { date, time: "09:00" };
}

function LetterForm({ initial, onPublish, onBack, busy, error }) {
  const isNew = !initial;
  const draft = isNew ? (() => { try { return JSON.parse(recall(WRITER_DRAFT) || "null"); } catch (e) { return null; } })() : null;
  const start = initial || draft || {};
  const live = initial && !isScheduled(initial);

  const [title, setTitle] = useWS(start.title || "");
  const [body, setBody] = useWS(start.body || "");
  const [paper, setPaper] = useWS(start.envelopeColor || WRITER_PAPERS[1]);
  const [wax, setWax] = useWS(start.wax || WRITER_WAXES[2]);
  const startAt = start.unlockAt && Date.parse(start.unlockAt) > Date.now() ? sofiaParts(Date.parse(start.unlockAt)) : null;
  const [when, setWhen] = useWS(startAt ? "later" : "now");
  const [day, setDay] = useWS(startAt ? startAt.date : tomorrowAtNine().date);
  const [time, setTime] = useWS(startAt ? startAt.time : tomorrowAtNine().time);
  const [sure, setSure] = useWS(false);

  // keep an unsent new letter safe if the tool is closed by accident
  useWE(() => {
    if (isNew) remember(WRITER_DRAFT, JSON.stringify({ title, body, envelopeColor: paper, wax }));
  }, [isNew, title, body, paper, wax]);

  useWE(() => { setSure(false); }, [title, body, paper, wax, when, day, time]);

  const at = when === "later" && day && time ? sofiaToInstant(day, time) : null;
  const atInPast = at !== null && at <= Date.now();
  const ready = title.trim() && body.trim() && !atInPast && !busy;

  // sending straight away notifies her within minutes, so it takes two taps
  const needsConfirm = !live && when === "now";
  const buttonText = busy ? "saving…"
    : live ? "save changes"
    : when === "later" ? (isNew ? "schedule it" : "save")
    : sure ? "tap again to send it now" : "send it now";

  function submit() {
    if (!ready) return;
    if (needsConfirm && !sure) { setSure(true); return; }
    onPublish({
      title, body, envelopeColor: paper, wax,
      unlockAt: at !== null ? new Date(at).toISOString() : null,
    });
  }

  const preview = { id: 99998, title: title.trim() || "…", date: "", envelopeColor: paper, wax };

  return (
    <div className="writer-card">
      <div className="writer-head">
        <button className="writer-link" onClick={onBack}>← my letters</button>
      </div>
      <h2 className="writer-title">{isNew ? "A new letter" : "Edit letter"}</h2>

      <input className="writer-input writer-hand" placeholder="title" value={title}
             onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      <textarea className="writer-input writer-hand writer-body" placeholder="write to her…"
                value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="writer-hint">An empty line between paragraphs — the text appears line by line.</div>

      <Swatches label="envelope" colors={WRITER_PAPERS} value={paper} onChange={setPaper} />
      <Swatches label="wax seal" colors={WRITER_WAXES} value={wax} onChange={setWax} />

      <div className="writer-preview">
        <window.EnvelopeSVG letter={preview} isOpen={false} small />
      </div>

      <div className="writer-row">
        <div className="writer-label">arrives</div>
        {live ? (
          <div className="writer-hint">Already in her mailbox — your changes show up in about 2 minutes.</div>
        ) : (
          <>
            <div className="writer-seg">
              <button type="button" data-on={when === "now" ? "1" : "0"} onClick={() => setWhen("now")}>now</button>
              <button type="button" data-on={when === "later" ? "1" : "0"} onClick={() => setWhen("later")}>later</button>
            </div>
            {when === "later" && (
              <div className="writer-when">
                <input type="date" className="writer-input" value={day} onChange={(e) => setDay(e.target.value)} />
                <input type="time" className="writer-input" value={time} onChange={(e) => setTime(e.target.value)} />
                <span className="writer-hint">Sofia time</span>
              </div>
            )}
            {atInPast && <div className="writer-error">That time has already passed.</div>}
          </>
        )}
      </div>

      {error && <div className="writer-error">{error}</div>}

      <div className="writer-actions">
        <button className={"writer-primary" + (sure ? " is-sure" : "")} disabled={!ready} onClick={submit}>
          {buttonText}
        </button>
      </div>
    </div>
  );
}

/* ---------------- the tool ---------------- */

function Writer({ onClose }) {
  const [key, setKey] = useWS(() => recall(WRITER_KEY) || "");
  const [view, setView] = useWS(key ? "loading" : "login"); // login | loading | list | form | done
  const [typed, setTyped] = useWS("");
  const [letters, setLetters] = useWS([]);
  const [editing, setEditing] = useWS(null);
  const [busy, setBusy] = useWS(false);
  const [error, setError] = useWS("");
  const [done, setDone] = useWS(null);

  async function open(withKey) {
    setBusy(true); setError("");
    const r = await writerApi(withKey, { action: "list" });
    setBusy(false);
    if (r.ok) {
      remember(WRITER_KEY, withKey);
      setKey(withKey);
      setLetters(r.letters);
      setView("list");
    } else {
      if (r.status === 401) remember(WRITER_KEY, null);
      setError(r.status === 401 ? "That's not it." : r.error);
      setView("login");
    }
  }

  useWE(() => { if (key) open(key); }, []);

  useWE(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function publish(fields) {
    setBusy(true); setError("");
    const body = editing
      ? { action: "update", id: editing.id, letter: fields }
      : { action: "create", letter: fields };
    const r = await writerApi(key, body);
    setBusy(false);
    if (!r.ok) {
      if (r.status === 401) { remember(WRITER_KEY, null); setView("login"); }
      setError(r.error || "something went wrong");
      return;
    }
    if (!editing) remember(WRITER_DRAFT, null);
    setLetters(r.letters);
    setDone({ letter: r.letter, edited: Boolean(editing) });
    setView("done");
  }

  function startWriting(letter) {
    setEditing(letter);
    setError("");
    setView("form");
  }

  let content;
  if (view === "login" || view === "loading") {
    content = (
      <div className="writer-card writer-narrow">
        <h2 className="writer-title">Just for you</h2>
        {view === "loading" ? (
          <div className="writer-hint">opening…</div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); if (typed) open(typed); }}>
            <input className="writer-input" type="password" placeholder="password" autoFocus
                   value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="current-password" />
            {error && <div className="writer-error">{error}</div>}
            <div className="writer-actions">
              <button className="writer-primary" disabled={!typed || busy}>{busy ? "checking…" : "open"}</button>
            </div>
          </form>
        )}
      </div>
    );
  } else if (view === "list") {
    content = (
      <div className="writer-card">
        <h2 className="writer-title">Your letters</h2>
        <button className="writer-primary writer-wide" onClick={() => startWriting(null)}>
          {hasDraft() ? "✎ continue your new letter" : "✎ write a new letter"}
        </button>
        <div className="writer-list">
          {letters.length === 0 && <div className="writer-hint">Letters you write here will show up in this list.</div>}
          {[...letters].reverse().map((l) => (
            <button key={l.id} className="writer-item" onClick={() => startWriting(l)}>
              <span className="writer-dot" style={{ background: l.envelopeColor, borderColor: l.wax }} />
              <span className="writer-item-text">
                <span className="writer-hand writer-item-title">{l.title}</span>
                <span className="writer-item-when">
                  {isScheduled(l) ? "arrives " + sofiaLabel(Date.parse(l.unlockAt)) : "in her mailbox · " + l.date}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="writer-hint writer-foot">
          The first five letters were written by hand, so they're only in letters.jsx.
        </div>
      </div>
    );
  } else if (view === "form") {
    content = (
      <LetterForm key={editing ? editing.id : "new"} initial={editing} busy={busy} error={error}
                  onPublish={publish} onBack={() => { setError(""); setView("list"); }} />
    );
  } else if (view === "done") {
    const later = isScheduled(done.letter);
    content = (
      <div className="writer-card writer-narrow">
        <h2 className="writer-title">{done.edited ? "Saved" : later ? "Scheduled 💌" : "On its way 💌"}</h2>
        <p className="writer-text">
          {later
            ? `“${done.letter.title}” will appear in her mailbox ${sofiaLabel(Date.parse(done.letter.unlockAt))}, and her phone will be told then.`
            : done.edited
              ? "Your changes will be on the site in about 2 minutes."
              : `“${done.letter.title}” will be in her mailbox in about 2 minutes, and her phone will be told on its own.`}
        </p>
        <div className="writer-actions">
          <button className="writer-link" onClick={() => setView("list")}>my letters</button>
          <button className="writer-primary" onClick={onClose}>close</button>
        </div>
      </div>
    );
  }

  return (
    // stopPropagation keeps typing (arrow keys etc.) away from anything else listening
    <div className="writer" onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation(); }}>
      {/* deliberately not click-to-close: a stray tap would lose an edit */}
      <div className="writer-scrim" />
      <div className="writer-scroll">
        {content}
      </div>
      <button className="writer-close" aria-label="close" onClick={onClose}>×</button>
    </div>
  );
}

window.Writer = Writer;
