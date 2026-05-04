/* Tweaks panel: edit letters, palette, etc. */

function TweaksApp() {
  const [tweaks, setTweak] = useTweaks(window.LETTERS_DATA);
  const [editingIdx, setEditingIdx] = React.useState(null);

  function updateLetter(i, patch) {
    const next = tweaks.letters.map((l, idx) => idx === i ? { ...l, ...patch } : l);
    setTweak("letters", next);
  }

  function addLetter() {
    const next = [...tweaks.letters, {
      id: Date.now(),
      date: "Today",
      title: "A new one",
      envelopeColor: "#f4d6c0",
      wax: "#a5443a",
      body: "Write something here…"
    }];
    setTweak("letters", next);
  }

  function removeLetter(i) {
    const next = tweaks.letters.filter((_, idx) => idx !== i);
    setTweak("letters", next);
    if (editingIdx === i) setEditingIdx(null);
  }

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Scene" />
      <TweakRadio
        label="Palette"
        value={tweaks.palette}
        onChange={v => setTweak("palette", v)}
        options={["sunset", "pastel", "dusk"]}
      />
      <TweakToggle
        label="Show flag"
        value={tweaks.showFlag}
        onChange={v => setTweak("showFlag", v)}
      />

      <TweakSection label={`Letters (${tweaks.letters.length})`} />
      {tweaks.letters.map((l, i) => (
        <div key={l.id} style={{
          border: "1px solid rgba(0,0,0,0.1)",
          borderRadius: 8,
          padding: 10,
          marginBottom: 8,
          background: "rgba(255,243,230,0.5)"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ fontFamily: "Caveat, cursive", fontSize: 18, color: "#3a2820" }}>
              {l.title || "Untitled"}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setEditingIdx(editingIdx === i ? null : i)}
                style={tinyBtn}>
                {editingIdx === i ? "−" : "edit"}
              </button>
              <button onClick={() => removeLetter(i)} style={{ ...tinyBtn, color: "#a44" }}>×</button>
            </div>
          </div>
          {editingIdx === i && (
            <div style={{ marginTop: 8 }}>
              <TweakText label="Title" value={l.title} onChange={v => updateLetter(i, { title: v })} />
              <TweakText label="Date" value={l.date} onChange={v => updateLetter(i, { date: v })} />
              <TweakColor label="Envelope" value={l.envelopeColor} onChange={v => updateLetter(i, { envelopeColor: v })} />
              <TweakColor label="Wax" value={l.wax} onChange={v => updateLetter(i, { wax: v })} />
              <label style={{ display: "block", fontSize: 11, marginTop: 8, marginBottom: 4, opacity: 0.7, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Letter body
              </label>
              <textarea
                value={l.body}
                onChange={e => updateLetter(i, { body: e.target.value })}
                rows={8}
                style={{
                  width: "100%",
                  fontFamily: "Caveat, cursive",
                  fontSize: 16,
                  padding: 8,
                  border: "1px solid rgba(0,0,0,0.15)",
                  borderRadius: 6,
                  background: "#fdf6e9",
                  color: "#3a2820",
                  resize: "vertical",
                  boxSizing: "border-box"
                }}
              />
            </div>
          )}
        </div>
      ))}
      <TweakButton label="+ add letter" onClick={addLetter} />
    </TweaksPanel>
  );
}

const tinyBtn = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 4,
  border: "1px solid rgba(0,0,0,0.15)",
  background: "#fff",
  cursor: "pointer"
};

// mount tweaks into its own root
const tweakRoot = document.createElement("div");
document.body.appendChild(tweakRoot);
ReactDOM.createRoot(tweakRoot).render(<TweaksApp />);
