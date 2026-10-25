/* Adding photos while writing a letter. Shared by your writing tool
   (writer.jsx, in English) and her writing screen (reply.jsx, in Bulgarian),
   so both work the same way:

   - a photo goes where a "[📷 2]" marker sits in the text; the letter lays
     it out (photos.jsx). The text box can't show pictures, so the marker
     stands in for one:
       "+ photo" puts it on its own line at the cursor
       a thumbnail's "move to cursor" moves it there
       "preview" opens the real letter
   - numbers always follow the order the photos appear in the text
   - each photo is shrunk on the phone, then uploaded through
     /api/letter-photo (your password or her word) to the Blob store

   Each screen keeps its own text and drafts; usePhotoEditor only looks
   after the photos, and the markers in that text. */

const { useState: usePES, useRef: usePER, useEffect: usePEE } = React;

const PHOTO_MAX_SIDE = 1600; // plenty for a phone screen; ~300-450 KB as JPEG
const PHOTO_QUALITY = 0.82;

// a fresh copy each time: the pattern is global, so a shared one keeps state between uses
const photoMarks = () => new RegExp(window.PHOTO_MARK.source, "giu");
const photoMark = (n) => `[📷 ${n}]`;
let photoSeq = 0;
const newPhotoId = () => "p" + Date.now().toString(36) + (photoSeq++);

/** Shrinks a photo from the phone to a JPEG at most 1600px on its long side.
 *  The browser turns it the right way up while decoding. */
function shrinkPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k);
      c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("shrink"))), "image/jpeg", PHOTO_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("open")); };
    img.src = url;
  });
}

/** POST to /api/letter-photo. auth is the whole Authorization header value. */
async function photoRequest(auth, body) {
  let res;
  try {
    res = await fetch("/api/letter-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, offline: true };
  }
  try { return await res.json(); } catch (e) { return { ok: false, error: `the server said ${res.status}` }; }
}

async function uploadPhoto(auth, blob) {
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("open"));
    r.readAsDataURL(blob);
  });
  const out = await photoRequest(auth, { action: "upload", data });
  if (!out.ok) throw new Error(out.offline ? "offline" : out.error || "upload");
  return out.url;
}

/** Puts text on its own line at the cursor, so a photo always sits between
 *  lines (the text after the cursor carries on below it). A cursor in the
 *  middle of a word, or just before its full stop, moves on to the end of it
 *  - a tap on a phone is rarely that precise. */
function placeOnOwnLine(body, at, text) {
  while (at < body.length && !/\s/.test(body[at]) && at > 0 && !/\s/.test(body[at - 1])) at++;
  const before = body.slice(0, at).replace(/[ \t]+$/, "");
  const after = body.slice(at).replace(/^[ \t]+/, "");
  const head = before + (before && !before.endsWith("\n") ? "\n" : "") + text;
  return { body: head + (after && !after.startsWith("\n") ? "\n" : "") + after, caret: head.length };
}

/** Rewrites every marker: to(n) is its new number, or 0 to take it out -
 *  and a line left empty by that goes too. */
function renumberMarks(body, to) {
  return body.split("\n").flatMap((line) => {
    if (!photoMarks().test(line)) return [line];
    const out = line.replace(photoMarks(), (m, d) => { const n = to(Number(d)); return n ? photoMark(n) : ""; });
    return out.trim() ? [out.replace(/[ \t]{2,}/g, " ")] : [];
  }).join("\n");
}

/** Numbers the photos in the order they appear in the text (ones without a
 *  marker after), so the numbers, the thumbnails and the swipe order in the
 *  letter all agree. Markers for photos that don't exist are dropped. */
function orderPhotos(body, photos) {
  const seen = [];
  for (const m of body.matchAll(photoMarks())) {
    const p = Number(m[1]) - 1;
    if (p >= 0 && p < photos.length && !seen.includes(p)) seen.push(p);
  }
  const order = [...seen, ...photos.map((_, i) => i).filter((i) => !seen.includes(i))];
  const num = {};
  order.forEach((old, k) => { num[old + 1] = k + 1; });
  return { body: renumberMarks(body, (n) => num[n] || 0), photos: order.map((i) => photos[i]) };
}

/** Which photo numbers have a marker in the text. */
function placedNumbers(body) {
  return new Set([...body.matchAll(photoMarks())].map((m) => Number(m[1])));
}

/* ---------------- the wording, for each screen ---------------- */

