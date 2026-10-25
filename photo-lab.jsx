/* ------------------------------------------------------------------ *
 * photo-lab.jsx — DESIGN SANDBOX, not part of the real site.
 *
 * Four ways a photo could look inside a letter (polaroid, album
 * corners, vintage print, postcard) and two places it could sit (stuck
 * on the letter paper, or tucked in the envelope). Runs on the real
 * letters, the real deck and the real reader from deck.jsx; only the
 * unfolded letter is swapped for a copy that can hold photos (window
 * .Letter is replaced below). Nothing here is loaded by index.html, and
 * nothing is uploaded or saved anywhere.
 *
 * Every control is mirrored into the URL hash, e.g.
 *   photo-lab.html#kind=postcard&place=envelope&n=8&open=1
 * ------------------------------------------------------------------ */

const { useState, useEffect, useRef, useContext, createContext } = React;

/* Stand-in photos (random pictures from picsum.photos) with sample
   captions. "use my photos…" in the bar swaps in real ones, which never
   leave this browser. */
const SAMPLES = [
  { seed: "lake-morning", w: 4, h: 3, caption: "нашата неделя" },
  { seed: "portrait-sun", w: 3, h: 4, caption: "ти, сутринта" },
  { seed: "old-town", w: 4, h: 3, caption: "първата ни разходка" },
  { seed: "sea-wind", w: 3, h: 4, caption: "пак ли ме снимаш?" },
  { seed: "dinner-light", w: 4, h: 3, caption: "онази вечер" },
  { seed: "mountain-road", w: 4, h: 3, caption: "по пътя" },
  { seed: "flowers-hand", w: 3, h: 4, caption: "за теб" },
  { seed: "sunset-roof", w: 4, h: 3, caption: "залезът" },
].map((s) => ({ ...s, src: `https://picsum.photos/seed/${s.seed}/${s.w * 240}/${s.h * 240}` }));

// the bar shows the polaroid round; the first round's other styles still
// open from the address: #kind=corners, #kind=deckled, #kind=postcard
const KINDS = [["polaroid", "first try"], ["candid", "A · candid"], ["kept", "B · kept for years"], ["placed", "C · placed with care"]];
const INSTANT = new Set(["candid", "kept", "placed"]);

const PhotoCtx = createContext({ kind: "polaroid", place: "paper", photos: [], captions: true });

const isPhone = () => window.matchMedia("(max-width: 720px)").matches;

/* ---------------- small helpers ---------------- */

function mixWithWhite(hex, t, alpha) {
  const n = parseInt(hex.replace("#", ""), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * t));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

/** "Jul 25, 2026" -> "'26 7 25", the way an old film camera printed it. */
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function cameraDate(date) {
  const m = /^(\w{3})\w* (\d+), (\d{4})/.exec(date || "");
  if (!m || !MONTHS[m[1]]) return "";
  return `'${m[3].slice(2)} ${MONTHS[m[1]]} ${m[2]}`;
}

/** Same pseudo-random sequence every time for the same seed, so a print's
 *  wavy edge doesn't change shape on every redraw. */
function seeded(seed) {
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A clip-path that cuts a rectangle with a wavy "deckled" edge. */
function deckleEdge(w, h, seed) {
  const r = seeded(seed);
  const amp = Math.max(1.6, w * 0.014);
  const step = Math.max(3, w / 48);
  const pts = [];
  for (let x = 0; x < w; x += step) pts.push([x, (x / step) % 2 ? amp * (0.6 + r() * 0.4) : r() * amp * 0.3]);
  for (let y = 0; y < h; y += step) pts.push([w - ((y / step) % 2 ? amp * (0.6 + r() * 0.4) : r() * amp * 0.3), y]);
  for (let x = w; x > 0; x -= step) pts.push([x, h - ((x / step) % 2 ? amp * (0.6 + r() * 0.4) : r() * amp * 0.3)]);
  for (let y = h; y > 0; y -= step) pts.push([(y / step) % 2 ? amp * (0.6 + r() * 0.4) : r() * amp * 0.3, y]);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
}

const isTall = (p) => p.h > p.w;

/* Photos are fetched and decoded before the letter opens, so they're
   already there when the paper unfolds instead of popping in a moment
   later. Each src is fetched once; later calls get the same promise. */
const photoCache = new Map();
function preloadPhoto(src) {
  if (!photoCache.has(src)) {
    const im = new Image();
    im.src = src;
    photoCache.set(src, (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => im));
  }
  return photoCache.get(src);
}

/** true once every photo in the list is downloaded and decoded. */
function usePhotosReady(photos) {
  const key = photos.map((p) => p.src).join("|");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all(photos.map((p) => preloadPhoto(p.src))).then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [key]);
  return ready;
}

