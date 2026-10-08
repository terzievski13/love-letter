/* Main app: 3D scene canvas underneath, React UI overlay on top.
   Stages: "outside" → "arriving" → "inside" → "reading"
   "arriving" = camera animating in; canvas stays visible, no overlay yet. */

const { useState: useS, useEffect: useE, useRef: useR } = React;

function App() {
  const [stage, setStage] = useS("outside"); // outside | arriving | inside | reading
  const [openLetterId, setOpenLetterId] = useS(null);
  const [hint, setHint] = useS(true);
  const [writerOpen, setWriterOpen] = useS(false); // the secret writing tool (writer.jsx)
  // her letters to you (reply.jsx): the bundle, her pile, her writing screen
  const [hers, setHers] = useS([]);
  const [hersVersion, setHersVersion] = useS(0); // remounts her pile after a change
  const [showHers, setShowHers] = useS(false);
  const [composer, setComposer] = useS(null);    // null | { initial }
  const [toast, setToast] = useS(null);
  const canvasRef = useR(null);
  const initedRef = useR(false);
  const stageRef = useR(stage);
  stageRef.current = stage;

  const data = window.LETTERS_DATA;
  // letters with an unlockAt stay hidden until that instant passes (compares absolute
  // time, so it fires at the same moment regardless of the viewer's own timezone)
  // the file lists letters oldest first; the deck shows the newest first
  const visibleLetters = data.letters.filter(
    (l) => !l.unlockAt || Date.now() >= new Date(l.unlockAt).getTime()
  ).reverse();
  const HL = window.HerLetters;
  // ids can't clash (hers start at 100001), so one open id covers both piles
  const pile = showHers ? hers : visibleLetters;
  const openLetterData = pile.find((l) => l.id === openLetterId) || null;
  const wordKnown = HL.knowsWord();

  // her letters never glow on her own device - she wrote them
  function takeHers(list) {
    if (HL.knowsWord()) HL.markRead(list.map((l) => l.id));
    setHers(list);
    setHersVersion((v) => v + 1);
  }

  function say(text) {
    setToast(text);
    setTimeout(() => setToast((t) => (t === text ? null : t)), 2400);
  }

  useE(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    window.ThreeScene.init(canvasRef.current);
    window.ThreeScene.onMailboxClick(() => {
      // start arrival sequence: open door, then arc the camera in
      setStage("arriving");
      window.ThreeScene.setDoorOpen(1);
      // her letters load while the camera flies in
      window.HerLetters.load().then(takeHers);
      // camera move begins ~ when door starts opening
      setTimeout(() => window.ThreeScene.cameraTo("inside", 3000), 250);
      // letters appear once camera has arrived
      setTimeout(() => setStage("inside"), 3300);
    });
    // holding the mailbox (~2s) opens the writing tool - only from outside,
    // so it can never fire mid-flight or while she's reading
    window.ThreeScene.onMailboxLongPress(() => {
      if (stageRef.current === "outside") setWriterOpen(true);
    });
  }, []);

  useE(() => {
    const t = setTimeout(() => setHint(false), 30000);
    return () => clearTimeout(t);
  }, []);

  function backToOutside() {
    setOpenLetterId(null);
    setShowHers(false);
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

  function herLetterDone({ letter, letters, edited }) {
    setComposer(null);
    closeLetter();
    if (!edited) HL.markRead([letter.id]);
    takeHers(letters);
    setShowHers(true);
    say(edited ? HL.COPY.saved : HL.COPY.sent);
  }

  async function deleteHerLetter(letter) {
    const r = await HL.api(HL.word() || "", { action: "delete", id: letter.id });
    if (r.status === 401) HL.forgetWord();
    if (!r.ok && r.status !== 404) { say(r.error || HL.COPY.offline); return; }
    closeLetter();
    if (r.letters) takeHers(r.letters);
    else takeHers(hers.filter((l) => l.id !== letter.id));
    say(HL.COPY.deleted);
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
          {/* your letters to her, or - after tapping the bundle - hers to you */}
          {showHers && hers.length === 0 ? (
            <HL.EmptyPile />
          ) : (
            <window.LetterDeck
              key={showHers ? "hers-" + hersVersion : "mine"}
              letters={pile}
              openLetter={openLetterData}
              onOpen={openLetter}
              onClose={closeLetter}
            />
          )}

          {/* while a letter is open, the reader shows its own "back to mailbox" */}
          {openLetterId === null && (showHers ? (
            <button className="back-btn" onClick={() => setShowHers(false)}>
              {HL.COPY.backToMine}
            </button>
          ) : (
            <button className="back-btn" onClick={backToOutside}>
              ← back outside
            </button>
          ))}

          {stage === "inside" && !openLetterId && (
            <div className="inside-hint">{showHers ? HL.COPY.hersShelf : "pick a letter"}</div>
          )}

          {stage === "inside" && !openLetterId && (
            <>
              {!showHers && <HL.Bundle hers={hers} onClick={() => setShowHers(true)} />}
              <button className="pill-btn write-btn" onClick={() => setComposer({ initial: null })}>
                {HL.COPY.write}
              </button>
            </>
          )}

          {/* asks once whether the mailbox may notify her; manages its own
              state and hides itself for good once answered */}
          {/* the slot lets the deck lift its counter and slider clear of
              the prompt while it's showing (see .notify-slot in index.html) */}
          {stage === "inside" && !openLetterId && !showHers && (
            <div className="notify-slot"><window.NotifyPrompt /></div>
          )}

          {/* edit / delete over her open letter - only where the word is known */}
          {openLetterData && openLetterData.fromHer && wordKnown && !composer && (
            <HL.OwnActions
              key={openLetterData.id}
              letter={openLetterData}
              onEdit={(l) => setComposer({ initial: l })}
              onDelete={deleteHerLetter}
            />
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

      {composer && (
        <HL.Composer
          key={composer.initial ? composer.initial.id : "new"}
          initial={composer.initial}
          onDone={herLetterDone}
          onCancel={() => setComposer(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}

      {writerOpen && <window.Writer onClose={() => setWriterOpen(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<App />);
