/* Envelope stack inside the mailbox + envelope-opening / paper-unfold flow */

const { useState, useEffect, useRef } = React;

/* A single envelope. When opened, it pulls out of the fanned pile, grows
   slightly toward the viewer, then settles down into its reading spot —
   at which point the flap opens and the letter appears above it. */
const STACK_Y = 44;       // vertical offset of the fanned pile
const PULL_MS = 1700;     // lift out of the pile, slight grow toward viewer
const SETTLE_MS = 1300;   // shrink back down into the reading slot
// SETTLE_Y/SETTLE_SCALE aren't arbitrary: the read-phase layout below centers
// a flex column of [Letter (200px tall at the moment it mounts) + 18px gap +
// small envelope (154px)] — solving for the envelope's center in that block
// gives screen-center + 109px, and 240/360 is exactly the small envelope's
// width ratio. So settle's end position lands pixel-for-pixel where the
// flex layout is about to put the envelope, and the handoff to the read
// phase's JSX below can happen with no visual jump.
const SETTLE_Y = 109;
const SETTLE_SCALE = 240 / 360;

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

  if (phase === "read") {
    // when open: render envelope + paper as a flex pair, centered
    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          maxHeight: "92vh",
          pointerEvents: "auto"
        }}
      >
        <Letter letter={letter} onClose={onClose} />
        <div style={{
          width: 240, height: 154,
          filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.4))",
          perspective: 800,
          transformStyle: "preserve-3d"
        }}>
          <EnvelopeSVG letter={letter} isOpen={true} small />
        </div>
      </div>
    );
  }

  let transform, transition;
  if (phase === "stack") {
    transform = `translate(${fan * 3}px, ${idx * 4 + STACK_Y}px) rotate(${fan}deg) scale(1)`;
    transition = "transform 0.6s cubic-bezier(.4,1.4,.5,1)";
  } else if (phase === "lift") {
    // pulled up and toward the viewer, growing slightly
    transform = "translate(0px, -40px) rotate(0deg) scale(1.08)";
    transition = `transform ${PULL_MS}ms cubic-bezier(.22,.85,.32,1.12)`;
  } else {
    // settle: shrinks down into the exact spot the read-phase layout expects
    transform = `translate(0px, ${SETTLE_Y}px) rotate(0deg) scale(${SETTLE_SCALE})`;
    transition = `transform ${SETTLE_MS}ms cubic-bezier(.4,0,.2,1)`;
  }

  const svgIsOpen = phase === "settle";
  const clickable = phase === "stack";

  return (
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
        perspective: 1000,
        transformStyle: "preserve-3d"
      }}
    >
      <EnvelopeSVG letter={letter} isOpen={svgIsOpen} />
    </div>
  );
}