/** How tall a print of width w comes out (used to fit the viewer and the
 *  envelope pile). Captions under the print add a line of handwriting. */
function printHeight(kind, p, w, withCaption) {
  const a = p.h / p.w;
  const under = withCaption && p.caption ? Math.max(17, w * 0.085) * 1.1 + w * 0.05 : 0;
  if (INSTANT.has(kind)) { const f = formatFor(kind, p); return w * (f.pt + (1 - 2 * f.ps) * f.ar + f.pb); }
  if (kind === "polaroid") return w * (0.055 + 0.89 + (withCaption && p.caption ? 0.2 : 0.17));
  if (kind === "corners") return w * 0.09 + w * 0.91 * a + under;
  if (kind === "deckled") return w * 0.13 + w * 0.87 * a + under;
  return w * (isTall(p) ? 1.5 : 2 / 3); // postcard
}

/* ---------------- the three polaroid directions ---------------- */

/* Real instant-film formats, as fractions of the card's width:
   ps side border, pt top border, pb bottom "chin", ar picture height / width. */
const FORMATS = {
  mini:   { ps: 4 / 54,   pt: 6 / 54,   pb: 18 / 54,   ar: 62 / 46 },  // Instax Mini 54×86mm
  wide:   { ps: 4.5 / 108, pt: 6.5 / 108, pb: 17.5 / 108, ar: 62 / 99 }, // Instax Wide 108×86mm
  square: { ps: 4.5 / 88, pt: 6 / 88,   pb: 22 / 88,   ar: 1 },        // Polaroid 600 88×107mm
};
function formatFor(kind, p) {
  if (kind === "candid") return isTall(p) || p.w === p.h ? FORMATS.mini : FORMATS.wide;
  return FORMATS.square;
}

// a fine paper grain, drawn once as a tiny tiling image
const GRAIN = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .42  0 0 0 0 .36  0 0 0 0 .3  0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>"
)}")`;

/** "Oct 7, 2026" -> "7.10" for a marker caption. */
function shortDate(date) {
  const m = /^(\w{3})\w* (\d+), (\d{4})/.exec(date || "");
  return m && MONTHS[m[1]] ? `${m[2]}.${MONTHS[m[1]]}` : "";
}

/** The ends of a strip of tape: torn and fibrous (washi), or the fine
 *  teeth of a tape dispenser (clear tape). A clip-path in percentages. */
function tapeEnds(rnd, torn) {
  const pts = [];
  const n = torn ? 9 : 7;
  const e = torn ? 5 : 2.5;
  for (let i = 0; i <= n; i++) pts.push([100 - (torn ? rnd() * e : i % 2 ? e : 0), (i / n) * 100]);
  for (let i = n; i >= 0; i--) pts.push([torn ? rnd() * e : i % 2 ? e : 0, (i / n) * 100]);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}% ${y.toFixed(1)}%`).join(",")})`;
}

/** Where the tape goes on this print: varied per photo, but the same
 *  every time for the same photo. x/y are fractions of the card. */