const PHOTO_COPY = {
  en: {
    caption: "caption",
    uploading: "uploading…",
    retry: "didn't upload — tap to retry",
    move: "move to cursor",
    place: "place at cursor",
    remove: "remove photo",
    loose: "no marker, so it goes between paragraphs",
    add: "+ photo",
    preview: "preview the letter",
    hint: "Tap in the letter where a photo belongs, then “+ photo” — a [📷 1] marker puts it right there. Two markers on one line sit side by side. Drag a thumbnail to choose what the square shows.",
    tapFirst: "Tap in the letter where it should go first.",
    back: "← back to writing",
    errors: { open: "couldn't open that photo", shrink: "couldn't shrink that photo", offline: "couldn't reach the server — are you online?" },
  },
  // hers, in your voice like the rest of her screen (HER_COPY in reply.jsx)
  bg: {
    caption: "надпис",
    uploading: "качвам…",
    retry: "не се качи — докосни пак",
    move: "премести тук",
    place: "сложи тук",
    remove: "махни снимката",
    loose: "без знак — ще е между абзаците",
    add: "+ снимка",
    preview: "виж писмото",
    hint: "Докосни в текста, където искаш снимка, и натисни „+ снимка“ — знакът [📷 1] я слага точно там. Два знака на един ред стоят една до друга. Плъзни снимката, за да избереш какво се вижда.",
    tapFirst: "Първо докосни в текста, където да е.",
    back: "← обратно към писането",
    errors: { open: "не мога да отворя тази снимка", shrink: "не мога да отворя тази снимка", offline: "няма връзка — опитай пак след малко", any: "снимката не се качи — опитай пак" },
  },
};

/* ---------------- the photos of one letter being written ---------------- */

/** The photos of the letter being written, kept in step with its text.
 *    initial  the photos it starts with ([{ src, caption, pos }])
 *    body, setBody  the letter text (the screen keeps it; markers live in it)
 *    auth     the Authorization header for /api/letter-photo
 *    copy     PHOTO_COPY.en or .bg */
function usePhotoEditor({ initial, body, setBody, auth, copy }) {
  const [photos, setPhotos] = usePES(() => (Array.isArray(initial) ? initial : [])
    .map((p) => ({ ...p, id: newPhotoId(), status: "ok" })));
  const [note, setNote] = usePES("");
  const caret = usePER(null);     // where the cursor was last in the text
  const files = usePER({});       // id -> the picked file, for a retry

  const patch = (id, change) => setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const say = (err) => copy.errors[err.message] || copy.errors.any || err.message;

  function send(id) {
    patch(id, { status: "uploading" });
    shrinkPhoto(files.current[id])
      .then((blob) => uploadPhoto(auth, blob))
      .then((src) => { delete files.current[id]; patch(id, { src, status: "ok" }); })
      .catch((err) => { patch(id, { status: "failed" }); setNote(say(err)); });
  }

  function add(fileList) {
    const picked = [...fileList];
    if (!picked.length) return;
    setNote("");
    const items = picked.map((f) => ({ id: newPhotoId(), src: "", local: URL.createObjectURL(f), caption: "", status: "uploading" }));
    items.forEach((it, j) => { files.current[it.id] = picked[j]; });
    let next = body;
    if (caret.current !== null) {
      // each on its own line at the cursor; joining two lines makes a pair
      const r = placeOnOwnLine(body, caret.current, items.map((_, j) => photoMark(photos.length + 1 + j)).join("\n"));
      next = r.body;
      caret.current = r.caret;
    }
    const o = orderPhotos(next, [...photos, ...items]);
    setBody(o.body);
    setPhotos(o.photos);
    items.forEach((it) => send(it.id));
  }

  function remove(id) {
    const n = photos.findIndex((p) => p.id === id) + 1;
    const gone = photos[n - 1];
    setBody(renumberMarks(body, (m) => (m === n ? 0 : m > n ? m - 1 : m)));
    setPhotos(photos.filter((p) => p.id !== id));
    // tidies the store; the server refuses while a sent letter still uses it
    // (those go when the edit is saved)
    if (gone && gone.src) photoRequest(auth, { action: "delete", url: gone.src });
  }

  function move(id) {
    if (caret.current === null) { setNote(copy.tapFirst); return; }
    setNote("");
    const n = photos.findIndex((p) => p.id === id) + 1;
    const HERE = "\u0000";
    const r = placeOnOwnLine(body, caret.current, HERE);
    const moved = renumberMarks(r.body, (m) => (m === n ? 0 : m)).replace(HERE, photoMark(n));
    caret.current = moved.indexOf(photoMark(n)) + photoMark(n).length;
    const o = orderPhotos(moved, photos);
    setBody(o.body);
    setPhotos(o.photos);
  }

  /** The text and photos as the letter should store them. With `peek`,
   *  photos still uploading are shown from the phone's own copy. */
  function forLetter(peek) {
    const o = orderPhotos(body, photos);
    return {
      body: o.body,
      photos: o.photos.filter((p) => p.src || (peek && p.local))
        .map((p) => ({ src: p.src || p.local, caption: p.caption, pos: p.pos })),
    };
  }

  return {
    photos, note, copy,
    uploading: photos.some((p) => p.status === "uploading"),
    failed: photos.some((p) => p.status === "failed"),
    // what a draft keeps: only uploaded photos (the address is what matters)
    kept: photos.filter((p) => p.status === "ok" && p.src).map(({ src, caption, pos }) => ({ src, caption, pos })),
    trackCaret: (e) => { caret.current = e.target.selectionStart; },
    add, remove, move, patch, retry: send, forLetter,
  };
}

