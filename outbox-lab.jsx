/* ------------------------------------------------------------------ *
 * outbox-lab.jsx — DESIGN SANDBOX, not part of the real site.
 *
 * Three candidate layouts for keeping her letters to you next to your
 * letters to her, inside the mailbox. All three use the real deck
 * (window.LetterDeck from deck.jsx), so swiping, opening and reading
 * behave exactly as they do on the site. Nothing here is loaded by
 * index.html, and nothing is saved anywhere but this browser.
 *
 * Every control is mirrored into the URL hash, e.g.
 *   outbox-lab.html#view=bundle&n=5&frame=phone&bar=0
 * ------------------------------------------------------------------ */

const { useState, useEffect, useRef } = React;

/* All her-facing wording, in Bulgarian, in your voice — like NOTIFY_COPY. */
const COPY = {
  mine: "от мен",
  hers: "от теб",
  mineShelf: "писма от мен",
  hersShelf: "писма от теб",
  write: "✎ напиши ми",
  emptyBig: "още нищо от теб",
  emptySmall: "първото писмо ще стои тук",
  bundleEmpty: "още нищо",
  backToMine: "← обратно към моите",
  backOutside: "← back outside",
  pick: "pick a letter",
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
  // the secret word, asked once per device
  wordTitle: "само за нас двамата",
  wordHint: "кажи тайната дума и повече няма да питам",
  wordPlaceholder: "тайната дума",
  wordGo: "влез",
  // after
  sent: "получих го 💌",
  saved: "запазено",
  deleted: "изтрито",
  edit: "✎ промени",
  del: "изтрий",
  delSure: "сигурна ли си? изтрий",
};

const PAPERS = ["#f4d6c0", "#e8d4b8", "#d8e4d0", "#d6e2ea", "#edd0d4", "#e3d6ea"];
const WAXES  = ["#a5443a", "#7a5a8a", "#5a7a52", "#46607a", "#8c4658", "#8a6a2a"];

/* ---------------- letters ---------------- */

// yours: the real ones, newest first, exactly as the deck gets them on the site
const MINE = window.LETTERS_DATA.letters
  .filter((l) => !l.unlockAt || Date.now() >= new Date(l.unlockAt).getTime())
  .reverse();

// her ids live in their own range so they can never clash with yours
const HER_ID_BASE = 100000;

const SAMPLE_TITLES = [
  "Отговор", "Добро утро", "Липсваш ми", "Една малка тайна", "За вчера",
  "Без повод", "Прочети го вечерта", "Благодаря ти", "Нашето място", "Сънувах те",
];
const SAMPLE_BODY =
  "(Примерно писмо — тук ще стои това, което тя напише.)\n\n" +
  "Може да е дълго или съвсем кратко.\nВсеки ред се появява един по един, точно като в твоите писма.\n\n" +
  "…\n\nКрай.";

const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Sample letters from her, newest first. */
function makeHers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.now() - i * 9 * 86400000);
    out.push({
      id: HER_ID_BASE + n - i,
      fromHer: true,
      date: fmtDate(d),
      title: SAMPLE_TITLES[i % SAMPLE_TITLES.length],
      envelopeColor: PAPERS[(i * 2 + 1) % PAPERS.length],
      wax: WAXES[(i * 3 + 4) % WAXES.length],
      body: SAMPLE_BODY,
    });
  }
  return out;
}

/* The deck makes letters she hasn't opened glow ("ново"). Her own letters
   shouldn't glow on her own phone, so they're marked read as they appear.
   (On the real site, the same letters SHOULD glow on your phone — that's
   for the real build to sort out, not the lab.) */
function markRead(ids) {
  try {
    const set = new Set(JSON.parse(localStorage.getItem("letters:read") || "[]"));
    ids.forEach((id) => set.add(id));
    localStorage.setItem("letters:read", JSON.stringify([...set]));
  } catch (e) {}
}

/* ---------------- url state ---------------- */

// embed=1 is the copy of the lab running inside the phone frame
const DEFAULTS = { view: "switch", n: "5", frame: "full", bar: "1", embed: "0", bs: "1" };
function readParams() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ""));
  const p = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (q.has(k)) p[k] = q.get(k);
  return p;
}
function writeParams(p) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== DEFAULTS[k]) q.set(k, v);
  history.replaceState(null, "", "#" + q.toString());
}

/* ---------------- shared pieces ---------------- */

/** Runs `fn` when `focus` changes after mount — so switching layout after
 *  sending a letter doesn't jump straight to her pile again. */
function useOnFocus(focus, fn) {
  const first = useRef(focus);
  useEffect(() => { if (focus !== first.current) fn(); }, [focus]);
}