function tapesFor(kind, rnd, wax) {
  if (kind === "candid") {
    const t = mixWithWhite(wax, [0.3, 0.5, 0.68][Math.floor(rnd() * 3)], 1);
    const pick = rnd();
    if (pick < 0.4) return [{ x: 0.5 + (rnd() - 0.5) * 0.2, y: 0.005, len: 0.46, th: 0.13, rot: -9 + rnd() * 18, t, cls: "tape-washi", torn: true }];
    if (pick < 0.72) return [
      { x: 0.07, y: 0.035, len: 0.36, th: 0.12, rot: -45 + (rnd() - 0.5) * 10, t, cls: "tape-washi", torn: true },
      { x: 0.93, y: 0.965, len: 0.36, th: 0.12, rot: -45 + (rnd() - 0.5) * 10, t, cls: "tape-washi", torn: true },
    ];
    return [{ x: 0.9, y: 0.04, len: 0.4, th: 0.13, rot: 42 + (rnd() - 0.5) * 10, t, cls: "tape-washi", torn: true }];
  }
  if (kind === "kept") return [{ x: 0.5 + (rnd() - 0.5) * 0.24, y: 0.004, len: 0.52, th: 0.14, rot: (rnd() - 0.5) * 8, cls: "tape-clear", torn: false }];
  return [{ x: 0.5, y: 0.004, len: 0.3, th: 0.075, rot: (rnd() - 0.5) * 4, t: mixWithWhite(wax, 0.25, 1), cls: "tape-faint", torn: false }];
}

function Tape({ tp, w, rnd }) {
  return (
    <span
      className={"ip-tape " + tp.cls}
      style={{
        "--t": tp.t, left: tp.x * 100 + "%", top: tp.y * 100 + "%",
        width: tp.len * w, height: tp.th * w,
        transform: `translate(-50%, -50%) rotate(${tp.rot}deg)`,
        clipPath: tapeEnds(rnd, tp.torn),
      }}
    />
  );
}

function Instant({ p, kind, w, tilt, wax, date, caption, loose, develop, onClick }) {
  const f = formatFor(kind, p);
  const rnd = seeded(p.src + kind);
  const tapes = loose ? [] : tapesFor(kind, rnd, wax);
  const vars = {
    "--w": w + "px", "--tilt": tilt + "deg", "--grain": GRAIN,
    "--ps": f.ps * w + "px", "--pt": f.pt * w + "px", "--pb": f.pb * w + "px",
  };
  const cap = caption ? p.caption : "";
  return (
    <div className="pl-item" style={{ "--w": w + "px" }}>
      <figure className={"ip ip-" + kind} style={vars} onClick={onClick}>
        <div className="ip-frame">
          <div className="ip-win" style={{ height: (1 - 2 * f.ps) * w * f.ar }}>
            <img src={p.src} alt="" draggable={false} />
            <span className="ip-lift" />
            <span className="ip-edge" />
            {develop !== undefined && <span className={"ip-dev" + (develop ? " go" : "")} />}
          </div>
          <div className="ip-cap" style={kind === "candid" ? { transform: `rotate(${(rnd() - 0.5) * 3}deg)` } : null}>
            <span>{cap}</span>
            {kind === "candid" && cap && <span className="ip-date">{shortDate(date)}</span>}
          </div>
        </div>
        {tapes.map((tp, i) => <Tape key={i} tp={tp} w={w} rnd={rnd} />)}
      </figure>
    </div>
  );
}

/* ---------------- one photo, in one of the four styles ---------------- */