/* ---------------- what it looks like ---------------- */

/** One photo: drag it to choose what the square shows. */
function PhotoTile({ photo, n, placed, copy, onChange, onRemove, onMove, onRetry }) {
  const [aspect, setAspect] = usePES(null);
  const drag = usePER(null);
  const pos = photo.pos || "50% 50%";
  const [px, py] = pos.split(" ").map(parseFloat);
  const clamp = (v) => Math.max(0, Math.min(100, v));

  function down(e) {
    if (!aspect || e.target.closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, px, py, size: e.currentTarget.clientWidth };
  }
  function move(e) {
    const d = drag.current;
    if (!d) return;
    // how far the photo sticks out past the square on each side
    const overX = d.size * Math.max(0, aspect - 1), overY = d.size * Math.max(0, 1 / aspect - 1);
    const x = overX ? clamp(d.px - ((e.clientX - d.x) / overX) * 100) : 50;
    const y = overY ? clamp(d.py - ((e.clientY - d.y) / overY) * 100) : 50;
    onChange({ pos: `${Math.round(x)}% ${Math.round(y)}%` });
  }
  const up = () => { drag.current = null; };

  return (
    <div className="pe-photo">
      <div className="pe-crop" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <img src={photo.local || photo.src} alt="" draggable={false} style={{ objectPosition: pos }}
             onLoad={(e) => setAspect(e.target.naturalWidth / e.target.naturalHeight)} />
        <span className="pe-n">{n}</span>
        {photo.status === "uploading" && <span className="pe-state">{copy.uploading}</span>}
        {photo.status === "failed" && <button type="button" className="pe-state" onClick={onRetry}>{copy.retry}</button>}
      </div>
      <input className="pe-cap" placeholder={copy.caption} maxLength={40}
             value={photo.caption || ""} onChange={(e) => onChange({ caption: e.target.value })} />
      <div className="pe-tools">
        <button type="button" className="pe-link" onClick={onMove}>{placed ? copy.move : copy.place}</button>
        <button type="button" className="pe-link pe-x" aria-label={copy.remove} onClick={onRemove}>×</button>
      </div>
      {!placed && <div className="pe-loose">{copy.loose}</div>}
    </div>
  );
}

/** The thumbnails, "+ photo", "preview" and the hint, under the letter text.
 *  variant "writer" or "composer" matches the screen's own type. */
function PhotoEditor({ ed, body, variant, onPreview }) {
  const { copy } = ed;
  const placed = placedNumbers(body);
  return (
    <div className={"pe pe-" + variant}>
      {ed.photos.length > 0 && (
        <div className="pe-grid">
          {ed.photos.map((p, i) => (
            <PhotoTile key={p.id} photo={p} n={i + 1} placed={placed.has(i + 1)} copy={copy}
                       onChange={(change) => ed.patch(p.id, change)}
                       onRemove={() => ed.remove(p.id)} onMove={() => ed.move(p.id)}
                       onRetry={() => ed.retry(p.id)} />
          ))}
        </div>
      )}
      <div className="pe-bar">
        <label className="pe-add">
          {copy.add}
          <input type="file" accept="image/*" multiple
                 onChange={(e) => { ed.add(e.target.files); e.target.value = ""; }} />
        </label>
        <button type="button" className="pe-link" disabled={!body.trim()} onClick={onPreview}>{copy.preview}</button>
      </div>
      {ed.note && <div className="pe-note">{ed.note}</div>}
      <div className="pe-hint">{copy.hint}</div>
    </div>
  );
}

/** The real letter, opened over the writing screen, exactly as it'll be read.
 *  Escape is caught first, so it closes only this (or the photo open in it). */
function LetterPeek({ letter, back, onClose }) {
  usePEE(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector(".photo-viewer")) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return ReactDOM.createPortal(
    <div className="reader letter-peek">
      <div className="reader-scrim" onClick={onClose} />
      <div className="reader-stage">
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}>
          <window.Letter letter={letter} onClose={onClose} />
        </div>
      </div>
      <button className="back-btn" onClick={onClose}>{back}</button>
    </div>,
    document.body
  );
}

window.PhotoEditing = { COPY: PHOTO_COPY, use: usePhotoEditor, Editor: PhotoEditor, Peek: LetterPeek };
