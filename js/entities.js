/* =============================================================
   entities.js — humanoid figures, civilians, intel pickups,
   vision cones, simple patrol AI.
   ============================================================= */

window.SilentEntities = (function () {

  // Build a simple boxy humanoid figure (head + torso + arms + legs).
  // Returns a Group with all parts attached.
  function makeHumanoid(opts) {
    const {
      bodyColor = 0x444444,
      headColor = 0xd9b390,
      accentColor = 0x222222, // belt / gear
    } = opts || {};

    const g = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });
    const accMat  = new THREE.MeshLambertMaterial({ color: accentColor });

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.85, 0.22);
    const leftLeg  = new THREE.Mesh(legGeo, bodyMat);
    const rightLeg = new THREE.Mesh(legGeo, bodyMat);
    leftLeg.position.set(-0.14, 0.425, 0);
    rightLeg.position.set( 0.14, 0.425, 0);
    g.add(leftLeg, rightLeg);

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), bodyMat);
    torso.position.set(0, 1.25, 0);
    g.add(torso);

    // Belt / vest accent
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.18, 0.34), accMat);
    vest.position.set(0, 1.05, 0);
    g.add(vest);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.16, 0.65, 0.18);
    const leftArm  = new THREE.Mesh(armGeo, bodyMat);
    const rightArm = new THREE.Mesh(armGeo, bodyMat);
    leftArm.position.set(-0.36, 1.30, 0);
    rightArm.position.set( 0.36, 1.30, 0);
    g.add(leftArm, rightArm);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.30, 0.30), headMat);
    head.position.set(0, 1.85, 0);
    g.add(head);

    // Make all parts cast shadows (renderer toggles this for graphics quality).
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });

    // Reference points
    g.userData.headLocalY = 1.85;
    g.userData.parts = { head, torso, leftArm, rightArm, leftLeg, rightLeg };

    return g;
  }

  // ---- Vision cone visual (used only on easier difficulties) ----
  // We render a flat triangle on the ground in front of the enemy.
  function makeVisionCone(range, halfAngleRad, color) {
    const segments = 12;
    const verts = [0, 0.02, 0];
    for (let i = 0; i <= segments; i++) {
      const t = -halfAngleRad + (i / segments) * (halfAngleRad * 2);
      verts.push(
        Math.sin(t) * range,
        0.02,
        Math.cos(t) * range
      );
    }
    const idx = [];
    for (let i = 1; i <= segments; i++) {
      idx.push(0, i, i + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.15,
      side: THREE.DoubleSide, depthWrite: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  // ---- Enemy class ----
  class Enemy {
    constructor(route, difficulty) {
      this.group = makeHumanoid({ bodyColor: 0x6b1d1d, headColor: 0xc5957a, accentColor: 0x2c0707 });
      this.waypoints = route.waypoints.map(w => ({ x: w.x, z: w.z }));
      this.speed = route.speed || 0;
      this.rotateSpeed = route.rotateSpeed || 0;
      this.wpIndex = 0;
      // Start at first waypoint, facing toward next (if any)
      const start = this.waypoints[0];
      this.group.position.set(start.x, 0, start.z);
      this.alertState = 'patrol'; // patrol | suspicious | alarmed
      this.alertHold = 0;          // sec remaining of suspicion
      this.lastSeenPos = null;

      // Difficulty-driven detection profile
      this.vision = {
        range: difficulty.visionRange,
        halfAngle: difficulty.visionAngle * Math.PI / 180 / 2,
        detectionSpeed: difficulty.detectionSpeed,
      };

      this.cone = null;
      if (difficulty.showVisionCones) {
        this.cone = makeVisionCone(this.vision.range, this.vision.halfAngle, 0xff5a5a);
        this.group.add(this.cone);
      }

      // Face along first->second waypoint, or random if rotating in place
      if (this.waypoints.length > 1) {
        const next = this.waypoints[1];
        this.group.rotation.y = Math.atan2(next.x - start.x, next.z - start.z);
      } else {
        this.group.rotation.y = Math.random() * Math.PI * 2;
      }
    }

    // Move toward current waypoint, advance when reached.
    tick(dt) {
      if (this.waypoints.length > 1 && this.speed > 0) {
        const target = this.waypoints[this.wpIndex];
        const pos = this.group.position;
        const dx = target.x - pos.x;
        const dz = target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.25) {
          this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
        } else {
          const step = Math.min(this.speed * dt, dist);
          pos.x += dx / dist * step;
          pos.z += dz / dist * step;
          // Smoothly turn toward direction of travel
          const targetYaw = Math.atan2(dx, dz);
          this.group.rotation.y = smoothYaw(this.group.rotation.y, targetYaw, 4 * dt);
        }
      } else if (this.rotateSpeed) {
        this.group.rotation.y += this.rotateSpeed * dt;
      }

      // Alert wear-off
      if (this.alertHold > 0) {
        this.alertHold -= dt;
        if (this.alertHold <= 0) {
          this.alertState = 'patrol';
          this.lastSeenPos = null;
        }
      }
    }

    setAlert(state, holdSec, pos) {
      this.alertState = state;
      this.alertHold = holdSec;
      if (pos) this.lastSeenPos = { x: pos.x, z: pos.z };
      // Tint cone based on alert
      if (this.cone) {
        const c = state === 'alarmed' ? 0xff2030 : state === 'suspicious' ? 0xffb030 : 0xff5a5a;
        this.cone.material.color.setHex(c);
        this.cone.material.opacity = state === 'patrol' ? 0.13 : 0.22;
      }
    }
  }

  // ---- Civilian class ----
  class Civilian {
    constructor(spawn, idx) {
      // Alternate green/blue to feel like distinct people
      const color = (idx % 2) ? 0x2e7d4f : 0x2a5d96;
      this.group = makeHumanoid({ bodyColor: color, headColor: 0xd9b390, accentColor: 0x111111 });
      this.group.position.set(spawn.x, 0, spawn.z);
      this.group.rotation.y = Math.random() * Math.PI * 2;
      this.secured = false;
      this.room = spawn.room;
      // Add subtle bob anim
      this.bobPhase = Math.random() * Math.PI * 2;
    }

    tick(dt) {
      if (this.secured) return;
      this.bobPhase += dt * 1.6;
      const off = Math.sin(this.bobPhase) * 0.015;
      this.group.position.y = off;
    }
  }

  // ---- Intel folder pickup ----
  function makeIntel(spawn) {
    const g = new THREE.Group();
    const folder = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.04, 0.32),
      new THREE.MeshLambertMaterial({ color: 0x9ed3ff, emissive: 0x183040 })
    );
    folder.position.y = 0.02;
    folder.castShadow = true;
    g.add(folder);
    // Slight cyan glow strip on top
    const glow = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.005, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x5fb7ff })
    );
    glow.position.set(0, 0.045, 0);
    g.add(glow);

    g.position.set(spawn.x, spawn.y, spawn.z);
    g.userData.collected = false;
    g.userData.spinPhase = Math.random() * Math.PI * 2;
    g.userData.baseY = spawn.y;
    return g;
  }

  function tickIntel(intel, dt) {
    for (const it of intel) {
      if (it.userData.collected) continue;
      it.userData.spinPhase += dt * 1.4;
      it.rotation.y = it.userData.spinPhase;
      // Absolute Y (not accumulated) so the folder doesn't drift over time.
      it.position.y = it.userData.baseY + Math.sin(it.userData.spinPhase * 1.5) * 0.05;
    }
  }

  // Smoothly interpolate yaw, handling angle wraparound.
  function smoothYaw(current, target, alpha) {
    let diff = target - current;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return current + diff * Math.min(1, alpha);
  }

  return {
    makeHumanoid,
    makeVisionCone,
    makeIntel,
    tickIntel,
    Enemy,
    Civilian,
    smoothYaw,
  };
})();