function PhotoPrint({ p, kind, w, tilt = 0, wax, date, caption, flipped, loose, develop, onClick }) {
  if (INSTANT.has(kind)) {
    return <Instant p={p} kind={kind} w={w} tilt={tilt} wax={wax} date={date} caption={caption} loose={loose} develop={develop} onClick={onClick} />;
  }
  const vars = { "--w": w + "px", "--wax": wax, "--tape": mixWithWhite(wax, 0.5, 0.82) };
  const cap = caption ? p.caption : "";
  const fig = { "--tilt": tilt + "deg" };
  const img = <img src={p.src} alt="" draggable={false} />;

  if (kind === "polaroid") {
    return (
      <div className="pl-item" style={vars}>
        <figure className={"pp pp-polaroid" + (cap ? "" : " no-cap")} style={{ ...fig, margin: 0 }} onClick={onClick}>
          {!loose && <span className="pp-tape" />}
          <div className="pp-img">{img}</div>
          <div className="pp-cap">{cap}</div>
        </figure>
      </div>
    );
  }

  if (kind === "corners") {
    return (
      <div className="pl-item" style={vars}>
        <figure className="pp pp-corners" style={{ ...fig, margin: 0 }} onClick={onClick}>
          <div className="pp-img" style={{ aspectRatio: `${p.w} / ${p.h}` }}>{img}</div>
          {["tl", "tr", "br", "bl"].map((c) => <span key={c} className={"pp-corner " + c}><i /></span>)}
        </figure>
        {cap && <div className="pp-under">{cap}</div>}
      </div>
    );
  }

  if (kind === "deckled") {
    const pad = w * 0.065;
    const h = pad * 2 + (w - pad * 2) * (p.h / p.w);
    const stamp = cameraDate(date);
    return (
      <div className="pl-item" style={vars}>
        <figure className="pp pp-deckled" style={{ ...fig, margin: 0 }} onClick={onClick}>
          <div className="pp-dk-card" style={{ height: h, clipPath: deckleEdge(w, h, p.src) }}>
            <div className="pp-img" style={{ height: "100%" }}>
              {img}
              {stamp && <span className="pp-datestamp">{stamp}</span>}
            </div>
          </div>
        </figure>
        {cap && <div className="pp-under" style={{ color: "#5c5048" }}>{cap}</div>}
      </div>
    );
  }

  // postcard
  const tall = isTall(p);
  return (
    <div className="pl-item" style={vars}>
      <figure className={"pp pp-postcard" + (flipped ? " flipped" : "")} style={{ ...fig, margin: 0 }} onClick={onClick}>
        <div className="pp-pc-inner" style={{ height: w * (tall ? 1.5 : 2 / 3) }}>
          <div className="pp-pc-face pp-pc-front">
            <div className="pp-img">{img}</div>
            <span className="pp-pc-curl" />
          </div>
          <div className="pp-pc-face pp-pc-back" style={tall ? { gridTemplateColumns: "1fr", gridTemplateRows: "58% 42%" } : null}>
            <div className="pp-pc-kind">ПОЩЕНСКА КАРТА</div>
            <div className="pp-pc-note" style={tall ? { borderRight: 0, borderBottom: "1px solid rgba(120,90,60,.35)" } : null}>
              {p.caption || ""}
            </div>
            <div className="pp-pc-right">
              <div className="pp-pc-stamp"><div>♥</div></div>
              <div className="pp-pc-lines">
                <div>за теб</div><div /><div />
              </div>
            </div>
          </div>
        </div>
      </figure>
    </div>
  );
}

/* ---------------- the full-screen viewer ---------------- */

function Lightbox({ photos, start, kind, wax, date, caption, onClose }) {
  const [i, setI] = useState(start);
  const [flipped, setFlipped] = useState(false);
  const down = useRef(null);
  const p = photos[i];

  useEffect(() => setFlipped(false), [i]);
  useEffect(() => {
    // capture first, so Escape closes the photo but not the letter under it
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
      else if (e.key === "ArrowRight") setI((v) => Math.min(photos.length - 1, v + 1));
      else return;
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [photos.length, onClose]);

  const vw = window.innerWidth, vh = window.innerHeight;
  const room = vh * 0.74 - (kind === "postcard" ? 40 : 0);
  let w = Math.min(vw * 0.86, 560);
  while (w > 120 && printHeight(kind, p, w, caption) > room) w *= 0.96;

  return ReactDOM.createPortal(
    <div
      className="lb"
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const d = down.current; down.current = null;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 45) setI((v) => Math.max(0, Math.min(photos.length - 1, v + (dx < 0 ? 1 : -1))));
        else if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="lb-photo" key={i}>
        <PhotoPrint
          p={p} kind={kind} w={w} tilt={-0.8} wax={wax} date={date} caption={caption}
          flipped={flipped} loose={INSTANT.has(kind)}
          onClick={() => kind === "postcard" && setFlipped((f) => !f)}
        />
      </div>
      <button className="lb-close" onClick={onClose}>×</button>
      {photos.length > 1 && (
        <>
          <button className="lb-arrow" style={{ left: 18 }} disabled={i === 0} onClick={() => setI(i - 1)}>←</button>
          <button className="lb-arrow" style={{ right: 18 }} disabled={i === photos.length - 1} onClick={() => setI(i + 1)}>→</button>
          <div className="lb-count">{i + 1} / {photos.length}</div>
        </>
      )}
      {kind === "postcard" && (
        <button className="lb-flip" onClick={() => setFlipped((f) => !f)}>{flipped ? "↻ снимката" : "↻ обърни"}</button>
      )}
    </div>,
    document.body
  );
}

