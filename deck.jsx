/* The letter picker inside the mailbox: a deck she swipes through one
   envelope at a time, and the reader that opens the chosen one.

   Replaced the fanned spread, which put every envelope on the same spot
   and ran out of room at a handful of letters. The deck only ever draws
   five envelopes, so it works the same at 5 letters or 500; the rail
   along the bottom scrubs to any of them. Prototyped as "1 · Deck" in
   picker-lab.html.

   Opening hands off to the same envelope art and letter unfold as
   before (EnvelopeSVG and Letter, from envelope.jsx). */

const { useState: useDS, useEffect: useDE, useRef: useDR, useCallback: useDC } = React;

const DECK_REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// where the read-phase layout puts the small envelope — same math as
// SETTLE_Y / SETTLE_SCALE in envelope.jsx
const READ_ENV_Y = 109;
const READ_ENV_SCALE = 240 / 360;
// the open letter is shown at 80% on phones (.reader-stage in index.html)
const READER_SCALE = () => (window.matchMedia("(max-width: 720px)").matches ? 0.8 : 1);

/* ---------------- what she has already opened ----------------
   Kept in this browser only (localStorage), so each device keeps its own
   list, and clearing site data resets it. The first time a device runs
   this, everything already in the mailbox counts as read — otherwise
   every old letter would show up as "new" on day one. */

const READ_KEY = "letters:read";

function loadReadIds(currentIds) {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (raw === null) {
      localStorage.setItem(READ_KEY, JSON.stringify(currentIds));
      return new Set(currentIds);
    }
    return new Set(JSON.parse(raw));
  } catch (e) {
    return new Set(currentIds);
  }
}

function saveReadIds(set) {
  try { localStorage.setItem(READ_KEY, JSON.stringify([...set])); } catch (e) {}
}

/* ---------------- the reader: envelope flies to centre, letter unfolds ---------------- */

