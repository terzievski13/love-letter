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
    scene.background = new THREE.Color(0xd8ecf8); // fallback if sky fails
    scene.fog = new THREE.Fog(0xd8ecf8, 25, 80);

    camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 200);
    camera.position.set(...CAM.outside.pos);
    camera.lookAt(...CAM.outside.look);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    buildSky();
    buildGround();
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
    g.addColorStop(0.00, "#87ceeb"); // top
    g.addColorStop(0.45, "#c8e8f5");
    g.addColorStop(0.75, "#fde8d0");
    g.addColorStop(1.00, "#e8d8c8"); // horizon
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 16, 256);
    // sun glow band
    const sg = ctx.createRadialGradient(8, 80, 4, 8, 80, 60);
    sg.addColorStop(0, "rgba(255,248,235,0.85)");
    sg.addColorStop(0.4, "rgba(255,248,235,0.3)");
    sg.addColorStop(1, "rgba(255,248,235,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 16, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.SphereGeometry(100, 32, 16);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
    scene.add(new THREE.Mesh(geo, mat));

    // clouds ringing the dome horizon in full 360° circle
    const cloudTex = makeCloudTexture();
    for (let i = 0; i < 10; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex, color: 0xffffff, transparent: true, opacity: 0.78, depthWrite: false });
      const s = new THREE.Sprite(m);
      const ang = (i / 10) * Math.PI * 2;
      const r = 62 + Math.random() * 12;
      s.position.set(Math.cos(ang) * r, 5 + Math.random() * 6, Math.sin(ang) * r);
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

  function buildGround() {
    // Domed hemisphere: circular hill with mailbox on top, grass curves away all sides into sky
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(40, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x8a9040, roughness: 0.95, metalness: 0 })
    );
    // Center sphere at [0, -40, 0] so the top (y=0) is where mailbox sits
    dome.position.set(0, -40, 0);
    dome.receiveShadow = true;
    scene.add(dome);
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
    const ambient = new THREE.HemisphereLight(0xc8e8f5, 0x6a7840, 0.75);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfffae0, 1.15);
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

    // soft cool-blue rim light
    const rim = new THREE.DirectionalLight(0xd4eeff, 0.3);
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