/* ---------------- where the photos go on the paper ---------------- */

/** Spreads the photos evenly between paragraphs. Returns a map from line
 *  index -> the photos that come right after that line. */
function placeOnPaper(lines, photos) {
  const ends = [];
  lines.forEach((l, i) => { if (l.trim() && (i + 1 === lines.length || !lines[i + 1].trim())) ends.push(i); });
  const gaps = ends.length > 1 ? ends.slice(0, -1) : ends;   // between paragraphs, not after the signature
  const n = photos.length;
  const slots = Math.min(n, gaps.length);
  const at = {};
  for (let k = 0; k < slots; k++) {
    const line = gaps[Math.min(gaps.length - 1, Math.floor(((k + 0.5) * gaps.length) / slots))];
    const from = Math.floor((k * n) / slots), to = Math.floor(((k + 1) * n) / slots);
    at[line] = { k, photos: photos.slice(from, to), first: from };
  }
  return at;
}

function paperWidth(kind, p, many, colW) {
  const phone = isPhone();
  if (kind === "candid") {
    const tall = formatFor(kind, p) === FORMATS.mini;
    if (many) return colW * (tall ? 0.46 : 0.62);
    return colW * (tall ? (phone ? 0.72 : 0.52) : phone ? 0.98 : 0.84);
  }
  if (kind === "kept") return colW * (many ? 0.52 : phone ? 0.86 : 0.64);
  if (kind === "placed") return colW * (many ? 0.52 : phone ? 0.94 : 0.47);
  if (kind === "polaroid") return colW * (many ? 0.5 : 0.7);
  if (kind === "postcard") return colW * (isTall(p) ? (many ? 0.44 : 0.62) : many ? 0.52 : 0.86);
  return colW * (isTall(p) ? (many ? 0.44 : 0.64) : many ? 0.52 : 0.8);
}

/* ---------------- tucked in the envelope ---------------- */

function EnvelopePile({ photos, kind, wax, date, open, onPick }) {
  const [due, setDue] = useState(false);
  const ready = usePhotosReady(photos);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDue(true), 1700);
    return () => clearTimeout(t);
  }, [open]);
  const out = due && ready;

  const base = isPhone() ? 100 : 132;
  const shown = photos.slice(0, isPhone() ? 2 : 4);   // a phone only has room for one each side
  const hidden = photos.length - shown.length;

  return (
    <div className="pl-pile" style={{ top: "calc(100% + 18px)" }}>
      {shown.map((p, i) => {
        const w = kind === "postcard" && !isTall(p) ? base * 1.15 : base;
        const h = printHeight(kind, p, w, false);
        const side = i % 2 === 0 ? 1 : -1;
        const slot = Math.floor(i / 2);
        const inX = side * (120 - w / 2 - 6);                     // hidden behind the envelope
        const outX = side * (120 + w * 0.42 + slot * w * 0.3);    // slid out beside it
        const y = -6 + slot * 14;
        const rot = side * (6 + slot * 9) + ((i % 3) - 1) * 1.5;
        const x = out ? outX : inX;
        return (
          <div
            key={p.src}
            className="pl-pile-item"
            style={{
              zIndex: 4 - slot,
              opacity: out ? 1 : 0,
              transform: `translate(${x - w / 2}px, ${y - h / 2}px) rotate(${out ? rot : 0}deg)`,
              transitionDelay: `${i * 0.16}s`,
            }}
          >
            <PhotoPrint p={p} kind={kind} w={w} wax={wax} date={date} caption={false} loose onClick={() => onPick(i)} />
          </div>
        );
      })}
      {out && (
        <div className="pl-more" style={{ left: 0, top: "auto", bottom: -30 }}>
          {photos.length === 1 ? "докосни снимката" : hidden > 0 ? `още ${hidden} снимки вътре` : "докосни снимките"}
        </div>
      )}
    </div>
  );
}

/* ---------------- the letter, now able to hold photos ----------------
   A copy of Letter from envelope.jsx (same paper, same unfold, same
   line-by-line handwriting) plus the photos. */

