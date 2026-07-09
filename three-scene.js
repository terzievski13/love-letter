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
  let mailboxGroup, doorGroup;
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
      ? { pos: [0, 2.5, 5], look: [0, 1.65, 0] }
      : { pos: [0, 2.2, 3],   look: [0, 1.65, 0] }
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

  function buildGround() {
    // Box geometry so the front face at z=-10 is the visible shore edge
    // Top surface at y=0 matches the mailbox base plate exactly
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(200, 0.5, 100),
      new THREE.MeshStandardMaterial({ color: 0x8ca511, roughness: 0.95, metalness: 0 })
    );
    // position: top at y=0, front face (shore edge) at z=-10, back edge at z=90
    ground.position.set(0, -0.25, 40);
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
    const innerMat = new THREE.MeshLambertMaterial({ color: 0x2a1810, side: THREE.DoubleSide });
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

    // INNER shell — half-cylinder slightly smaller, dark interior
    const domeInner = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.015, R - 0.015, L - 0.01, 40, 1, true, -Math.PI / 2, Math.PI),
      innerMat
    );
    domeInner.rotation.x = -Math.PI / 2;
    domeInner.position.y = BH;
    body.add(domeInner);

    // Inner side panels (dark lower walls, slightly inset)
    const innerSideGeo = new THREE.BoxGeometry(0.012, BH, L - 0.01);
    const innerSideL = new THREE.Mesh(innerSideGeo, innerMat);
    innerSideL.position.set(-(R - 0.015), BH / 2, 0);
    body.add(innerSideL);
    const innerSideR = new THREE.Mesh(innerSideGeo, innerMat);
    innerSideR.position.set(R - 0.015, BH / 2, 0);
    body.add(innerSideR);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry((R - 0.015) * 2, 0.018, L - 0.01),
      innerMat
    );
    floor.position.y = 0.009;
    floor.receiveShadow = true;
    body.add(floor);

    // Dark back wall — without this the red outer shell back cap shows through
    const backWall = new THREE.Mesh(new THREE.ShapeGeometry(archShape()), innerMat);
    backWall.position.z = -L / 2 + 0.012;
    body.add(backWall);

    // Decorative letter props — cream envelopes sitting on the floor
    const letterMat = new THREE.MeshLambertMaterial({ color: 0xf5ead8 });
    const letterGeo = new THREE.BoxGeometry(0.55, 0.008, 0.38);
    [{ x: -0.05, rz: 0.06 }, { x: 0.00, rz: 0.00 }, { x: 0.06, rz: -0.05 }].forEach(({ x, rz }) => {
      const letter = new THREE.Mesh(letterGeo, letterMat);
      letter.position.set(x, 0.022, -0.1);
      letter.rotation.z = rz;
      body.add(letter);
    });

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

  return { init, onMailboxClick, cameraTo, setDoorOpen, dispose };
})();

window.ThreeScene = ThreeScene;
