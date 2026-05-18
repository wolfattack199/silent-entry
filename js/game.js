/* =============================================================
   game.js — Three.js scene, controls, movement, detection,
   mission state machine. Glues SilentMap, SilentEntities,
   SilentUI, and SilentSave together.
   ============================================================= */

window.SilentGame = (function () {

  // ----- Difficulty profiles -----
  const DIFFICULTIES = {
    'Rookie':    { visionRange:  8, visionAngle:  70, detectionSpeed: 0.35, showVisionCones: true,  enemyCount: 4 },
    'Standard':  { visionRange: 10, visionAngle:  85, detectionSpeed: 0.55, showVisionCones: true,  enemyCount: 5 },
    'Veteran':   { visionRange: 13, visionAngle: 100, detectionSpeed: 0.85, showVisionCones: false, enemyCount: 6 },
    'Nightmare': { visionRange: 15, visionAngle: 110, detectionSpeed: 1.25, showVisionCones: false, enemyCount: 6 },
  };

  // ----- State -----
  let renderer, gameScene, gameCamera;
  let menuScene, menuCamera;
  let map = null;
  let civilians = [], enemies = [], intel = [], doors = [];
  let flashlight = null, flashlightTarget = null;
  let state = 'menu';                // menu | playing | paused | ending
  let mode  = 'standard';            // standard | timed | nightmare
  let difficulty = 'Standard';
  let detection = 0;
  let missionTimeMs = 0;
  let civSecured = 0;
  let intelCollected = 0;
  let lastFrame = performance.now();
  let shakeTime = 0;
  let pointerLocked = false;
  let lastInteractable = null;       // for HUD prompt

  const PLAYER_RADIUS = 0.32;
  const PLAYER_HEIGHT_STAND = 1.65;
  const PLAYER_HEIGHT_CROUCH = 1.0;

  const player = {
    position: new THREE.Vector3(),
    yaw: 0,
    crouching: false,
    slowWalking: false,
    flashlightOn: true,
    height: PLAYER_HEIGHT_STAND,
    vel: new THREE.Vector3(),
  };

  const input = { w:false, a:false, s:false, d:false, shift:false, ctrl:false };

  // ---------- Public API ----------

  function init() {
    setupRenderer();
    setupMenuScene();
    bindInput();
    bindPointerLock();
    window.addEventListener('resize', onResize);
    SilentUI.init({
      startMission,
      abortMission,
      resumeMission,
      retryMission,
      returnToMenu,
      menuBgRender: renderMenu,
    });
    requestAnimationFrame(animate);
  }

  // ---------- Renderer + cameras ----------

  function setupRenderer() {
    const canvas = document.getElementById('gameCanvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    applyGraphicsToRenderer();

    // Two cameras with different FOVs — game is tighter, menu is wider.
    gameCamera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 200);
    menuCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  }

  function applyGraphicsToRenderer() {
    const gfx = SilentSave.get().graphics;
    renderer.shadowMap.enabled = gfx !== 'Low';
    renderer.shadowMap.type = gfx === 'High' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
  }

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (gameCamera) {
      gameCamera.aspect = window.innerWidth / window.innerHeight;
      gameCamera.updateProjectionMatrix();
    }
    if (menuCamera) {
      menuCamera.aspect = window.innerWidth / window.innerHeight;
      menuCamera.updateProjectionMatrix();
    }
  }

  // ---------- Menu background scene ----------

  function setupMenuScene() {
    menuScene = new THREE.Scene();
    menuScene.background = new THREE.Color(0x05080c);
    menuScene.fog = new THREE.Fog(0x05080c, 8, 35);

    // Ambient + key light
    menuScene.add(new THREE.AmbientLight(0x111418, 0.6));
    const key = new THREE.DirectionalLight(0x6699cc, 0.55);
    key.position.set(5, 8, 5);
    menuScene.add(key);
    const fill = new THREE.PointLight(0x4fd1c5, 0.6, 22, 1.5);
    fill.position.set(-4, 3, -2);
    menuScene.add(fill);

    // Subtle ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshLambertMaterial({ color: 0x0a0e13 })
    );
    ground.rotation.x = -Math.PI / 2;
    menuScene.add(ground);

    // Backdrop "building" — a wall with two windows, vaguely tactical
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x1a2128 });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 0.4), wallMat);
    wall.position.set(0, 2.5, -7);
    menuScene.add(wall);
    const winMat = new THREE.MeshBasicMaterial({ color: 0x1d2a3a });
    const winGlow = new THREE.MeshBasicMaterial({ color: 0xffba62 });
    [-2.4, 2.4].forEach(wx => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(2, 1.4, 0.05), winMat);
      f.position.set(wx, 3, -6.8);
      menuScene.add(f);
      const inset = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.06), winGlow);
      inset.position.set(wx, 3, -6.78);
      menuScene.add(inset);
    });

    // Rotating "search lamp" - a cone glow on the ground
    const lamp = new THREE.SpotLight(0xffe0a0, 1.2, 18, Math.PI / 7, 0.6, 1.6);
    lamp.position.set(0, 6, 2);
    lamp.target.position.set(2, 0, -2);
    menuScene.add(lamp);
    menuScene.add(lamp.target);
    menuScene.userData.lamp = lamp;
    menuScene.userData.lampPhase = 0;

    // A floating cubic "tactical badge"
    const badge = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.8, 0),
      new THREE.MeshStandardMaterial({ color: 0x4fd1c5, emissive: 0x113638, metalness: 0.4, roughness: 0.4 })
    );
    badge.position.set(0, 2.6, 0);
    menuScene.add(badge);
    menuScene.userData.badge = badge;

    menuCamera.position.set(0, 2.3, 6);
    menuCamera.lookAt(0, 2, 0);
  }

  function renderMenu(dt) {
    if (!menuScene) return;
    const d = menuScene.userData;
    if (d.badge) {
      d.badge.rotation.y += dt * 0.6;
      d.badge.rotation.x += dt * 0.18;
      d.badge.position.y = 2.6 + Math.sin(performance.now() * 0.0014) * 0.2;
    }
    if (d.lamp) {
      d.lampPhase += dt * 0.4;
      d.lamp.target.position.set(Math.sin(d.lampPhase) * 5, 0, -2 + Math.cos(d.lampPhase * 0.7) * 2);
      d.lamp.target.updateMatrixWorld();
    }
    renderer.render(menuScene, menuCamera);
  }

  // ---------- Game scene ----------

  function setupGameScene() {
    // Tear down previous scene if any
    if (gameScene) {
      disposeScene(gameScene);
    }
    gameScene = new THREE.Scene();
    const isNightmare = (mode === 'nightmare') || (difficulty === 'Nightmare');
    const fogNear = isNightmare ? 1.5 : 3;
    const fogFar  = isNightmare ? 12 : 22;
    gameScene.fog = new THREE.Fog(0x05080c, fogNear, fogFar);
    gameScene.background = new THREE.Color(0x05080c);

    // Base ambient (very dim — flashlight is primary illumination)
    const amb = new THREE.AmbientLight(0x202830, isNightmare ? 0.10 : 0.20);
    gameScene.add(amb);

    // A subtle hemisphere wash so floors aren't pitch black
    const hemi = new THREE.HemisphereLight(0x223344, 0x05070a, isNightmare ? 0.12 : 0.18);
    gameScene.add(hemi);

    // Build the map
    map = SilentMap.build(gameScene, SilentSave.get().graphics);
    doors = map.doors;

    // Spawn enemies
    enemies = [];
    const profile = currentDifficultyProfile();
    const routes = map.enemyRoutes.slice(0, profile.enemyCount);
    routes.forEach(r => {
      const e = new SilentEntities.Enemy(r, profile);
      enemies.push(e);
      gameScene.add(e.group);
    });

    // Spawn civilians
    civilians = [];
    map.civSpawns.forEach((sp, i) => {
      const c = new SilentEntities.Civilian(sp, i);
      civilians.push(c);
      gameScene.add(c.group);
    });

    // Spawn intel
    intel = [];
    map.intelSpawns.forEach(sp => {
      const it = SilentEntities.makeIntel(sp);
      intel.push(it);
      gameScene.add(it);
    });

    // Player flashlight (narrow spot, attached to camera position each frame)
    const fIntensity = SilentSave.get().flashlightIntensity * (isNightmare ? 0.85 : 1.0);
    flashlight = new THREE.SpotLight(0xffffff, fIntensity * 2.2, 16, Math.PI / 7.5, 0.55, 1.6);
    flashlight.position.set(0, 1.6, 0);
    flashlightTarget = new THREE.Object3D();
    gameScene.add(flashlight);
    gameScene.add(flashlightTarget);
    flashlight.target = flashlightTarget;
    // Flashlight shadows are expensive on a moving spotlight — High only.
    if (SilentSave.get().graphics === 'High') {
      flashlight.castShadow = true;
      flashlight.shadow.mapSize.set(512, 512);
      flashlight.shadow.bias = -0.001;
    }
    player.flashlightOn = SilentSave.get().flashlightDefaultOn;
    flashlight.visible = player.flashlightOn;

    // Place player
    player.position.set(map.playerStart.x, 0, map.playerStart.z);
    const startEuler = new THREE.Euler(0, map.playerStart.facing, 0, 'YXZ');
    gameCamera.quaternion.setFromEuler(startEuler);
    player.height = PLAYER_HEIGHT_STAND;
    gameCamera.position.set(player.position.x, player.height, player.position.z);

    // Mission counters
    detection = 0;
    missionTimeMs = 0;
    civSecured = 0;
    intelCollected = 0;
  }

  function currentDifficultyProfile() {
    // Mode 'nightmare' forces Nightmare regardless of menu setting.
    const dkey = (mode === 'nightmare') ? 'Nightmare' : difficulty;
    return Object.assign({}, DIFFICULTIES[dkey] || DIFFICULTIES.Standard);
  }

  // Recursively dispose meshes/materials/geometries to avoid GPU leaks.
  function disposeScene(scene) {
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => m.dispose && m.dispose());
      }
    });
  }

  // ---------- Mission state ----------

  function startMission(modeArg) {
    mode = modeArg;
    difficulty = SilentSave.get().difficulty;
    if (mode === 'nightmare') difficulty = 'Nightmare';
    setupGameScene();
    state = 'playing';
    SilentUI.showGameplay();
    requestPointerLock();
    // Initial HUD setup
    SilentUI.setHUD({
      timeMs: 0,
      civSecured: 0,
      civTotal: civilians.length,
      intelCollected: 0,
      intelTotal: intel.length,
      mode: prettyMode(),
      stance: 'STAND',
      lightOn: player.flashlightOn,
      detection: 0,
      objective: defaultObjective(),
    });
  }

  function prettyMode() {
    return mode === 'standard' ? 'Standard' : mode === 'timed' ? 'Timed' : 'Nightmare';
  }

  function defaultObjective() {
    const showMarkers = SilentSave.get().objectiveMarkers && mode !== 'nightmare';
    return showMarkers
      ? 'Secure all civilians, then reach the extraction point.'
      : 'Clear the building. Trust your instincts.';
  }

  function pauseMission() {
    if (state !== 'playing') return;
    state = 'paused';
    document.exitPointerLock && document.exitPointerLock();
    SilentUI.showScreen('pauseMenu');
  }

  function resumeMission() {
    if (state !== 'paused') return;
    state = 'playing';
    SilentUI.showGameplay();
    requestPointerLock();
  }

  function abortMission() {
    state = 'menu';
    SilentUI.showScreen('mainMenu');
  }

  // Called by UI when the user returns to the main menu from the end screen.
  // Resets state so the menu's animated background renders again.
  function returnToMenu() {
    state = 'menu';
    SilentUI.showScreen('mainMenu');
  }

  function retryMission() {
    startMission(mode);
  }

  function endMission(won, reason) {
    if (state === 'ending') return;
    state = 'ending';
    document.exitPointerLock && document.exitPointerLock();

    if (won) {
      SilentSave.recordMission({
        timeMs: missionTimeMs,
        civiliansRescued: civSecured,
        intel: intelCollected,
        mode,
      });
    }
    SilentUI.refreshStats();
    SilentUI.refreshSaveReadout();
    SilentUI.refreshNightmareLock();
    SilentUI.showEnd({
      won,
      timeMs: missionTimeMs,
      civSecured,
      civTotal: civilians.length,
      intel: intelCollected,
      mode: prettyMode(),
      reason: reason || (won ? 'All clear — extraction reached.' : ''),
    });
  }

  // ---------- Input ----------

  function bindInput() {
    document.addEventListener('keydown', e => {
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyW': input.w = true; break;
        case 'KeyA': input.a = true; break;
        case 'KeyS': input.s = true; break;
        case 'KeyD': input.d = true; break;
        case 'ShiftLeft': case 'ShiftRight': input.shift = true; player.slowWalking = true; break;
        case 'ControlLeft': case 'ControlRight': input.ctrl = true; player.crouching = true; e.preventDefault(); break;
        case 'KeyE': if (state === 'playing') handleInteraction(); break;
        case 'KeyF': if (state === 'playing') toggleFlashlight(); break;
        case 'Tab':
          if (state === 'playing') {
            SilentUI.setMapVisible(true);
            e.preventDefault();
          }
          break;
        case 'Escape':
          if (state === 'playing') pauseMission();
          else if (state === 'paused') resumeMission();
          break;
      }
    });
    document.addEventListener('keyup', e => {
      switch (e.code) {
        case 'KeyW': input.w = false; break;
        case 'KeyA': input.a = false; break;
        case 'KeyS': input.s = false; break;
        case 'KeyD': input.d = false; break;
        case 'ShiftLeft': case 'ShiftRight': input.shift = false; player.slowWalking = false; break;
        case 'ControlLeft': case 'ControlRight': input.ctrl = false; player.crouching = false; break;
        case 'Tab':
          SilentUI.setMapVisible(false);
          break;
      }
    });

    // Mouse: left = interact, right = flashlight
    document.addEventListener('mousedown', e => {
      if (state !== 'playing') return;
      if (e.button === 0) handleInteraction();
      else if (e.button === 2) toggleFlashlight();
    });
    // Suppress context menu so right-click is usable
    document.addEventListener('contextmenu', e => e.preventDefault());
  }

  function bindPointerLock() {
    // Pointer lock setup. We wrap PointerLockControls so the user explicitly
    // sees the library being used, but we apply the sensitivity slider to
    // mouse movement ourselves so it's actually adjustable.
    if (THREE.PointerLockControls) {
      const ctrl = new THREE.PointerLockControls(gameCamera, document.body);
      ctrl.disconnect();        // strip the built-in handlers (we replace them)
      ctrl.connect = () => {};  // prevent reconnect
      window._silentControls = ctrl;
    }

    const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const PI_2 = Math.PI / 2;

    document.addEventListener('mousemove', e => {
      if (state !== 'playing' || !pointerLocked) return;
      const sens = 0.0021 * SilentSave.get().sensitivity;
      _euler.setFromQuaternion(gameCamera.quaternion);
      _euler.y -= e.movementX * sens;
      _euler.x -= e.movementY * sens;
      _euler.x = Math.max(-PI_2 + 0.02, Math.min(PI_2 - 0.02, _euler.x));
      gameCamera.quaternion.setFromEuler(_euler);
    });

    document.addEventListener('pointerlockchange', () => {
      pointerLocked = document.pointerLockElement === document.body;
      if (!pointerLocked && state === 'playing') {
        // User pressed Esc — surface pause.
        pauseMission();
      }
    });
  }

  function requestPointerLock() {
    document.body.requestPointerLock();
  }

  // ---------- Movement ----------

  function updateMovement(dt) {
    let fwd = 0, right = 0;
    if (input.w) fwd += 1;
    if (input.s) fwd -= 1;
    if (input.d) right += 1;
    if (input.a) right -= 1;
    if (fwd || right) {
      const len = Math.hypot(fwd, right);
      fwd /= len; right /= len;
    }

    const baseSpeed = player.crouching ? 1.8 : 3.1;
    const speed = player.slowWalking ? baseSpeed * 0.45 : baseSpeed;

    // Build world-space forward & right from camera (yaw only).
    const fwdVec = new THREE.Vector3(0, 0, -1).applyQuaternion(gameCamera.quaternion);
    fwdVec.y = 0; fwdVec.normalize();
    const rightVec = new THREE.Vector3(1, 0, 0).applyQuaternion(gameCamera.quaternion);
    rightVec.y = 0; rightVec.normalize();

    const vx = (fwdVec.x * fwd + rightVec.x * right) * speed;
    const vz = (fwdVec.z * fwd + rightVec.z * right) * speed;

    // Move axis-by-axis so we slide along walls.
    const newX = player.position.x + vx * dt;
    if (!playerCollidesAt(newX, player.position.z)) {
      player.position.x = newX;
    }
    const newZ = player.position.z + vz * dt;
    if (!playerCollidesAt(player.position.x, newZ)) {
      player.position.z = newZ;
    }

    // Clamp inside bounds (safety net so a glitch can't escape)
    const b = map.bounds;
    player.position.x = Math.max(b.x1, Math.min(b.x2, player.position.x));
    player.position.z = Math.max(b.z1, Math.min(b.z2, player.position.z));

    // Smooth crouch
    const targetHeight = player.crouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT_STAND;
    player.height += (targetHeight - player.height) * Math.min(1, 12 * dt);

    // Mild head bob when walking
    let bob = 0;
    if ((fwd || right) && !player.slowWalking) {
      bob = Math.sin(performance.now() * 0.012) * (player.crouching ? 0.01 : 0.025);
    }

    // Apply screen shake if alerted
    let shakeX = 0, shakeY = 0;
    if (shakeTime > 0 && SilentSave.get().screenShake) {
      const s = Math.min(0.05, shakeTime * 0.08);
      shakeX = (Math.random() - 0.5) * s;
      shakeY = (Math.random() - 0.5) * s;
      shakeTime -= dt;
    }

    gameCamera.position.set(
      player.position.x + shakeX,
      player.height + bob + shakeY,
      player.position.z
    );

    // Update flashlight: pin to camera and point along view direction
    if (flashlight && flashlightTarget) {
      flashlight.position.copy(gameCamera.position);
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(gameCamera.quaternion);
      flashlightTarget.position.copy(gameCamera.position).add(dir.multiplyScalar(6));
    }
  }

  function playerCollidesAt(x, z) {
    const r = PLAYER_RADIUS;
    for (const c of map.collidables) {
      if (c.passable) continue;
      if (x + r < c.minX || x - r > c.maxX) continue;
      if (z + r < c.minZ || z - r > c.maxZ) continue;
      return true;
    }
    return false;
  }

  // ---------- Enemies ----------

  function updateEnemies(dt) {
    for (const e of enemies) e.tick(dt);
  }

  // ---------- Detection ----------

  function updateDetection(dt) {
    let spotted = false;

    for (const e of enemies) {
      const ep = e.group.position;
      const pp = player.position;
      const dx = pp.x - ep.x;
      const dz = pp.z - ep.z;
      const dist = Math.hypot(dx, dz);

      let visionRange = e.vision.range;
      if (player.crouching) visionRange *= 0.7;
      if (player.slowWalking) visionRange *= 0.85;
      if (player.flashlightOn) visionRange *= 1.25;

      if (dist > visionRange) continue;

      // Forward direction in XZ from enemy yaw.
      // Enemy rotation.y was set via atan2(dx, dz), so forward = (sin yaw, cos yaw).
      const yaw = e.group.rotation.y;
      const fwdX = Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const toX = dx / dist;
      const toZ = dz / dist;
      const dot = fwdX * toX + fwdZ * toZ;
      const cosHalf = Math.cos(e.vision.halfAngle);
      if (dot < cosHalf) continue;

      // Line of sight occlusion — eye height test against walls/tall furniture.
      const eyeY = ep.y + 1.7;
      if (segmentBlockedXZ(ep.x, ep.z, pp.x, pp.z, eyeY)) continue;

      // Player is visible.
      spotted = true;
      let factor = 1.0;
      if (player.crouching) factor *= 0.55;
      if (player.slowWalking) factor *= 0.7;
      if (player.flashlightOn) factor *= 1.3;
      // Closer = faster detection.
      factor *= (1.0 + Math.max(0, (visionRange - dist) / visionRange) * 0.6);

      detection += e.vision.detectionSpeed * factor * dt;
      if (detection > 0.35 && detection < 0.7) {
        e.setAlert('suspicious', 3.0, pp);
      } else if (detection >= 0.7) {
        e.setAlert('alarmed', 4.0, pp);
        shakeTime = Math.max(shakeTime, 0.6);
      }
    }

    if (!spotted) {
      detection = Math.max(0, detection - 0.30 * dt);
    } else {
      detection = Math.min(1.05, detection);
    }

    if (detection >= 1.0) {
      endMission(false, 'Detected by hostile.');
    }
  }

  // Cheap segment vs collider AABB test in 2D (with a minimum height filter so
  // a low sofa doesn't block a tall human's line of sight).
  function segmentBlockedXZ(x1, z1, x2, z2, eyeY) {
    for (const c of map.collidables) {
      if (c.passable) continue;
      if (c.kind === 'furniture' && c.maxY < 1.4) continue;
      if (segmentIntersectsRect(x1, z1, x2, z2, c.minX, c.minZ, c.maxX, c.maxZ)) return true;
    }
    return false;
  }

  function segmentIntersectsRect(x1, z1, x2, z2, minX, minZ, maxX, maxZ) {
    const dx = x2 - x1, dz = z2 - z1;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-6) {
      if (x1 < minX || x1 > maxX) return false;
    } else {
      const t1 = (minX - x1) / dx;
      const t2 = (maxX - x1) / dx;
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      if (lo > tmin) tmin = lo;
      if (hi < tmax) tmax = hi;
      if (tmax < tmin) return false;
    }
    if (Math.abs(dz) < 1e-6) {
      if (z1 < minZ || z1 > maxZ) return false;
    } else {
      const t1 = (minZ - z1) / dz;
      const t2 = (maxZ - z1) / dz;
      const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
      if (lo > tmin) tmin = lo;
      if (hi < tmax) tmax = hi;
      if (tmax < tmin) return false;
    }
    return true;
  }

  // ---------- Interaction ----------

  function handleInteraction() {
    const target = findInteractable();
    if (!target) return;
    if (target.kind === 'civilian') {
      target.obj.secured = true;
      gameScene.remove(target.obj.group);
      civSecured++;
    } else if (target.kind === 'intel') {
      target.obj.userData.collected = true;
      gameScene.remove(target.obj);
      intelCollected++;
    } else if (target.kind === 'door') {
      // Toggle open / closed
      const door = target.obj;
      door.targetAngle = (Math.abs(door.targetAngle) > 0.1) ? 0 : Math.PI / 2;
    } else if (target.kind === 'extraction') {
      if (civSecured >= civilians.length) {
        endMission(true, 'Extraction reached with all civilians.');
      } else {
        // Pop a transient note via objective text.
        SilentUI.setHUD({ objective: `Cannot extract — ${civilians.length - civSecured} civilian(s) still inside.` });
      }
    }
  }

  // Find best interactable in the player's view cone within range.
  function findInteractable() {
    const cam = gameCamera;
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    camDir.y = 0;
    if (camDir.lengthSq() < 1e-6) return null;
    camDir.normalize();

    const candidates = [];

    // Civilians
    for (const c of civilians) {
      if (c.secured) continue;
      const p = c.group.position;
      const dx = p.x - cam.position.x;
      const dz = p.z - cam.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.4) continue;
      const dot = (dx / dist) * camDir.x + (dz / dist) * camDir.z;
      if (dot < 0.6) continue;
      candidates.push({ kind: 'civilian', obj: c, dist, label: 'Secure Civilian' });
    }

    // Intel
    for (const it of intel) {
      if (it.userData.collected) continue;
      const p = it.position;
      const dx = p.x - cam.position.x;
      const dz = p.z - cam.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.0) continue;
      const dot = (dx / dist) * camDir.x + (dz / dist) * camDir.z;
      if (dot < 0.5) continue;
      candidates.push({ kind: 'intel', obj: it, dist, label: 'Collect Intel' });
    }

    // Doors — interact at the panel center
    for (const d of doors) {
      // Center of panel relative to hinge
      const baseAngle = Math.atan2(d.def.dz, d.def.dx);
      const worldAngle = baseAngle + d.angle * d.def.openSign;
      const cx = d.def.hingeX + Math.cos(worldAngle) * (SilentMap.DOOR_WIDTH / 2);
      const cz = d.def.hingeZ + Math.sin(worldAngle) * (SilentMap.DOOR_WIDTH / 2);
      const dx = cx - cam.position.x;
      const dz = cz - cam.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 2.0) continue;
      const dot = (dx / dist) * camDir.x + (dz / dist) * camDir.z;
      if (dot < 0.45) continue;
      candidates.push({
        kind: 'door',
        obj: d,
        dist,
        label: d.isOpen ? `Close ${d.def.name}` : `Open ${d.def.name}`,
      });
    }

    // Extraction
    const ex = map.extraction;
    const exDx = ex.x - cam.position.x;
    const exDz = ex.z - cam.position.z;
    const exDist = Math.hypot(exDx, exDz);
    if (exDist < 2.5) {
      candidates.push({ kind: 'extraction', obj: null, dist: exDist, label: 'Extract' });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates[0];
  }

  function toggleFlashlight() {
    player.flashlightOn = !player.flashlightOn;
    if (flashlight) flashlight.visible = player.flashlightOn;
  }

  // ---------- Lights tick ----------

  function updateFlickerLights(dt) {
    if (!map || !map.ambientLights) return;
    const t = performance.now() * 0.001;
    for (const a of map.ambientLights) {
      if (a.kind === 'flicker') {
        const f = 0.6 + 0.4 * Math.sin(a.phase + t * 17.0) * Math.sin(a.phase * 2.1 + t * 3.5);
        a.light.intensity = a.base * Math.max(0.05, f);
      }
    }
  }

  // ---------- Frame loop ----------

  function animate(timestamp) {
    const now = timestamp || performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;

    if (state === 'playing') {
      missionTimeMs += dt * 1000;
      updateMovement(dt);
      updateEnemies(dt);
      updateDetection(dt);
      SilentMap.tickDoors(doors, dt);
      SilentEntities.tickIntel(intel, dt);
      updateFlickerLights(dt);

      // Refresh interactable prompt
      const target = findInteractable();
      if (target !== lastInteractable) {
        SilentUI.setInteractPrompt(target ? target.label : null);
        lastInteractable = target;
      }

      SilentUI.setHUD({
        timeMs: missionTimeMs,
        civSecured,
        civTotal: civilians.length,
        intelCollected,
        intelTotal: intel.length,
        mode: prettyMode(),
        stance: player.crouching ? 'CROUCH' : (player.slowWalking ? 'SLOW' : 'STAND'),
        lightOn: player.flashlightOn,
        detection,
      });

      // Minimap (only if visible — Tab held)
      if (!document.getElementById('mapOverlay').classList.contains('hidden')) {
        const showMarkers = SilentSave.get().objectiveMarkers && mode !== 'nightmare';
        SilentUI.drawMinimap({
          rooms: map.rooms,
          civs: civilians,
          intel,
          enemies,
          player: { position: player.position, yaw: getYaw() },
          extraction: map.extraction,
          showMarkers,
        });
      }

      renderer.render(gameScene, gameCamera);
    } else if (state === 'paused' || state === 'ending') {
      // Keep rendering the game scene under the overlay so the world is visible.
      if (gameScene) renderer.render(gameScene, gameCamera);
    } else {
      // menu
      renderMenu(dt);
    }

    requestAnimationFrame(animate);
  }

  function getYaw() {
    const e = new THREE.Euler().setFromQuaternion(gameCamera.quaternion, 'YXZ');
    return e.y;
  }

  return {
    init,
    returnToMenu,
  };
})();
