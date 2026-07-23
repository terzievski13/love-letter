/* Three.js scene: cliffside over the sea at golden hour with a 3D mailbox.
   Exposes a single global ThreeScene with:
     - init(canvas)
     - onMailboxClick(cb)
     - cameraTo(stage)  // 'outside' | 'inside'
     - setDoorOpen(t)   // 0..1
     - dispose()
*/

const ThreeScene = (() => {
  let renderer, scene, camera, raf;
  let mailboxGroup, doorGroup, interiorLight;
  let envelopeMeshes = [];
  let onClickCb = null;
  let raycaster, pointer;
  let canvasEl;
  let _lastW = 0, _lastH = 0;

  // camera waypoints (target positions / look-ats)
  // Mailbox group is rotated -0.55 rad on Y so opening points roughly toward (+X, +Z).
  // Outside cam sees it 3/4. Inside cam ends up just above the opening, looking down into it.
  const isMobile = window.innerWidth < window.innerHeight;
  const CAM = {
    outside: { pos: [4, 2.75, 8.2], look: [0, 1.7, 0] },
    inside: isMobile
      ? { pos: [-1.5, 2.58, 4.85], look: [0, 1.65, 0] }
      : { pos: [-0.88, 2.25, 2.80], look: [0, 1.65, 0] }
  };

  let camAnim = null; // {start, from, to, lookFrom, lookTo, dur}
  let currentLook = new THREE.Vector3(0, 1.6, 0);

  // Per-frame landscape animations (water drift, sun pulse, boat...).
  // Each module pushes its own tick; cutting a module removes its motion.
  const tickers = [];
  function updateLandscape(t) {
    for (let i = 0; i < tickers.length; i++) tickers[i](t);
  }

  // door rotation
  let doorTarget = 0;
  let doorCurrent = 0;
  let doorVelocity = 0;

  function init(canvas) {
    canvasEl = canvas;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const initW = Math.max(canvas.clientWidth, 1);
    const initH = Math.max(canvas.clientHeight, 1);
    renderer.setSize(initW, initH, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeebA90);
    scene.fog = new THREE.Fog(0xeeb890, 30, 175);

    camera = new THREE.PerspectiveCamera(isMobile ? 70 : 60, initW / initH, 0.1, 200);
    camera.position.set(...CAM.outside.pos);
    camera.lookAt(...CAM.outside.look);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    buildSky();
    buildWater();
    buildGround();
    buildMountains();
    buildSun();
    buildScatter();
    buildLighthouse();
    buildSailboat();
    buildMailbox();
    buildLights();

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("click", onCanvasClick);
    window.addEventListener("resize", onResize);

    // ResizeObserver — handles the iframe's late layout where clientWidth starts at 0
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => onResize());
      ro.observe(canvas);
    }
    // belt-and-suspenders: poll for first non-zero size
    (function waitForSize() {
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        onResize();
      } else {
        requestAnimationFrame(waitForSize);
      }
    })();

    animate();
  }

  function buildSky() {
    // Gradient sky via canvas texture mapped onto a back-side sphere
    const c = document.createElement("canvas");
    c.width = 16; c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, "#b84830"); // deep sunset red at top
    g.addColorStop(0.30, "#e07040"); // warm orange
    g.addColorStop(0.58, "#f0a868"); // golden-peach
    g.addColorStop(0.82, "#eeb890"); // soft peach
    g.addColorStop(1.00, "#eeb890"); // horizon — matches fog
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    // sun glow band
    const sg = ctx.createRadialGradient(8, 80, 4, 8, 80, 60);
    sg.addColorStop(0, "rgba(255,240,212,0.95)");
    sg.addColorStop(0.4, "rgba(255,240,212,0.4)");
    sg.addColorStop(1, "rgba(255,240,212,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.SphereGeometry(100, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, depthTest: false });
    scene.add(new THREE.Mesh(geo, mat));

    // Distant clouds spread across the sky. Explicit x/y/z (not derived from
    // an angle) so placement is predictable: x spans both sides of centre,
    // y is kept well above the mountains' peak height so no cloud can ever
    // read as a stray ridge on the skyline again.
    const cloudTex = makeCloudTexture();
    const cloudConfigs = [
      { x: -55, y: 32, z: -70, w: 28, h: 8,  color: 0xffddd0, opacity: 0.65 },
      { x: -38, y: 28, z: -55, w: 22, h: 7,  color: 0xffe8d8, opacity: 0.70 },
      { x: -18, y: 34, z: -40, w: 26, h: 8,  color: 0xfff3e6, opacity: 0.72 },
      { x:   2, y: 26, z: -26, w: 20, h: 6,  color: 0xffe0cc, opacity: 0.60 },
      { x:  20, y: 33, z: -52, w: 24, h: 7,  color: 0xfff3e6, opacity: 0.68 },
      { x:  40, y: 30, z: -68, w: 22, h: 7,  color: 0xffe8d8, opacity: 0.72 },
      { x: -30, y: 40, z: -63, w: 30, h: 9,  color: 0xffd8cc, opacity: 0.55 },
      { x:  28, y: 38, z: -36, w: 26, h: 8,  color: 0xffeee0, opacity: 0.58 },
      { x:  -2, y: 36, z: -23, w: 32, h: 10, color: 0xffe0d0, opacity: 0.50 },
    ];
    const cloudSprites = [];
    cloudConfigs.forEach(({ x, y, z, w, h, color, opacity }, i) => {
      const m = new THREE.SpriteMaterial({ map: cloudTex, color, transparent: true, opacity, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.position.set(x, y, z);
      s.scale.set(w, h, 1);
      s.userData.baseX = x;
      s.userData.phase = i * 1.7;
      scene.add(s);
      cloudSprites.push(s);
    });
    // barely-there drift — a few units over minutes, enough to feel alive
    tickers.push((t) => {
      for (const s of cloudSprites) {
        s.position.x = s.userData.baseX + Math.sin(t * 0.03 + s.userData.phase) * 2.2;
      }
    });
  }

  function makeCloudTexture() {
    // A few overlapping soft puffs with a gently faded underside — reads as
    // a cumulus tuft instead of one round blob.
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const puffs = [
      [66, 148, 44], [108, 118, 56], [156, 124, 52], [198, 146, 40], [128, 156, 54]
    ];
    puffs.forEach(([x, y, r]) => {
      const g = ctx.createRadialGradient(x, y, r * 0.15, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(0.6, "rgba(255,255,255,0.55)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    });
    // soft flat-ish underside
    ctx.globalCompositeOperation = "destination-out";
    const cut = ctx.createLinearGradient(0, 168, 0, 214);
    cut.addColorStop(0, "rgba(0,0,0,0)");
    cut.addColorStop(1, "rgba(0,0,0,0.9)");
    ctx.fillStyle = cut;
    ctx.fillRect(0, 168, 256, 88);
    ctx.globalCompositeOperation = "source-over";
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildWater() {
    // One shader-driven water plane, replacing the old texture stack
    // (base gradient + two scrolling ripple overlays + a separate glitter
    // streak plane aimed at the sun). Everything — the depth-based color,
    // the gentle moving ripples, and the golden glitter path — now comes
    // from a single fragment shader:
    //   - color ramp: same four stops as the old canvas gradient, blended
    //     by world-space distance instead of a baked texture
    //   - ripples: a small sum of traveling sine waves, read as a fake
    //     bump normal (via their analytic slope) rather than displacing
    //     actual geometry — the plane has no subdivisions, so all of the
    //     "wave" look is a per-pixel lighting trick, not real motion
    //   - glitter: a Blinn-Phong-style specular toward the real sun
    //     position, broken into individual twinkling grains (a hashed
    //     on/off grid re-rolled a few times a second) instead of one
    //     smooth highlight — this is what used to be the separate streak
    //     plane, but it now emerges naturally from the ripple normals, so
    //     it's wide near shore and narrows toward the sun on its own,
    //     the way real water glitter actually falls off with distance
    const waterUniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        // matches the sun sprite position in buildSun() — the glint
        // targets this exact point (not just a fixed direction) so it
        // visibly converges toward the real sun as the camera moves,
        // instead of looking like a decal painted on the water
        uSunPos: { value: new THREE.Vector3(-95, 3, -130) }
      }
    ]);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 400),
      new THREE.ShaderMaterial({
        uniforms: waterUniforms,
        fog: true,
        vertexShader: `
          varying vec3 vWorldPos;
          #include <fog_pars_vertex>
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPosition.xyz;
            vec4 mvPosition = viewMatrix * worldPosition;
            gl_Position = projectionMatrix * mvPosition;
            #include <fog_vertex>
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uSunPos;
          varying vec3 vWorldPos;
          #include <fog_pars_fragment>

          // same four stops as the old canvas gradient (deep far horizon
          // to clean near-shore blue), blended with smoothstep instead of
          // linear so the bands melt into each other a little softer
          vec3 colorRamp(float t) {
            vec3 c0 = vec3(0.1176, 0.1961, 0.2824);
            vec3 c1 = vec3(0.1804, 0.3137, 0.4392);
            vec3 c2 = vec3(0.2902, 0.4784, 0.5961);
            vec3 c3 = vec3(0.4078, 0.6588, 0.7686);
            vec3 col = mix(c0, c1, smoothstep(0.0, 0.30, t));
            col = mix(col, c2, smoothstep(0.30, 0.65, t));
            col = mix(col, c3, smoothstep(0.65, 1.0, t));
            return col;
          }

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
          }

          void main() {
            // far horizon (world z -300) to near shore (world z +100),
            // matching the water plane's own span
            float t = clamp((vWorldPos.z + 300.0) / 400.0, 0.0, 1.0);
            vec3 baseColor = colorRamp(t);

            // three slow traveling waves at odd angles (not axis-aligned,
            // so the pattern doesn't read as a grid) — read only as an
            // analytic slope, never as real displacement
            vec2 p = vWorldPos.xz;
            vec2 dir1 = normalize(vec2(0.7, 0.3));
            vec2 dir2 = normalize(vec2(-0.4, 0.9));
            vec2 dir3 = normalize(vec2(0.9, -0.4));
            float f1 = 0.35; float f2 = 0.6; float f3 = 1.3;
            float s1 = 0.35; float s2 = -0.25; float s3 = 0.5;
            float a1 = 0.12; float a2 = 0.08; float a3 = 0.05;

            vec2 grad = cos(dot(p, dir1) * f1 + uTime * s1) * f1 * dir1 * a1
                      + cos(dot(p, dir2) * f2 + uTime * s2) * f2 * dir2 * a2
                      + cos(dot(p, dir3) * f3 + uTime * s3) * f3 * dir3 * a3;
            vec3 bumpNormal = normalize(vec3(-grad.x, 1.0, -grad.y));

            // a whisper of brightness variation from the same waves so the
            // surface doesn't read as flat-shaded even away from the glints
            float heightSum = sin(dot(p, dir1) * f1 + uTime * s1) * a1
                             + sin(dot(p, dir2) * f2 + uTime * s2) * a2;
            baseColor *= 1.0 + heightSum * 0.05;

            // distant wave streaks: thin horizontal lines that travel
            // toward shore (perpendicular to their own length), the way
            // real distant swell rolls in toward the beach. The line
            // positions are what move now — rowPhase carries -uTime so
            // the bands travel in +z (toward the camera/shore) — while
            // the dash/gap pattern along each line's length (built from
            // x only, no uTime) stays put relative to its line, riding
            // along with it instead of sliding sideways on its own.
            // Fragment-only, so it can never leave the water mesh.
            //
            // Two things made this look too stiff: perfectly even spacing
            // (a plain sine gives every band the same gap) and every band
            // showing up at full strength. Domain-warp the y input with a
            // couple of slow, mismatched sines before computing the band
            // phase so the lines bend and the spacing breathes instead of
            // reading as ruled paper, and randomly mute roughly half the
            // rows entirely so streaks appear at irregular intervals.
            float warp = sin(p.x * 0.03 + p.y * 0.017) * 2.4
                       + sin(p.y * 0.021 - p.x * 0.011) * 1.6;
            float rowPhase = (p.y + warp) * 0.4 + p.x * 0.05 - uTime * 0.28;
            float rowMask = pow(max(sin(rowPhase), 0.0), 16.0);
            float rowId = floor(rowPhase / 6.2832);
            float rowHashA = hash(vec2(rowId, 1.7));
            float rowHashB = hash(vec2(rowId, 4.2));
            float rowHashC = hash(vec2(rowId, 7.9));
            float rowVisible = step(0.45, rowHashC);
            // longer wavelength than before (0.05–0.14 vs a fixed 0.3) so
            // each bright dash covers more distance, and both the
            // wavelength and the on/off ratio are randomized per row —
            // no two streaks are the same length
            float freqX = mix(0.05, 0.14, rowHashA);
            float streakPhase = p.x * freqX + rowHashA * 6.2832;
            float onThreshold = mix(-0.4, 0.3, rowHashB);
            float streakShimmer = smoothstep(onThreshold, onThreshold + 0.5, sin(streakPhase));
            float streak = rowMask * streakShimmer * rowVisible;
            baseColor = mix(baseColor, vec3(0.92, 0.97, 1.0), streak * 0.14);

            // specular toward the sun's actual position (not just a fixed
            // direction) — targeting the real point makes the glint
            // visibly converge toward it as the camera moves during the
            // mailbox zoom, so it reads as a reflection of that sun
            // rather than a static pattern drawn on the water. A fixed
            // direction looked fine from one still angle but didn't track
            // correctly once the camera actually moved.
            vec3 toSun = normalize(uSunPos - vWorldPos);
            vec3 toCam = normalize(cameraPosition - vWorldPos);
            // guard against toSun/toCam nearly canceling out (near-zero
            // vector into normalize() is a NaN/Inf blowup, which reads as
            // white speckle noise on screen) — falls back to "no glint"
            vec3 halfRaw = toSun + toCam;
            float halfLen = length(halfRaw);
            vec3 halfDir = halfLen > 0.0001 ? halfRaw / halfLen : bumpNormal;
            // a tight-ish exponent so the glint stays a sliver, not a
            // wide wash, but wide enough to read as a bold streak
            float spec = pow(max(dot(bumpNormal, halfDir), 0.0), 180.0);

            // break the highlight into many small grains, each with its
            // own brightness cycling smoothly over time (a sine wave with
            // a per-grain phase from a hash) — no hard on/off switch, so
            // nothing ever pops; grains just continuously brighten and
            // fade at slightly different times, reading as one flowing
            // shimmer instead of individually blinking points
            vec2 cell = floor(p * 18.0);
            float cellPhase = hash(cell) * 6.2832;
            float shimmer = 0.5 + 0.5 * sin(uTime * 3.0 + cellPhase);
            float sparkle = spec * smoothstep(0.5, 1.0, shimmer);

            vec3 glintColor = vec3(1.0, 0.58, 0.2);
            vec3 finalColor = baseColor + glintColor * sparkle * 1.8;
            finalColor = min(finalColor, vec3(1.0));

            gl_FragColor = vec4(finalColor, 1.0);
            #include <fog_fragment>
          }
        `
      })
    );
    // y=-0.22: low enough that the knoll's dipped skirt (clamped at -0.14
    // in groundHeight) never floods
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.22, -100);
    scene.add(water);
    tickers.push((t) => { waterUniforms.uTime.value = t; });
  }

  function buildSun() {
    // Low setting sun in the mountain gap: a hot disc + a wide soft halo.
    // Both fog-free sprites; the water plane in front clips the disc's lower
    // half, so it reads as sitting ON the horizon at its own depth.
    function glowTexture(stops) {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const ctx = c.getContext("2d");
      const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
      stops.forEach(([p, col]) => g.addColorStop(p, col));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture([[0, "rgba(255,205,150,0.55)"], [0.45, "rgba(255,190,130,0.22)"], [1, "rgba(255,190,130,0)"]]),
      transparent: true, depthWrite: false, fog: false
    }));
    halo.position.set(-95, 6, -131);
    halo.scale.set(46, 46, 1);
    scene.add(halo);

    const sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture([[0, "rgba(255,246,221,1)"], [0.35, "rgba(255,228,175,0.95)"], [0.55, "rgba(255,205,145,0.30)"], [1, "rgba(255,205,145,0)"]]),
      transparent: true, depthWrite: false, fog: false
    }));
    sun.position.set(-95, 2.8, -130);
    sun.scale.set(14, 14, 1);
    scene.add(sun);
  }

  /* ---- Terrain shape: single source of truth ----
     groundHeight(x,z) is used by the ground mesh AND every scatter/placement
     function (stones, rocks, flowers, trees), so nothing ever floats. */

  // Deterministic value noise from a sin-hash — no external lib.
  function hash2(ix, iz) {
    const s = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }
  function valueNoise2(x, z) {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = hash2(ix, iz), b = hash2(ix + 1, iz);
    const c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz; // 0..1
  }
  function fbm2(x, z, octaves) {
    let v = 0, amp = 0.5, f = 1, total = 0;
    for (let i = 0; i < (octaves || 3); i++) {
      v += amp * valueNoise2(x * f, z * f);
      total += amp;
      amp *= 0.5; f *= 2;
    }
    return v / total; // 0..1
  }
  // Clamped hermite step; works with reversed edges (e0 > e1) too.
  function sstep(e0, e1, x) {
    const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  // 0 on solid land → 1 fully dropped below the water. The land outside a
  // noise-wobbled ellipse dives under the sea — that wrap of water around
  // the grass is what makes it a headland.
  //
  // EDGE_SHRINK pulls that whole boundary 30% closer to the mailbox (world
  // origin) in every direction — scaling x/z by 1/EDGE_SHRINK before the
  // ellipse/front math is equivalent to scaling the ellipse (center included)
  // and the front cutoff uniformly around the origin, so the ground is
  // trimmed evenly rather than just on one side.
  const EDGE_SHRINK = 0.7;
  function terrainDrop(x, z) {
    const xe = x / EDGE_SHRINK, ze = z / EDGE_SHRINK;
    const wob = (fbm2(xe / 14 + 40.2, ze / 14 + 17.9, 2) - 0.5) * 0.12;
    const ex = xe / 34;
    const ez = (ze - 23) / 32;
    const d = Math.sqrt(ex * ex + ez * ez) + wob;
    const edge = sstep(0.95, 1.28, d);
    const front = sstep(-9, -18, ze); // steeper drop past the old z=-10 shore line
    return Math.max(edge, front);
  }

  function groundHeight(x, z) {
    const r = Math.hypot(x, z);
    // gentle rolling grass — rises only: centered noise would dip low spots
    // under the water plane and read as random inland ponds
    let h = fbm2(x / 8 + 3.7, z / 8 + 9.1, 2) * 0.35;
    // dead-flat plateau under the mailbox — base plate, shadow and camera
    // look-at all assume y=0 there; blends back to rolling by r=5
    h *= sstep(2.8, 5, r);
    // knoll: the land falls away from the plateau in every direction, so
    // the mailbox crests a small hill and the path climbs to it (concept
    // board: "the hill elevates the mailbox"). The plateau itself cannot
    // move, so the surroundings dip instead — clamped above the sea, which
    // sits at y=-0.22 for exactly this reason.
    h -= 0.5 * sstep(2.8, 9, r);
    h = Math.max(h, -0.14);
    // headland drop into the sea, with a little cliff-face roughness in the band
    const drop = terrainDrop(x, z);
    const cliffNoise = (fbm2(x / 3 + 77.7, z / 3 + 51.3, 2) - 0.5) * 0.5 * drop * (1 - drop) * 4;
    return h * (1 - drop) + (-2.5) * drop + cliffNoise;
  }

  // 1 on the dirt path, 0 off it. Distance to a CUBIC bezier (sampled, which
  // is plenty accurate for coloring and stone placement). Cubic because the
  // reference image's path is a gentle S: it enters at the bottom-left, bows
  // out to the LEFT, then swings back to arrive at the mailbox straight from
  // the front (final tangent runs along -z into P3 — keep C2 directly in
  // front of P3 in x or the approach goes diagonal again).
  // P0 sits just past the frame's bottom edge (found by projecting through
  // the camera, don't eyeball it) so the path flows in from off-screen
  // left-of-center, like the reference image. Re-projected after the FOV
  // widened from 38→70 (wider lens pushed the visible bottom edge further
  // out, to z≈5.5-6.4 near x≈0.7-1.3) — bump this again if FOV changes.
  const PATH_P0 = [1.34, 6.8], PATH_C1 = [-1.75, 3.4],
        PATH_C2 = [-0.35, 2.2], PATH_P3 = [-0.3, 0.7];
  function pathBez(t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [
      a * PATH_P0[0] + b * PATH_C1[0] + c * PATH_C2[0] + d * PATH_P3[0],
      a * PATH_P0[1] + b * PATH_C1[1] + c * PATH_C2[1] + d * PATH_P3[1]
    ];
  }
  function pathMask(x, z) {
    let min2 = Infinity;
    for (let i = 0; i <= 32; i++) {
      const [px, pz] = pathBez(i / 32);
      const dx = x - px, dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < min2) min2 = d2;
    }
    // wide worn-earth band (per the user's sketch): the dirt itself reads
    // as the path again, stones sit on top of it, with an organic
    // noise-wobbled edge instead of a ruler line
    const w = 0.62 + 0.26 * sstep(0.5, 7, z);
    const wob = (fbm2(x * 1.1 + 5.5, z * 1.1 + 2.2, 2) - 0.5) * 0.22;
    const trail = 1 - sstep(w, w + 0.3, Math.sqrt(min2) + wob);
    // rounded dirt clearing under the mailbox itself, a bit wider than the
    // path it caps (per the reference image: the box stands on bare ground)
    const cd = Math.hypot(x - 0.05, z - 0.35);
    const clearing = 1 - sstep(0.82, 1.15, cd + wob);
    return Math.max(trail, clearing);
  }

  // Ground colors live in a painted texture (not vertex colors): the mesh's
  // vertices are ~0.8 units apart, far too coarse to draw the half-unit-wide
  // path — a 1024px canvas gives ~11px per unit instead.
  function makeGroundTexture() {
    const W = 1024, H = 1024;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(W, H);
    const data = img.data;

    const grassA = new THREE.Color(0x7d9410); // shaded grass
    const grassB = new THREE.Color(0x9cb625); // sunny grass
    // sandy, desaturated — the earlier redder dirt read rusty on screen
    const dirtA  = new THREE.Color(0xa08a62);
    const dirtB  = new THREE.Color(0xbca27a);
    const rock   = new THREE.Color(0x8a7460);
    const col = new THREE.Color(), dirt = new THREE.Color(), out = new THREE.Color();

    for (let py = 0; py < H; py++) {
      // canvas row 0 is v=1 (far edge, z=-15); v=0 is z=55
      const z = 55 - (1 - (py + 0.5) / H) * 70;
      for (let px = 0; px < W; px++) {
        const x = ((px + 0.5) / W) * 90 - 45;

        // mottled grass, never one flat green
        const mottle = fbm2(x / 5 + 11.3, z / 5 + 7.9, 2);
        col.copy(grassA).lerp(grassB, mottle);

        // darker grass right at the cliff lip (fake AO), rock further down.
        // drop stands in for height here — cheaper than groundHeight per pixel.
        const drop = terrainDrop(x, z);
        if (drop > 0.02) {
          col.multiplyScalar(1 - 0.35 * sstep(0.02, 0.22, drop) * (1 - sstep(0.22, 0.45, drop)));
          col.lerp(rock, sstep(0.18, 0.5, drop));
        }

        // dirt path — only bother inside its bounding box
        if (x > -3.8 && x < 5.2 && z > -1.4 && z < 8.4) {
          const pm = pathMask(x, z);
          if (pm > 0) {
            dirt.copy(dirtA).lerp(dirtB, fbm2(x / 2.4 + 31.1, z / 2.4 + 5.5, 2));
            col.lerp(dirt, pm);
            // pebble speckle — gentle: at ~11 texels per world unit any
            // high-contrast blob magnifies into a blurry dark smudge on
            // screen (looked like stray shadows on the widened path)
            if (pm > 0.4) {
              const peb = valueNoise2(x * 5.5 + 61.7, z * 5.5 + 23.3);
              if (peb > 0.72) col.multiplyScalar(0.88);
              else if (peb < 0.16) col.multiplyScalar(1.1);
            }
          }
        }

        // THREE.Color stores hex input as LINEAR components; the canvas is
        // read back as sRGB, so convert or everything double-darkens.
        out.copy(col).convertLinearToSRGB();
        const o = (py * W + px) * 4;
        data[o] = out.r * 255; data[o + 1] = out.g * 255; data[o + 2] = out.b * 255;
        data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); // path stays crisp at grazing angle
    return tex;
  }

  function buildGround() {
    // Rolling grassy headland: one displaced plane. Shape from groundHeight,
    // color from the painted texture above.
    const geo = new THREE.PlaneGeometry(90, 70, 110, 90);
    geo.rotateX(-Math.PI / 2);        // lie flat: x/z plane, +y up
    geo.translate(0, 0, 20);          // spans x −45..45, z −15..55
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();

    const ground = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
    );
    ground.receiveShadow = true;
    scene.add(ground);
  }

  function buildMountains() {
    /* Real 3D ranges instead of flat cutouts: each range is a horizontal
       terrain strip displaced upward with ridged noise. Sun-facing slopes
       catch the DirectionalLight, away slopes fall to ambient — that
       surface variation is what the old silhouettes couldn't do.
       The far range stays UNLIT (MeshBasic) with its shading painted into
       vertex colors: at that distance it's ~80% fog anyway, and unlit
       materials fade into the peach horizon predictably (same reasoning as
       the old cutouts). */
    const paintLightDir = new THREE.Vector3(6, 3, 0).normalize(); // matches the real sun

    function makeRange(cfg) {
      const geo = new THREE.PlaneGeometry(cfg.w, cfg.d, cfg.sw, cfg.sd);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        // crest runs along the strip's middle; height tapers to 0 at the
        // front/back edges so the range rises cleanly out of the water
        const dp = Math.sin(Math.PI * (z / cfg.d + 0.5));
        // ridged noise: sharp crests, rounded valleys
        const n = fbm2(x / 18 + cfg.seed, (z + cfg.z) / 18 + cfg.seed * 2.7, 3);
        const ridge = Math.pow(1 - Math.abs(2 * n - 1), 1.5);
        const rough = 0.85 + 0.3 * fbm2(x / 5 + cfg.seed * 3.3, (z + cfg.z) / 5, 2);
        pos.setY(i, cfg.envelope(x) * dp * ridge * rough * cfg.peak);
      }
      geo.computeVertexNormals();

      // altitude bands: forest low → rock mid → warm snow above a jittered
      // snowline (never pure white — it's catching sunset light)
      const colors = new Float32Array(pos.count * 3);
      const nor = geo.attributes.normal;
      const cForest = new THREE.Color(cfg.forest);
      const cRock = new THREE.Color(cfg.rock);
      const cSnow = cfg.snow ? new THREE.Color(cfg.snow) : null;
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        // bands are relative to each column's own summit height, so snow
        // reads as caps on the crests, not one absolute-height wall
        const colMax = Math.max(cfg.envelope(x), 0.001) * cfg.peak;
        const rel = y / colMax; // 0 at base .. ~1 near a crest
        const jit = (fbm2(x / 7 + 3.1, (z + cfg.z) / 7 + 8.8, 2) - 0.5) * 0.28;
        c.copy(cForest).lerp(cRock, sstep(0.15, 0.48, rel + jit * 0.6));
        if (cSnow) c.lerp(cSnow, sstep(0.70, 0.84, rel + jit));
        if (!cfg.lit) {
          // matte-painted shading for the unlit far range
          const ndl = Math.max(0, nor.getX(i) * paintLightDir.x + nor.getY(i) * paintLightDir.y + nor.getZ(i) * paintLightDir.z);
          c.multiplyScalar(0.78 + 0.35 * ndl);
        }
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

      const mat = cfg.lit
        // low warm emissive floor so shadow-side slopes never go muddy
        // against the peach fog
        ? new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x5a3830, emissiveIntensity: 0.22 })
        : new THREE.MeshBasicMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, -1.2, cfg.z); // base tucked under the water
      scene.add(mesh);
    }

    /* envelope(x) composes the frame — in WORLD x, and the camera looks
       diagonally: at mountain depth the screen centre is around world
       x ≈ −55 (desktop). So "tall on the right of the frame" means
       x ∈ [−45, +10], and the sun gap (low horizon + water) sits around
       x ≈ −75, which stays visible on portrait phones too. */
    const ranges = [
      { // near foothills — the mid-distance coastline ridge, frame right
        w: 240, d: 50, sw: 120, sd: 20, z: -92, peak: 22, seed: 11.7, lit: true,
        forest: 0x3c4a30, rock: 0x5f4a3e, snow: null,
        envelope: (x) => 0.9 * sstep(-30, 5, x)
      },
      { // main range — dominant snow-capped peaks, right half of the frame
        w: 280, d: 55, sw: 128, sd: 22, z: -112, peak: 32, seed: 4.2, lit: true,
        forest: 0x473227, rock: 0x7d5f58, snow: 0xf6ddd0,
        envelope: (x) => 0.12 + 0.88 * sstep(-52, -6, x)
      },
      { // far range — haze-eaten wall on the right, low hills across the gap
        w: 340, d: 60, sw: 90, sd: 14, z: -148, peak: 42, seed: 27.9, lit: false,
        forest: 0x8a7078, rock: 0x9a7880, snow: 0xeecfc8,
        envelope: (x) => 0.28 + 0.72 * sstep(-55, 5, x)
      }
    ];
    ranges.forEach(makeRange);
  }

  // Bakes a set of different parts (each with its own geometry) into one
  // static geometry — used to flatten a loaded GLTF flower's many small
  // meshes of one color (stem,
  // petals, etc.) into a single shape InstancedMesh can replicate cheaply.
  // Reads .getX/Y/Z off whatever BufferAttribute is handed in and .elements
  // off whatever Matrix4 is handed in, both plain-data reads, so this
  // happily accepts geometry/matrices from the separate module-build THREE
  // that GLTFLoader constructs (see loadFlowerModel) even though everything
  // else in this file is the classic global THREE.
  function mergeGeometryList(parts) {
    const positions = [], normals = [], indices = [];
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    let vOffset = 0;
    parts.forEach(({ geometry, matrix }) => {
      const posAttr = geometry.attributes.position, normAttr = geometry.attributes.normal;
      const idx = geometry.index;
      const nm = new THREE.Matrix3().getNormalMatrix(matrix);
      for (let i = 0; i < posAttr.count; i++) {
        p.fromBufferAttribute(posAttr, i).applyMatrix4(matrix);
        n.fromBufferAttribute(normAttr, i).applyMatrix3(nm).normalize();
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
      }
      if (idx) {
        for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + vOffset);
      } else {
        for (let i = 0; i < posAttr.count; i++) indices.push(i + vOffset);
      }
      vOffset += posAttr.count;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geo.setIndex(indices);
    return geo;
  }

  // Flattens any Object3D tree (a loaded GLTF scene, or a plain THREE.Group
  // built by hand) into one merged geometry per material/color — e.g. a
  // daisy comes back as [stem+leaves(green), petals(cream),
  // center+florets(orange)]. Every returned geometry shares the root's own
  // local space, so a single wind-sway patch keyed off local Y bends the
  // whole flower (stem, petals, everything) as one piece. Reads plain
  // .attributes/.index/.elements off whatever geometry/material it's handed,
  // so it works equally well on GLTFLoader's module-THREE objects and this
  // file's own classic-THREE meshes.
  function flattenModelToParts(root) {
    root.updateMatrixWorld(true);
    const groups = new Map(); // material.uuid -> { color, parts }
    root.traverse((obj) => {
      if (!obj.isMesh) return;
      const key = obj.material.uuid;
      if (!groups.has(key)) groups.set(key, { color: obj.material.color, parts: [] });
      groups.get(key).parts.push({ geometry: obj.geometry, matrix: obj.matrixWorld });
    });
    return Array.from(groups.values()).map(({ color, parts }) => ({
      color: new THREE.Color(color.r, color.g, color.b),
      geometry: mergeGeometryList(parts)
    }));
  }

  // Loads a GLTF flower prop (rooted at the base of its stem, like the
  // procedural stem geometry is) and flattens it via flattenModelToParts.
  async function loadFlowerModel(url) {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const gltf = await new Promise((resolve, reject) =>
      new GLTFLoader().load(url, resolve, undefined, reject));
    return flattenModelToParts(gltf.scene);
  }

  // Lavender sprig, built procedurally instead of loaded from a file —
  // flowers/lavender-flower.html is a standalone generator/preview page
  // (ported 1:1 below: four fanned stems, each a tapered spike of stacked
  // bud whorls, plus radiating lance-shaped leaves) rather than an exported
  // .glb like the other three species, since it was only ever run in its
  // own preview page. A local seeded LCG (same seed the source page used)
  // keeps the one-time bake deterministic across reloads, same as every
  // other hash-seeded shape in this file. Returned via flattenModelToParts
  // so it slots into buildFlowerSpecies exactly like a loaded model.
  function buildLavenderModel() {
    let seed = 5521;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    function rand(min, max) { return min + rnd() * (max - min); }

    const materials = {
      stem: new THREE.MeshLambertMaterial({ color: 0x2e7a34 }),
      stemDark: new THREE.MeshLambertMaterial({ color: 0x25612a }),
      leaf: new THREE.MeshLambertMaterial({ color: 0x3c8a3f, side: THREE.DoubleSide }),
      bud: new THREE.MeshLambertMaterial({ color: 0x8f63c9 }),
      budTip: new THREE.MeshLambertMaterial({ color: 0xa886d9 })
    };

    function budMesh(material, size) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 7, 6), material);
      m.scale.set(size * 0.88, size, size * 0.88);
      return m;
    }

    // tilt: 0 = mesh lies flat/horizontal (points along +Z), PI/2 = stands straight up.
    function placeAround(mesh, angle, radialOffset, heightOffset, tilt) {
      const holder = new THREE.Group();
      mesh.position.set(0, heightOffset, radialOffset);
      mesh.rotation.x = -tilt;
      holder.add(mesh);
      holder.rotation.y = angle;
      return holder;
    }

    // flat lanceolate leaf blade: base at origin, tip along +Z, width along X, thin along Y.
    function leafGeometry(length, width, curve) {
      const hw = width / 2;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(hw * 0.7, length * 0.18, hw, length * 0.42);
      shape.quadraticCurveTo(hw * 0.35, length * 0.85, 0, length);
      shape.quadraticCurveTo(-hw * 0.35, length * 0.85, -hw, length * 0.42);
      shape.quadraticCurveTo(-hw * 0.7, length * 0.18, 0, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: width * 0.06, bevelEnabled: false, curveSegments: 10 });
      geo.translate(0, 0, -width * 0.03);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const t = Math.max(0, Math.min(1, y / length));
        pos.setZ(i, pos.getZ(i) + Math.sin(t * Math.PI) * curve);
      }
      pos.needsUpdate = true;
      geo.rotateX(Math.PI / 2);
      geo.computeVertexNormals();
      return geo;
    }

    function makeLeaf(length, width, curve) {
      return new THREE.Mesh(leafGeometry(length, width, curve), materials.leaf);
    }

    // tapered spike of stacked bud whorls, wide at base, narrow at tip
    function makeSpike(baseY, length) {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.011, length, 8), materials.stemDark);
      core.position.y = baseY + length / 2;
      g.add(core);

      const levels = 8;
      for (let lvl = 0; lvl < levels; lvl++) {
        const tFrac = lvl / (levels - 1);
        const y = baseY + tFrac * length;
        const taper = 1 - tFrac * 0.85;
        const count = Math.max(2, Math.round(4 * taper));
        const coreR = 0.011 * (1 - tFrac) + 0.0035 * tFrac;
        const budSize = rand(0.019, 0.025) * (0.55 + 0.45 * taper);
        const mat = tFrac > 0.85 ? materials.budTip : materials.bud;
        const offset = lvl * 0.6 + rand(-0.1, 0.1);
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + offset;
          const bud = budMesh(mat, budSize);
          const holder = new THREE.Group();
          holder.add(bud);
          holder.position.set(0, y + rand(-0.003, 0.003), coreR + budSize * 0.5);
          const spin = new THREE.Group();
          spin.add(holder);
          spin.rotation.y = a;
          g.add(spin);
        }
      }
      const cap = budMesh(materials.budTip, 0.013);
      cap.position.y = baseY + length;
      g.add(cap);

      const calyx = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), materials.stemDark);
      calyx.scale.set(1, 0.5, 1);
      calyx.position.y = baseY - 0.004;
      g.add(calyx);
      return g;
    }

    function makeStem(stemH, spikeLen, lean) {
      const g = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0085, stemH, 8), materials.stem);
      stem.position.y = stemH / 2;
      g.add(stem);
      g.add(makeSpike(stemH, spikeLen));
      g.rotation.z = lean;
      return g;
    }

    const g = new THREE.Group();
    // four stems of varying height, fanning out like a bouquet
    const stems = [
      { h: 0.30, spike: 0.085, lean: -0.62 },
      { h: 0.52, spike: 0.165, lean: -0.16 },
      { h: 0.585, spike: 0.185, lean: 0.01 },
      { h: 0.475, spike: 0.145, lean: 0.19 }
    ];
    stems.forEach((s, i) => {
      const stem = makeStem(s.h, s.spike, s.lean);
      stem.position.x = (i - 1.5) * 0.006;
      if (i === 0) stem.rotation.y = Math.PI / 3; // smallest stem kicked 60° out of the fan's plane
      g.add(stem);
    });

    // broad lance-shaped leaves radiating from the base, layered low-to-high
    const leafCount = 15;
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2 + rand(-0.2, 0.2);
      const length = rand(0.16, 0.29);
      const width = length * rand(0.14, 0.19);
      const heightOffset = rand(0.0, 0.05);
      const tilt = rand(0.25, 0.85);
      const leaf = makeLeaf(length, width, rand(0.01, 0.025));
      const holder = placeAround(leaf, angle, 0.014, heightOffset, tilt);
      g.add(holder);
    }

    return flattenModelToParts(g);
  }

  // Instances one loaded flower model (see loadFlowerModel) across a
  // placement list — one InstancedMesh per merged color, all sharing the
  // same placements so every part of a given flower moves together.
  function buildFlowerSpecies(parts, placements, baseScale) {
    const d = new THREE.Object3D();
    parts.forEach(({ geometry, color }) => {
      const mesh = new THREE.InstancedMesh(
        geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }), placements.length);
      placements.forEach((p, i) => {
        d.position.set(p.x, p.y, p.z);
        d.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
        const sc = baseScale * p.s;
        d.scale.set(sc, sc, sc);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    });
  }

  // A worn slab stepping stone: big flat-ish top, smoothly rounded down to
  // the ground — no wall, no hard chamfer edge. Same lathe-a-profile trick
  // used elsewhere in this file, but takes a seed + side count per call so every
  // stone gets its own irregular outline instead of sharing one shape at
  // different scales.
  function makeStoneGeometry(seedA, seedB, sides) {
    seedA = seedA === undefined ? 3.7 : seedA;
    seedB = seedB === undefined ? 8.1 : seedB;
    sides = sides || 16;
    // Bottom-to-top, like the other lathe profiles in this file (reversing
    // this flips face winding and the whole stone culls as backfacing).
    // The slope from one point to the next roughly doubles each step instead
    // of jumping straight from a gentle top curve to a steep one — the old
    // profile had one segment ~7x steeper than its neighbor right where the
    // flat top met the rounded side, and at low side-counts (12-17) that
    // single sharp bend rendered as an obviously flat, straight-edged facet
    // on whichever stone happened to face it toward the camera.
    const profile = [
      [0.00, 0.00], // centre bottom
      [0.90, 0.00],
      [0.97, 0.02],
      [1.00, 0.08],
      [1.00, 0.20], // belly — widest point
      [0.97, 0.50],
      [0.90, 0.75],
      [0.80, 0.90],
      [0.70, 0.97],
      [0.62, 1.00], // top plateau edge
      [0.00, 1.00]  // centre of the flat-ish top
    ].map(([rf, hf]) => new THREE.Vector2(rf, hf));
    let geo = new THREE.LatheGeometry(profile, sides);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-6) continue;
      // jitter, unique seed per stone — reads as an irregular found rock,
      // not a resized copy of its neighbors
      const j = 1 + (fbm2(x * 1.3 + seedA, z * 1.3 + seedB, 2) - 0.5) * 0.4;
      pos.setXYZ(i, x * j, y, z * j);
    }
    // smooth shared-vertex normals (no toNonIndexed) — the whole surface
    // reads as one continuous curve, not a faceted, hard-edged puck
    geo.computeVertexNormals();
    return geo;
  }

  function buildScatter() {
    /* Foreground dressing: stepping stones on the path, boulders at the
       cliff lip, wildflowers, chunky grass tufts. One InstancedMesh per
       species = one draw call each. Everything is placed via groundHeight
       so nothing floats, kept inside x,z ∈ ±10 (the sun's shadow box),
       and positioned with hash2 so the layout is stable across reloads. */
    const dummy = new THREE.Object3D();
    function place(mesh, list) {
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
        dummy.scale.set(p.sx || 1, p.sy || 1, p.sz || 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (p.color) mesh.setColorAt(i, p.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh);
      return mesh;
    }
    const bez = pathBez;

    /* Layout copied from the user's foreground concept board:
       gray rocks in clusters (big anchors at the frame corners, escorts
       flanking the path), and flower drifts of white daisies, yellow
       buttercups and pink spikes on the knoll's flanks. Nothing evenly
       sprinkled; everything clustered. */
    const pathSide = (t, off) => {
      const [bx, bz] = bez(t);
      const [ax, az] = bez(t + 0.02);
      const dx = ax - bx, dz = az - bz;
      const dl = Math.hypot(dx, dz) || 1;
      return [bx + (-dz / dl) * off, bz + (dx / dl) * off];
    };

    // ---------- rocks: neutral gray, clustered, varied sizes ----------
    const rockGeo = new THREE.SphereGeometry(1, 10, 8);
    const rp = rockGeo.attributes.position;
    for (let i = 0; i < rp.count; i++) {
      const px = rp.getX(i), py = rp.getY(i), pz = rp.getZ(i);
      // chunkier lumps than before — the board's rocks are angular-soft
      const j = 1 + (fbm2(px * 1.6 + 9.2, (py + pz) * 1.6 + 4.4, 2) - 0.5) * 0.42;
      rp.setXYZ(i, px * j, py * j * 0.7, pz * j);
    }
    rockGeo.computeVertexNormals();
    // [groupX, groupZ, [size, offsetX, offsetZ]...]
    const rockGroups = [
      [-5.0, 4.6, [0.72, 0, 0], [0.34, 0.85, 0.5], [0.20, -0.66, 0.42]],  // big left anchor
      [6.1, 3.9, [0.58, 0, 0], [0.28, -0.64, 0.3]],                       // big right anchor
      [1.9, 4.8, [0.28, 0, 0], [0.15, 0.42, 0.22]],                       // path right
      [-2.4, 2.7, [0.24, 0, 0], [0.13, -0.34, 0.18]],                     // path left (moved off the widened path)
      [3.3, 1.8, [0.20, 0, 0]],                                           // near the crest
      [-3.9, 0.8, [0.38, 0, 0], [0.19, 0.5, 0.3]],                        // left flank
      // cliff-lip groups: anchor scaled by EDGE_SHRINK (0.7) to follow the
      // trimmed shoreline in, so they still sit right at the lip instead of
      // floating out over the now-closer water
      [-3.92, -4.83, [0.52, 0, 0], [0.30, 0.58, 0.26], [0.17, -0.44, 0.30]],// cliff lip
      [3.71, -4.41, [0.42, 0, 0], [0.22, -0.42, 0.28]],
      [-1.4, -5.04, [0.28, 0, 0]],
      [7.0, -1.5, [0.34, 0, 0], [0.18, 0.44, -0.2]]
    ];
    const rocks = [];
    rockGroups.forEach(([gx, gz, ...members], gi) => {
      members.forEach(([s, ox, oz], mi) => {
        const x = gx + ox, z = gz + oz;
        rocks.push({
          x, z, y: groundHeight(x, z) + s * 0.26,
          sx: s, sy: s * (0.78 + hash2(4.4, gi + mi) * 0.2), sz: s * (0.88 + hash2(5.2, gi * 3 + mi) * 0.22),
          ry: hash2(6.6, gi * 7 + mi) * Math.PI * 2,
          // neutral gray (board swatch ≈ #9a9a96): near-zero saturation so
          // the warm sunset key light doesn't push the rocks tan
          color: new THREE.Color().setHSL(0.55, 0.02, 0.40 + hash2(3.7, gi + mi * 2) * 0.14)
        });
      });
    });
    const rockMesh = place(new THREE.InstancedMesh(
      rockGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), rocks.length), rocks);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    // nothing may grow inside a boulder's footprint (still used by the
    // flower placement below)
    const insideRock = (x, z) =>
      rocks.some((r) => Math.hypot(x - r.x, z - r.z) < r.sx * 1.15);

    // ---------- stepping stones: worn slabs along the path ----------
    // each stone below gets its own geometry (unique jitter seed + side
    // count) so none of them look like a resized copy of another, and each
    // sits low, half-buried in the dirt (makeStoneGeometry above)
    // arc-length lookup so stones space evenly along the bezier — uniform t
    // bunches them near the ends once the curve bows this much
    const AL_N = 60, alLens = [0];
    {
      let pv = bez(0);
      for (let i = 1; i <= AL_N; i++) {
        const p = bez(i / AL_N);
        alLens.push(alLens[i - 1] + Math.hypot(p[0] - pv[0], p[1] - pv[1]));
        pv = p;
      }
    }
    const tAtFraction = (f) => {
      const target = f * alLens[AL_N];
      let i = 1;
      while (i < AL_N && alLens[i] < target) i++;
      const k = (target - alLens[i - 1]) / (alLens[i] - alLens[i - 1] || 1);
      return (i - 1 + k) / AL_N;
    };
    const stones = [];
    const STONE_N = 7;
    for (let i = 0; i < STONE_N; i++) {
      const t = tAtFraction(0.10 + i * (0.80 / (STONE_N - 1)));
      const [bx, bz] = bez(t);
      const [ax, az] = bez(t + 0.02);
      const dx = ax - bx, dz = az - bz;
      const dl = Math.hypot(dx, dz) || 1;
      // alternate left/right like a natural footstep line, plus per-stone
      // jitter so it doesn't read as a mechanical zigzag either
      const zigzag = (i % 2 === 0 ? 1 : -1) * 0.24;
      const side = zigzag + (hash2(3.3, i) - 0.5) * 0.34;
      let x = bx + (-dz / dl) * side, z = bz + (dx / dl) * side;
      if (i === 1) {
        // nudged further from the camera along the path (position only,
        // size/jitter/color untouched)
        const push = 0.2;
        x += (dx / dl) * push;
        z += (dz / dl) * push;
      }
      const s = 0.26 + hash2(7.7, i) * 0.16;
      // buried, but a bit more of the slab shows above the dirt than before
      const sink = s * 0.16;
      const stone = {
        x, z, y: groundHeight(x, z) - sink,
        sx: s, sy: s * 0.37, sz: s * (0.72 + hash2(9.1, i) * 0.45),
        ry: hash2(5.5, i) * Math.PI * 2,
        // gray stone, a shade cooler and darker than the sandy dirt
        color: new THREE.Color().setHSL(0.08, 0.06, 0.48 + hash2(2.9, i) * 0.10)
      };
      stones.push(stone);
      // 12-17 sides — round enough to avoid a hexagon look, still varied
      const sides = 12 + Math.floor(hash2(12.3, i) * 6);
      const geo = makeStoneGeometry(i * 13.7 + 3.7, i * 9.1 + 8.1, sides);
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: stone.color }));
      mesh.position.set(stone.x, stone.y, stone.z);
      mesh.rotation.y = stone.ry;
      mesh.scale.set(stone.sx, stone.sy, stone.sz);
      mesh.receiveShadow = true;
      // no castShadow: slabs this flat only smear blurry shadow-map blotches
      // across the dirt beside them
      scene.add(mesh);
    }

    // nothing may grow on top of a stone either
    const insideStone = (x, z) =>
      stones.some((st) => Math.hypot(x - st.x, z - st.z) < st.sx * 1.15);

    // ---------- flowers: daisy, rose, cosmos + lavender drifts ----------
    // All four species are real props flattened into merged geometry (see
    // flattenModelToParts) — daisy/rose/cosmos loaded from flowers/*.glb,
    // lavender built procedurally by buildLavenderModel (ported from
    // flowers/lavender-flower.html, which was never exported to a .glb).
    // Replaces the old reddish procedural foxglove spike, which didn't
    // match any of the four modeled species and read as out of place.
    const daisyPlacements = [], rosePlacements = [], cosmosPlacements = [], lavenderPlacements = [];
    const PLACEMENTS = { daisy: daisyPlacements, rose: rosePlacements, cosmos: cosmosPlacements, lavender: lavenderPlacements };
    // cluster centers on the knoll flanks (heaviest beside the path, like
    // the board), near the big rocks, along the cliff lip inner side —
    // cosmos and lavender get two modest clusters each so they read as
    // occasional accents among the daisy/rose drifts, not another dominant
    // species.
    const flowerClusters = [
      { at: pathSide(0.25, 1.4), kind: "daisy", n: 13 },
      { at: pathSide(0.5, -1.5), kind: "daisy", n: 12 },
      { at: pathSide(0.8, 1.6), kind: "rose", n: 10 },
      { at: pathSide(0.14, -1.3), kind: "daisy", n: 10 },
      { at: [-4.2, 3.6], kind: "daisy", n: 13 },  // by the big left anchor
      { at: [5.4, 3.0], kind: "rose", n: 10 },     // by the big right anchor
      { at: [-3.2, 2.0], kind: "daisy", n: 12 },
      { at: [2.6, -2.8], kind: "daisy", n: 12 },
      // cliff/crest-lip clusters: anchor scaled by EDGE_SHRINK (0.7), same
      // as the cliff-lip rocks, so they stay right at the trimmed edge
      // instead of sitting out past it
      { at: [-1.12, -3.92], kind: "rose", n: 10 },
      { at: [-3.43, -4.2], kind: "daisy", n: 12 },  // cliff-lip rocks
      { at: [3.36, -3.85], kind: "daisy", n: 10 },
      { at: [-6.2, -3.4], kind: "cosmos", n: 8 },
      { at: [6.6, -0.6], kind: "daisy", n: 12 },
      { at: [0.8, 2.9], kind: "rose", n: 9 },     // right where the path crests
      { at: [-2.1, 5.4], kind: "lavender", n: 7 },
      { at: [1.05, -4.41], kind: "daisy", n: 10 },   // crest lip, breaks horizon
      { at: [-6.8, 1.4], kind: "rose", n: 9 },
      { at: [3.6, 4.6], kind: "daisy", n: 10 },
      { at: [5.6, -4.6], kind: "cosmos", n: 7 },
      { at: [5.0, 4.4], kind: "lavender", n: 6 }
    ];
    // All four species are wide static props (unlike the old flattened
    // petal geometry, which was small enough that close placements never
    // visibly overlapped) — a radius per species (roughly the model's own
    // canopy half-width, scaled by that instance's random size `s`) so
    // candidates too close to an already-placed flower get skipped, same
    // as candidates that land in a rock or on the path.
    // Farthest any vertex sits from the model's own root (the stem base,
    // which is what actually gets rotated/placed) — not the bounding-box
    // half-size, since the root isn't centered in the box (the rose's
    // base leaves splay further to one side than the other). Every
    // instance gets a random yaw, so that far side can swing toward any
    // neighbor; this is the only radius that's safe regardless of which
    // way it lands.
    const CANOPY_RADIUS = { daisy: 0.123, rose: 0.16, cosmos: 0.15, lavender: 0.09 };
    const placedCanopies = []; // { x, z, r }
    flowerClusters.forEach(({ at: [cx, cz], kind, n }, pi) => {
      for (let i = 0; i < n; i++) {
        const ang = hash2(pi * 11.3, i * 3.1) * Math.PI * 2;
        const rad = 0.08 + Math.sqrt(hash2(pi * 7.9, i * 5.7)) * 0.6;
        const x = cx + Math.cos(ang) * rad, z = cz + Math.sin(ang) * rad;
        if (pathMask(x, z) > 0.3 || terrainDrop(x, z) > 0.08 || Math.hypot(x, z) < 0.8 || insideRock(x, z) || insideStone(x, z)) continue;
        const y = groundHeight(x, z);
        const s = 0.75 + hash2(pi * 2.2, i * 9.4) * 0.55;
        const lean = (hash2(pi * 5.1, i * 1.8) - 0.5) * 0.2;
        const r = CANOPY_RADIUS[kind] * s;
        if (placedCanopies.some((q) => Math.hypot(x - q.x, z - q.z) < (r + q.r) * 0.95)) continue;
        placedCanopies.push({ x, z, r });
        // random yaw so every instance of the (identical) loaded model
        // doesn't face the same way
        const ry = hash2(pi * 3.7, i * 6.3) * Math.PI * 2;
        PLACEMENTS[kind].push({ x, y, z, s, rz: lean, ry });
      }
    });

    // daisy/rose/cosmos models are downloaded async — the rest of the
    // scene doesn't wait on them, they just pop in a beat after everything
    // else. Lavender is built procedurally so it's ready immediately, but
    // is instanced alongside the others here for one consistent pop-in.
    Promise.all([
      loadFlowerModel("flowers/daisy-flower.glb"),
      loadFlowerModel("flowers/rose-flower.glb"),
      loadFlowerModel("flowers/cosmos-flower.glb")
    ]).then(([daisyParts, roseParts, cosmosParts]) => {
      // scale each model's native size down to roughly the footprint the
      // old procedural flowers had, so cluster density/composition doesn't
      // suddenly change — easy to retune once seen live. Native heights
      // (denominators) are each model's own loaded bounding-box height.
      buildFlowerSpecies(daisyParts, daisyPlacements, 0.15 / 0.3242);
      buildFlowerSpecies(roseParts, rosePlacements, 0.16 / 0.2882);
      buildFlowerSpecies(cosmosParts, cosmosPlacements, 0.24 / 0.3702);
      buildFlowerSpecies(buildLavenderModel(), lavenderPlacements, 0.4 / 0.77);
    }).catch((e) => console.error("flower model load failed", e));
  }

  function buildLighthouse() {
    /* Tiny lighthouse + village on a rocky islet in the right-hand bay,
       in the open water IN FRONT of the foothill ridge (the ridge strip
       starts at z=−67 — anything deeper is swallowed by it). The sailboat's
       lane (z=−55) passes just behind the islet. Each piece is deliberately
       low-poly; fog does the distance work. Cut the whole thing by removing
       the buildLighthouse() call. */
    const g = new THREE.Group();
    g.position.set(1.5, 0, -52);
    g.scale.setScalar(0.85);
    scene.add(g);

    // rocky outcrop rising from the water — soft low-frequency lumps
    const rockGeo = new THREE.SphereGeometry(1, 14, 10);
    const rpos = rockGeo.attributes.position;
    for (let i = 0; i < rpos.count; i++) {
      const px = rpos.getX(i), py = rpos.getY(i), pz = rpos.getZ(i);
      const j = 1 + (fbm2(px * 1.1 + 3.3, (py - pz) * 1.1 + 7.7, 2) - 0.5) * 0.22;
      rpos.setXYZ(i, px * j, py * j, pz * j);
    }
    rockGeo.computeVertexNormals();
    const rock = new THREE.Mesh(
      rockGeo,
      new THREE.MeshLambertMaterial({ color: 0x5f4636 })
    );
    rock.scale.set(3.4, 2.1, 2.6);
    rock.position.y = -0.6;
    g.add(rock);

    // tower: white with red bands painted into a tiny canvas
    const bc = document.createElement("canvas");
    bc.width = 8; bc.height = 64;
    const bctx = bc.getContext("2d");
    bctx.fillStyle = "#f4ece0";
    bctx.fillRect(0, 0, 8, 64);
    bctx.fillStyle = "#c04c38";
    bctx.fillRect(0, 8, 8, 12);
    bctx.fillRect(0, 34, 8, 12);
    const btex = new THREE.CanvasTexture(bc);
    btex.colorSpace = THREE.SRGBColorSpace;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.5, 2.6, 14),
      new THREE.MeshLambertMaterial({ map: btex })
    );
    tower.position.y = 2.75;
    g.add(tower);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(0.44, 0.5, 14),
      new THREE.MeshLambertMaterial({ color: 0x8a3020 })
    );
    roof.position.y = 4.3;
    g.add(roof);
    // one warm lit window near the top — a lamp, not a light source
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: (() => {
        const lc = document.createElement("canvas");
        lc.width = lc.height = 32;
        const lctx = lc.getContext("2d");
        const lg = lctx.createRadialGradient(16, 16, 2, 16, 16, 15);
        lg.addColorStop(0, "rgba(255,224,160,1)");
        lg.addColorStop(0.5, "rgba(255,200,120,0.5)");
        lg.addColorStop(1, "rgba(255,200,120,0)");
        lctx.fillStyle = lg;
        lctx.fillRect(0, 0, 32, 32);
        const t = new THREE.CanvasTexture(lc);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })(),
      transparent: true, depthWrite: false
    }));
    lamp.position.y = 3.95;
    lamp.scale.set(0.7, 0.7, 1);
    g.add(lamp);

    // handful of village houses tucked on the islet around the tower
    const houseMat = new THREE.MeshLambertMaterial({ color: 0xe8d8bc });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xa04434 });
    // three houses, huddled together on the leeward side — a hamlet, not
    // a sprinkle
    [[-1.4, 0.35], [-0.85, -0.55], [-1.75, -0.35]].forEach(([hx, hz], i) => {
      const hh = 0.3 + hash2(41.7, i) * 0.12;
      const hw = 0.34 + hash2(43.9, i) * 0.1;
      // approximate the dome's local top height so houses hug the rock
      const domeY = -0.6 + 2.1 * Math.sqrt(Math.max(0, 1 - (hx / 3.4) ** 2 - (hz / 2.6) ** 2));
      const house = new THREE.Mesh(new THREE.BoxGeometry(hw, hh, hw * 0.9), houseMat);
      house.position.set(hx, domeY - 0.08 + hh / 2, hz);
      house.rotation.y = hash2(47.3, i) * Math.PI;
      g.add(house);
      const hroof = new THREE.Mesh(new THREE.ConeGeometry(hw * 0.78, hh * 0.8, 4), roofMat);
      hroof.position.set(hx, domeY - 0.08 + hh + hh * 0.4, hz);
      hroof.rotation.y = house.rotation.y + Math.PI / 4;
      g.add(hroof);
    });
  }

  function buildSailboat() {
    // Tiny boat drifting across the bay at z≈−55. Unlit warm colors so fog
    // blends it predictably; bob + drift ticked from updateLandscape.
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 1.5, 12, 1, false, Math.PI, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x4a3226, fog: true })
    );
    hull.rotation.z = Math.PI / 2; // half-cylinder opening up = hull shell
    hull.scale.set(1, 1, 0.55);
    boat.add(hull);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.5, 5),
      new THREE.MeshBasicMaterial({ color: 0x3a2820, fog: true })
    );
    mast.position.y = 0.75;
    boat.add(mast);
    // a sail genuinely is a plane — one triangle
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([
      0.05, 0.25, 0, 0.05, 1.45, 0, 0.85, 0.35, 0
    ]), 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(
      sailGeo,
      new THREE.MeshBasicMaterial({ color: 0xfff2e0, side: THREE.DoubleSide, fog: true })
    );
    boat.add(sail);
    boat.position.set(-30, -0.16, -55);
    boat.rotation.y = Math.PI * 0.08;
    scene.add(boat);
    tickers.push((t) => {
      // −45 → +30 over ~4 minutes; both ends are outside the frame, so the
      // wrap-around teleport is never visible
      boat.position.x = -45 + ((t * 0.3125) % 75);
      boat.rotation.z = Math.sin(t * 0.8) * 0.03;
      boat.position.y = -0.16 + Math.sin(t * 0.55) * 0.015;
    });
  }

  // Warm saddle-brown wood texture for the mailbox interior.
  // Horizontal plank bands + wavy grain strokes, kept subtle so it reads as
  // "wood" without becoming noisy at this small scale.
  function makeWoodTexture() {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#5c3b26"; // saddle brown base
    ctx.fillRect(0, 0, 256, 256);
    // plank bands (horizontal)
    const bandH = 42;
    for (let i = 0; i < 7; i++) {
      const y = i * bandH;
      ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.08)" : "rgba(255,214,166,0.05)";
      ctx.fillRect(0, y, 256, bandH);
      ctx.strokeStyle = "rgba(28,14,7,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(256, y + 0.5); ctx.stroke();
    }
    // wavy grain strokes
    ctx.strokeStyle = "rgba(35,18,9,0.16)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * 256;
      const x = Math.random() * 200;
      const len = 40 + Math.random() * 90;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + len * 0.3, y + (Math.random() - 0.5) * 4,
                        x + len * 0.7, y + (Math.random() - 0.5) * 4,
                        x + len, y + (Math.random() - 0.5) * 2);
      ctx.stroke();
    }
    // occasional knot
    for (let i = 0; i < 3; i++) {
      const kx = 30 + Math.random() * 196, ky = 30 + Math.random() * 196;
      ctx.strokeStyle = "rgba(30,15,8,0.28)";
      ctx.beginPath(); ctx.ellipse(kx, ky, 5, 3, Math.random(), 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(kx, ky, 9, 5.5, Math.random(), 0, Math.PI * 2); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // Envelope face texture: cream paper, soft shading, flap V-lines,
  // optional deep-red wax seal at the flap point.
  function makeEnvelopeTexture(withSeal) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 180;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#f3e7d0";
    ctx.fillRect(0, 0, 256, 180);
    // gentle paper shading (light top-left, warm shadow bottom-right)
    const g = ctx.createLinearGradient(0, 0, 256, 180);
    g.addColorStop(0, "rgba(255,255,255,0.30)");
    g.addColorStop(1, "rgba(150,110,70,0.14)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 180);
    // flap crease lines: V from top corners to centre
    ctx.strokeStyle = "rgba(130,95,60,0.5)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(3, 4); ctx.lineTo(128, 92); ctx.lineTo(253, 4);
    ctx.stroke();
    // faint flap shadow just under the crease
    ctx.strokeStyle = "rgba(130,95,60,0.15)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(6, 10); ctx.lineTo(128, 98); ctx.lineTo(250, 10);
    ctx.stroke();
    if (withSeal) {
      ctx.fillStyle = "#9e3226";
      ctx.beginPath(); ctx.arc(128, 92, 19, 0, Math.PI * 2); ctx.fill();
      // seal edge + highlight for a bit of dimension
      ctx.strokeStyle = "rgba(80,18,12,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(128, 92, 19, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,235,220,0.22)";
      ctx.beginPath(); ctx.arc(122, 86, 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(80,18,12,0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(128, 92, 11, 0, Math.PI * 2); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildMailbox() {
    /* Classic arch-profile mailbox: rectangular lower section + half-cylinder dome on top.
       Opening (+Z face) is the door. Rotated -0.55 rad on Y for a 3/4 camera angle. */
    mailboxGroup = new THREE.Group();
    scene.add(mailboxGroup);

    // Dimensions
    const R  = 0.36;  // arch radius (half-width = 0.72 total)
    const BH = 0.30;  // lower rectangular section height
    const L  = 1.20;  // depth (front to back, along Z)

    const bodyMat  = new THREE.MeshLambertMaterial({ color: 0xc46554 });
    const darkMat  = new THREE.MeshLambertMaterial({ color: 0x8a3020 });
    // Interior: warm saddle wood instead of near-black, lit by interiorLight
    const woodTex = makeWoodTexture();
    const innerMat = new THREE.MeshLambertMaterial({ map: woodTex, side: THREE.DoubleSide });
    const postMat  = new THREE.MeshLambertMaterial({ color: 0x5a3828 });
    const ironMat  = new THREE.MeshLambertMaterial({ color: 0x2a1810 });

    // Post
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), postMat);
    post.position.y = 0.8;
    post.castShadow = true;
    mailboxGroup.add(post);

    // Base plate
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.44), postMat);
    plate.position.y = 0.03;
    plate.castShadow = true; plate.receiveShadow = true;
    mailboxGroup.add(plate);

    // Body group — sits exactly at post top (post goes 0→1.6)
    const body = new THREE.Group();
    body.position.y = 1.6;
    mailboxGroup.add(body);

    // Helper: arch cross-section shape (flat bottom, semicircle top)
    function archShape() {
      const s = new THREE.Shape();
      s.moveTo(-R, 0);
      s.lineTo(-R, BH);
      s.absarc(0, BH, R, Math.PI, 0, true);
      s.lineTo(R, 0);
      s.closePath();
      return s;
    }

    // OUTER SHELL — single ExtrudeGeometry: no seam at dome/side junction.
    // DoubleSide so the back cap is visible from inside and the door frame shows
    // on the inside when the door is open.
    const outerMat = new THREE.MeshLambertMaterial({ color: 0xc46554 });
    // Hollow shell: punch an inner arch hole so the front/back caps are rings, not solid plates.
    const shellShape = archShape();
    const wallT = 0.015;
    const Ri = R - wallT;
    const innerHole = new THREE.Path();
    innerHole.moveTo(Ri, 0);
    innerHole.lineTo(Ri, BH);
    innerHole.absarc(0, BH, Ri, 0, Math.PI, false);
    innerHole.lineTo(-Ri, 0);
    innerHole.closePath();
    shellShape.holes.push(innerHole);
    const outerShell = new THREE.Mesh(
      new THREE.ExtrudeGeometry(shellShape, { depth: L, bevelEnabled: false }),
      outerMat
    );
    outerShell.position.z = -L / 2;
    outerShell.castShadow = true;
    outerShell.receiveShadow = true;
    body.add(outerShell);

    // INNER shell — half-cylinder slightly smaller, dark interior.
    // Its radius must sit clearly inside the outer shell's inner-hole radius
    // (R - wallT) rather than exactly on it — the flat side panels get this
    // clearance for free from their own thickness, but this cylinder has no
    // thickness, so an exactly-coincident radius z-fights with the red shell
    // and shows through as a reddish curved ceiling.
    // Depth kept just barely (0.002) short of the shell's full depth, split
    // evenly at front and back: enough clearance to avoid z-fighting flicker
    // against the shell's front/back caps, but small enough the recess at
    // the visible opening edge doesn't read as a dark line.
    const innerDepth = L - 0.002;
    const domeInner = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.019, R - 0.019, innerDepth, 40, 1, true, -Math.PI / 2, Math.PI),
      innerMat
    );
    domeInner.rotation.x = -Math.PI / 2;
    domeInner.position.y = BH;
    body.add(domeInner);

    // Inner side panels (dark lower walls, slightly inset). Separate geometry
    // instances (not shared) because each side needs its own custom UVs below.
    // The REAL seam (not the front-recess gap fixed earlier): the dome sits
    // at radius R-0.019 but these walls were centered at R-0.015 with 0.012
    // thickness, so their interior-facing surface (R-0.015 - 0.006 = R-0.021)
    // sat 0.002 further in than the dome (R-0.019) at one edge and 0.004
    // proud of it at the other — a permanent step/ridge right at the
    // wall-to-dome junction that reads as a dark line the whole seam length,
    // regardless of the front-face recess. Fix: size+center the wall so its
    // outer face still meets the shell's inner-hole radius (R-0.015, unchanged
    // shell relationship) while its inner face lands exactly on the dome's
    // radius (R-0.019) — flush on both sides, no step.
    const shellInnerR = R - 0.015;
    const domeR = R - 0.019;
    // Flush fit: wall's inner face lands exactly on the dome's radius, no
    // step. (A small inward overlap was tried to hide a grazing-angle
    // artifact on the left wall, but it created a real ridge visible on the
    // more face-on right wall — worse trade. Back to exact flush.)
    const wallT2 = shellInnerR - domeR;
    const wallCenterR = (shellInnerR + domeR) / 2;
    const innerSideGeoL = new THREE.BoxGeometry(wallT2, BH, innerDepth);
    const innerSideL = new THREE.Mesh(innerSideGeoL, innerMat);
    innerSideL.position.set(-wallCenterR, BH / 2, 0);
    body.add(innerSideL);
    const innerSideGeoR = new THREE.BoxGeometry(wallT2, BH, innerDepth);
    const innerSideR = new THREE.Mesh(innerSideGeoR, innerMat);
    innerSideR.position.set(wallCenterR, BH / 2, 0);
    body.add(innerSideR);

    // Continuous wood-grain UVs across the two flat side walls and the
    // curved dome between them, so the plank bands run as one unbroken sweep
    // (floor-left-wall → up → over the dome → down → floor-right-wall)
    // instead of each geometry inventing its own mismatched parameterization.
    // "s" = arc-length position along that sweep; "depth" = front-to-back.
    (function unifyWoodUVs() {
      const wallArc = BH;
      const domeArc = Math.PI * (R - 0.019);
      // Match the plank width used on the floor (one tile's 7 bands spread
      // across the floor's actual width) instead of the walls' own height —
      // same physical board width everywhere, floor and walls and dome alike.
      // One full texture tile already contains all 7 bands, so matching the
      // floor's spacing means one tile per floorW of arc length — NOT one
      // tile per floorW/7 (that earlier version was 7x too dense).
      const floorW = (R - 0.015) * 2;
      const vOf = (s) => s / floorW;
      const halfDepth = innerDepth / 2;
      const uOf = (depth) => (depth + halfDepth) / innerDepth;

      function apply(geo, sFn, depthFn) {
        const posAttr = geo.attributes.position;
        const uvAttr = geo.attributes.uv;
        for (let i = 0; i < posAttr.count; i++) {
          const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
          uvAttr.setXY(i, uOf(depthFn(x, y, z)), vOf(sFn(x, y, z)));
        }
        uvAttr.needsUpdate = true;
      }

      // Left wall: local y spans -BH/2..BH/2 -> world y 0..BH -> s 0..wallArc.
      apply(innerSideGeoL, (x, y) => y + BH / 2, (x, y, z) => z);
      // Right wall: mirrored sweep direction, continuing past the dome.
      apply(innerSideGeoR, (x, y) => (wallArc + domeArc) + (BH / 2 - y), (x, y, z) => z);
      // Dome: theta = atan2(x, z) in local (pre-rotation) space runs
      // -PI/2 (left wall junction) .. +PI/2 (right wall junction); local y is
      // depth, negated by the mesh's -90 deg X rotation.
      apply(domeInner.geometry, (x, y, z) => wallArc + (Math.atan2(x, z) + Math.PI / 2) * (R - 0.019), (x, y, z) => -y);
    })();

    // Floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry((R - 0.015) * 2, 0.018, innerDepth),
      innerMat
    );
    floor.position.y = 0.009;
    floor.receiveShadow = true;
    body.add(floor);

    // Floor plank pattern: same wood texture and two-tone banding, turned 90°
    // from the walls (their boards run front-to-back) so the floor's boards
    // run side-to-side instead, scaled to exactly one tile across the
    // floor's actual width rather than stretched/repeated arbitrarily.
    (function floorUVs() {
      const floorW = (R - 0.015) * 2;
      const halfW = floorW / 2;
      const halfDepth = innerDepth / 2;
      const pos = floor.geometry.attributes.position;
      const uv = floor.geometry.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        // Mirrored (halfW - x instead of x + halfW): reverses which plank
        // tint sits at the left edge vs. right, for contrast against the
        // wall color at that corner.
        uv.setXY(i, (z + halfDepth) / innerDepth, (halfW - x) / floorW);
      }
      uv.needsUpdate = true;
    })();

    // Dark back wall — without this the red outer shell back cap shows through
    const backWall = new THREE.Mesh(new THREE.ShapeGeometry(archShape()), innerMat);
    backWall.position.z = -L / 2 + 0.012;
    body.add(backWall);

    // Envelope fan — standing in the box like cards in a card catalog, faces
    // toward the opening, each envelope leaning further open toward the front.
    // Each envelope is a thin box; the top (+Y) face carries the paper texture
    // (flap V-lines + optional seal), sides are plain cream.
    const sealTex = makeEnvelopeTexture(true);
    const plainTex = makeEnvelopeTexture(false);
    function makeEnvelope(w, d, tex, tint) {
      const sideMat = new THREE.MeshLambertMaterial({ color: tint || 0xefe2c8 });
      const topMat  = new THREE.MeshLambertMaterial({ map: tex, color: tint || 0xffffff });
      const botMat  = new THREE.MeshLambertMaterial({ color: 0xe4d4b6 });
      // BoxGeometry material order: +x, -x, +y, -y, +z, -z
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, 0.035, d),
        [sideMat, sideMat, topMat, botMat, sideMat, sideMat]
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    const envelopes = [
      // fanned like a card catalog: upright at the back wall, each one toward
      // the front leaning a bit further open, hero with wax seal in front.
      // Values hand-tuned in the design-session Tweaks panel — don't re-derive.
      { w: 0.52, d: 0.36, tex: plainTex, pile: { x: -0.075, y: 0.165, z: -0.47, rotX: 90, rotY: 0, rotZ: 0 } },
      { w: 0.50, d: 0.34, tex: plainTex, pile: { x: -0.07, y: 0.19, z: -0.545, rotX: 90, rotY: 0, rotZ: 0 }, tint: 0xf6ecd9 },
      { w: 0.48, d: 0.34, tex: plainTex, pile: { x: -0.07, y: 0.18, z: -0.145, rotX: 71, rotY: 11, rotZ: 1 }, tint: 0xf2e4cc },
      { w: 0.42, d: 0.32, tex: sealTex,  pile: { x: 0.13, y: 0.17, z: -0.06, rotX: 67, rotY: -8, rotZ: -6 } },
      { w: 0.50, d: 0.36, tex: sealTex,  pile: { x: -0.07, y: 0.165, z: 0.155, rotX: 50, rotY: 26, rotZ: 1.1 } }
    ];
    // Live-tweakable positions: pull from window.LETTERS_DATA.letters[i].pile
    // when present (edited via the Tweaks panel) so a saved edit survives a
    // reload; the literal values above are just the fallback/original layout.
    // Rotation order YXZ (turn, then tilt, then roll) instead of the three.js
    // default XYZ — with XYZ, adjusting tilt after turn re-couples axes in a
    // way that feels broken; YXZ matches how a gimbal/turntable control is
    // expected to behave (turn sets facing, tilt pivots off that facing, roll
    // twists around what's now "forward").
    const deg2rad = (d) => (d || 0) * Math.PI / 180;
    envelopeMeshes = [];
    envelopes.forEach(({ w, d, tex, tint, pile: fallbackPile }, i) => {
      const letterData = window.LETTERS_DATA && window.LETTERS_DATA.letters && window.LETTERS_DATA.letters[i];
      const pile = (letterData && letterData.pile) || fallbackPile;
      const env = makeEnvelope(w, d, tex, tint);
      env.position.set(pile.x, pile.y, pile.z);
      env.rotation.order = "YXZ";
      env.rotation.set(deg2rad(pile.rotX), deg2rad(pile.rotY), deg2rad(pile.rotZ));
      body.add(env);
      envelopeMeshes.push(env);
    });

    // Interior light — dim, soft, candle-like: gentle falloff (low decay),
    // wider reach, warm but desaturated so it doesn't look like a bulb.
    // Position is Tweaks-adjustable too (see setLightPosition).
    const lp = (window.LETTERS_DATA && window.LETTERS_DATA.lightPos) || { x: 0.06, y: 0.455, z: 0.2 };
    interiorLight = new THREE.PointLight(0xffd9ae, 0, 2.4, 1.6);
    interiorLight.position.set(lp.x, lp.y, lp.z);
    body.add(interiorLight);

    // DOOR GROUP — hinge at y=0, front face at z=L/2, swings on X axis
    doorGroup = new THREE.Group();
    doorGroup.position.set(0, 0, L / 2);
    body.add(doorGroup);

    // Door face is DoubleSide so it stays visible after swinging past 90°
    const doorMat = new THREE.MeshLambertMaterial({ color: 0xc46554, side: THREE.DoubleSide });
    const doorFace = new THREE.Mesh(new THREE.ShapeGeometry(archShape()), doorMat);
    doorFace.castShadow = true;
    doorFace.receiveShadow = true;
    doorGroup.add(doorFace);

    // Latch — small horizontal bar centred on the door, near top of rectangular section
    const latch = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.035, 0.035),
      ironMat
    );
    latch.position.set(0, BH * 0.72, 0.02);
    doorGroup.add(latch);

    mailboxGroup.userData.body = body;
    mailboxGroup.traverse(o => { if (o.isMesh) o.userData.mailbox = true; });
    mailboxGroup.rotation.y = -0.55;
  }

  function buildLights() {
    // ground bounce leans toward the new grass tone instead of bare dirt
    const ambient = new THREE.HemisphereLight(0xfde4c8, 0x5c5432, 0.55);
    scene.add(ambient);

    // key stays roughly where the mailbox was tuned for — only nudged a
    // touch toward the back for a hint of the sunset backlight. Position is
    // 2x the original (5,3,-2) direction, pushed straight back along the
    // same ray: a DirectionalLight's illumination only depends on direction,
    // not distance, so this doesn't change how anything is lit — it only
    // gives the shadow camera's near plane (0.5) room to clear the cliff-lip
    // rock clusters near (5.3,-6.3) and (7.0,-1.5), which otherwise sit
    // behind/at the near plane (their light-space depth was ~0, some even
    // negative) and silently dropped out of the shadow map entirely.
    const sun = new THREE.DirectionalLight(0xffd6a0, 1.6);
    sun.position.set(10, 6, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 30;
    // Old bias:-0.0005 alone caused a visible gap between rocks and their
    // shadows (peter-panning). Tested bias/normalBias down to 0 across every
    // rock and the mailbox dome at high contrast — no shadow acne appears at
    // this light angle, so there's no need for either offset.
    sun.shadow.bias = 0;
    sun.shadow.normalBias = 0;
    scene.add(sun);

    // warm rim light — faked sun-side rim, slightly stronger now that the
    // visible sun sits back-left
    const rim = new THREE.DirectionalLight(0xffa072, 0.5);
    rim.position.set(-5, 2, 4);
    scene.add(rim);
  }

  function onPointerMove(e) {
    const r = canvasEl.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(mailboxGroup, true);
    canvasEl.style.cursor = hits.length > 0 ? "pointer" : "default";
  }

  function onCanvasClick(e) {
    const r = canvasEl.getBoundingClientRect();
    pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(mailboxGroup, true);
    if (hits.length > 0 && onClickCb) onClickCb();
  }

  function onResize() {
    if (!canvasEl) return;
    const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
    if (w === _lastW && h === _lastH) return;
    _lastW = w; _lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function cameraTo(stage, dur = 3000) {
    const target = CAM[stage] || CAM.outside;
    camAnim = {
      start: performance.now(),
      from: camera.position.clone(),
      to: new THREE.Vector3(...target.pos),
      lookFrom: currentLook.clone(),
      lookTo: new THREE.Vector3(...target.look),
      dur,
      stage
    };
  }

  function setDoorOpen(t) { doorTarget = t; }

  // Live-update one envelope's transform from the Tweaks panel. rotX/Y/Z are
  // in degrees (friendlier for a slider than radians); index matches the
  // letter's position in window.LETTERS_DATA.letters.
  function setEnvelopePile(i, pile) {
    const env = envelopeMeshes[i];
    if (!env) return;
    const d2r = (d) => (d || 0) * Math.PI / 180;
    env.position.set(pile.x, pile.y, pile.z);
    env.rotation.set(d2r(pile.rotX), d2r(pile.rotY), d2r(pile.rotZ));
  }

  // Live-update the interior light's position from the Tweaks panel.
  function setLightPosition(pos) {
    if (!interiorLight) return;
    interiorLight.position.set(pos.x, pos.y, pos.z);
  }

  function onMailboxClick(cb) { onClickCb = cb; }

  function easeInOutCubic(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function easeInOutQuad(x) {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  function animate() {
    raf = requestAnimationFrame(animate);
    const now = performance.now();
    const t = now * 0.001;
    updateLandscape(t);

    // door spring — slight overshoot gives a satisfying mechanical settle
    const springForce = (doorTarget - doorCurrent) * 0.045;
    doorVelocity = (doorVelocity + springForce) * 0.84;
    doorCurrent += doorVelocity;
    if (doorCurrent < 0) { doorCurrent = 0; if (doorVelocity < 0) doorVelocity *= -0.12; }
    doorGroup.rotation.x = doorCurrent * (Math.PI * 0.95);

    // interior glow follows the door — closed box is dark, open box glows warm
    if (interiorLight) interiorLight.intensity = Math.max(0, doorCurrent) * 0.7;

    // camera animation
    if (camAnim) {
      const k = Math.min(1, (now - camAnim.start) / camAnim.dur);
      // inside: gentler quad ease for a slow steady zoom; outside: snappier cubic
      const e = easeInOutCubic(k);
      const p = new THREE.Vector3().lerpVectors(camAnim.from, camAnim.to, e);
      if (camAnim.stage === 'inside') {
        // Bell-curve arc: sin(k*π) is 0 at both start and end, peaks at midpoint.
        // This creates a gentle orbital sweep with no jump on frame 0.
        const sweep = Math.pow(Math.sin(k * Math.PI), 3) * 0.3;
        const lt = camAnim.lookTo;
        const dx = p.x - lt.x, dz = p.z - lt.z;
        const cs = Math.cos(sweep), sn = Math.sin(sweep);
        p.x = lt.x + dx * cs - dz * sn;
        p.z = lt.z + dx * sn + dz * cs;
      }
      camera.position.copy(p);
      currentLook.lerpVectors(camAnim.lookFrom, camAnim.lookTo, e);
      camera.lookAt(currentLook);
      if (k >= 1) camAnim = null;
    } else {
      // gentle idle drift on camera while outside
      camera.lookAt(currentLook);
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    cancelAnimationFrame(raf);
    renderer.dispose();
  }

  // Dev helper: jump the camera to an arbitrary pos/look instantly (used for
  // trying out framing options; safe to leave in, nothing calls it in prod).
  function _debugCam(pos, look) {
    camAnim = null;
    camera.position.set(...pos);
    currentLook.set(...look);
    camera.lookAt(currentLook);
  }

  return { init, onMailboxClick, cameraTo, setDoorOpen, setEnvelopePile, setLightPosition, dispose, _debugCam };
})();

window.ThreeScene = ThreeScene;
