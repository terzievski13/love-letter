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
    outside: { pos: [4, 2.6, 8.2], look: [0, 1.7, 0] },
    inside: isMobile
      ? { pos: [-1.5, 2.58, 4.85], look: [0, 1.65, 0] }
      : { pos: [-0.88, 2.25, 2.80], look: [0, 1.65, 0] }
  };

  let camAnim = null; // {start, from, to, lookFrom, lookTo, dur}
  let currentLook = new THREE.Vector3(0, 1.6, 0);

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

    camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 200);
    camera.position.set(...CAM.outside.pos);
    camera.lookAt(...CAM.outside.look);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    buildSky();
    buildWater();
    buildGround();
    buildMountains();
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
    cloudConfigs.forEach(({ x, y, z, w, h, color, opacity }) => {
      const m = new THREE.SpriteMaterial({ map: cloudTex, color, transparent: true, opacity, depthWrite: false });
      const s = new THREE.Sprite(m);
      s.position.set(x, y, z);
      s.scale.set(w, h, 1);
      scene.add(s);
    });
  }

  function makeCloudTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 120);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(128, 128, 110, 0, Math.PI * 2); ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  function buildWater() {
    // Warm sunset lake — gradient canvas texture, starts behind the shore edge at z=-10
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const ctx = c.getContext("2d");
    // gradient runs top (far) to bottom (near shore)
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0.00, "#1e3248"); // deep blue far horizon
    g.addColorStop(0.30, "#2e5070"); // rich mid-lake blue
    g.addColorStop(0.65, "#4a7a98"); // brighter mid
    g.addColorStop(1.00, "#68a8c4"); // clean near-shore blue
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // warm sun glitter streak — back to its original spot (outside the
    // visible strip), so the water reads as plain blue like before
    const sg = ctx.createRadialGradient(128, 70, 4, 128, 70, 80);
    sg.addColorStop(0, "rgba(255,210,130,0.40)");
    sg.addColorStop(1, "rgba(255,210,130,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 256, 256);
    // Ripple lines — same style as the main branch (short straight strokes,
    // cool blue-white), kept inside the ~46px band that's actually visible
    // on screen here (the shore hides everything past y≈187, the mountains
    // hide everything before y≈141) — main's own random full-canvas
    // placement would mostly land somewhere hidden in this scene's geometry.
    ctx.strokeStyle = "rgba(200,230,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const wy = 141 + Math.random() * 46;
      ctx.beginPath();
      ctx.moveTo(Math.random() * 256, wy);
      ctx.lineTo(Math.random() * 256 + 40, wy);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // Large plane centered well behind the shore so it fills the background
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 400),
      new THREE.MeshBasicMaterial({ map: tex, fog: true })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, -0.05, -100); // slightly below ground level, far back
    scene.add(water);
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
  function terrainDrop(x, z) {
    const wob = (fbm2(x / 14 + 40.2, z / 14 + 17.9, 2) - 0.5) * 0.12;
    const ex = x / 34;
    const ez = (z - 23) / 32;
    const d = Math.sqrt(ex * ex + ez * ez) + wob;
    const edge = sstep(0.95, 1.28, d);
    const front = sstep(-9, -18, z); // steeper drop past the old z=-10 shore line
    return Math.max(edge, front);
  }

  function groundHeight(x, z) {
    // gentle rolling grass — rises only (0..0.55): centered noise would dip
    // low spots under the water plane and read as random inland ponds
    let h = fbm2(x / 8 + 3.7, z / 8 + 9.1, 2) * 0.55;
    // dead-flat plateau under the mailbox — base plate, shadow and camera
    // look-at all assume y=0 there; blends back to rolling by r=5
    h *= sstep(2.8, 5, Math.hypot(x, z));
    // headland drop into the sea, with a little cliff-face roughness in the band
    const drop = terrainDrop(x, z);
    const cliffNoise = (fbm2(x / 3 + 77.7, z / 3 + 51.3, 2) - 0.5) * 0.5 * drop * (1 - drop) * 4;
    return h * (1 - drop) + (-2.5) * drop + cliffNoise;
  }

  // 1 on the dirt path, 0 off it. Distance to a quadratic bezier from the
  // bottom-right of the outside camera's frame to the mailbox base — sampled,
  // which is plenty accurate for coloring and stone placement.
  const PATH_P0 = [2.7, 6.8], PATH_P1 = [2.4, 3.0], PATH_P2 = [0.4, 0.85];
  function pathMask(x, z) {
    let min2 = Infinity;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, u = 1 - t;
      const px = u * u * PATH_P0[0] + 2 * u * t * PATH_P1[0] + t * t * PATH_P2[0];
      const pz = u * u * PATH_P0[1] + 2 * u * t * PATH_P1[1] + t * t * PATH_P2[1];
      const dx = x - px, dz = z - pz;
      const d2 = dx * dx + dz * dz;
      if (d2 < min2) min2 = d2;
    }
    return 1 - sstep(0.30, 0.55, Math.sqrt(min2));
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
    const dirtA  = new THREE.Color(0x9a744a);
    const dirtB  = new THREE.Color(0xb08a5a);
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
        if (x > -1 && x < 4.6 && z > -0.6 && z < 8.4) {
          const pm = pathMask(x, z);
          if (pm > 0) {
            dirt.copy(dirtA).lerp(dirtB, fbm2(x / 2.4 + 31.1, z / 2.4 + 5.5, 2));
            col.lerp(dirt, pm);
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
    // Smooth ridge silhouettes using the midpoint-quadratic method:
    // each "peak" point is a bezier control point; the curve passes through
    // midpoints between consecutive peaks, giving smooth slopes with
    // natural-feeling summits rather than sharp spikes.
    // MeshBasicMaterial (no lighting) makes fog blend predictably —
    // distant layers fade directly into the warm peach horizon.
    function makeRidge(pts, baseY) {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], baseY);
      s.lineTo(pts[0][0], pts[0][1]);
      for (let i = 0; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i+1][0]) / 2;
        const my = (pts[i][1] + pts[i+1][1]) / 2;
        s.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
      }
      const last = pts[pts.length - 1];
      s.lineTo(last[0], last[1]);
      s.lineTo(last[0], baseY);
      s.closePath();
      return s;
    }

    const layers = [
      {
        // Front foothills — deep warm purple silhouette just behind the lake
        z: -90,
        rocky: 0x3a1e1c,
        forest: 0x364e34,
        forestRatio: 0.4, // treeline height as a fraction of each peak — keeps the same curve, just shorter
        pts: [
          [-92,0],[-76,7],[-60,18],[-46,11],[-32,24],[-18,15],[-4,28],
          [10,18],[24,14],[38,21],[52,12],[66,17],[78,8],[92,0]
        ]
      },
      {
        // Main range — warm mauve, dominant peaks left of centre, taper right
        z: -105,
        rocky: 0x461C14,
        forest: 0x473227,
        forestRatio: 0.38,
        pts: [
          [-94,2],[-78,12],[-62,26],[-46,16],[-30,40],[-14,26],
          [0,48],[14,36],[28,50],[42,36],[56,22],[68,14],[80,9],[94,2]
        ]
      },
      {
        // Distant range — warm rose-gray, fog blends it into peach horizon
        z: -145,
        rocky: 0x9a7880,
        forest: 0x6e5868,
        forestRatio: 0.35,
        pts: [
          [-141,3],[-125,14],[-107,28],[-89,18],[-69,38],[-49,26],
          [-29,42],[-9,28],[9,36],[27,20],[43,10],[51,3]
        ]
      }
    ];

    // Darkens each ridge toward its base with a vertex-color gradient — a
    // fake contact shadow where it tucks behind the layer in front of it,
    // for a sense of depth instead of flat cutout color.
    function applyBaseShadow(mesh, colorHex, baseY, shadowHeight) {
      const pos = mesh.geometry.attributes.position;
      const colors = new Float32Array(pos.count * 3);
      const base = new THREE.Color(colorHex);
      const shadow = base.clone().multiplyScalar(0.45);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const t = THREE.MathUtils.clamp((pos.getY(i) - baseY) / shadowHeight, 0, 1);
        c.copy(shadow).lerp(base, t);
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      mesh.material.vertexColors = true;
      mesh.material.color.set(0xffffff);
    }

    layers.forEach(({ z, rocky, forest, forestRatio, pts }) => {
      const ridgeMesh = new THREE.Mesh(
        new THREE.ShapeGeometry(makeRidge(pts, -4)),
        new THREE.MeshBasicMaterial({ color: rocky, fog: true, side: THREE.DoubleSide })
      );
      ridgeMesh.position.z = z;
      applyBaseShadow(ridgeMesh, rocky, -4, 6);
      scene.add(ridgeMesh);

      const fPts = pts.map(([x, y]) => [x, y * forestRatio]);
      const forestMesh = new THREE.Mesh(
        new THREE.ShapeGeometry(makeRidge(fPts, -4)),
        new THREE.MeshBasicMaterial({ color: forest, fog: true, side: THREE.DoubleSide })
      );
      forestMesh.position.z = z + 0.5;
      scene.add(forestMesh);
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
    const ambient = new THREE.HemisphereLight(0xfde4c8, 0x6a4a3a, 0.55);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xffd6a0, 1.6);
    sun.position.set(6, 3, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -10;
    sun.shadow.camera.right = 10;
    sun.shadow.camera.top = 10;
    sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 30;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    // warm rim light
    const rim = new THREE.DirectionalLight(0xff9a6a, 0.4);
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
