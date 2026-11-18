// The story: three jobs for fixer Marisol Vega, each a small state machine
// (go to a place, do the thing, get to the next place) with a waypoint beacon,
// a timer and a cash reward. Finishing all three ends the story.
import * as THREE from 'three';
import { makeCar } from './vehicles.js';
import { buildPersonMesh } from './people.js';

export const MISSION_DEFS = [
  {
    name: 'First Wheels',
    brief: 'Marisol needs wheels. Steal the marked sedan by the marina and bring it to the chop shop. You have 90 seconds.',
    timer: 90, reward: 500,
  },
  {
    name: 'Hot Delivery',
    brief: 'Pick up the package on the east side, then run it across town. The cops will be watching — 2 stars the moment you grab it. 120 seconds.',
    timer: 120, reward: 800,
  },
  {
    name: 'The Big Score',
    brief: 'Night job. Hit the downtown bank, grab the cash, and lose a 3-star chase at the hideout. The crew is armed — so are you.',
    timer: 0, reward: 2500,
  },
];

let beacon = null;

function setBeacon(G, x, z, color) {
  if (beacon) {
    G.scene.remove(beacon);
    beacon = null;
  }
  if (x === null) return;
  const g = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  cyl.position.y = 15;
  g.add(cyl);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.18, 8, 24),
    new THREE.MeshBasicMaterial({ color }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.25;
  g.add(ring);
  g.position.set(x, 0, z);
  G.scene.add(g);
  beacon = g;
}

function setObjective(G, text) {
  G.objective = text;
  const el = document.getElementById('objective');
  if (el) el.textContent = text;
}

export function startMission(G, index) {
  const def = MISSION_DEFS[index];
  const s = G.city.spots;
  const m = {
    index, def, stage: 'go', timer: def.timer,
    target: null, car: null,
  };
  G.mission = m;
  G.banner(def.name, def.brief);
  G.audio.jingle();
  if (index === 0) {
    // The marked sedan waits by the marina.
    m.car = makeCar(G, 'sedan', s.sedan.x, s.sedan.z, Math.PI / 2);
    m.car.kind = 'parked';
    m.car.speed = 0;
    G.cars.push(m.car);
    m.target = { x: s.sedan.x, z: s.sedan.z, label: 'the marked sedan' };
    setObjective(G, `Mission 1 — ${def.name}: steal the marked sedan (F near it).`);
    setBeacon(G, s.sedan.x, s.sedan.z, 0xffd23e);
  } else if (index === 1) {
    m.target = { x: s.package.x, z: s.package.z, label: 'the package' };
    setObjective(G, `Mission 2 — ${def.name}: pick up the package on the east side.`);
    setBeacon(G, s.package.x, s.package.z, 0xffd23e);
  } else {
    G.setNight(true);
    m.target = { x: s.bank.x, z: s.bank.z, label: 'the bank' };
    setObjective(G, `Mission 3 — ${def.name}: reach the downtown bank at night.`);
    setBeacon(G, s.bank.x, s.bank.z, 0xffd23e);
  }
}

function completeMission(G) {
  const m = G.mission;
  const reward = m.def.reward;
  G.player.cash += reward;
  G.popup(`+$${reward}`);
  G.audio.cash();
  G.save();
  setBeacon(G, null, null);
  if (m.index >= 2) {
    G.mission = null;
    G.missionsDone = 3;
    G.banner('STORY COMPLETE', 'All three jobs done. Marisol is paid, and Solmar is yours.');
    G.audio.jingle();
    setObjective(G, 'Story complete — free roam. Keep the city hot or lay low at the hideout.');
    G.save();
    return;
  }
  G.missionsDone = m.index + 1;
  G.banner('JOB DONE', `${m.def.name} complete — $${reward}. Next job unlocked.`);
  G.mission = null;
  setObjective(G, `Job ${m.index + 1} done. Press M1 (or drive to the next marker) to start job ${m.index + 2} — or free roam.`);
  G.save();
}

