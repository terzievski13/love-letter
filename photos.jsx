/* Photos in a letter: polaroids taped onto the paper between paragraphs,
   and the full-screen viewer when one is tapped. The look was chosen in
   Oct 2026 ("A · Taped in", refined in Claude Design from the first-try
   polaroid in photo-lab.html); its CSS is the "photos in a letter" block in
   index.html. Letter (envelope.jsx) only calls in here when a letter has
   photos, so letters without them render exactly as before.

   A letter's photos:  "photos": [{ "src": "https://…", "caption": "…",
                                    "pos": "62% 50%" }, …]
   caption and pos are optional; pos shifts the square crop (object-position).
   Where each one goes is a marker in the body - see layoutPhotos below. */

const { useState: usePS, useEffect: usePE, useRef: usePR } = React;

const photoPhone = () => window.matchMedia("(max-width: 720px)").matches;

/** The letter's usable photos, or [] - tolerant of a hand-edited letter getting it wrong. */
function letterPhotos(letter) {
  const list = letter && Array.isArray(letter.photos) ? letter.photos : [];
  return list.filter((p) => p && typeof p.src === "string" && p.src);
}

/* ---------------- loading ---------------- */

/* Photos are fetched and decoded before they're shown, so they're already
   there when the paper unfolds instead of popping in a moment later. Each
   src is fetched once; later calls get the same promise. */
const photoCache = new Map();
function preloadPhoto(src) {
  if (!photoCache.has(src)) {
    const im = new Image();
    im.src = src;
    photoCache.set(src, (im.decode ? im.decode() : Promise.resolve()).catch(() => {}).then(() => im));
  }
  return photoCache.get(src);
}

/** Called by the deck for the centred letter and its neighbours. */
function preloadLetterPhotos(letter) {
  letterPhotos(letter).forEach((p) => preloadPhoto(p.src));
}

const PHOTO_PATIENCE = 8000; // on a very slow connection, show the frame anyway

/** true once every photo in the list is downloaded and decoded. */
function usePhotosReady(photos) {
  const key = photos.map((p) => p.src).join("|");
  const [ready, setReady] = usePS(false);
  usePE(() => {
    let live = true;
    const t = setTimeout(() => { if (live) setReady(true); }, PHOTO_PATIENCE);
    Promise.all(photos.map((p) => preloadPhoto(p.src))).then(() => { if (live) setReady(true); });
    return () => { live = false; clearTimeout(t); };
  }, [key]);
  return ready;
}

/* ---------------- one print ---------------- */

/** Deterministic "random" in [0,1) from a photo's index, so a photo looks
 *  the same on every visit. */
