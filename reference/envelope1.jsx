/* Envelope stack inside the mailbox + envelope-opening / paper-unfold flow */

const { useState, useEffect, useRef } = React;

/* A single envelope. When opened, the flap rotates up and a paper letter
   appears next to the envelope and unfolds. */
const PULL_MS = 850;      // lift out of the pile, grow toward viewer
const SETTLE_MS = 650;     // shrink back down into the reading slot
const READ_FADE_MS = 380;  // letter text fades in once the envelope has settled
const STACK_Y = 44;        // keeps the fanned pile visually where it was before the anchor change
// The settle position is exact, not a guess: it's where the envelope will stay
// permanently once open, with the letter positioned directly above it (see below).
// This is the SAME envelope element throughout — it never swaps for a lookalike,
// so there's nothing to pop or cross-fade.
const SETTLE_Y = 109;
const SETTLE_SCALE = 240 / 360;
// The paper's BOTTOM stays fixed at this point, right at the envelope's own
// top edge (settled envelope is 230*0.667=153px tall, centered at +109, so its
// top edge sits at 109-76.5=32.5px below center) — with a small deliberate
// overlap so the paper looks tucked into the envelope's mouth instead of
// floating above it. It only grows UPWARD from there, never covering the
// flap/seal below.
const PAPER_BOTTOM_Y = -55;

function Envelope({ letter, idx, total, onClick, isOpen, onClose }) {
  const fan = (idx - (total - 1) / 2) * 6; // degrees
  // phase machine: stack -> lift -> settle -> read
  const [phase, setPhase] = useState("stack");

  useEffect(() => {
    if (isOpen) {
      setPhase("lift");
      const t1 = setTimeout(() => setPhase("settle"), PULL_MS);
      const t2 = setTimeout(() => setPhase("read"), PULL_MS + SETTLE_MS);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
    setPhase("stack");
  }, [isOpen]);

  let transform, transition;
  if (phase === "stack") {
    transform = `translate(${fan * 3}px, ${idx * 4 + STACK_Y}px) rotate(${fan}deg) scale(1)`;
    transition = "transform 0.6s cubic-bezier(.4,1.4,.5,1)";
  } else if (phase === "lift") {
    // pulled up and toward the viewer, growing large
    transform = "translate(0px, -110px) rotate(0deg) scale(1.22)";
    transition = `transform ${PULL_MS}ms cubic-bezier(.22,.85,.32,1.12)`;
  } else {
    // settle & read share the same final transform — the envelope arrives here
    // once and simply stays, so there's no second swap/pop later.
    transform = `translate(0px, ${SETTLE_Y}px) rotate(0deg) scale(${SETTLE_SCALE})`;
    transition = `transform ${SETTLE_MS}ms cubic-bezier(.4,0,.2,1)`;
  }

  const svgIsOpen = phase === "settle" || phase === "read";
  const clickable = phase === "stack";

  return (
    <>
      <div
        onClick={clickable ? onClick : undefined}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: 360,
          height: 230,
          marginLeft: -180,
          marginTop: -115,
          transform,
          transition,
          cursor: clickable ? "pointer" : "default",
          zIndex: clickable ? 10 + idx : 90,
          filter: clickable
            ? "drop-shadow(0 6px 12px rgba(0,0,0,0.25))"
            : "drop-shadow(0 24px 36px rgba(0,0,0,0.4))",
          perspective: 1000
        }}
      >
        <EnvelopeSVG letter={letter} isOpen={svgIsOpen} />
      </div>

      {phase === "read" && (
        <div style={{
          position: "absolute",
          left: "50%",
          top: `calc(50% + ${PAPER_BOTTOM_Y}px)`,
          transform: "translate(-50%, -100%)",
          zIndex: 100,
          opacity: 0,
          animation: `fadeIn ${READ_FADE_MS}ms ease forwards`,
          pointerEvents: "auto"
        }}>
          <Letter letter={letter} onClose={onClose} />
        </div>
      )}
    </>
  );
}

