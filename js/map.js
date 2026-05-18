/* =============================================================
   map.js — building geometry, furniture, spawn data.

   Coordinate system:
     +X  → east
     +Y  → up
     +Z  → south  (entrance is at +Z, building extends to -Z)

   The building is a single rectangular footprint with one
   protruding entry hall on the south side.

   Walls are axis-aligned. Each entry below is one solid segment
   AFTER door gaps have been subtracted by hand, which keeps the
   geometry simple and collision cheap.
   ============================================================= */

window.SilentMap = (function () {

  const WALL_HEIGHT = 3.4;
  const WALL_THICK  = 0.25;
  const DOOR_WIDTH  = 1.6;

  // ----- Rooms (for the floor plan overlay / context, not collidable) ----
  const ROOMS = [
    { name: 'Entry Hallway', x1: -6, z1: 12, x2: 6,  z2: 18, dark: false, color: '#1a2028' },
    { name: 'Living Room',   x1: -10, z1: -8, x2: 10, z2: 12, dark: false, color: '#1a2530' },
    { name: 'Kitchen',       x1: -22, z1: 4, x2: -10, z2: 12, dark: false, color: '#171c22' },
    { name: 'Bathroom',      x1: -22, z1: -8, x2: -10, z2: 4, dark: true,  color: '#15191e' },
    { name: 'Storage Room',  x1: -22, z1: -18, x2: -10, z2: -8, dark: true, color: '#13171c' },
    { name: 'Main Bedroom',  x1: -10, z1: -18, x2: 10,  z2: -8, dark: false, color: '#1a1f26' },
    { name: 'Office',        x1: 10, z1: -8, x2: 22, z2: 12, dark: false, color: '#1c2128' },
    { name: 'Back Room',     x1: 10, z1: -18, x2: 22, z2: -8, dark: true,  color: '#10141a' },
  ];

  // ----- Walls -----
  // Each entry: { x1, z1, x2, z2 }. Either x1==x2 (Z-aligned) or z1==z2 (X-aligned).
  // Door gaps have already been carved out manually below.
  const WALLS = [
    // ---- Exterior ----
    { x1: -22, z1: -18, x2:  22, z2: -18 }, // north
    { x1:  22, z1: -18, x2:  22, z2:  12 }, // east
    { x1: -22, z1: -18, x2: -22, z2:  12 }, // west
    { x1: -22, z1:  12, x2:  -6, z2:  12 }, // south-west
    { x1:   6, z1:  12, x2:  22, z2:  12 }, // south-east
    { x1:  -6, z1:  12, x2:  -6, z2:  18 }, // entry-hall west
    { x1:   6, z1:  12, x2:   6, z2:  18 }, // entry-hall east
    { x1:  -6, z1:  18, x2: -0.8, z2: 18 }, // entry south, west of door
    { x1: 0.8, z1:  18, x2:   6, z2:  18 }, // entry south, east of door

    // ---- Entry hall <-> Living Room (z=12, x in [-6..6]) ----
    { x1:  -6, z1:  12, x2: -0.8, z2: 12 },
    { x1: 0.8, z1:  12, x2:   6,  z2: 12 },

    // ---- Vertical wall x = -10 (Living/Bedroom column edge) ----
    { x1: -10, z1: -18, x2: -10, z2: -13.8 },   // Storage <-> Bedroom corner
    { x1: -10, z1: -12.2, x2: -10, z2:  -8 },
    { x1: -10, z1:  -8, x2: -10, z2: -2.8 },    // Living
    { x1: -10, z1: -1.2, x2: -10, z2: 7.2 },    // door at z≈-2 (Living↔Bathroom), at z≈8 (Living↔Kitchen)
    { x1: -10, z1:  8.8, x2: -10, z2: 12 },

    // ---- Vertical wall x = 10 (Living/Office column edge) ----
    { x1:  10, z1: -18, x2:  10, z2: -13.8 },
    { x1:  10, z1: -12.2, x2:  10, z2:  -8 },
    { x1:  10, z1:  -8, x2:  10, z2: -2.8 },    // doors at z≈-2 and z≈8 (Office↔Living)
    { x1:  10, z1: -1.2, x2:  10, z2:  7.2 },
    { x1:  10, z1:  8.8, x2:  10, z2: 12 },

    // ---- Horizontal wall z = -8 (north edge of Living, etc.) ----
    { x1: -22, z1:  -8, x2: -15.8, z2: -8 },    // Bathroom<->Storage door at x≈-15
    { x1: -14.2, z1: -8, x2: -10,  z2: -8 },
    { x1: -10, z1:  -8, x2: -0.8,  z2: -8 },    // Living<->Bedroom door at x≈0
    { x1:  0.8, z1: -8, x2:  10,   z2: -8 },
    { x1:  10, z1:  -8, x2:  14.2, z2: -8 },    // Office<->BackRoom door at x≈15
    { x1: 15.8, z1: -8, x2:  22,   z2: -8 },

    // ---- Horizontal wall z = 4 (Kitchen<->Bathroom) ----
    { x1: -22, z1:   4, x2: -15.8, z2:  4 },
    { x1: -14.2, z1:  4, x2: -10,  z2:  4 },
  ];

  // ----- Doors -----
  // Each: hinge at (hingeX, hingeZ); when closed the panel extends
  // along (dx,dz)*DOOR_WIDTH; opens by ±90° (openSign).
  const DOORS = [
    // Main entry (south)
    { hingeX: -0.8, hingeZ: 18, dx:  1, dz: 0, openSign:  1, name: 'Entry' },
    // Entry hall ↔ Living room
    { hingeX: -0.8, hingeZ: 12, dx:  1, dz: 0, openSign: -1, name: 'Lobby' },
    // x=-10 doors
    { hingeX: -10, hingeZ: -2.8, dx: 0, dz:  1, openSign:  1, name: 'Bathroom' },
    { hingeX: -10, hingeZ:  7.2, dx: 0, dz:  1, openSign: -1, name: 'Kitchen' },
    { hingeX: -10, hingeZ: -13.8, dx: 0, dz:  1, openSign:  1, name: 'Storage' },
    // x=10 doors
    { hingeX:  10, hingeZ: -2.8, dx: 0, dz:  1, openSign: -1, name: 'Office A' },
    { hingeX:  10, hingeZ:  7.2, dx: 0, dz:  1, openSign:  1, name: 'Office B' },
    { hingeX:  10, hingeZ: -13.8, dx: 0, dz:  1, openSign: -1, name: 'Back' },
    // z=-8 doors
    { hingeX: -0.8, hingeZ: -8, dx:  1, dz: 0, openSign:  1, name: 'Bedroom' },
    { hingeX: -15.8, hingeZ: -8, dx:  1, dz: 0, openSign:  1, name: 'Storage Hall' },
    { hingeX:  14.2, hingeZ: -8, dx:  1, dz: 0, openSign: -1, name: 'Back Hall' },
    // z=4 door
    { hingeX: -15.8, hingeZ: 4, dx:  1, dz: 0, openSign:  1, name: 'Bath Hall' },
  ];

  // ----- Furniture (visual + collidable boxes) -----
  // Each: { x, z, w, d, h, y?, color, shape? }
  //   y defaults to h/2 (sitting on floor)
  const FURNITURE = [
    // Living room: sofa, coffee table, TV stand
    { x: -6, z: 6, w: 4, d: 1, h: 0.9, color: '#3a2f24', label: 'sofa' },
    { x: -6, z: 4.5, w: 2, d: 1, h: 0.4, color: '#22272d' },
    { x: 8.5, z: -6.5, w: 1, d: 2, h: 1.0, color: '#1c1c1c' }, // tv stand
    { x: 4, z: 1, w: 1.6, d: 1.6, h: 0.55, color: '#5a4a36' }, // coffee table

    // Kitchen: counter L-shape + island
    { x: -21, z: 7, w: 2, d: 5, h: 0.95, color: '#3a3a3a' },
    { x: -16, z: 5, w: 8, d: 1, h: 0.95, color: '#3a3a3a' },
    { x: -16, z: 9, w: 4, d: 1, h: 0.95, color: '#2e2e2e' }, // island

    // Bathroom: tub + sink
    { x: -20, z: -6, w: 3, d: 1.5, h: 0.6, color: '#dddddd' },
    { x: -12, z: -7, w: 1.2, d: 0.8, h: 0.95, color: '#cccccc' },

    // Storage: crates and shelves (dense)
    { x: -20, z: -16, w: 1.4, d: 1.4, h: 1.4, color: '#6e4a2a' },
    { x: -20, z: -14, w: 1.4, d: 1.4, h: 1.0, color: '#5a3e22' },
    { x: -18, z: -16, w: 1.0, d: 1.0, h: 0.8, color: '#6e4a2a' },
    { x: -12, z: -16, w: 2, d: 0.6, h: 2.2, color: '#3a2c1d' }, // shelf

    // Master Bedroom: bed, dresser, nightstand
    { x: 0, z: -16, w: 3.2, d: 2.0, h: 0.6, color: '#46342a' },
    { x: 0, z: -16, w: 3.2, d: 2.0, h: 0.25, y: 0.85, color: '#dcdcdc' }, // sheets
    { x: -2.6, z: -15.5, w: 0.7, d: 0.7, h: 0.7, color: '#3b2a1a' },
    { x: 4, z: -16, w: 1.8, d: 0.8, h: 1.1, color: '#5a4030' }, // dresser

    // Office: desk + chairs + shelf
    { x: 18, z: -2, w: 2.6, d: 1.2, h: 0.85, color: '#3a2f24' },
    { x: 18, z: -1, w: 0.7, d: 0.7, h: 0.5, color: '#1a1a1a' },
    { x: 14, z: 8, w: 2, d: 0.6, h: 2.2, color: '#3a2c1d' },
    { x: 20, z: 6, w: 1.6, d: 0.8, h: 0.85, color: '#3a2f24' },

    // Back room: crates / mess
    { x: 18, z: -16, w: 1.5, d: 1.5, h: 1.5, color: '#5a3e22' },
    { x: 14, z: -16, w: 1.2, d: 1.2, h: 1.0, color: '#5a3e22' },
    { x: 20, z: -14, w: 1.2, d: 1.2, h: 1.2, color: '#6e4a2a' },
    { x: 14, z: -12, w: 2.0, d: 0.6, h: 1.9, color: '#3a2c1d' },

    // Entry hall: bench
    { x: 0, z: 15, w: 1.6, d: 0.6, h: 0.5, color: '#2e2e2e' },
  ];

  // ----- Civilian spawn points -----
  const CIV_SPAWNS = [
    { x: -3, z: 6, room: 'Living Room' },
    { x: -18, z: 8, room: 'Kitchen' },
    { x: 2, z: -14, room: 'Main Bedroom' },
    { x: 18, z: 6, room: 'Office' },
    { x: -18, z: -2, room: 'Bathroom' },
  ];

  // ----- Hostile patrol routes -----
  // Each enemy has a list of waypoints; they walk between them.
  // A single waypoint means 'rotate in place'.
  const ENEMY_ROUTES = [
    { waypoints: [{ x: 0, z: 4 }, { x: 6, z: 0 }, { x: -6, z: 0 }], speed: 1.4 },
    { waypoints: [{ x: 18, z: 6 }, { x: 18, z: -4 }], speed: 1.2 },
    { waypoints: [{ x: -16, z: 8 }], speed: 0, rotateSpeed: 0.7 },
    { waypoints: [{ x: 5, z: -12 }, { x: -5, z: -12 }], speed: 1.1 },
    { waypoints: [{ x: 18, z: -14 }], speed: 0, rotateSpeed: 0.9 },
    { waypoints: [{ x: -18, z: -14 }], speed: 0, rotateSpeed: -0.7 },
  ];

  // ----- Intel locations -----
  const INTEL_SPAWNS = [
    { x: 18, z: -2, y: 1.0, room: 'Office' },
    { x: -16, z: 5, y: 1.05, room: 'Kitchen' },
    { x: -12, z: -16, y: 2.4, room: 'Storage Room' },
  ];

  // ----- Extraction point -----
  const EXTRACTION = { x: 0, z: 20.5 }; // just outside the entry door

  // ----- Player start -----
  // Inside the entry hall at z=16, facing north (toward the building interior).
  // Three.js camera default looks -Z; Y-rotation of 0 keeps that direction.
  const PLAYER_START = { x: 0, z: 16, facing: 0 };

  // ----- Flickering light rooms -----
  const FLICKER_LIGHTS = [
    { x: -16, y: 3.0, z: -2, room: 'Bathroom',     color: 0xbbccff, intensity: 0.7, range: 8 },
    { x: 18,  y: 3.0, z: -14, room: 'Back Room',   color: 0xffaa55, intensity: 0.5, range: 7 },
    { x: -16, y: 3.0, z: -14, room: 'Storage',     color: 0xffddaa, intensity: 0.4, range: 6 },
  ];

  // Constant ceiling lights for non-dark rooms (always on, low intensity).
  const CEILING_LIGHTS = [
    { x: 0,   y: 3.0, z: 4,   color: 0xaab8c8, intensity: 0.45, range: 10 },
    { x: 0,   y: 3.0, z: 15,  color: 0xaab8c8, intensity: 0.45, range: 7 },
    { x: -16, y: 3.0, z: 8,   color: 0xaab8c8, intensity: 0.40, range: 8 },
    { x: 18,  y: 3.0, z: 2,   color: 0xaab8c8, intensity: 0.45, range: 10 },
    { x: 0,   y: 3.0, z: -13, color: 0xaab8c8, intensity: 0.35, range: 9 },
  ];

  // Build the actual scene contents. Returns objects the game holds onto.
  // graphics ∈ {'Low','Medium','High'} drives detail/shadow choices.
  function build(scene, graphics) {

    const collidables = [];   // AABBs for movement / vision raycasts
    const wallMeshes  = [];
    const doors       = [];
    const ambientLights = [];

    const wallMat  = new THREE.MeshLambertMaterial({ color: 0x2c333d });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x14181d });
    const ceilMat  = new THREE.MeshLambertMaterial({ color: 0x0c0f12 });
    const outdoorMat = new THREE.MeshLambertMaterial({ color: 0x0b0d10 });

    // ---- Outdoor ground (asphalt-ish) so leaving the building isn't a void ----
    const outdoor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), outdoorMat);
    outdoor.rotation.x = -Math.PI / 2;
    outdoor.position.set(0, -0.02, 0);
    scene.add(outdoor);

    // ---- Floor ----
    const buildingWidth = 44, buildingDepth = 36;
    const floorGeo = new THREE.PlaneGeometry(buildingWidth, buildingDepth);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -3);
    if (graphics !== 'Low') floor.receiveShadow = true;
    scene.add(floor);

    // Entry hall floor extension (smaller protrusion)
    const entryFloor = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), floorMat);
    entryFloor.rotation.x = -Math.PI / 2;
    entryFloor.position.set(0, 0, 15);
    if (graphics !== 'Low') entryFloor.receiveShadow = true;
    scene.add(entryFloor);

    // ---- Ceiling (skip on Low for perf) ----
    if (graphics !== 'Low') {
      const ceil = new THREE.Mesh(floorGeo, ceilMat);
      ceil.rotation.x =  Math.PI / 2;
      ceil.position.set(0, WALL_HEIGHT, -3);
      scene.add(ceil);

      const entryCeil = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), ceilMat);
      entryCeil.rotation.x = Math.PI / 2;
      entryCeil.position.set(0, WALL_HEIGHT, 15);
      scene.add(entryCeil);
    }

    // ---- Outdoor pad at extraction (so the area outside looks intentional) ----
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshLambertMaterial({ color: 0x1c2228 }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.01, 20.5);
    scene.add(pad);

    // Pillars at extraction for visual marker (light yellow)
    [-2, 2].forEach(px => {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 2.2, 0.25),
        new THREE.MeshLambertMaterial({ color: 0xf6c453, emissive: 0x5a4a10 })
      );
      pillar.position.set(px, 1.1, 21);
      scene.add(pillar);
    });

    // ---- Walls ----
    WALLS.forEach(w => {
      addWall(w, scene, wallMat, collidables, wallMeshes, graphics);
    });

    // ---- Doors ----
    DOORS.forEach(d => doors.push(buildDoor(d, scene, collidables, graphics)));

    // ---- Furniture ----
    FURNITURE.forEach(f => addFurniture(f, scene, collidables, graphics));

    // ---- Floor decals per room (so each room looks distinct from above) ----
    if (graphics !== 'Low') {
      ROOMS.forEach(r => {
        const cx = (r.x1 + r.x2) / 2;
        const cz = (r.z1 + r.z2) / 2;
        const w = Math.abs(r.x2 - r.x1) - 0.4;
        const d = Math.abs(r.z2 - r.z1) - 0.4;
        const rug = new THREE.Mesh(
          new THREE.PlaneGeometry(w, d),
          new THREE.MeshLambertMaterial({ color: r.color })
        );
        rug.rotation.x = -Math.PI / 2;
        rug.position.set(cx, 0.02, cz);
        if (graphics !== 'Low') rug.receiveShadow = true;
        scene.add(rug);
      });
    }

    // ---- Static ceiling lights ----
    CEILING_LIGHTS.forEach(l => {
      const pl = new THREE.PointLight(l.color, l.intensity, l.range, 1.6);
      pl.position.set(l.x, l.y, l.z);
      scene.add(pl);
      ambientLights.push({ light: pl, kind: 'static' });
      // Visual fixture (small box for visibility under light)
      const fix = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.06, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x111418 })
      );
      fix.position.set(l.x, WALL_HEIGHT - 0.04, l.z);
      scene.add(fix);
    });

    // ---- Flickering lights ----
    FLICKER_LIGHTS.forEach(l => {
      const pl = new THREE.PointLight(l.color, l.intensity, l.range, 1.6);
      pl.position.set(l.x, l.y, l.z);
      scene.add(pl);
      ambientLights.push({
        light: pl,
        kind: 'flicker',
        base: l.intensity,
        phase: Math.random() * Math.PI * 2,
      });
      const fix = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.06, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x111418 })
      );
      fix.position.set(l.x, WALL_HEIGHT - 0.04, l.z);
      scene.add(fix);
    });

    // Return everything the game needs to read.
    return {
      collidables,
      wallMeshes,
      doors,
      ambientLights,
      rooms: ROOMS,
      civSpawns: CIV_SPAWNS,
      enemyRoutes: ENEMY_ROUTES,
      intelSpawns: INTEL_SPAWNS,
      extraction: EXTRACTION,
      playerStart: PLAYER_START,
      wallHeight: WALL_HEIGHT,
      bounds: { x1: -23, z1: -19, x2: 23, z2: 22 },
    };
  }

  // ---- Helpers ----

  function addWall(seg, scene, mat, collidables, wallMeshes, graphics) {
    const minX = Math.min(seg.x1, seg.x2);
    const maxX = Math.max(seg.x1, seg.x2);
    const minZ = Math.min(seg.z1, seg.z2);
    const maxZ = Math.max(seg.z1, seg.z2);
    // Pad in the thin direction to give the box some depth.
    let w = Math.max(maxX - minX, WALL_THICK);
    let d = Math.max(maxZ - minZ, WALL_THICK);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), mat);
    mesh.position.set(cx, WALL_HEIGHT / 2, cz);
    if (graphics !== 'Low') { mesh.castShadow = true; mesh.receiveShadow = true; }
    scene.add(mesh);
    wallMeshes.push(mesh);
    collidables.push({
      mesh,
      kind: 'wall',
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2,
      minY: 0, maxY: WALL_HEIGHT,
    });
  }

  function buildDoor(def, scene, collidables, graphics) {
    // Door is a hinged group: we move the door group to hinge position,
    // and the panel is a child offset by (DOOR_WIDTH/2, ...) from the hinge.
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x5a4434 });
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(DOOR_WIDTH, WALL_HEIGHT - 0.2, 0.08),
      frameMat
    );
    panel.position.set(DOOR_WIDTH / 2, (WALL_HEIGHT - 0.2) / 2, 0);
    if (graphics !== 'Low') { panel.castShadow = true; panel.receiveShadow = true; }

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.06, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xc8b06a })
    );
    handle.position.set(DOOR_WIDTH * 0.85, 1.05, 0.07);
    panel.add(handle);

    const group = new THREE.Group();
    group.add(panel);
    group.position.set(def.hingeX, 0, def.hingeZ);
    // World XZ-angle of the panel = -group.rotation.y (Three.js right-handed Y).
    // When closed, that angle should equal atan2(dz, dx).
    group.rotation.y = -Math.atan2(def.dz, def.dx);
    scene.add(group);

    const door = {
      def,
      group,
      panel,
      angle: 0,
      targetAngle: 0,
      // Collider data: updated each frame when angle changes meaningfully.
      collider: { kind: 'door', minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: WALL_HEIGHT },
      isOpen: false,
    };
    collidables.push(door.collider);
    updateDoorCollider(door);
    return door;
  }

  function addFurniture(f, scene, collidables, graphics) {
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(f.color) });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(f.w, f.h, f.d), mat);
    const y = (f.y != null) ? f.y : f.h / 2;
    mesh.position.set(f.x, y, f.z);
    if (graphics !== 'Low') { mesh.castShadow = true; mesh.receiveShadow = true; }
    scene.add(mesh);
    // Furniture is collidable if it's tall enough that the player would bump it.
    if (f.h > 0.35) {
      collidables.push({
        mesh,
        kind: 'furniture',
        minX: f.x - f.w / 2, maxX: f.x + f.w / 2,
        minZ: f.z - f.d / 2, maxZ: f.z + f.d / 2,
        minY: y - f.h / 2,   maxY: y + f.h / 2,
      });
    }
  }

  // Recompute a door's AABB based on its current angle.
  // We approximate the swung door with a tight AABB around hinge -> panel tip.
  function updateDoorCollider(door) {
    const hx = door.def.hingeX, hz = door.def.hingeZ;
    const baseAngle = Math.atan2(door.def.dz, door.def.dx);
    const worldAngle = baseAngle + door.angle * door.def.openSign;
    const tipX = hx + Math.cos(worldAngle) * DOOR_WIDTH;
    const tipZ = hz + Math.sin(worldAngle) * DOOR_WIDTH;
    const pad = 0.18;
    door.collider.minX = Math.min(hx, tipX) - pad;
    door.collider.maxX = Math.max(hx, tipX) + pad;
    door.collider.minZ = Math.min(hz, tipZ) - pad;
    door.collider.maxZ = Math.max(hz, tipZ) + pad;
    // Open doors are passable; we'll skip the collider during movement checks.
    door.collider.passable = door.isOpen;
  }

  // Animate doors toward targetAngle. Returns whether any collider changed.
  function tickDoors(doors, dt) {
    let changed = false;
    const SPEED = 3.4; // rad/sec
    for (const door of doors) {
      if (door.angle !== door.targetAngle) {
        const diff = door.targetAngle - door.angle;
        const step = Math.sign(diff) * Math.min(Math.abs(diff), SPEED * dt);
        door.angle += step;
        // Keep visual world angle in sync with collider math.
        const baseAngle = Math.atan2(door.def.dz, door.def.dx);
        door.group.rotation.y = -(baseAngle + door.angle * door.def.openSign);
        door.isOpen = Math.abs(door.angle) > 0.4;
        updateDoorCollider(door);
        changed = true;
      }
    }
    return changed;
  }

  // Resolve which room a world (x, z) is in (or null).
  function roomAt(x, z) {
    for (const r of ROOMS) {
      if (x >= r.x1 && x <= r.x2 && z >= r.z1 && z <= r.z2) return r.name;
    }
    return null;
  }

  return {
    WALL_HEIGHT,
    WALL_THICK,
    DOOR_WIDTH,
    ROOMS,
    build,
    tickDoors,
    roomAt,
  };
})();
