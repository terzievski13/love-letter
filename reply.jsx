/* Her side of the mailbox: the letters she writes back to you.

   - the tied bundle in the bottom-right corner of the mailbox (opens her pile)
   - her writing screen ("✎ напиши ми"), which asks for the secret word the
     first time only, then remembers it on that device
   - edit / delete over an open letter of hers - only on a device that knows
     the word

   Her letters are kept in Redis through /api/her-letters (not in
   letters.jsx). Designed in outbox-lab.html (layout B · bundle). app.jsx
   puts these pieces around the deck; the deck itself doesn't know.

   All her-facing wording is in HER_COPY at the top, in Bulgarian, in your
   voice - rewrite it freely. */

const { useState: useRS, useEffect: useRE } = React;

const HER_COPY = {
  hers: "от теб",
  hersShelf: "писма от теб",
  write: "✎ напиши ми",
  emptyBig: "още нищо от теб",
  emptySmall: "първото писмо ще стои тук",
  bundleEmpty: "още нищо",
  backToMine: "← обратно към моите",
  newTag: "ново",
  // composer
  composeTitle: "писмо до мен",
  editTitle: "промени писмото",
  titlePlaceholder: "заглавие",
  bodyPlaceholder: "пиши тук…",
  paper: "плик",
  wax: "восък",
  send: "изпрати",
  save: "запази",
  cancel: "отказ",
  sending: "изпращам…",
  saving: "запазвам…",
  // the secret word, asked once per device
  wordTitle: "само за нас двамата",
  wordHint: "кажи тайната дума и повече няма да питам",
  wordPlaceholder: "тайната дума",
  wordGo: "влез",
  checking: "проверявам…",
  wrongWord: "не е тази 🙂",
  offline: "няма връзка — опитай пак след малко",
  // after
  sent: "получих го 💌",
  saved: "запазено",
  deleted: "изтрито",
  edit: "✎ промени",
  del: "изтрий",
  delSure: "сигурна ли си? изтрий",
  deleting: "изтривам…",
};

const HER_PAPERS = ["#f4d6c0", "#e8d4b8", "#d8e4d0", "#d6e2ea", "#edd0d4", "#e3d6ea"];
const HER_WAXES = ["#a5443a", "#7a5a8a", "#5a7a52", "#46607a", "#8c4658", "#8a6a2a"];

const HER_WORD = "mailbox:her-word";   // the secret word, remembered on this device
const HER_DRAFT = "mailbox:her-draft"; // an unsent new letter survives closing the screen
const READ_IDS = "letters:read";       // the deck's own "already opened" list (deck.jsx)

function herRecall(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function herRemember(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) {}
}

/* ---------------- talking to the server ---------------- */

async function herApi(word, body) {
  try {
    const res = await fetch("/api/her-letters", {
      method: "POST",
      // headers can't carry Cyrillic, so the word travels URI-encoded
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + encodeURIComponent(word) },
      body: JSON.stringify(body),
    });
    let data;
    try { data = await res.json(); } catch (e) { data = { ok: false, error: HER_COPY.offline }; }
    return { status: res.status, ...data };
  } catch (e) {
    return { status: 0, ok: false, error: HER_COPY.offline };
  }
}

/** Her letters, newest first. An empty list if anything goes wrong. */
async function loadHers() {
  try {
    const res = await fetch("/api/her-letters", { cache: "no-store" });
    const data = await res.json();
    return data && data.ok && Array.isArray(data.letters) ? data.letters : [];
  } catch (e) {
    return [];
  }
}

/* ---------------- "ново" ----------------
   Her letters glow on your phone until you open them, the same way yours
   glow on hers. On a device that knows the word (hers) they never glow -
   she wrote them. */

function knowsWord() {
  return Boolean(herRecall(HER_WORD));
}

function markHersRead(ids) {
  try {
    const raw = localStorage.getItem(READ_IDS);
    if (raw === null) return; // the deck hasn't set this device up yet; it will
    const set = new Set(JSON.parse(raw));
    ids.forEach((id) => set.add(id));
    localStorage.setItem(READ_IDS, JSON.stringify([...set]));
  } catch (e) {}
}