function EnvelopeSVG({ letter, isOpen, small = false }) {
  const c = letter.envelopeColor;
  const dark = shade(c, -25);
  const lite = shade(c, 8);
  const wax = letter.wax;
  const w = small ? 240 : 360;
  const h = small ? 154 : 230;

  return (
    <svg viewBox="0 0 360 230" width={w} height={h}
         style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`env-grad-${letter.id}${small ? "s" : ""}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={lite} />
          <stop offset="100%" stopColor={shade(c, -8)} />
        </linearGradient>
        {/* very subtle paper noise via filter */}
        <filter id={`noise-${letter.id}${small ? "s" : ""}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={letter.id % 9} />
          <feColorMatrix values="0 0 0 0 0.4   0 0 0 0 0.3   0 0 0 0 0.2   0 0 0 0.08 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      {/* envelope body */}
      <rect x="0" y="0" width="360" height="230" rx="3" fill={`url(#env-grad-${letter.id}${small ? "s" : ""})`} stroke={dark} strokeWidth="1.5" />
      {/* subtle noise overlay */}
      <rect x="0" y="0" width="360" height="230" rx="3" filter={`url(#noise-${letter.id}${small ? "s" : ""})`} opacity="0.5" />

      {/* back V seams visible when flap is open */}
      {isOpen && (
        <>
          <path d="M 0 0 L 180 100 L 360 0" fill="none" stroke={dark} strokeWidth="1" opacity="0.3" />
          <path d="M 0 230 L 180 130 L 360 230" fill="none" stroke={dark} strokeWidth="1" opacity="0.3" />
        </>
      )}

      {/* the address area when closed */}
      {!isOpen && (
        <g style={{ fontFamily: "Caveat, cursive" }}>
          <line x1="120" y1="120" x2="280" y2="120" stroke={dark} strokeWidth="0.6" opacity="0.4" />
          <line x1="120" y1="140" x2="260" y2="140" stroke={dark} strokeWidth="0.6" opacity="0.4" />
          <line x1="120" y1="160" x2="270" y2="160" stroke={dark} strokeWidth="0.6" opacity="0.4" />
          <text x="120" y="118" fill={dark} fontSize="22">For my love</text>
          <text x="120" y="138" fill={dark} fontSize="16" opacity="0.7">— {letter.title}</text>
          <text x="120" y="158" fill={dark} fontSize="13" opacity="0.55">{letter.date}</text>
          {/* stamp */}
          <g>
            <rect x="290" y="14" width="50" height="60" fill={shade(c, 18)} stroke={dark} strokeWidth="0.8" strokeDasharray="2 2" />
            <circle cx="315" cy="44" r="14" fill={wax} opacity="0.85" />
            <text x="315" y="49" textAnchor="middle" fill="#fff3e6" fontSize="14" fontFamily="serif">♥</text>
          </g>
        </g>
      )}

      {/* flap — uses CSS 3D, parent has perspective */}
      <g style={{
        transformOrigin: "180px 0px",
        transformBox: "fill-box",
        transform: isOpen ? "rotateX(-155deg) translateY(-1px)" : "rotateX(0deg)",
        transition: "transform 1.0s cubic-bezier(.5,1.1,.4,1)"
      }}>
        <path d="M 0 0 L 180 110 L 360 0 Z"
              fill={shade(c, -5)} stroke={dark} strokeWidth="1.5" />
        <path d="M 0 0 L 180 110 L 360 0"
              fill="none" stroke={dark} strokeWidth="0.6" opacity="0.4" />
        {/* wax seal — only when closed */}
        {!isOpen && (
          <g transform="translate(180, 100)">
            <circle r="22" fill={wax} />
            <circle r="22" fill={shade(wax, 15)} opacity="0.5" />
            <circle r="18" fill="none" stroke={shade(wax, -25)} strokeWidth="1" opacity="0.6" />
            <text textAnchor="middle" y="6" fill={shade(wax, -40)} fontSize="20" fontFamily="serif" fontStyle="italic">L</text>
          </g>
        )}
      </g>
    </svg>
  );
}