/** One pile of letters: the real deck, plus the reader it opens. */
function Pile({ letters, openId, setOpenId, deckKey }) {
  const open = letters.find((l) => l.id === openId) || null;
  if (!letters.length) {
    return (
      <div className="empty-shelf">
        <div className="big">{COPY.emptyBig}</div>
        <div className="small">{COPY.emptySmall}</div>
      </div>
    );
  }
  return (
    <window.LetterDeck
      key={deckKey}
      letters={letters}
      openLetter={open}
      onOpen={setOpenId}
      onClose={() => setOpenId(null)}
    />
  );
}

/** Edit / delete, floating over the reader while one of her letters is open. */
function OwnActions({ letter, onEdit, onDelete }) {
  const [sure, setSure] = useState(false);
  return (
    <div className="own-actions">
      <button onClick={() => onEdit(letter)}>{COPY.edit}</button>
      <button className={sure ? "danger" : ""} onClick={() => (sure ? onDelete(letter.id) : setSure(true))}>
        {sure ? COPY.delSure : COPY.del}
      </button>
    </div>
  );
}

/** Her writing screen. Asks for the secret word the first time only. */
function Composer({ initial, wordKnown, onWordOk, onSave, onCancel }) {
  const [word, setWord] = useState("");
  const [title, setTitle] = useState(initial ? initial.title : "");
  const [body, setBody] = useState(initial ? initial.body : "");
  const [paper, setPaper] = useState(initial ? initial.envelopeColor : PAPERS[4]);
  const [wax, setWax] = useState(initial ? initial.wax : WAXES[4]);

  const preview = {
    id: 99999,
    title: title.trim() || "…",
    date: initial ? initial.date : fmtDate(new Date()),
    envelopeColor: paper,
    wax,
  };
  const ready = title.trim() && body.trim();

  return (
    // stopPropagation keeps the deck's arrow-key handler from hijacking the
    // cursor keys while she types
    <div className="composer-wrap" onKeyDown={(e) => e.stopPropagation()}>
      {!wordKnown ? (
        <div className="composer">
          <h2>{COPY.wordTitle}</h2>
          <div className="hint">{COPY.wordHint}</div>
          <input
            type="password" autoFocus placeholder={COPY.wordPlaceholder}
            value={word} onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && word.trim()) onWordOk(); }}
            style={{ marginTop: 14 }}
          />
          <div className="hint" style={{ fontSize: 14, opacity: 0.7 }}>(в лабораторията всяка дума върши работа)</div>
          <div className="actions">
            <button onClick={onCancel}>{COPY.cancel}</button>
            <button className="primary" disabled={!word.trim()} onClick={onWordOk}>{COPY.wordGo}</button>
          </div>
        </div>
      ) : (
        <div className="composer">
          <h2>{initial ? COPY.editTitle : COPY.composeTitle}</h2>
          <input type="text" placeholder={COPY.titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea placeholder={COPY.bodyPlaceholder} value={body} onChange={(e) => setBody(e.target.value)} />

          <div className="row-label">{COPY.paper}</div>
          <div className="swatches">
            {PAPERS.map((c) => (
              <button key={c} data-on={c === paper ? "1" : "0"} style={{ background: c }} onClick={() => setPaper(c)} />
            ))}
          </div>
          <div className="row-label">{COPY.wax}</div>
          <div className="swatches">
            {WAXES.map((c) => (
              <button key={c} data-on={c === wax ? "1" : "0"} style={{ background: c }} onClick={() => setWax(c)} />
            ))}
          </div>

          <div className="preview">
            <window.EnvelopeSVG letter={preview} isOpen={false} small />
          </div>

          <div className="actions">
            <button onClick={onCancel}>{COPY.cancel}</button>
            <button
              className="primary" disabled={!ready}
              onClick={() => onSave({ title: title.trim(), body, envelopeColor: paper, wax })}
            >
              {initial ? COPY.save : COPY.send}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- A · the switch ---------------- */

function SwitchView({ hers, hersKey, focus, onWrite, actions }) {
  const [side, setSide] = useState("mine");
  const [openId, setOpenId] = useState(null);
  useOnFocus(focus, () => { setOpenId(null); setSide("hers"); });

  const list = side === "mine" ? MINE : hers;
  const open = list.find((l) => l.id === openId);

  return (
    <>
      <Pile letters={list} openId={openId} setOpenId={setOpenId} deckKey={side === "mine" ? "mine" : hersKey} />
      {!open && (
        <>
          <button className="back-btn">{COPY.backOutside}</button>
          <div className="switch">
            <button data-on={side === "mine" ? "1" : "0"} onClick={() => setSide("mine")}>{COPY.mine}</button>
            <button data-on={side === "hers" ? "1" : "0"} onClick={() => setSide("hers")}>
              {COPY.hers}{hers.length > 0 && <span className="count">{hers.length}</span>}
            </button>
          </div>
          <button className="pill-btn" style={{ top: 24, right: 24 }} onClick={onWrite}>{COPY.write}</button>
        </>
      )}
      {open && open.fromHer && <OwnActions letter={open} {...actions} />}
    </>
  );
}

/* ---------------- B · the tied bundle ---------------- */

function Bundle({ hers, onClick, scale }) {
  const top = hers.slice(0, 3).reverse();
  return (
    <button className={"bundle" + (hers.length ? "" : " bundle-empty")} style={{ "--bs": scale }} onClick={onClick}>
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
        {COPY.hers} · {hers.length || COPY.bundleEmpty}
      </div>
    </button>
  );
}

function BundleView({ hers, hersKey, focus, onWrite, actions, bundleScale }) {
  const [showHers, setShowHers] = useState(false);
  const [openId, setOpenId] = useState(null);
  useOnFocus(focus, () => { setOpenId(null); setShowHers(true); });

  const list = showHers ? hers : MINE;
  const open = list.find((l) => l.id === openId);

  return (
    <>
      <Pile letters={list} openId={openId} setOpenId={setOpenId} deckKey={showHers ? hersKey : "mine"} />
      {!open && (
        <>
          {showHers ? (
            <>
              <button className="back-btn" onClick={() => setShowHers(false)}>{COPY.backToMine}</button>
              <div className="inside-hint">{COPY.hersShelf}</div>
            </>
          ) : (
            <>
              <button className="back-btn">{COPY.backOutside}</button>
              <div className="inside-hint">{COPY.pick}</div>
              <Bundle hers={hers} scale={bundleScale} onClick={() => setShowHers(true)} />
            </>
          )}
          <button className="pill-btn" style={{ top: 24, right: 24 }} onClick={onWrite}>{COPY.write}</button>
        </>
      )}
      {open && open.fromHer && <OwnActions letter={open} {...actions} />}
    </>
  );
}

/* ---------------- C · two shelves ----------------
   Sideways swiping already belongs to the deck, so the shelves change
   with the arrows in the heading rather than with a swipe. */

function ShelvesView({ hers, hersKey, focus, onWrite, actions }) {
  const [shelf, setShelf] = useState(0);
  const [openMine, setOpenMine] = useState(null);
  const [openHers, setOpenHers] = useState(null);
  useOnFocus(focus, () => { setOpenHers(null); setShelf(1); });

  const open = shelf === 0 ? MINE.find((l) => l.id === openMine) : hers.find((l) => l.id === openHers);

  return (
    <>
      <div className="shelves">
        <div className="shelf-track" style={{ transform: `translateX(${-shelf * 50}%)` }}>
          <div className="shelf" inert={shelf !== 0 ? "" : undefined}>
            <Pile letters={MINE} openId={openMine} setOpenId={setOpenMine} deckKey="mine" />
          </div>
          <div className="shelf" inert={shelf !== 1 ? "" : undefined}>
            <Pile letters={hers} openId={openHers} setOpenId={setOpenHers} deckKey={hersKey} />
          </div>
        </div>
      </div>
      {!open && (
        <>
          <button className="back-btn">{COPY.backOutside}</button>
          <div className="shelf-head" style={{ top: window.matchMedia("(max-width: 720px)").matches ? 70 : 22 }}>
            <button disabled={shelf === 0} onClick={() => setShelf(0)}>‹</button>
            <div className="name">{shelf === 0 ? COPY.mineShelf : COPY.hersShelf}</div>
            <button disabled={shelf === 1} onClick={() => setShelf(1)}>›</button>
          </div>
          <div className="shelf-dots" style={{ top: window.matchMedia("(max-width: 720px)").matches ? 110 : 62 }}>
            <span data-on={shelf === 0 ? "1" : "0"} />
            <span data-on={shelf === 1 ? "1" : "0"} />
          </div>
          <button className="pill-btn" style={{ top: 24, right: 24 }} onClick={onWrite}>{COPY.write}</button>
        </>
      )}
      {open && open.fromHer && <OwnActions letter={open} {...actions} />}
    </>
  );
}

/* ---------------- the lab ---------------- */

function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={v} data-on={v === value ? "1" : "0"} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

const WORD_KEY = "outbox-lab:word";

function Lab() {
  const [p, setP] = useState(readParams);
  const set = (k, v) => setP((prev) => { const next = { ...prev, [k]: v }; writeParams(next); return next; });

  useEffect(() => {
    const onHash = () => setP(readParams());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const [hers, setHers] = useState(() => { const h = makeHers(Number(p.n)); markRead(h.map((l) => l.id)); return h; });
  const [version, setVersion] = useState(0);   // remounts her deck after a change
  const [focus, setFocus] = useState(0);       // bumps to show her pile after sending
  const [composer, setComposer] = useState(null); // null | { initial }
  const [wordKnown, setWordKnown] = useState(() => { try { return localStorage.getItem(WORD_KEY) === "1"; } catch (e) { return false; } });
  const [toast, setToast] = useState(null);
  const [frameKey, setFrameKey] = useState(0);   // remounts the phone frame on reset

  function replaceHers(next) {
    markRead(next.map((l) => l.id));
    setHers(next);
    setVersion((v) => v + 1);
  }

  useEffect(() => { replaceHers(makeHers(Number(p.n))); }, [p.n]);

  function say(text) {
    setToast(text);
    setTimeout(() => setToast(null), 2200);
  }

  function save(fields) {
    const editing = composer && composer.initial;
    if (editing) {
      replaceHers(hers.map((l) => (l.id === editing.id ? { ...l, ...fields } : l)));
      say(COPY.saved);
    } else {
      const id = Math.max(HER_ID_BASE, ...hers.map((l) => l.id)) + 1;
      replaceHers([{ id, fromHer: true, date: fmtDate(new Date()), ...fields }, ...hers]);
      setFocus((f) => f + 1);
      say(COPY.sent);
    }
    setComposer(null);
  }

  const actions = {
    onEdit: (letter) => setComposer({ initial: letter }),
    onDelete: (id) => { replaceHers(hers.filter((l) => l.id !== id)); say(COPY.deleted); },
  };

  const viewProps = {
    hers,
    hersKey: "hers-" + version,
    focus,
    onWrite: () => setComposer({ initial: null }),
    actions,
    bundleScale: Number(p.bs) || 1,
  };

  const View = p.view === "bundle" ? BundleView : p.view === "shelves" ? ShelvesView : SwitchView;

  return (
    <div className="lab">
      {p.bar === "1" && (
        <div className="lab-bar">
          <div className="grp"><label>layout</label>
            <Seg value={p.view} onChange={(v) => set("view", v)}
                 options={[["switch", "A · switch"], ["bundle", "B · bundle"], ["shelves", "C · shelves"]]} />
          </div>
          <div className="grp"><label>her letters</label>
            <Seg value={p.n} onChange={(v) => set("n", v)} options={[["0", "0"], ["1", "1"], ["5", "5"], ["20", "20"]]} />
          </div>
          {p.view === "bundle" && (
            <div className="grp"><label>bundle size</label>
              <div className="size-ctl">
                <input type="range" min="0.5" max="1.8" step="0.05" value={p.bs} onChange={(e) => set("bs", e.target.value)} />
                <output>{Math.round(Number(p.bs) * 100)}%</output>
                {p.bs !== "1" && <button className="ghost-btn" onClick={() => set("bs", "1")}>100%</button>}
              </div>
            </div>
          )}
          <div className="grp"><label>frame</label>
            <Seg value={p.frame} onChange={(v) => set("frame", v)} options={[["full", "fill"], ["phone", "phone"]]} />
          </div>
          <button className="ghost-btn" onClick={() => {
            try { localStorage.removeItem(WORD_KEY); } catch (e) {}
            setWordKnown(false);
            replaceHers(makeHers(Number(p.n)));
            setFrameKey((k) => k + 1);
          }}>reset</button>
          <button className="ghost-btn" onClick={() => set("bar", "0")}>hide this bar</button>
          <span className="lab-note">sandbox — nothing is sent or saved anywhere</span>
        </div>
      )}
      {p.bar !== "1" && p.embed !== "1" && <button className="bar-peek" onClick={() => set("bar", "1")}>☰</button>}

      <div className="lab-stage">
        {p.frame === "phone" ? (
          /* A real 390px-wide window, so the layout sizes itself exactly as it
             would on a phone, rather than a desktop-sized page in a small box. */
          <div className="stage is-phone">
            <iframe
              key={frameKey}
              title="phone"
              src={`outbox-lab.html#view=${p.view}&n=${p.n}&bs=${p.bs}&bar=0&embed=1`}
            />
          </div>
        ) : (
          <div className="stage is-full">
            <div className="stage-vignette" />
            <View key={p.view} {...viewProps} />
          </div>
        )}
      </div>

      {composer && (
        <Composer
          initial={composer.initial}
          wordKnown={wordKnown}
          onWordOk={() => { try { localStorage.setItem(WORD_KEY, "1"); } catch (e) {} setWordKnown(true); }}
          onSave={save}
          onCancel={() => setComposer(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("lab")).render(<Lab />);
