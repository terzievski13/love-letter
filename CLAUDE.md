# Letters, From Me

A personal one-page website for my girlfriend. A 3D interactive mailbox 
where I leave her letters over time. To be hosted on Vercel.

## Stack

- Vanilla Three.js 0.160.0 (no build step, loaded via unpkg)
- React 18 + ReactDOM (UMD, browser-loaded via unpkg)
- Babel Standalone 7.29 (JSX transpiled in-browser, no bundler)
- Plain CSS in index.html (no Tailwind)
- Deployed to Vercel

## Working features (DO NOT modify unless I ask)

- Initial 3/4 camera view with sunset sky
- Click mailbox → camera zooms in, mailbox opens, shows letter spread
- "Pick a letter" view: fanned envelope spread inside mailbox
- Click envelope → letter unfolds with gradual handwritten text reveal
- Back/close buttons with zoom-out animation
- Handwritten font on letters
- Typography in titles

## Currently broken / needs work (priority order)

1. **Landscape is bad.** Floating grass strips, flat green plane. 
   Want low-poly cozy coastal sunset, "A Short Hike" / "Spiritfarer" mood.
2. **Mailbox opening animation feels off.** Pivot point or easing 
   issue — needs to feel natural and satisfying.
3. **Mailbox model is basic.** Proportions and material need work, 
   want a warmer wooden feel.

## Version control

- This project uses Git, hosted on GitHub
- Deployed to Vercel via GitHub auto-deploy
- Commit at meaningful checkpoints with descriptive messages
- Before big refactors, commit current working state first as a safety net

## Future ideas (don't build yet, just for context)

- Add new letters over time without rebuilding
- Maybe small details: fireflies, ambient sound, wind in grass

## How I work

- I'm a freelance videographer, not a developer. Explain choices in 
  plain language. No jargon dumps.
- Ask clarifying questions before big changes.
- Iterate one piece at a time. Don't refactor multiple things at once.
- When you're not 100% sure about something, say so explicitly.
- Don't make up library APIs or behaviors — verify or admit uncertainty.

## Conventions

- All files are flat in the project root (no src/ folder)
- 3D scene logic in three-scene.js
- React UI overlay in app.jsx
- Envelope + letter components in envelope.jsx
- Letter content in letters.jsx (one object per letter in the LETTERS_DATA array)
- Use TypeScript-friendly patterns even though we're in plain JS