/* Paper sheet that unfolds and reveals handwriting line-by-line */
function Letter({ letter, onClose }) {
  const [phase, setPhase] = useState(0); // 0 hidden, 1 visible+folded, 2 unfolded, 3 reading
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 100);
    const t2 = setTimeout(() => setPhase(2), 700);
    const t3 = setTimeout(() => setPhase(3), 1500);
    return () => { [t1, t2, t3].forEach(clearTimeout); };
  }, []);

  const lines = letter.body.split("\n");

  return (
    <div style={{
      position: "relative",
      width: "min(210px, 55vw)",
      height: phase >= 2 ? "min(360px, 52vh)" : 130,
      transition: "height 0.85s cubic-bezier(.5,1.1,.4,1)",
      opacity: phase >= 1 ? 1 : 0,
      transform: phase >= 1 ? "scale(1)" : "scale(0.7)",
      transitionProperty: "height, opacity, transform",
      transitionDuration: "0.85s, 0.5s, 0.6s",
      transitionTimingFunction: "cubic-bezier(.5,1.1,.4,1)",
      filter: "drop-shadow(0 20px 34px rgba(0,0,0,0.4))"
    }}>
      {/* paper sheet */}
      <div style={{
        position: "absolute", inset: 0,
        background: `
          repeating-linear-gradient(0deg, transparent 0, transparent 24px, rgba(120,90,60,0.16) 24px, rgba(120,90,60,0.16) 25px),
          linear-gradient(180deg, #fdf6e9 0%, #f6e9d2 100%)
        `,
        borderRadius: 3,
        boxShadow: "inset 0 0 40px rgba(180,140,90,0.18)"
      }}>
        {/* fold creases */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "33.33%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(120,90,60,0.4), transparent)",
          opacity: phase >= 2 ? 0.85 : 0,
          transition: "opacity 0.4s 0.2s"
        }}/>
        <div style={{
          position: "absolute", left: 0, right: 0, top: "66.66%", height: 1,
          background: "linear-gradient(90deg, transparent, rgba(120,90,60,0.4), transparent)",
          opacity: phase >= 2 ? 0.85 : 0,
          transition: "opacity 0.4s 0.2s"
        }}/>

        {/* handwritten text */}
        <div style={{
          position: "absolute",
          inset: "28px 26px",
          fontFamily: "Caveat, cursive",
          fontSize: 17,
          lineHeight: "24px",
          color: "#3a2820",
          opacity: phase >= 3 ? 1 : 0,
          transition: "opacity 0.5s",
          whiteSpace: "pre-wrap",
          overflowY: "auto"
        }}>
          <div style={{ fontFamily: "Caveat, cursive", fontSize: 12, color: "#7a5a4a", marginBottom: 10, letterSpacing: 1 }}>
            {letter.date}
          </div>
          {lines.map((line, i) => (
            <div key={i} style={{
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? "translateY(0)" : "translateY(6px)",
              transition: `opacity 0.5s ${0.1 + i * 0.15}s, transform 0.5s ${0.1 + i * 0.15}s`,
              minHeight: line === "" ? 12 : "auto"
            }}>
              {line || "\u00A0"}
            </div>
          ))}
        </div>
      </div>

      {/* close button */}
      {phase >= 2 && (
        <button onClick={onClose} style={{
          position: "absolute",
          top: -14, right: -14,
          width: 32, height: 32, borderRadius: 16,
          border: "none",
          background: "#2a1a14",
          color: "#fff3e6",
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          display: "grid",
          placeItems: "center",
          opacity: 0,
          animation: "fadeIn 0.4s 0.2s forwards",
          zIndex: 10
        }}>×</button>
      )}
    </div>
  );
}

/* tiny color shader */
function shade(hex, percent) {
  const num = parseInt(hex.replace("#", ""), 16);
  let r = (num >> 16) + percent;
  let g = ((num >> 8) & 0xff) + percent;
  let b = (num & 0xff) + percent;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return "#" + ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
}

window.Envelope = Envelope;
window.EnvelopeSVG = EnvelopeSVG;
window.shade = shade;