function failMission(G, why) {
  const m = G.mission;
  G.banner('JOB FAILED', why);
  G.audio.busted();
  setBeacon(G, null, null);
  G.mission = null;
  setObjective(G, `Job ${m.index + 1} failed — ${why} Walk to the yellow marker to retry it.`);
  // A retry marker appears at the mission start spot.
  G.retryIndex = m.index;
  const s = G.city.spots;
  const spot = m.index === 0 ? s.sedan : m.index === 1 ? s.package : s.bank;
  setBeacon(G, spot.x, spot.z, 0xffd23e);
}

export function updateMissions(G, dt) {
  const m = G.mission;
  const p = G.player;
  // Retry: walk into the beacon to restart the failed job.
  if (!m && G.retryIndex !== null && G.retryIndex !== undefined) {
    const s = G.city.spots;
    const spot = G.retryIndex === 0 ? s.sedan : G.retryIndex === 1 ? s.package : s.bank;
    if (Math.hypot(p.x - spot.x, p.z - spot.z) < 4) {
      const idx = G.retryIndex;
      G.retryIndex = null;
      startMission(G, idx);
      return;
    }
  }
  if (!m) return;
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(G, 'Out of time.');
      return;
    }
  }
  const s = G.city.spots;
  const near = (x, z, r) => Math.hypot(p.x - x, p.z - z) < r;
  if (m.index === 0) {
    if (m.stage === 'go') {
      if (G.playerCar === m.car) {
        m.stage = 'deliver';
        m.target = { x: s.chopShop.x, z: s.chopShop.z, label: 'the chop shop' };
        setObjective(G, `Mission 1 — ${m.def.name}: deliver the sedan to the chop shop.`);
        setBeacon(G, s.chopShop.x, s.chopShop.z, 0xffd23e);
      }
    } else if (m.stage === 'deliver' && G.playerCar === m.car && near(s.chopShop.x, s.chopShop.z, 7)) {
      completeMission(G);
    }
  } else if (m.index === 1) {
    if (m.stage === 'go' && near(s.package.x, s.package.z, 4)) {
      m.stage = 'deliver';
      m.target = { x: s.chopShop.x, z: s.chopShop.z, label: 'the drop-off' };
      G.wanted.heat = Math.max(G.wanted.heat, 45);
      setObjective(G, `Mission 2 — ${m.def.name}: deliver the package to the drop-off. Cops are on you.`);
      setBeacon(G, s.chopShop.x, s.chopShop.z, 0xffd23e);
      G.audio.jingle();
    } else if (m.stage === 'deliver' && near(s.chopShop.x, s.chopShop.z, 7)) {
      completeMission(G);
    }
  } else if (m.index === 2) {
    if (m.stage === 'go' && near(s.bank.x, s.bank.z, 6)) {
      m.stage = 'grab';
      m.grabAt = G.time + 3;
      setObjective(G, `Mission 3 — ${m.def.name}: grabbing the cash… stay close to the bank.`);
      // The crew opens fire.
      for (let i = 0; i < 3; i += 1) {
        const mesh = buildPersonMesh(G.rng, '#3a3a3a');
        const x = s.bank.x + (i - 1) * 8;
        const z = s.bank.z + 12;
        mesh.position.set(x, 0, z);
        G.scene.add(mesh);
        G.gang.push({ mesh, x, z, heading: 0, health: 100, shootAt: 1 + i * 0.5 });
      }
    } else if (m.stage === 'grab') {
      if (!near(s.bank.x, s.bank.z, 8)) {
        m.stage = 'go';
        setObjective(G, `Mission 3 — ${m.def.name}: get back to the bank to grab the cash.`);
      } else if (G.time >= m.grabAt) {
        m.stage = 'escape';
        m.target = { x: s.hideout.x, z: s.hideout.z, label: 'the hideout' };
        G.wanted.heat = Math.max(G.wanted.heat, 65);
        setObjective(G, `Mission 3 — ${m.def.name}: cash grabbed! Lose the 3-star chase at the hideout.`);
        setBeacon(G, s.hideout.x, s.hideout.z, 0x3ddc5f);
        G.audio.jingle();
      }
    } else if (m.stage === 'escape' && near(s.hideout.x, s.hideout.z, 8)) {
      G.wanted.heat = 0;
      G.setNight(false);
      completeMission(G);
    }
  }
}

export function missionTarget(G) {
  return G.mission ? G.mission.target : null;
}

export function clearBeacon(G) {
  setBeacon(G, null, null);
}