function hasUnread(hers) {
  try {
    const raw = localStorage.getItem(READ_IDS);
    if (raw === null) return false;
    const set = new Set(JSON.parse(raw));
    return hers.some((l) => !set.has(l.id));
  } catch (e) {
    return false;
  }
}

/* ---------------- the bundle ---------------- */

function HerBundle({ hers, onClick }) {
  const top = hers.slice(0, 3).reverse();
  const unread = hers.length > 0 && hasUnread(hers);
  return (
    <button className={"bundle" + (hers.length ? "" : " bundle-empty")} onClick={onClick}>
      {(top.length ? top : [{ id: "e", envelopeColor: "#e8d4b8" }]).map((l, k, arr) => (
        <div
          key={l.id}
          className="bundle-env"
          style={{
            top: 6 + k * 3,
            background: l.envelopeColor,
            transform: `rotate(${(k - (arr.length - 1) / 2) * 5}deg)`,
          }}
        />
      ))}
      {hers.length > 0 && (
        <>
          <div className="bundle-ribbon-v" />
          <div className="bundle-ribbon-h" />
          <div className="bundle-bow">❦</div>
        </>
      )}
      <div className="bundle-label">
        {unread && <span className="new-tag" style={{ marginRight: 6, verticalAlign: "2px" }}>{HER_COPY.newTag}</span>}
        {HER_COPY.hers} · {hers.length || HER_COPY.bundleEmpty}
      </div>
    </button>
  );
}

function HerEmptyPile() {
  return (
    <div className="empty-shelf">
      <div className="big">{HER_COPY.emptyBig}</div>
      <div className="small">{HER_COPY.emptySmall}</div>
    </div>
  );
}

/* ---------------- edit / delete, over her open letter ---------------- */

function HerOwnActions({ letter, onEdit, onDelete }) {
  const [sure, setSure] = useRS(false);
  const [busy, setBusy] = useRS(false);

  async function del() {
    if (!sure) { setSure(true); return; }
    setBusy(true);
    await onDelete(letter);
    setBusy(false);
  }

  return (
    <div className="own-actions">
      <button onClick={() => onEdit(letter)} disabled={busy}>{HER_COPY.edit}</button>
      <button className={sure ? "danger" : ""} onClick={del} disabled={busy}>
        {busy ? HER_COPY.deleting : sure ? HER_COPY.delSure : HER_COPY.del}
      </button>
    </div>
  );
}

/* ---------------- her writing screen ---------------- */

function HerSwatches({ colors, value, onChange, label }) {
  return (
    <>
      <div className="row-label">{label}</div>
      <div className="swatches">
        {colors.map((c) => (
          <button key={c} type="button" aria-label={c} data-on={c === value ? "1" : "0"}
                  style={{ background: c }} onClick={() => onChange(c)} />
        ))}
      </div>
    </>
  );
}