function LabLetter({ letter, onClose }) {
  const { kind, place, photos, captions } = useContext(PhotoCtx);
  const [phase, setPhase] = useState(0); // 0 hidden, 1 visible+folded, 2 unfolded, 3 reading
  const [lb, setLb] = useState(null);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => setPhase(3), 1500);
    return () => { [t1, t2, t3].forEach(clearTimeout); };
  }, []);

  const lines = letter.body.split("\n");
  const onPaper = place === "paper" ? placeOnPaper(lines, photos) : {};
  const colW = Math.min(440, window.innerWidth * 0.88) - 96;
  const reveal = (delay) => ({
    opacity: phase >= 3 ? 1 : 0,
    transform: phase >= 3 ? "translateY(0)" : "translateY(6px)",
    transition: `opacity 0.5s ${delay}s, transform 0.5s ${delay}s`,
  });

  return (
    <div style={{
      position: "relative",
      width: "min(440px, 88vw)",
      height: phase >= 2 ? "min(580px, 70vh)" : 200,
      opacity: phase >= 1 ? 1 : 0,
      transform: phase >= 1 ? "scale(1)" : "scale(0.7)",
      transitionProperty: "height, opacity, transform",
      transitionDuration: "0.85s, 0.5s, 0.6s",
      transitionTimingFunction: "cubic-bezier(.5,1.1,.4,1)",
      boxShadow: "0 30px 60px rgba(0,0,0,0.45)"
    }}>
      <div style={{
        position: "absolute", inset: 0,
        background: `
          repeating-linear-gradient(0deg, transparent 0, transparent 31px, rgba(120,90,60,0.16) 31px, rgba(120,90,60,0.16) 32px),
          linear-gradient(180deg, #fdf6e9 0%, #f6e9d2 100%)
        `,
        borderRadius: 4,
        boxShadow: "inset 0 0 60px rgba(180,140,90,0.18)"
      }}>
        <div style={{
          position: "absolute", left: 0, right: 0, top: "33.33%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(120,90,60,0.4), transparent)",
          opacity: phase >= 2 ? 0.85 : 0, transition: "opacity 0.4s 0.2s"
        }}/>
        <div style={{
          position: "absolute", left: 0, right: 0, top: "66.66%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(120,90,60,0.4), transparent)",
          opacity: phase >= 2 ? 0.85 : 0, transition: "opacity 0.4s 0.2s"
        }}/>

        <div style={{
          position: "absolute",
          inset: 0,
          padding: "44px 48px",
          fontFamily: "Caveat, cursive",
          fontSize: 22,
          lineHeight: "32px",
          color: "#3a2820",
          opacity: phase >= 3 ? 1 : 0,
          transition: "opacity 0.5s",
          whiteSpace: "pre-wrap",
          overflowY: "auto",
          overflowX: "hidden",
        }}>
          <div style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: "#7a5a4a", marginBottom: 14, letterSpacing: 1 }}>
            {letter.date}
          </div>
          {lines.map((line, i) => {
            const slot = onPaper[i];
            return (
              <React.Fragment key={i}>
                <div style={{ ...reveal(0.1 + i * 0.15), minHeight: line === "" ? 16 : "auto" }}>
                  {line || "\u00A0"}
                </div>
                {slot && (
                  <PaperSlot
                    slot={slot} kind={kind} colW={colW} wax={letter.wax} date={letter.date}
                    captions={captions} show={phase >= 3} delay={0.25 + i * 0.15} onPick={setLb}
                  />
                )}
              </React.Fragment>
            );
          })}
          <div style={{ clear: "both" }} />
        </div>
      </div>

      {place === "envelope" && photos.length > 0 && (
        <EnvelopePile photos={photos} kind={kind} wax={letter.wax} date={letter.date} open={phase >= 1} onPick={setLb} />
      )}

      {phase >= 2 && (
        <button onClick={onClose} style={{
          position: "absolute", top: -16, right: -16,
          width: 36, height: 36, borderRadius: 18, border: "none",
          background: "#2a1a14", color: "#fff3e6", fontSize: 20, lineHeight: 1,
          cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          display: "grid", placeItems: "center",
          opacity: 0, animation: "fadeIn 0.4s 0.2s forwards", zIndex: 10
        }}>×</button>
      )}

      {lb !== null && (
        <Lightbox
          photos={photos} start={lb} kind={kind} wax={letter.wax} date={letter.date}
          caption={captions} onClose={() => setLb(null)}
        />
      )}
    </div>
  );
}

