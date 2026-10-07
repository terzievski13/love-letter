/* ------------------------------------------------------------------ *
 * picker-lab.jsx — DESIGN SANDBOX, not part of the real site.
 *
 * Four candidate replacements for the fanned envelope spread, all
 * running on the real letter data and handing off to the real letter
 * unfold (window.Letter). Nothing here is loaded by index.html.
 *
 * Every control is mirrored into the URL hash, so any state can be
 * linked to or screenshotted directly, e.g.
 *   picker-lab.html#view=drawer&n=50&order=new&glow=1&frame=phone
 * ------------------------------------------------------------------ */

const { useState, useEffect, useMemo, useRef, useCallback } = React;
const shade = window.shade;

const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SETTLE_Y = 109;             // matches envelope.jsx's read-phase math
const SETTLE_SCALE = 240 / 360;
const INK = "#3a2820";

/* ---------------- letters: the real ones, plus believable filler ---------------- */

const REAL_LETTERS = window.LETTERS_DATA.letters.filter(
  (l) => !l.unlockAt || Date.now() >= new Date(l.unlockAt).getTime()
);

const FAKE_TITLES = [
  "Добро утро", "Мисля за теб", "Едно малко нещо", "Спомен от вчера",
  "Днес те сънувах", "Три причини", "Когато си уморена", "Нашата песен",
  "Писмо без повод", "За смеха ти", "Малка тайна", "Пътуване",
  "Първият сняг", "Кафе за двама", "Нещо, което забравих да кажа",
  "Понеделник", "Между другото", "Обещание", "Едно лято", "Благодаря ти",
];
const FAKE_PAPERS = ["#f4d6c0","#e8d4b8","#d8e4d0","#d6e2ea","#edd0d4","#efe3c8","#e3d6ea","#dedad0","#f0dcc8"];
const FAKE_WAXES  = ["#a5443a","#7a5a8a","#5a7a52","#46607a","#8c4658","#8a6a2a","#6a4a7a","#4a6a6a","#9a5a3a"];

/** Filler letters for stress-testing. Oldest first, like the real file. */
function makeFake(n) {
  const bodies = REAL_LETTERS.map((l) => l.body.split("\n\n").slice(0, 5).join("\n\n"));
  const end = new Date(2026, 8, 15);
  const spanDays = 760;
  const out = [];
  for (let i = 0; i < n; i++) {
    const age = Math.round((spanDays * (n - 1 - i)) / Math.max(1, n - 1));
    const d = new Date(end.getTime() - age * 86400000);
    out.push({
      id: 1000 + i,
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      title: FAKE_TITLES[i % FAKE_TITLES.length] + (i >= FAKE_TITLES.length ? " " + (Math.floor(i / FAKE_TITLES.length) + 1) : ""),
      envelopeColor: FAKE_PAPERS[i % FAKE_PAPERS.length],
      wax: FAKE_WAXES[(i * 5) % FAKE_WAXES.length],
      body: bodies[i % bodies.length],
    });
  }
  return out;
}

/** The `date` field is free text; today every letter uses "Mon D, YYYY",
 *  which Date can parse. Falls back to null so nothing ever crashes. */
function parseDate(letter) {
  const t = Date.parse(letter.date);
  return Number.isNaN(t) ? null : new Date(t);
}

/* ---------------- what she has already read ---------------- */

const READ_KEY = "picker-lab:read";
function loadRead() {
  try { return new Set(JSON.parse(localStorage.getItem(READ_KEY) || "[]")); }
  catch (e) { return new Set(); }
}
function saveRead(set) {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...set])); } catch (e) {}
}

/* ---------------- url state ---------------- */