function EnvelopeSVG({ letter, isOpen, small = false }) {
  const c = letter.envelopeColor;
  const dark = shade(c, -25);
  const lite = shade(c, 8);
  const wax = letter.wax;
  const waxHi = shade(wax, 34);
  const waxDark = shade(wax, -30);
  const waxDeep = shade(wax, -52);
  const w = small ? 240 : 360;
  const h = small ? 154 : 230;
  const k = `${letter.id}${small ? "s" : ""}`;

  return (
    <svg viewBox="0 0 360 230" width={w} height={h}
         style={{
           display: "block",
           overflow: "visible",
           perspective: small ? 800 : 1000,
           transformStyle: "preserve-3d"
         }}>
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
        {/* wax seal: lit from the top-left; its shadow is a soft gradient rather
            than an SVG filter, because the seal rides on the flap's 3D rotation
            and WebKit renders filters inside 3D-transformed content unreliably */}
        <radialGradient id={`seal-${k}`} cx="0.34" cy="0.28" r="0.85">
          <stop offset="0%" stopColor={waxHi} />
          <stop offset="50%" stopColor={wax} />
          <stop offset="100%" stopColor={waxDark} />
        </radialGradient>
        <radialGradient id={`seal-shadow-${k}`}>
          <stop offset="0%" stopColor="#24100a" stopOpacity="0.5" />
          <stop offset="78%" stopColor="#24100a" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#24100a" stopOpacity="0" />
        </radialGradient>
        {/* engraved stamp: fine vertical hatching in the wax colour */}
        <pattern id={`stamp-hatch-${k}`} patternUnits="userSpaceOnUse" width="2.2" height="2.2">
          <rect x="0" y="0" width="2.2" height="2.2" fill={shade(wax, 100)} />
          <line x1="0.5" y1="0" x2="0.5" y2="2.2" stroke={wax} strokeWidth="0.55" opacity="0.5" />
        </pattern>
        <filter id={`stamp-shadow-${k}`} x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0.5" dy="1.8" stdDeviation="1.5" floodColor="#2a140c" floodOpacity="0.38" />
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

      {/* the address area when closed — fades out rather than popping instantly,
          so it doesn't go blank before the flap's rotation becomes visible */}
      <g style={{
        fontFamily: "Caveat, cursive",
        opacity: isOpen ? 0 : 1,
        transition: "opacity 0.3s ease"
      }}>
        {/* sits below the wax seal so the seal never covers it */}
        <line x1="120" y1="154" x2="280" y2="154" stroke={dark} strokeWidth="0.6" opacity="0.4" />
        <line x1="120" y1="174" x2="260" y2="174" stroke={dark} strokeWidth="0.6" opacity="0.4" />
        <line x1="120" y1="193" x2="270" y2="193" stroke={dark} strokeWidth="0.6" opacity="0.4" />
        <text x="120" y="152" fill={dark} fontSize="22">For my love</text>
        <text x="120" y="172" fill={dark} fontSize="16" opacity="0.7">— {letter.title}</text>
        <text x="120" y="191" fill={dark} fontSize="13" opacity="0.55">{letter.date}</text>
      </g>

      {/* flap — uses CSS 3D, parent has perspective */}
      <g style={{
        transformOrigin: "180px 0px",
        transform: isOpen ? "rotateX(165deg) translateY(-1px)" : "rotateX(0deg)",
        transition: "transform 1.0s cubic-bezier(.5,1.1,.4,1)"
      }}>
        <path d="M 0 0 L 180 110 L 360 0 Z"
              fill={shade(c, -5)} stroke={dark} strokeWidth="1.5" />
        <path d="M 0 0 L 180 110 L 360 0"
              fill="none" stroke={dark} strokeWidth="0.6" opacity="0.4" />
        {/* wax seal — a raised, hand-poured blob with a heart pressed in.
            Fades out with the address rather than popping instantly */}
        <g style={{ opacity: isOpen ? 0 : 1, transition: "opacity 0.3s ease" }}>
          <ellipse cx="181" cy="110.5" rx="28" ry="27.5" fill={`url(#seal-shadow-${k})`} />
          {/* the wax's thickness, then its top */}
          <path d="M 180 84.5 C 191 83.5, 203 90.5, 205 101.5 C 207 111.5, 202 123.5, 191 129.5 C 181 134.5, 167 133.5, 159 125.5 C 151 117.5, 152 103.5, 157 95.5 C 162 87.5, 170 85.5, 180 84.5 Z"
                fill={waxDeep} />
          <path d="M 180 82 C 191 81, 203 88, 205 99 C 207 109, 202 121, 191 127 C 181 132, 167 131, 159 123 C 151 115, 152 101, 157 93 C 162 85, 170 83, 180 82 Z"
                fill={`url(#seal-${k})`} />
          {/* pressed-in ring and heart: dark edge above, light edge below */}
          <circle cx="180" cy="105.4" r="16" fill="none" stroke={waxDeep} strokeWidth="1.4" opacity="0.6" />
          <circle cx="180" cy="106.8" r="16" fill="none" stroke={waxHi} strokeWidth="0.9" opacity="0.55" />
          <path d="M 180 115.8 C 172 109.8, 170 103.8, 174 100.8 C 177 98.8, 180 100.8, 180 103.8 C 180 100.8, 183 98.8, 186 100.8 C 190 103.8, 188 109.8, 180 115.8 Z"
                fill={waxHi} opacity="0.6" />
          <path d="M 180 115 C 172 109, 170 103, 174 100 C 177 98, 180 100, 180 103 C 180 100, 183 98, 186 100 C 190 103, 188 109, 180 115 Z"
                fill={waxDeep} opacity="0.65" />
          <path d="M 163 96 C 166 89, 173 86, 180 86" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
          <circle cx="167" cy="92" r="1.4" fill="#ffffff" opacity="0.5" />
        </g>
      </g>

      {/* engraved stamp — stuck on top of the flap, fades with the address */}
      <g transform="translate(276, 14)" filter={`url(#stamp-shadow-${k})`}
         style={{ opacity: isOpen ? 0 : 1, transition: "opacity 0.3s ease" }}>
        <rect x="0" y="0" width="62" height="46" fill="#fbf5ec" />
        {/* perforated edge: round dots in the flap colour bite into the paper */}
        <rect x="0" y="0" width="62" height="46" fill="none" stroke={shade(c, -5)} strokeWidth="4.6"
              strokeDasharray="0 5.8" strokeLinecap="round" />
        <rect x="4.5" y="4.5" width="53" height="37" fill={`url(#stamp-hatch-${k})`} stroke={waxDark} strokeWidth="0.6" />
        <rect x="6.5" y="6.5" width="49" height="33" fill="none" stroke={waxDark} strokeWidth="0.3" opacity="0.8" />
        <circle cx="31" cy="20" r="12.6" fill="#fbf5ec" stroke={waxDark} strokeWidth="0.8" />
        <circle cx="31" cy="20" r="11" fill="none" stroke={wax} strokeWidth="0.35" />
        <path d="M 31 27.4 C 24 21.9, 22.5 16.4, 26.3 14 C 28.6 12.6, 31 14, 31 16.4 C 31 14, 33.4 12.6, 35.7 14 C 39.5 16.4, 38 21.9, 31 27.4 Z"
              fill={wax} />
        <path d="M 26.5 16.4 C 26.8 15, 28 14.4, 29 14.6" fill="none" stroke="#ffffff" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
        <g fill={waxDark} fontSize="6" fontWeight="700" textAnchor="middle" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          <text x="10" y="13">1</text>
          <text x="52" y="13">1</text>
        </g>
        {/* ribbon banner with folded ends */}
        <path d="M 13 32.5 L 7.5 34 L 10 36.25 L 7.5 38.5 L 13 40 Z" fill={waxDeep} />
        <path d="M 49 32.5 L 54.5 34 L 52 36.25 L 54.5 38.5 L 49 40 Z" fill={waxDeep} />
        <rect x="12" y="31.5" width="38" height="7.5" fill={waxDark} />
        <text x="31" y="36.9" textAnchor="middle" fontSize="4.6" letterSpacing="0.9" fill="#fbf5ec"
              style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}>С ЛЮБОВ</text>
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
      width: "min(440px, 88vw)",
      height: phase >= 2 ? "min(580px, 70vh)" : 200,
      transition: "height 0.85s cubic-bezier(.5,1.1,.4,1)",
      opacity: phase >= 1 ? 1 : 0,
      transform: phase >= 1 ? "scale(1)" : "scale(0.7)",
      transitionProperty: "height, opacity, transform",
      transitionDuration: "0.85s, 0.5s, 0.6s",
      transitionTimingFunction: "cubic-bezier(.5,1.1,.4,1)",
      boxShadow: "0 30px 60px rgba(0,0,0,0.45)"
    }}>
      {/* paper sheet */}
      <div style={{
        position: "absolute", inset: 0,
        background: `
          repeating-linear-gradient(0deg, transparent 0, transparent 31px, rgba(120,90,60,0.16) 31px, rgba(120,90,60,0.16) 32px),
          linear-gradient(180deg, #fdf6e9 0%, #f6e9d2 100%)
        `,
        borderRadius: 4,
        boxShadow: "inset 0 0 60px rgba(180,140,90,0.18)"
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
          inset: "44px 48px",
          fontFamily: "Caveat, cursive",
          fontSize: 22,
          lineHeight: "32px",
          color: "#3a2820",
          opacity: phase >= 3 ? 1 : 0,
          transition: "opacity 0.5s",
          whiteSpace: "pre-wrap",
          overflowY: "auto"
        }}>
          <div style={{ fontFamily: "Caveat, cursive", fontSize: 14, color: "#7a5a4a", marginBottom: 14, letterSpacing: 1 }}>
            {letter.date}
          </div>
          {lines.map((line, i) => (
            <div key={i} style={{
              opacity: phase >= 3 ? 1 : 0,
              transform: phase >= 3 ? "translateY(0)" : "translateY(6px)",
              transition: `opacity 0.5s ${0.1 + i * 0.15}s, transform 0.5s ${0.1 + i * 0.15}s`,
              minHeight: line === "" ? 16 : "auto"
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
          top: -16, right: -16,
          width: 36, height: 36, borderRadius: 18,
          border: "none",
          background: "#2a1a14",
          color: "#fff3e6",
          fontSize: 20,
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
window.shade = shade;

/* Used by deck.jsx (the letter picker on the site) and by picker-lab.html,
   so both show the real envelope art and the real letter unfold rather than
   a copy that would drift. */
window.EnvelopeSVG = EnvelopeSVG;
window.Letter = Letter;
