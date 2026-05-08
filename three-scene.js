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
    scene.background = new THREE.Color(0xfbcf9a); // fallback if sky fails
    scene.fog = new THREE.Fog(0xf6c89a, 30, 200);

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
    g.addColorStop(0.00, "#f2a06a"); // top
    g.addColorStop(0.45, "#fbcf9a");
    g.addColorStop(0.75, "#fde6cd");
    g.addColorStop(1.00, "#f6c89a"); // horizon
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
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    scene.add(new THREE.Mesh(geo, mat));

    // distant clouds (a few flat sprites)
    const cloudTex = makeCloudTexture();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, color: 0xfff3e6, transparent: true, opacity: 0.72, depthWrite: false });
      const s = new THREE.Sprite(m);
      const ang = (i / 6) * Math.PI * 0.8 - Math.PI * 0.15;
      const r = 60 + Math.random() * 10;
      s.position.set(Math.cos(ang) * r, 8 + Math.random() * 4, -Math.abs(Math.sin(ang) * r) - 20);
      s.scale.set(18 + Math.random() * 8, 6 + Math.random() * 2, 1);
      scene.add(s);
    }
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
    g.addColorStop(0.00, "#2a3a52"); // deep slate-blue far
    g.addColorStop(0.40, "#4a6a82"); // calm lake blue
    g.addColorStop(0.78, "#6a8ea4"); // lighter mid-blue
    g.addColorStop(1.00, "#7a9eac"); // near shore blue
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // warm sun glitter streak on the water surface
    const sg = ctx.createRadialGradient(128, 80, 6, 128, 80, 90);
    sg.addColorStop(0, "rgba(255,220,140,0.55)");
    sg.addColorStop(1, "rgba(255,220,140,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 256, 256);
    // soft ripple lines
    ctx.strokeStyle = "rgba(200,230,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
      const wy = Math.random() * 256;
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
      new THREE.MeshStandardMaterial({ color: 0x8a9040, roughness: 0.95, metalness: 0 })
    );
    // position: top at y=0, front face (shore edge) at z=-10, back edge at z=90
    ground.position.set(0, -0.25, 40);
    ground.receiveShadow = true;
    scene.add(ground);
  }

  function buildMountains() {
    // Three depth layers of low-poly peaks — closer ones dark, far ones warm-hazy
    // Fog (30–200) provides natural atmospheric thinning on the far peaks
    // r is kept to ~¼ of h so peaks look narrow and alpine, not pyramidal
    const peaks = [
      // front layer — darkest, least fogged
      { x: -18, z:  -65, h: 30, r:  9, color: 0x7a4828 },
      { x:  15, z:  -62, h: 24, r:  7, color: 0x7a5030 },
      // middle layer
      { x: -35, z:  -90, h: 56, r: 16, color: 0x9a5838 },
      { x:   4, z:  -86, h: 72, r: 20, color: 0x8a4830 }, // dominant peak
      { x:  36, z:  -96, h: 50, r: 15, color: 0x9a6040 },
      // back layer — lightest, most fogged
      { x: -55, z: -118, h: 44, r: 14, color: 0xb87050 },
      { x:  20, z: -112, h: 58, r: 18, color: 0xaa6848 },
      { x:  60, z: -126, h: 38, r: 12, color: 0xbe8060 },
    ];
    peaks.forEach(({ x, z, h, r, color }) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 5, 1), // 5-sided = angular low-poly alpine shape
        new THREE.MeshLambertMaterial({ color, fog: true })
      );
      cone.position.set(x, h / 2, z); // base at y=0, rises upward
      scene.add(cone);
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
    const outerMat = new THREE.MeshLambertMaterial({ color: 0xc46554, side: THREE.DoubleSide });
    const outerShell = new THREE.Mesh(
      new THREE.ExtrudeGeometry(archShape(), { depth: L, bevelEnabled: false }),
      outerMat
    );
    outerShell.position.z = -L / 2; // centre along Z so back=-L/2, front=+L/2
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
    sun.position.set(8, 5, -10);
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