function Reader({ letter, origin, onClose }) {
  const [go, setGo] = useDS(DECK_REDUCE);
  const [flap, setFlap] = useDS(DECK_REDUCE);
  const [phase, setPhase] = useDS("fly");
  const [out, setOut] = useDS(false);

  useDE(() => {
    if (DECK_REDUCE) {
      const t = setTimeout(() => setPhase("read"), 240);
      return () => clearTimeout(t);
    }
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)));
    const t1 = setTimeout(() => setFlap(true), 300);
    const t2 = setTimeout(() => setPhase("read"), 1000);
    return () => { cancelAnimationFrame(r); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const close = useDC(() => {
    setOut(true);
    setTimeout(onClose, 300);
  }, [onClose]);

  useDE(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // starts exactly over the envelope she tapped, then glides to centre
  let ghostTransform = `translate(0px, ${READ_ENV_Y}px) scale(${READ_ENV_SCALE})`;
  if (!go && origin) {
    // measured on screen, but the ghost lives inside the (possibly shrunk)
    // reader stage, so undo that scale to land exactly on the tapped card
    const k = READER_SCALE();
    const vw = window.innerWidth, vh = window.innerHeight;
    const sx = (origin.left + origin.width / 2 - vw / 2) / k;
    const sy = (origin.top + origin.height / 2 - vh / 2) / k;
    ghostTransform = `translate(${sx}px, ${sy}px) scale(${origin.width / 360 / k})`;
  }

  return (
    <div className="reader" style={{ opacity: out ? 0 : 1, transition: "opacity .3s ease" }}>
      <div className="reader-scrim" onClick={close} />

      <div className="reader-stage">
      {phase === "fly" && (
        <div
          className="reader-ghost"
          style={{
            transform: ghostTransform,
            opacity: go ? 1 : 0.9,
            transition: DECK_REDUCE ? "none" : "transform 940ms cubic-bezier(.3,.85,.3,1), opacity .3s",
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
      </div>

      <button className="back-btn" onClick={close}>← back to mailbox</button>
    </div>
  );
}

/* ---------------- the deck ---------------- */

function LetterDeck({ letters, onOpen, onClose, openLetter }) {
  const [i, setI] = useDS(0);
  const [drag, setDrag] = useDS(0);
  const [size, setSize] = useDS({ w: 900, h: 600 });
  const [origin, setOrigin] = useDS(null);
  const [readSet, setReadSet] = useDS(() => loadReadIds(letters.map((l) => l.id)));
  const boxRef = useDR(null);
  const railRef = useDR(null);
  const pointer = useDR(null);

  useDE(() => {
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
  const clamp = (v) => Math.max(0, Math.min(n - 1, v));
  const cur = clamp(i);   // stays valid if the list ever shrinks
  // the card plus its caption need ~310 units of height; leave room for the
  // hint above and the rail below
  const scale = Math.max(0.42, Math.min(1.25, (size.w * 0.78) / 360, (size.h - 190) / 310));
  const cardW = 360 * scale;
  const step = cardW * 0.66;
  const pos = cur - drag / step;

  const goTo = (v) => setI(clamp(v));

  function open(letter, el) {
    setOrigin(el ? el.getBoundingClientRect() : null);
    setReadSet((prev) => {
      if (prev.has(letter.id)) return prev;
      const next = new Set(prev); next.add(letter.id); saveReadIds(next); return next;
    });
    onOpen(letter.id);
  }

  useDE(() => {
    const onKey = (e) => {
      if (openLetter) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setI((v) => clamp(v - 1)); }
      if (e.key === "ArrowRight") { e.preventDefault(); setI((v) => clamp(v + 1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, openLetter]);

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
    if ((cur === 0 && d > 0) || (cur === n - 1 && d < 0)) d *= 0.32;   // rubber band at the ends
    setDrag(d);
  }
  function up(e) {
    const p = pointer.current;
    pointer.current = null;
    if (!p) return;
    setDrag(0);
    if (p.moved <= TAP_SLOP) {
      if (p.idx === null) return;
      if (p.idx === cur) {
        const l = letters[cur];
        open(l, boxRef.current.querySelector(`[data-card="${l.id}"]`));
      } else {
        goTo(p.idx);
      }
      return;
    }
    const d = e.clientX - p.x;
    const dt = Date.now() - p.t;
    const flick = Math.abs(d) > 36 && dt < 260;
    if (Math.abs(d) > step * 0.3 || flick) goTo(cur - Math.sign(d));
  }

  function railJump(e) {
    const r = railRef.current.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    goTo(Math.round(f * (n - 1)));
  }

  if (n === 0) return null;

  // only the centre card and two either side are ever drawn
  const first = Math.max(0, Math.floor(pos) - 2);
  const last = Math.min(n - 1, Math.ceil(pos) + 2);
  const cards = [];
  for (let j = first; j <= last; j++) cards.push(j);

  const railFrac = n > 1 ? cur / (n - 1) : 0;
  const thumbW = Math.max(8, 100 / n);

  return (
    <>
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
          const isCenter = j === cur;
          const isNew = !readSet.has(l.id);
          return (
            <div
              key={l.id}
              data-idx={j}
              className="deck-card"
              style={{
                transform: `translate(${off * step}px, ${a * 12 - 30 * scale}px) rotate(${off * 4.5}deg) scale(${scale * (1 - a * 0.12)})`,
                transition: pointer.current ? "none" : "transform 430ms cubic-bezier(.22,.8,.26,1), opacity 430ms, filter 430ms",
                // side envelopes recede by darkening, not fading — over the 3D
                // scene a see-through envelope shows the landscape through it.
                // Only the outermost ones fade, so they don't pop in and out.
                filter: `brightness(${1 - Math.min(a, 2) * 0.2})`,
                opacity: a > 2 ? 3 - a : 1,
                zIndex: 100 - Math.round(a * 10),
              }}
            >
              <div
                data-card={l.id}
                className={isNew ? "is-new" : "is-read"}
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

        {n > 1 && (
          <>
            <button className="deck-arrow" style={{ left: 10 }} disabled={cur === 0} onClick={() => goTo(cur - 1)}>‹</button>
            <button className="deck-arrow" style={{ right: 10 }} disabled={cur === n - 1} onClick={() => goTo(cur + 1)}>›</button>

            <div className="deck-pos">{cur + 1} / {n}</div>
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
          </>
        )}
      </div>

      {openLetter && (
        <Reader key={openLetter.id} letter={openLetter} origin={origin} onClose={onClose} />
      )}
    </>
  );
}

window.LetterDeck = LetterDeck;
