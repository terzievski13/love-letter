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
  let mailboxGroup, doorGroup, flagGroup;
  let onClickCb = null;
  let raycaster, pointer;
  let canvasEl;

  // camera waypoints (target positions / look-ats)
  // Mailbox group is rotated -0.55 rad on Y so opening points roughly toward (+X, +Z).
  // Outside cam sees it 3/4. Inside cam ends up just above the opening, looking down into it.
  const CAM = {
    outside: { pos: [4.6, 2.6, 6.2], look: [0, 1.7, 0] },
    inside:  { pos: [1.05, 2.55, 1.55], look: [0.3, 1.55, 0.5] }
  };

  let camAnim = null; // {start, from, to, lookFrom, lookTo, dur}
  let currentLook = new THREE.Vector3(0, 1.6, 0);

  // door rotation
  let doorTarget = 0;
  let doorCurrent = 0;
  let doorVelocity = 0;

  // flag wiggle
  let flagPhase = 0;

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
    scene.fog = new THREE.Fog(0xf6c89a, 25, 80);

    camera = new THREE.PerspectiveCamera(38, initW / initH, 0.1, 200);
    camera.position.set(...CAM.outside.pos);
    camera.lookAt(...CAM.outside.look);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    buildSky();
    buildSea();
    buildCliff();
    buildFoliage();
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

  function buildSea() {
    // Sea: textured plane with painted gradient + sun glitter
    const c = document.createElement("canvas");
    c.width = 256; c.height = 256;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#5a7a96");   // far
    g.addColorStop(0.5, "#7a92a8");
    g.addColorStop(1, "#c8a888");   // near (warm reflection)
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    // sun glitter band
    const sg = ctx.createRadialGradient(180, 60, 8, 180, 60, 80);
    sg.addColorStop(0, "rgba(255,228,180,0.85)");
    sg.addColorStop(1, "rgba(255,228,180,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, 256, 256);
    // ripple lines
    ctx.strokeStyle = "rgba(255,240,210,0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 80; i++) {
      ctx.beginPath();
      const y = Math.random() * 256;
      ctx.moveTo(Math.random() * 256, y);
      ctx.lineTo(Math.random() * 256 + 30, y);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const geo = new THREE.PlaneGeometry(400, 400);
    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
    const sea = new THREE.Mesh(geo, mat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -8, -40);
    scene.add(sea);
    scene.userData.sea = sea;
  }

  function buildCliff() {
    // Grass platform — irregular front edge
    const platShape = new THREE.Shape();
    platShape.moveTo(-12, -8);
    platShape.lineTo(12, -8);
    platShape.lineTo(13, -3);
    platShape.bezierCurveTo(10, -1.5, 6, -0.5, 2, -0.7);
    platShape.bezierCurveTo(-2, -0.9, -6, -1.8, -10, -2.2);
    platShape.lineTo(-13, -3);
    platShape.closePath();

    const platGeo = new THREE.ExtrudeGeometry(platShape, {
      depth: 6, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.18, bevelSegments: 2
    });
    platGeo.rotateX(-Math.PI / 2);

    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x8a9040, roughness: 0.95, metalness: 0
    });
    const platform = new THREE.Mesh(platGeo, grassMat);
    platform.position.y = -6;
    platform.receiveShadow = true;
    scene.add(platform);

    // Rocky cliff face (a few angled boxes underneath)
    const rockMat = new THREE.MeshStandardMaterial({ color: 0xa88366, roughness: 1, metalness: 0 });
    for (let i = -3; i <= 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 3), rockMat);
      b.position.set(i * 3.5, -8, -1 + Math.random() * 0.5);
      b.rotation.z = (Math.random() - 0.5) * 0.2;
      b.rotation.y = (Math.random() - 0.5) * 0.3;
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
    }

    // Grass blades on top — instanced
    // Pre-collect valid positions so no InstancedMesh slots are left at identity/origin
    const bladeGeo = new THREE.PlaneGeometry(0.06, 0.25);
    bladeGeo.translate(0, 0.125, 0);
    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x9a9448, side: THREE.DoubleSide, roughness: 1
    });
    const bladeData = [];
    for (let i = 0; i < 900; i++) {
      const x = (Math.random() - 0.5) * 24;
      const z = -7 + Math.random() * 6;
      const front = -1.5 + (x * x) * 0.005;
      if (z > front) continue;
      bladeData.push([x, z, Math.random() * Math.PI, 0.7 + Math.random() * 0.6]);
    }
    const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeData.length);
    const dummy = new THREE.Object3D();
    bladeData.forEach(([x, z, ry, s], idx) => {
      dummy.position.set(x, -0.05, z);
      dummy.rotation.y = ry;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      grass.setMatrixAt(idx, dummy.matrix);
    });
    grass.instanceMatrix.needsUpdate = true;
    scene.add(grass);

    // Tiny flowers scattered
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xeaa05a, roughness: 0.9 });
    for (let i = 0; i < 18; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 6), flowerMat);
      f.position.set((Math.random() - 0.5) * 18, 0.05, -6 + Math.random() * 5);
      scene.add(f);
    }
  }

  function buildFoliage() {
    // a single small bush behind the mailbox for depth
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x6e8a4a, roughness: 1 });
    const bush = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.2, 8, 6), bushMat);
      s.position.set((Math.random() - 0.5) * 0.7, 0.3 + Math.random() * 0.2, (Math.random() - 0.5) * 0.6);
      bush.add(s);
    }
    bush.position.set(-2.2, 0, -3);
    scene.add(bush);
  }

  function buildMailbox() {
    /* Mailbox is built so its OPENING (door end) faces +Z.
       Local axes: +X = right side of box, +Y = up, +Z = front (door),
                   -Z = back (closed wall).
       After we build it, we tilt the whole group ~ -0.45 rad on Y so
       the camera's outside view (at +X +Z) sees a 3/4 angle. */
    mailboxGroup = new THREE.Group();
    scene.add(mailboxGroup);

    // softer toon-ish materials
    const woodMat   = new THREE.MeshLambertMaterial({ color: 0x7a5640 });
    const bodyMat   = new THREE.MeshLambertMaterial({ color: 0xc46554 });
    const bodyDark  = new THREE.MeshLambertMaterial({ color: 0x9a4636 });
    const innerMat  = new THREE.MeshLambertMaterial({ color: 0x3a2218, side: THREE.DoubleSide });
    const ironMat   = new THREE.MeshLambertMaterial({ color: 0x33241c });
    const flagMat   = new THREE.MeshLambertMaterial({ color: 0xd45044 });

    // post
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.6, 0.14), woodMat);
    post.position.y = 0.8;
    post.castShadow = true;
    mailboxGroup.add(post);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), woodMat);
    plate.position.y = 0.03;
    plate.castShadow = true; plate.receiveShadow = true;
    mailboxGroup.add(plate);

    // body group: opening faces +Z
    const body = new THREE.Group();
    body.position.y = 1.78;
    mailboxGroup.add(body);

    // Half-cylinder outer shell — axis along Z, top half above the floor.
    // CylinderGeometry default axis is Y, so we rotate -90° on X to point along Z.
    const shellOuter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 1.05, 28, 1, true, 0, Math.PI),
      bodyMat
    );
    shellOuter.rotation.x = -Math.PI / 2;
    // The half-cylinder by default opens at angle 0 (which is +X side after the Y axis); 
    // but we want flat side DOWN. After rotating X = -90, the open half spans +Y (up) by default? 
    // Actually we want it open downward so we can place a flat floor. Set thetaStart so the missing
    // half is below the local origin -> rotate the geometry around its (now Z) axis by -PI/2.
    shellOuter.rotation.z = 0;
    shellOuter.castShadow = true; shellOuter.receiveShadow = true;
    body.add(shellOuter);

    // Inner shell (slightly smaller, dark interior)
    const shellInner = new THREE.Mesh(
      new THREE.CylinderGeometry(0.40, 0.40, 1.02, 28, 1, true, 0, Math.PI),
      innerMat
    );
    shellInner.rotation.x = -Math.PI / 2;
    body.add(shellInner);

    // Floor of the mailbox
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.02, 1.04),
      innerMat
    );
    floor.position.y = -0.01;
    body.add(floor);

    // Back wall (closed end, at -Z)
    const back = new THREE.Mesh(
      new THREE.CircleGeometry(0.40, 28, 0, Math.PI),
      bodyDark
    );
    back.position.z = -0.525;
    back.rotation.z = 0;
    back.rotation.y = Math.PI; // face -Z outward
    body.add(back);

    // door — hinged at the BOTTOM of the front opening, swings down/out
    doorGroup = new THREE.Group();
    doorGroup.position.set(0, 0, 0.525); // at the front opening
    body.add(doorGroup);
    // door panel: a half-disc, with its straight edge at the bottom (the hinge)
    // CircleGeometry from 0..PI gives a half disc with straight edge along the x-axis,
    // centered at (0,0). Translate up by 0 — it already pivots around y=0 which is the hinge line.
    const doorMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.40, 28, 0, Math.PI),
      bodyMat
    );
    // door panel local: straight edge along x at y=0 (hinge), curve goes up.
    doorMesh.castShadow = true;
    doorGroup.add(doorMesh);
    // little metal trim / handle near the top of the door
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 12, 8),
      ironMat
    );
    handle.position.set(0, 0.32, 0.01);
    doorGroup.add(handle);

    // flag on the LEFT side (–X local)
    flagGroup = new THREE.Group();
    flagGroup.position.set(-0.42, 0.0, 0.05); // mounted on left side, near front
    body.add(flagGroup);
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.34, 8),
      ironMat
    );
    pole.position.y = 0.17;
    flagGroup.add(pole);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.005, 0.1, 0.18),
      flagMat
    );
    flag.position.set(0, 0.30, 0.09);
    flagGroup.add(flag);

    mailboxGroup.userData.body = body;
    mailboxGroup.traverse(o => { if (o.isMesh) o.userData.mailbox = true; });

    // 3/4 angle: rotate so the front opening tilts toward outside camera (+X +Z)
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
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function cameraTo(stage, dur = 2200) {
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
    doorVelocity = (doorVelocity + springForce) * 0.76;
    doorCurrent += doorVelocity;
    doorGroup.rotation.x = -doorCurrent * (Math.PI * 0.95);

    // flag wiggle
    flagPhase += 0.03;
    flagGroup.rotation.z = Math.sin(flagPhase) * 0.06;

    // camera animation
    if (camAnim) {
      const k = Math.min(1, (now - camAnim.start) / camAnim.dur);
      // inside: gentler quad ease for a slow steady zoom; outside: snappier cubic
      const e = camAnim.stage === 'inside' ? easeInOutQuad(k) : easeInOutCubic(k);
      const p = new THREE.Vector3().lerpVectors(camAnim.from, camAnim.to, e);
      if (camAnim.stage === 'inside') {
        // Clockwise sweep: camera starts at a small CCW offset that winds down to 0,
        // creating a gentle clockwise arc around the mailbox as it zooms in
        const sweep = (1 - e) * 0.32;
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