/** One spot between paragraphs holding one or more photos. It stays
 *  invisible (but already takes its space, so the text never jumps)
 *  until its photos are decoded, then settles onto the paper. */
function instantTilt(kind, p, k) {
  const r = seeded(p.src + "tilt")();
  const sign = k % 2 ? 1 : -1;
  const mag = kind === "candid" ? 3 + r * 3.5 : kind === "kept" ? 1 + r : 0.4 + r * 0.5;
  return sign * mag * (isPhone() && kind === "candid" ? 0.6 : 1);
}

function PaperSlot({ slot, kind, colW, wax, date, captions, show, delay, onPick }) {
  const ready = usePhotosReady(slot.photos);
  const on = show && ready;
  const many = slot.photos.length > 1;
  const side = slot.k % 2 ? "right" : "left";
  const instant = INSTANT.has(kind);
  // a pair of A or B prints overlaps and shares one strip of tape
  const shared = instant && kind !== "placed" && slot.photos.length === 2;
  let cls = many ? "many" : "single " + side;
  if (instant && many) cls += " overlap";
  if (kind === "candid" && !many) cls += " hang";
  if (kind === "placed" && !many && !isPhone()) cls = "float-" + side;
  if (instant) {
    return (
      <div
        className={"pl-slot " + cls}
        style={{
          whiteSpace: "normal",
          opacity: on ? 1 : 0,
          transform: on ? "translateY(0) scale(1)" : "translateY(-10px) scale(1.035)",
          transition: `opacity .55s ${delay}s, transform .8s cubic-bezier(.2,.8,.2,1) ${delay}s`,
        }}
      >
        {slot.photos.map((p, j) => (
          <PhotoPrint
            key={p.src} p={p} kind={kind} w={paperWidth(kind, p, many, colW)}
            tilt={instantTilt(kind, p, slot.k + j)} wax={wax} date={date} caption={captions}
            loose={shared} develop={kind === "candid" ? on : undefined}
            onClick={() => onPick(slot.first + j)}
          />
        ))}
        {shared && (
          <Tape
            w={colW} rnd={seeded(slot.photos[0].src + "shared")}
            tp={kind === "kept"
              ? { x: 0.47, y: 0.02, len: 0.34, th: 0.085, rot: -3, cls: "tape-clear", torn: false }
              : { x: 0.47, y: 0.04, len: 0.3, th: 0.08, rot: -7, t: mixWithWhite(wax, 0.5, 1), cls: "tape-washi", torn: true }}
          />
        )}
      </div>
    );
  }
  return (
    <div
      className={"pl-slot " + cls}
      style={{
        whiteSpace: "normal",
        opacity: on ? 1 : 0,
        transform: on ? "translateY(0) scale(1)" : "translateY(-10px) scale(1.035)",
        transition: `opacity .55s ${delay}s, transform .8s cubic-bezier(.2,.8,.2,1) ${delay}s`,
      }}
    >
      {slot.photos.map((p, j) => {
        const tilt = kind === "postcard" ? (slot.k + j) % 2 ? 1.6 : -1.8 : (slot.k + j) % 2 ? 2.8 : -3.2;
        return (
          <PhotoPrint
            key={p.src} p={p} kind={kind} w={paperWidth(kind, p, many, colW)}
            tilt={tilt} wax={wax} date={date} caption={captions}
            onClick={() => onPick(slot.first + j)}
          />
        );
      })}
    </div>
  );
}

// the real reader in deck.jsx draws <window.Letter>, so this swaps in the copy above
window.Letter = LabLetter;

/* ---------------- url state ---------------- */

// embed=1 is the copy of the lab running inside the phone frame
const DEFAULTS = { kind: "polaroid", place: "paper", n: "3", cap: "1", frame: "full", bar: "1", embed: "0", open: "0" };
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