const DEFAULTS = { view: "deck", n: "real", order: "new", glow: "1", unread: "2", frame: "full", bar: "1", open: "" };
function readParams() {
  const q = new URLSearchParams(location.hash.replace(/^#/, ""));
  const p = { ...DEFAULTS };
  Object.keys(DEFAULTS).forEach((k) => { if (q.get(k) !== null) p[k] = q.get(k); });
  return p;
}
function writeParams(p) {
  const q = new URLSearchParams();
  Object.keys(DEFAULTS).forEach((k) => { if (p[k] && p[k] !== "") q.set(k, p[k]); });
  history.replaceState(null, "", "#" + q.toString());
}

/* ---------------- small shared pieces ---------------- */

function Seal({ color, size = 26, letterMark = "L" }) {
  return (
    <svg width={size} height={size} viewBox="-24 -24 48 48" style={{ display: "block", flex: "0 0 auto" }}>
      <circle r="22" fill={color} />
      <circle r="22" fill={shade(color, 15)} opacity="0.5" />
      <circle r="18" fill="none" stroke={shade(color, -25)} strokeWidth="1.5" opacity="0.6" />
      <text textAnchor="middle" y="7" fill={shade(color, -40)} fontSize="22" fontFamily="serif" fontStyle="italic">{letterMark}</text>
    </svg>
  );
}

/* ---------------- the reader: real envelope flies in, real letter unfolds ---------------- */

function Reader({ letter, origin, onClose }) {
  const [go, setGo] = useState(REDUCE);
  const [flap, setFlap] = useState(REDUCE);
  const [phase, setPhase] = useState("fly");
  const [out, setOut] = useState(false);

  useEffect(() => {
    if (REDUCE) {
      const t = setTimeout(() => setPhase("read"), 240);
      return () => clearTimeout(t);
    }
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    const t1 = setTimeout(() => setFlap(true), 300);
    const t2 = setTimeout(() => setPhase("read"), 1000);
    return () => { cancelAnimationFrame(r); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const close = useCallback(() => {
    setOut(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  let ghostTransform = `translate(0px, ${SETTLE_Y}px) scale(${SETTLE_SCALE})`;
  if (!go && origin) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = origin.left + origin.width / 2 - vw / 2;
    const sy = origin.top + origin.height / 2 - vh / 2;
    ghostTransform = `translate(${sx}px, ${sy}px) scale(${origin.width / 360})`;
  }

  return (
    <div className="reader" style={{ opacity: out ? 0 : 1, transition: "opacity .3s ease" }}>
      <div className="reader-scrim" onClick={close} />

      {phase === "fly" && (
        <div
          className="reader-ghost"
          style={{
            transform: ghostTransform,
            opacity: go ? 1 : 0.9,
            transition: REDUCE ? "none" : "transform 940ms cubic-bezier(.3,.85,.3,1), opacity .3s",
          }}
        >
          <window.EnvelopeSVG letter={letter} isOpen={flap} />
        </div>
      )}

      {phase === "read" && (
        <div style={{
          position: "absolute", left: "50%", top: "50%",
          transform: "translate(-50%, -50%)", zIndex: 100,
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: 18, maxHeight: "92vh", pointerEvents: "auto",
        }}>
          <window.Letter letter={letter} onClose={close} />
          <div style={{
            width: 240, height: 154,
            filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.4))",
            perspective: 800, transformStyle: "preserve-3d",
          }}>
            <window.EnvelopeSVG letter={letter} isOpen={true} small />
          </div>
        </div>
      )}

      <button className="reader-close-hint" onClick={close}>← back to the mailbox</button>
    </div>
  );
}

/* ---------------- 1. DECK — swipe through, one at a time ---------------- */

function Deck({ letters, open, glow, readSet }) {
  const [i, setI] = useState(0);
  const [drag, setDrag] = useState(0);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const boxRef = useRef(null);
  const railRef = useRef(null);
  const pointer = useRef(null);

  useEffect(() => { setI(0); setDrag(0); }, [letters]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = letters.length;
  // the card plus its caption need ~310 units of height; leave room for the
  // hint above and the rail below
  const scale = Math.max(0.42, Math.min(1.25, (size.w * 0.78) / 360, (size.h - 190) / 310));
  const cardW = 360 * scale;
  const step = cardW * 0.66;
  const pos = i - drag / step;

  const clamp = (v) => Math.max(0, Math.min(n - 1, v));
  const goTo = (v) => setI(clamp(v));

  useEffect(() => {
    const onKey = (e) => {
      if (document.querySelector(".reader")) return;   // a letter is open
      if (e.key === "ArrowLeft") { e.preventDefault(); setI((v) => clamp(v - 1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setI((v) => clamp(v + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  /* Taps and swipes are both resolved here rather than with a separate onClick:
     once an element has pointer capture, Chrome sends the follow-up click to the
     capturing element, so a click handler on the card never fires after a drag
     gesture starts. Capture is also only taken once the finger has actually
     moved, so a still finger stays a tap. */
  const TAP_SLOP = 8;

  function down(e) {
    if (e.target.closest(".deck-rail") || e.target.closest(".deck-arrow")) return;
    const card = e.target.closest("[data-idx]");
    pointer.current = {
      x: e.clientX, t: Date.now(), moved: 0, id: e.pointerId,
      idx: card ? Number(card.dataset.idx) : null,
      captured: false, el: e.currentTarget,
    };
  }
  function move(e) {
    const p = pointer.current;
    if (!p) return;
    const raw = e.clientX - p.x;
    p.moved = Math.max(p.moved, Math.abs(raw));
    if (!p.captured && p.moved > 4) {
      p.captured = true;
      try { p.el.setPointerCapture(p.id); } catch (err) {}
    }
    if (!p.captured) return;
    let d = raw;
    if ((i === 0 && d > 0) || (i === n - 1 && d < 0)) d *= 0.32;   // rubber band at the ends
    setDrag(d);
  }
  function up(e) {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    setDrag(0);
    if (p.moved <= TAP_SLOP) {
      if (p.idx === null) return;
      if (p.idx === i) {
        const l = letters[i];
        open(l, boxRef.current.querySelector(`[data-card="${l.id}"]`));
      } else {
        goTo(p.idx);
      }
      return;
    }
    const d = e.clientX - p.x;
    const dt = Date.now() - p.t;
    const flick = Math.abs(d) > 36 && dt < 260;
    if (Math.abs(d) > step * 0.3 || flick) goTo(i - Math.sign(d));
  }

  function railJump(e) {
    const r = railRef.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    goTo(Math.round(f * (n - 1)));
  }

  const first = Math.max(0, Math.floor(pos) - 2);
  const last = Math.min(n - 1, Math.ceil(pos) + 2);
  const cards = [];
  for (let j = first; j <= last; j++) cards.push(j);

  const railFrac = n > 1 ? i / (n - 1) : 0;
  const thumbW = Math.max(8, 100 / n);

  return (
    <div
      className="deck"
      ref={boxRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {cards.map((j) => {
        const l = letters[j];
        const off = j - pos;
        const a = Math.min(Math.abs(off), 3);
        const isCenter = j === i;
        const isNew = glow && !readSet.has(l.id);
        return (
          <div
            key={l.id}
            data-idx={j}
            className="deck-card"
            style={{
              transform: `translate(${off * step}px, ${a * 12 - 30 * scale}px) rotate(${off * 4.5}deg) scale(${scale * (1 - a * 0.12)})`,
              transition: pointer.current ? "none" : "transform 430ms cubic-bezier(.22,.8,.26,1), opacity 430ms",
              opacity: 1 - a * 0.24,
              zIndex: 100 - Math.round(a * 10),
              cursor: "pointer",
            }}
          >
            <div
              data-card={l.id}
              className={isNew ? "is-new" : glow ? "is-read" : ""}
              style={{ width: 360, height: 230, borderRadius: 4, filter: isNew ? "none" : "drop-shadow(0 14px 22px rgba(0,0,0,.42))" }}
            >
              <window.EnvelopeSVG letter={l} isOpen={false} />
            </div>
            {/* the envelope art keeps its faint handwritten address; the title
                she is actually choosing by is spelled out underneath */}
            <div className="deck-cap" style={{ opacity: isCenter ? 1 : 0 }}>
              <div className="deck-cap-title">
                {isNew && <span className="new-tag" style={{ marginRight: 7, verticalAlign: "3px" }}>ново</span>}
                {l.title}
              </div>
              <div className="deck-cap-date">{l.date}</div>
            </div>
          </div>
        );
      })}

      <button className="deck-arrow" style={{ left: 10 }} disabled={i === 0} onClick={() => goTo(i - 1)}>‹</button>
      <button className="deck-arrow" style={{ right: 10 }} disabled={i === n - 1} onClick={() => goTo(i + 1)}>›</button>

      <div className="deck-pos">{i + 1} / {n}</div>
      <div
        className="deck-rail"
        ref={railRef}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); railJump(e); }}
        onPointerMove={(e) => { if (e.buttons) railJump(e); }}
      >
        <div className="deck-rail-track">
          <div className="deck-rail-thumb" style={{ width: thumbW + "%", left: `calc(${railFrac * 100}% - ${(railFrac * thumbW)}%)` }} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- 2. DRAWER — stacked like files, thumb-scrolled ---------------- */

function Drawer({ letters, open, glow, readSet }) {
  return (
    <div className="drawer">
      <div className="drawer-inner">
        {letters.map((l, idx) => {
          const c = l.envelopeColor;
          const isNew = glow && !readSet.has(l.id);
          return (
            <button
              key={l.id}
              className={"drawer-item " + (isNew ? "is-new" : glow ? "is-read" : "")}
              style={{
                background: `linear-gradient(180deg, ${shade(c, 10)} 0%, ${c} 42%, ${shade(c, -6)} 100%)`,
                color: INK,
                zIndex: idx + 1,
                "--dx": (idx % 2 ? 3 : -3) + "px",
                "--rot": (idx % 2 ? 0.22 : -0.22) + "deg",
              }}
              onClick={(e) => open(l, e.currentTarget)}
            >
              {/* the two faint diagonals are the envelope's back seams, so a
                  row reads as the top edge of a letter rather than a list item */}
              <svg className="drawer-seam" viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 0 0 L 200 46 L 400 0" fill="none" stroke={shade(c, -60)} strokeWidth="1.6" />
              </svg>
              <div className="drawer-row">
                <Seal color={l.wax} size={22} />
                <div className="drawer-title">{l.title}</div>
                {isNew && <span className="new-tag">ново</span>}
                <div className="drawer-date">{l.date}</div>
              </div>
              <div className="drawer-edge" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 3. TIMELINE — a thread of months ---------------- */

function Timeline({ letters, open, glow, readSet, order }) {
  /* The other three prototypes keep the order the letters are written in the
     file, the way the site does today. A thread of months can't: it has to put
     each letter under its real month, so here they are sorted by the `date`
     field. Letters sharing a date keep their file order. Anything whose date
     can't be read is left, in file order, at the end. */
  const sorted = useMemo(() => {
    const dir = order === "old" ? 1 : -1;
    const withIdx = letters.map((l, i) => ({ l, d: parseDate(l), i }));
    const dated = withIdx.filter((x) => x.d);
    const undated = withIdx.filter((x) => !x.d);
    dated.sort((a, b) => (a.d - b.d) * dir || a.i - b.i);
    return [...dated, ...undated].map((x) => x.l);
  }, [letters, order]);

  const groups = useMemo(() => {
    const out = [];
    let cur = null;
    sorted.forEach((l) => {
      const d = parseDate(l);
      const key = d ? `${d.getFullYear()}-${d.getMonth()}` : "unknown";
      const label = d
        ? d.toLocaleDateString("en-US", { month: "long", year: "numeric" })
        : "undated";
      if (!cur || cur.key !== key) { cur = { key, label, items: [] }; out.push(cur); }
      cur.items.push(l);
    });
    return out;
  }, [sorted]);

  return (
    <div className="timeline">
      <div className="timeline-inner">
        <div className="tl-thread" />
        {groups.map((g) => (
          <div key={g.key + g.items[0].id}>
            <div className="tl-month"><b>{g.label}<span>{g.items.length} {g.items.length === 1 ? "letter" : "letters"}</span></b></div>
            {g.items.map((l) => {
              const isNew = glow && !readSet.has(l.id);
              const d = parseDate(l);
              return (
                <button key={l.id} className="tl-item" onClick={(e) => open(l, e.currentTarget)}>
                  <div
                    className={isNew ? "is-new" : ""}
                    style={{ borderRadius: "50%", flex: "0 0 auto", opacity: glow && !isNew ? 0.55 : 1 }}
                  >
                    <Seal color={l.wax} size={28} />
                  </div>
                  <div className="tl-text">
                    <div className="tl-title" style={{ opacity: glow && !isNew ? 0.68 : 1 }}>
                      {l.title} {isNew && <span className="new-tag" style={{ fontSize: 13, verticalAlign: "2px" }}>ново</span>}
                    </div>
                    <div className="tl-date">{d ? `${d.toLocaleDateString("en-US", { weekday: "long" })} the ${d.getDate()}` : l.date}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 4. WALL — everything at once ---------------- */

function Wall({ letters, open, glow, readSet }) {
  return (
    <div className="wall">
      <div className="wall-inner">
        {letters.map((l) => {
          const c = l.envelopeColor;
          const isNew = glow && !readSet.has(l.id);
          return (
            <button
              key={l.id}
              className={"wall-card " + (isNew ? "is-new" : glow ? "is-read" : "")}
              style={{ background: `linear-gradient(170deg, ${shade(c, 8)}, ${shade(c, -8)})`, color: INK }}
              onClick={(e) => open(l, e.currentTarget)}
            >
              <div
                className="wall-flap"
                style={{ background: shade(c, -13), clipPath: "polygon(0 0, 50% 100%, 100% 0)" }}
              />
              <svg className="wall-seam" viewBox="0 0 360 230" preserveAspectRatio="none" aria-hidden="true">
                <path d="M 0 0 L 180 115 L 360 0" fill="none" stroke={shade(c, -48)} strokeWidth="2" opacity=".55" />
                <path d="M 0 230 L 180 132 L 360 230" fill="none" stroke={shade(c, -48)} strokeWidth="2" opacity=".28" />
              </svg>
              <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)" }}>
                <Seal color={l.wax} size={24} />
              </div>
              <div className="wall-meta">
                <div className="wall-title">{l.title}</div>
                <div className="wall-date">{l.date}</div>
              </div>
              {isNew && <div style={{ position: "absolute", top: 5, right: 5 }}><span className="new-tag" style={{ fontSize: 13, lineHeight: "17px" }}>ново</span></div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- the lab shell ---------------- */

const VIEWS = [
  { id: "deck", label: "1 · Deck", Comp: Deck, blurb: "swipe through, one at a time" },
  { id: "drawer", label: "2 · Drawer", Comp: Drawer, blurb: "stacked like files, scroll with your thumb" },
  { id: "timeline", label: "3 · Timeline", Comp: Timeline, blurb: "a thread of months" },
  { id: "wall", label: "4 · Wall", Comp: Wall, blurb: "everything at once" },
];

function Seg({ value, options, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} data-on={String(value) === String(o.v) ? "1" : "0"} onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Lab() {
  const [p, setP] = useState(readParams);
  const [readSet, setReadSet] = useState(loadRead);
  const [openLetter, setOpenLetter] = useState(null);
  const [origin, setOrigin] = useState(null);

  const set = (patch) => setP((prev) => { const next = { ...prev, ...patch }; writeParams(next); return next; });
  useEffect(() => { writeParams(p); }, []);

  /* editing the hash by hand (or the back button) switches prototype */
  useEffect(() => {
    const onHash = () => setP(readParams());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const base = useMemo(() => (p.n === "real" ? REAL_LETTERS : makeFake(Number(p.n))), [p.n]);
  const letters = useMemo(() => (p.order === "new" ? [...base].reverse() : base), [base, p.order]);
  const glow = p.glow !== "0";

  /* Realistic starting point: she has kept up, so only the newest couple of
     letters are unread. "all" is the other true case — the very first visit. */
  const seeded = useMemo(() => {
    if (p.unread === "all") return new Set();
    const keepNew = Number(p.unread) || 0;
    return new Set(base.slice(0, Math.max(0, base.length - keepNew)).map((l) => l.id));
  }, [base, p.unread]);
  const effRead = useMemo(() => new Set([...seeded, ...readSet]), [seeded, readSet]);

  const open = useCallback((letter, el) => {
    setOrigin(el ? el.getBoundingClientRect() : null);
    setOpenLetter(letter);
    setReadSet((prev) => {
      if (prev.has(letter.id)) return prev;
      const next = new Set(prev); next.add(letter.id); saveRead(next); return next;
    });
  }, []);

  /* ?open=<id> lets a screenshot land straight on an opened letter */
  useEffect(() => {
    if (!p.open) return;
    const l = letters.find((x) => String(x.id) === String(p.open));
    if (l) open(l, null);
  }, [p.open, letters, open]);

  const view = VIEWS.find((v) => v.id === p.view) || VIEWS[0];
  const Comp = view.Comp;

  return (
    <div className="lab">
      {p.bar === "0" && (
        <button className="bar-peek" title="show the controls" onClick={() => set({ bar: "1" })}>☰</button>
      )}
      {p.bar !== "0" && (
      <div className="lab-bar">
        <div className="grp">
          <label>view</label>
          <Seg value={p.view} onChange={(v) => set({ view: v })}
               options={VIEWS.map((v) => ({ v: v.id, l: v.label }))} />
        </div>
        <div className="grp">
          <label>letters</label>
          <Seg value={p.n} onChange={(v) => set({ n: v })}
               options={[{ v: "real", l: `real (${REAL_LETTERS.length})` }, { v: "12", l: "12" }, { v: "50", l: "50" }, { v: "200", l: "200" }]} />
        </div>
        <div className="grp">
          <label>order</label>
          <Seg value={p.order} onChange={(v) => set({ order: v })}
               options={[{ v: "new", l: "newest first" }, { v: "old", l: "oldest first" }]} />
        </div>
        <div className="grp">
          <label>new-letter glow</label>
          <Seg value={p.glow} onChange={(v) => set({ glow: v })}
               options={[{ v: "1", l: "on" }, { v: "0", l: "off" }]} />
        </div>
        <div className="grp">
          <label>frame</label>
          <Seg value={p.frame} onChange={(v) => set({ frame: v })}
               options={[{ v: "full", l: "fill window" }, { v: "phone", l: "phone" }]} />
        </div>
        <div className="grp">
          <label>unread</label>
          <Seg value={p.unread} onChange={(v) => set({ unread: v })}
               options={[{ v: "2", l: "newest 2" }, { v: "all", l: "all (first visit)" }]} />
        </div>
        <button className="ghost-btn" onClick={() => { saveRead(new Set()); setReadSet(new Set()); }}>
          reset
        </button>
        <button className="ghost-btn" onClick={() => set({ bar: "0" })}>hide this bar</button>
        <div className="lab-note">{view.blurb}</div>
      </div>
      )}

      <div className="lab-stage">
        <div className={"stage " + (p.frame === "phone" ? "is-phone" : "is-full")}>
          <Comp letters={letters} open={open} glow={glow} readSet={effRead} order={p.order} />
          <div className="stage-vignette" />
          {p.view !== "deck" && <div className="stage-topfade" />}
          <div className="stage-hint">pick a letter</div>
        </div>
      </div>

      {openLetter && (
        <Reader
          key={openLetter.id}
          letter={openLetter}
          origin={origin}
          onClose={() => { setOpenLetter(null); if (p.open) set({ open: "" }); }}
        />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("lab")).render(<Lab />);
