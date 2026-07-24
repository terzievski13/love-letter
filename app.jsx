/* Main app: 3D scene canvas underneath, React UI overlay on top.
   Stages: "outside" → "arriving" → "inside" → "reading"
   "arriving" = camera animating in; canvas stays visible, no overlay yet. */

const { useState: useS, useEffect: useE, useRef: useR } = React;

function App() {
  const [stage, setStage] = useS("outside"); // outside | arriving | inside | reading
  const [openLetterId, setOpenLetterId] = useS(null);
  const [hint, setHint] = useS(true);
  const canvasRef = useR(null);
  const initedRef = useR(false);

  const data = window.LETTERS_DATA;
  // letters with an unlockAt stay hidden until that instant passes (compares absolute
  // time, so it fires at the same moment regardless of the viewer's own timezone)
  const visibleLetters = data.letters.filter(
    (l) => !l.unlockAt || Date.now() >= new Date(l.unlockAt).getTime()
  );

  useE(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    window.ThreeScene.init(canvasRef.current);
    window.ThreeScene.onMailboxClick(() => {
      // start arrival sequence: open door, then arc the camera in
      setStage("arriving");
      window.ThreeScene.setDoorOpen(1);
      // camera move begins ~ when door starts opening
      setTimeout(() => window.ThreeScene.cameraTo("inside", 3000), 250);
      // letters appear once camera has arrived
      setTimeout(() => setStage("inside"), 3300);
    });
  }, []);

  useE(() => {
    const t = setTimeout(() => setHint(false), 30000);
    return () => clearTimeout(t);
  }, []);

  function backToOutside() {
    setOpenLetterId(null);
    setStage("outside");
    window.ThreeScene.cameraTo("outside", 1900);
    setTimeout(() => window.ThreeScene.setDoorOpen(0), 800);
  }

  function openLetter(id) {
    setOpenLetterId(id);
    setStage("reading");
  }

  function closeLetter() {
    setOpenLetterId(null);
    setStage("inside");
  }

  const showVignette = stage === "inside" || stage === "reading";
  const showInterior = stage === "inside" || stage === "reading";

  return (
    <div className="root">
      <canvas ref={canvasRef} className="three-canvas" />

      {/* warm vignette during interior — fades in only after camera arrives */}
      <div className="vignette" style={{ opacity: showVignette ? 0.7 : 0 }} />

      {/* INSIDE — letters fanned out (only mount after camera arrives) */}
      {showInterior && (
        <div className="interior">
          <div className="letter-stage">
            {visibleLetters.map((l, i) => (
              <window.Envelope
                key={l.id}
                letter={l}
                idx={i}
                total={visibleLetters.length}
                isOpen={openLetterId === l.id}
                onClick={() => openLetter(l.id)}
                onClose={closeLetter}
              />
            ))}
          </div>

          <button className="back-btn" onClick={() => {
            if (openLetterId !== null) closeLetter();
            else backToOutside();
          }}>
            ← {openLetterId !== null ? "back to mailbox" : "back outside"}
          </button>

          {stage === "inside" && !openLetterId && (
            <div className="inside-hint">pick a letter</div>
          )}
        </div>
      )}

      {/* OUTSIDE — title & hint */}
      {stage === "outside" && (
        <>
          <div className="title">
            <div className="title-sub">a little mailbox, just for you</div>
            <div className="title-main">letters, from me</div>
          </div>
          {hint && (
            <div className="outside-hint">
              <div>click the mailbox</div>
              <div className="hint-arrow">↑</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