function photoSeeded(n, salt) {
  const x = Math.sin((n + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const photoLerp = (a, b, t) => a + (b - a) * t;

/** Small, unequal differences per print: tilt, caption angle, where the
 *  tape sits (always near the centre), its angle and length. */
function polaroidVars(i) {
  const side = i % 2 === 0 ? -1 : 1; // alternate the lean, like the left/right slots
  return {
    figure: {
      "--tilt": (side * photoLerp(1.6, 3.2, photoSeeded(i, 1))).toFixed(1) + "deg",
      "--cr": photoLerp(-2, 0.5, photoSeeded(i, 2)).toFixed(1) + "deg",
    },
    tape: {
      "--tx": photoLerp(47, 53, photoSeeded(i, 3)).toFixed(1) + "%",
      "--tr": photoLerp(-4.5, 3.5, photoSeeded(i, 4)).toFixed(1) + "deg",
      "--tl": photoLerp(0.34, 0.4, photoSeeded(i, 5)).toFixed(2),
    },
  };
}

/** A caption longer than the chin holds is written a little smaller
 *  rather than cut off. */
function captionStyle(text) {
  const n = [...text].length;
  if (n <= 16) return undefined;
  return { fontSize: `calc(var(--w) * ${(0.094 * Math.max(0.68, 16 / n)).toFixed(4)})` };
}

function Polaroid({ photo, i, w, flat, onClick }) {
  const v = polaroidVars(i);
  const cap = (photo.caption || "").trim();
  return (
    <div className="pl-item" style={{ "--w": w + "px" }}>
      <figure className="pp" style={flat ? { ...v.figure, "--tilt": "-0.8deg" } : v.figure} onClick={onClick}>
        <span className="pp-tape" style={v.tape} />
        <div className="pp-img">
          <img src={photo.src} alt="" draggable={false}
               style={photo.pos ? { objectPosition: photo.pos } : undefined} />
        </div>
        <figcaption className="pp-cap" style={captionStyle(cap)}>{cap}</figcaption>
      </figure>
    </div>
  );
}

/* ---------------- where they go on the paper ---------------- */

/* A photo is placed by a marker in the letter's text: "[📷 2]" puts the
   second photo right there. The writing tool inserts these at the cursor;
   "[снимка 2]" and "[photo 2]" work too, for a letter written by hand.
   Two markers on one line make an overlapping pair. */
const PHOTO_MARK = /\[\s*(?:📷|снимка|photo)\s*(\d+)\s*\]/giu;

/** Lays the photos out along the letter's lines. Returns
 *    text:  what each line shows - markers taken out, and null for a line
 *           that was only markers (it isn't drawn at all)
 *    at:    line index -> the groups of photos (one, or a pair) right after it
 *  Photos with a marker go where it is. Any without one are spread evenly
 *  over the gaps between paragraphs (never after the signature). */
function layoutPhotos(lines, photos) {
  const n = photos.length;
  const at = {};
  const placed = new Set();
  const put = (line, idx) => {
    for (let j = 0; j < idx.length; j += 2) (at[line] = at[line] || []).push({ idx: idx.slice(j, j + 2) });
  };

  const text = lines.map((line, i) => {
    const marks = [...line.matchAll(PHOTO_MARK)];
    if (!marks.length) return line;
    const idx = marks.map((m) => Number(m[1]) - 1).filter((p) => p >= 0 && p < n && !placed.has(p));
    idx.forEach((p) => placed.add(p));
    put(i, idx);
    const rest = line.replace(PHOTO_MARK, "").trim();
    return rest || null;
  });

  const loose = photos.map((_, p) => p).filter((p) => !placed.has(p));
  if (loose.length) {
    const ends = [];
    text.forEach((l, i) => {
      if (l && l.trim() && (i + 1 === text.length || !(text[i + 1] || "").trim())) ends.push(i);
    });
    const gaps = ends.length > 1 ? ends.slice(0, -1) : ends.length ? ends : [lines.length - 1];
    const slots = Math.min(loose.length, gaps.length);
    for (let s = 0; s < slots; s++) {
      const line = gaps[Math.min(gaps.length - 1, Math.floor(((s + 0.5) * gaps.length) / slots))];
      put(line, loose.slice(Math.floor((s * loose.length) / slots), Math.floor(((s + 1) * loose.length) / slots)));
    }
  }

  // number the groups top to bottom, so single prints keep alternating left and right
  let k = 0;
  Object.keys(at).map(Number).sort((a, b) => a - b).forEach((line) => {
    at[line].forEach((g) => { g.k = k++; g.photos = g.idx.map((p) => photos[p]); });
  });
  return { text, at };
}

/** One spot between paragraphs holding one photo or a pair. It already
 *  takes its space (so the text never jumps) but stays invisible until its
 *  photos are decoded, then settles onto the paper. */
function PhotoSlot({ group, colW, show, delay, onPick }) {
  const ready = usePhotosReady(group.photos);
  const on = show && ready;
  const many = group.photos.length > 1;
  const phone = photoPhone();
  // laptop: 241px alone, 172px in a pair; phone: 200px alone, so the caption
  // is still ~14px on screen once the letter is shown at 80%
  const w = Math.round(many ? colW * (phone ? 0.54 : 0.5) : phone ? Math.min(200, colW * 0.81) : colW * 0.7);
  return (
    <div
      className={"pl-slot " + (many ? "many" : group.k % 2 ? "right" : "left")}
      style={{
        whiteSpace: "normal",
        opacity: on ? 1 : 0,
        transform: on ? "translateY(0) scale(1)" : "translateY(-10px) scale(1.035)",
        transition: `opacity .55s ${delay}s, transform .8s cubic-bezier(.2,.8,.2,1) ${delay}s`,
      }}
    >
      {group.photos.map((p, j) => (
        <Polaroid key={j} photo={p} i={group.idx[j]} w={w} onClick={() => onPick(group.idx[j])} />
      ))}
    </div>
  );
}

/* ---------------- tapped open ---------------- */

/* Drawn straight into <body>: on phones the reader is shrunk to 80%, and the
   viewer should fill the real screen. Keys are caught first, so Escape closes
   the photo but not the letter under it. Swipe or arrows for the next one;
   a tap anywhere else closes it. */
function PhotoViewer({ photos, start, wax, onClose }) {
  const [i, setI] = usePS(start);
  const down = usePR(null);
  const last = photos.length - 1;

  usePE(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") setI((v) => Math.max(0, v - 1));
      else if (e.key === "ArrowRight") setI((v) => Math.min(last, v + 1));
      else return;
      e.stopPropagation();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [last, onClose]);

  // a polaroid is 1.218 times as tall as it is wide
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.round(Math.min(vw * 0.86, 560, (vh * 0.76) / 1.218));

  return ReactDOM.createPortal(
    <div
      className="photo-viewer"
      style={{ "--wax": wax }}
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={(e) => {
        const d = down.current; down.current = null;
        if (!d || e.target.closest("button")) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 45 && last > 0) setI((v) => Math.max(0, Math.min(last, v + (dx < 0 ? 1 : -1))));
        else if (Math.abs(dx) < 10 && Math.abs(e.clientY - d.y) < 10) onClose();
      }}
    >
      <div className="pv-photo" key={i}>
        <Polaroid photo={photos[i]} i={i} w={w} flat />
      </div>
      <button className="pv-close" aria-label="close" onClick={onClose}>×</button>
      {last > 0 && (
        <>
          <button className="pv-arrow" style={{ left: 18 }} disabled={i === 0} onClick={() => setI(i - 1)}>←</button>
          <button className="pv-arrow" style={{ right: 18 }} disabled={i === last} onClick={() => setI(i + 1)}>→</button>
          <div className="pv-count">{i + 1} / {photos.length}</div>
        </>
      )}
    </div>,
    document.body
  );
}

window.letterPhotos = letterPhotos;
window.preloadLetterPhotos = preloadLetterPhotos;
window.layoutPhotos = layoutPhotos;
window.PHOTO_MARK = PHOTO_MARK;
window.PhotoSlot = PhotoSlot;
window.PhotoViewer = PhotoViewer;
window.Polaroid = Polaroid;