/** onDone({ letter, letters, edited }) once the server has it. */
function HerComposer({ initial, onDone, onCancel }) {
  const isNew = !initial;
  const draft = isNew ? (() => { try { return JSON.parse(herRecall(HER_DRAFT) || "null"); } catch (e) { return null; } })() : null;
  const start = initial || draft || {};

  const [word, setWord] = useRS(() => herRecall(HER_WORD) || "");
  const [step, setStep] = useRS(() => (herRecall(HER_WORD) ? "write" : "word"));
  const [typed, setTyped] = useRS("");
  const [title, setTitle] = useRS(start.title || "");
  const [body, setBody] = useRS(start.body || "");
  const [paper, setPaper] = useRS(start.envelopeColor || HER_PAPERS[4]);
  const [wax, setWax] = useRS(start.wax || HER_WAXES[4]);
  const [busy, setBusy] = useRS(false);
  const [error, setError] = useRS("");

  // keep an unsent new letter safe if the screen is closed by accident
  useRE(() => {
    if (isNew) herRemember(HER_DRAFT, JSON.stringify({ title, body, envelopeColor: paper, wax }));
  }, [isNew, title, body, paper, wax]);

  async function tryWord() {
    if (!typed.trim() || busy) return;
    setBusy(true); setError("");
    const r = await herApi(typed, { action: "check" });
    setBusy(false);
    if (r.ok) {
      herRemember(HER_WORD, typed);
      setWord(typed);
      setStep("write");
    } else {
      setError(r.status === 401 ? HER_COPY.wrongWord : r.error);
    }
  }

  async function submit() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true); setError("");
    const letter = { title: title.trim(), body, envelopeColor: paper, wax };
    const r = await herApi(word, initial
      ? { action: "update", id: initial.id, letter }
      : { action: "create", letter });
    setBusy(false);
    if (!r.ok) {
      if (r.status === 401) {
        // the word was changed since this device learned it - ask again
        herRemember(HER_WORD, null);
        setStep("word");
        setError(HER_COPY.wrongWord);
        return;
      }
      setError(r.error || HER_COPY.offline);
      return;
    }
    if (isNew) herRemember(HER_DRAFT, null);
    onDone({ letter: r.letter, letters: r.letters, edited: !isNew });
  }

  const preview = {
    id: 99997,
    title: title.trim() || "…",
    date: initial ? initial.date : "",
    envelopeColor: paper,
    wax,
  };
  const ready = title.trim() && body.trim() && !busy;

  return (
    // stopPropagation keeps the deck's arrow keys (and the open letter's
    // Escape) away from her typing; deliberately not click-to-close
    <div className="composer-wrap" onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onCancel(); }}>
      {step === "word" ? (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); tryWord(); }}>
          <h2>{HER_COPY.wordTitle}</h2>
          <div className="hint">{HER_COPY.wordHint}</div>
          <input
            type="password" autoFocus placeholder={HER_COPY.wordPlaceholder}
            value={typed} onChange={(e) => setTyped(e.target.value)}
            autoComplete="off" style={{ marginTop: 14 }}
          />
          {error && <div className="err">{error}</div>}
          <div className="actions">
            <button type="button" onClick={onCancel}>{HER_COPY.cancel}</button>
            <button type="submit" className="primary" disabled={!typed.trim() || busy}>
              {busy ? HER_COPY.checking : HER_COPY.wordGo}
            </button>
          </div>
        </form>
      ) : (
        <div className="composer">
          <h2>{initial ? HER_COPY.editTitle : HER_COPY.composeTitle}</h2>
          <input type="text" placeholder={HER_COPY.titlePlaceholder} value={title} maxLength={120}
                 onChange={(e) => setTitle(e.target.value)} />
          <textarea placeholder={HER_COPY.bodyPlaceholder} value={body} onChange={(e) => setBody(e.target.value)} />

          <HerSwatches label={HER_COPY.paper} colors={HER_PAPERS} value={paper} onChange={setPaper} />
          <HerSwatches label={HER_COPY.wax} colors={HER_WAXES} value={wax} onChange={setWax} />

          <div className="preview">
            <window.EnvelopeSVG letter={preview} isOpen={false} small />
          </div>

          {error && <div className="err">{error}</div>}
          <div className="actions">
            <button onClick={onCancel} disabled={busy}>{HER_COPY.cancel}</button>
            <button className="primary" disabled={!ready} onClick={submit}>
              {busy ? (initial ? HER_COPY.saving : HER_COPY.sending) : initial ? HER_COPY.save : HER_COPY.send}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

window.HerLetters = {
  COPY: HER_COPY,
  load: loadHers,
  api: herApi,
  word: () => herRecall(HER_WORD),
  forgetWord: () => herRemember(HER_WORD, null),
  knowsWord,
  markRead: markHersRead,
  Bundle: HerBundle,
  EmptyPile: HerEmptyPile,
  OwnActions: HerOwnActions,
  Composer: HerComposer,
};
