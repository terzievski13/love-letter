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
  // the file lists letters oldest first; the deck shows the newest first
  const visibleLetters = data.letters.filter(
    (l) => !l.unlockAt || Date.now() >= new Date(l.unlockAt).getTime()
  ).reverse();
  const openLetterData = visibleLetters.find((l) => l.id === openLetterId) || null;

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

      {/* INSIDE — the letter deck (only mounts after camera arrives) */}
      {showInterior && (
        <div className="interior">
          <window.LetterDeck
            letters={visibleLetters}
            openLetter={openLetterData}
            onOpen={openLetter}
            onClose={closeLetter}
          />

          {/* while a letter is open, the reader shows its own "back to mailbox" */}
          {openLetterId === null && (
            <button className="back-btn" onClick={backToOutside}>
              ← back outside
            </button>
          )}

          {stage === "inside" && !openLetterId && (
            <div className="inside-hint">pick a letter</div>
          )}

          {/* asks once whether the mailbox may notify her; manages its own
              state and hides itself for good once answered */}
          {/* the slot lets the deck lift its counter and slider clear of
              the prompt while it's showing (see .notify-slot in index.html) */}
          {stage === "inside" && !openLetterId && (
            <div className="notify-slot"><window.NotifyPrompt /></div>
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
