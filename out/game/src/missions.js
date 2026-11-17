// missions.js — 3-mission story: Danny Reyes owes fixer Marisol Vega a debt.
import * as THREE from 'three';

export const MISSIONS = [
  {
    id: 1, name: 'First Wheels', reward: 500,
    brief: 'Marisol Vega: "You owe me, Danny. Steal the marked sedan by the pier and bring it to the chop shop. No cops, no excuses."',
    start: { x: -52, z: 52 },
    steps: [
      { text: 'Steal the marked sedan (walk up and press E)', target: { x: -156, z: 104 }, kind: 'steal' },
      { text: 'Deliver the sedan to the chop shop', target: { x: 156, z: -52 }, kind: 'deliver', timer: 90 },
    ],
  },
  {
    id: 2, name: 'Hot Delivery', reward: 900,
    brief: 'Marisol: "A package is waiting at the port. Pick it up, drop it downtown — and stay cool. The cops are already sniffing around."',
    start: { x: 156, z: -104 },
    steps: [
      { text: 'Pick up the package at the port', target: { x: 182, z: -52 }, kind: 'pickup' },
      { text: 'Deliver the package downtown (2-star heat!)', target: { x: 0, z: 0 }, kind: 'deliver', timer: 120, wanted: 2 },
    ],
  },
  {
    id: 3, name: 'The Big Score', reward: 2500,
    brief: 'Marisol: "Tonight we hit the Solmar National Bank. Grab the cash, lose the cops, get to the hideout. This clears your debt, Danny."',
    start: { x: 0, z: -52 },
    steps: [
      { text: 'Reach the Solmar National Bank', target: { x: 26, z: 26 }, kind: 'goto', night: true },
      { text: 'Grab the cash inside (press E at the door)', target: { x: 26, z: 26 }, kind: 'grab' },
      { text: 'Escape the 3-star chase — reach the hideout', target: { x: -156, z: -156 }, kind: 'deliver', timer: 150, wanted: 3 },
    ],
  },
];

export function initMissions(G) {
  G.missionIndex = 0; // next mission to start (0-based)
  G.mission = null;   // active mission state
  G.missionDone = [false, false, false];
  // start markers (yellow blips) for the next mission
  const geo = new THREE.CylinderGeometry(2.2, 2.2, 0.4, 20);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.7 });
  G.startMarker = new THREE.Mesh(geo, mat);
  G.scene.add(G.startMarker);
  // waypoint beacon
  const bgeo = new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true);
  const bmat = new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  G.beacon = new THREE.Mesh(bgeo, bmat);
  G.beacon.visible = false;
  G.scene.add(G.beacon);
  updateStartMarker(G);
}

export function updateStartMarker(G) {
  if (G.mission || G.missionIndex >= MISSIONS.length) {
    G.startMarker.visible = false;
    return;
  }
  const m = MISSIONS[G.missionIndex];
  G.startMarker.visible = true;
  G.startMarker.position.set(m.start.x, 0.25, m.start.z);
}

export function startMission(G, idx) {
  const def = MISSIONS[idx];
  G.mission = {
    def, step: 0, timer: def.steps[0].timer || 0,
    target: new THREE.Vector3(def.steps[0].target.x, 0, def.steps[0].target.z),
    cashStolen: false,
  };
  G.beacon.visible = true;
  G.beacon.position.set(def.steps[0].target.x, 15, def.steps[0].target.z);
  G.showBrief(def.brief);
  G.audio?.jingle();
  updateStartMarker(G);
  G.hud?.update();
}

export function currentObjective(G) {
  if (!G.mission) {
    if (G.missionIndex >= MISSIONS.length) return 'Story complete — free roam Solmar!';
    return `Go to the yellow marker to start: ${MISSIONS[G.missionIndex].name}`;
  }
  const step = G.mission.def.steps[G.mission.step];
  return step.text;
}

export function missionTarget(G) {
  if (G.mission) return G.mission.target;
  if (G.missionIndex < MISSIONS.length) {
    const s = MISSIONS[G.missionIndex].start;
    return new THREE.Vector3(s.x, 0, s.z);
  }
  return null;
}

function advanceStep(G) {
  const m = G.mission;
  m.step += 1;
  if (m.step >= m.def.steps.length) {
    completeMission(G);
    return;
  }
  const step = m.def.steps[m.step];
  m.target.set(step.target.x, 0, step.target.z);
  m.timer = step.timer || 0;
  G.beacon.position.set(step.target.x, 15, step.target.z);
  if (step.wanted) G.setWanted(step.wanted, 'mission heat');
  if (step.night) G.setNight(true);
  if (step.kind === 'deliver' && m.def.id === 3) {
    // gang guards at the bank for the escape
    import('./combat.js').then((c) => c.spawnGang(G, 26, 26, 4));
  }
  G.hud?.update();
}

export function completeMission(G) {
  const m = G.mission;
  G.addCash(m.def.reward);
  G.hudPopup(`+$${m.def.reward} — ${m.def.name} complete!`, '#FFD700');
  G.missionDone[m.def.id - 1] = true;
  G.missionIndex = m.def.id; // next mission
  G.mission = null;
  G.beacon.visible = false;
  G.setWanted(0, 'mission complete');
  G.setNight(false);
  G.audio?.jingle();
  G.saveGame();
  if (G.missionIndex >= MISSIONS.length) {
    G.addCash(1000);
    G.state = 'complete';
    G.showComplete();
  }
  updateStartMarker(G);
  G.hud?.update();
}

export function failMission(G, reason) {
  if (!G.mission) return;
  G.showToast(`Mission failed: ${reason}`);
  G.mission = null;
  G.beacon.visible = false;
  G.setNight(false);
  updateStartMarker(G);
  G.hud?.update();
}

export function updateMissions(G, dt) {
  if (G.startMarker.visible) G.startMarker.rotation.y += dt;
  if (G.beacon.visible) G.beacon.rotation.y += dt * 0.5;
  if (!G.mission) {
    // walk into the start marker to begin
    if (G.missionIndex < MISSIONS.length) {
      const s = MISSIONS[G.missionIndex].start;
      const d = Math.hypot(G.playerPos.x - s.x, G.playerPos.z - s.z);
      if (d < 3.5 && !G.player.inCar) startMission(G, G.missionIndex);
    }
    return;
  }
  const m = G.mission;
  const step = m.def.steps[m.step];
  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) { failMission(G, 'Out of time'); return; }
  }
  const d = Math.hypot(G.playerPos.x - step.target.x, G.playerPos.z - step.target.z);
  if (step.kind === 'steal') {
    // target is the marked sedan; entering it advances
    if (G.player.inCar && G.playerCar?.isMarked) advanceStep(G);
  } else if (step.kind === 'pickup' || step.kind === 'goto') {
    if (d < 5) advanceStep(G);
  } else if (step.kind === 'deliver') {
    if (d < 6 && G.player.inCar) advanceStep(G);
    else if (d < 6 && !G.player.inCar) G.showToast('You need the car to deliver!');
  } else if (step.kind === 'grab') {
    if (d < 5 && G.keys['KeyE']) {
      G.hudPopup('Cash grabbed!', '#FFD700');
      advanceStep(G);
    }
  }
}