function Seg({ value, options, onChange, disabled }) {
  return (
    <div className="seg" style={disabled ? { opacity: 0.35, pointerEvents: "none" } : null}>
      {options.map(([v, label]) => (
        <button key={v} data-on={v === value ? "1" : "0"} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

/* real photos from this computer: kept as in-memory links, never uploaded */
function loadOwn(files) {
  return Promise.all([...files].map((f, i) => new Promise((resolve) => {
    const src = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => resolve({ src, w: im.naturalWidth, h: im.naturalHeight, caption: SAMPLES[i % SAMPLES.length].caption });
    im.onerror = () => resolve(null);   // e.g. an iPhone HEIC photo in Chrome
    im.src = src;
  }))).then((list) => list.filter(Boolean));
}

const LETTERS = window.LETTERS_DATA.letters
  .filter((l) => !l.unlockAt || Date.now() >= new Date(l.unlockAt).getTime())
  .slice()
  .reverse();

function Lab() {
  const [p, setP] = useState(readParams);
  const set = (k, v) => setP((prev) => { const next = { ...prev, [k]: v }; writeParams(next); return next; });
  const [openId, setOpenId] = useState(() => (p.open === "1" ? LETTERS[0].id : null));
  // the phone frame reads the photos chosen in the outer page
  const [own, setOwn] = useState(() => (p.embed === "1" && window.parent.__ownPhotos) || []);
  const fileRef = useRef(null);

  useEffect(() => {
    const onHash = () => setP(readParams());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => { window.__ownPhotos = own; }, [own]);

  const photos = own.length ? own : SAMPLES.slice(0, Number(p.n));
  useEffect(() => { photos.forEach((ph) => preloadPhoto(ph.src)); }, [photos.map((ph) => ph.src).join("|")]);
  const ctx = { kind: p.kind, place: p.place, photos, captions: p.cap === "1" };
  const open = LETTERS.find((l) => l.id === openId) || null;
  const frameSrc = `photo-lab.html#kind=${p.kind}&place=${p.place}&n=${p.n}&cap=${p.cap}&bar=0&embed=1&open=1`;

  return (
    <PhotoCtx.Provider value={ctx}>
      <div className="lab">
        {p.bar === "1" && (
          <div className="lab-bar">
            <div className="grp"><label>style</label>
              <Seg value={p.kind} onChange={(v) => set("kind", v)} options={KINDS} />
            </div>
            <div className="grp"><label>where</label>
              <Seg value={p.place} onChange={(v) => set("place", v)} options={[["paper", "on the paper"], ["envelope", "in the envelope"]]} />
            </div>
            <div className="grp"><label>photos</label>
              <Seg value={p.n} disabled={own.length > 0} onChange={(v) => set("n", v)} options={[["1", "1"], ["3", "3"], ["8", "8"]]} />
            </div>
            <div className="grp"><label>captions</label>
              <Seg value={p.cap} onChange={(v) => set("cap", v)} options={[["1", "on"], ["0", "off"]]} />
            </div>
            <div className="grp"><label>frame</label>
              <Seg value={p.frame} onChange={(v) => set("frame", v)} options={[["full", "fill"], ["phone", "phone"]]} />
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden
              onChange={(e) => loadOwn(e.target.files).then((list) => { if (list.length) setOwn(list); e.target.value = ""; })} />
            {own.length
              ? <button className="ghost-btn" onClick={() => setOwn([])}>back to sample photos</button>
              : <button className="ghost-btn" onClick={() => fileRef.current.click()}>use my photos…</button>}
            <button className="ghost-btn" onClick={() => set("bar", "0")}>hide this bar</button>
            <span className="lab-note">sandbox — photos never leave this browser</span>
          </div>
        )}
        {p.bar !== "1" && p.embed !== "1" && <button className="bar-peek" onClick={() => set("bar", "1")}>☰</button>}

        <div className="lab-stage">
          {p.frame === "phone" ? (
            /* A real 390px-wide window, so the reader shrinks to 80% and
               sizes itself exactly as it does on her phone. */
            <div className="stage is-phone">
              <iframe key={frameSrc + own.length} title="phone" src={frameSrc} />
            </div>
          ) : (
            <div className="stage is-full">
              <div className="stage-vignette" />
              {!open && <div className="inside-hint">tap a letter</div>}
              <window.LetterDeck
                letters={LETTERS}
                openLetter={open}
                onOpen={setOpenId}
                onClose={() => setOpenId(null)}
              />
            </div>
          )}
        </div>
      </div>
    </PhotoCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("lab")).render(<Lab />);
