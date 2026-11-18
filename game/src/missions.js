// Story missions for Solmar Heat — six jobs for fixer Marisol Vega.
import * as THREE from 'three';
import { money } from './common.js';

function markerMesh(scene, color) {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 13; g.add(beam);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 8, 24),
    new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; g.add(ring);
  g.visible = false;
  scene.add(g);
  return g;
}

export class Missions {
  constructor(scene, W) {
    this.scene = scene; this.W = W;
    this.defs = this._defs();
    this.done = new Set();
    this.active = null; // {def, stage, timer, target, fareIdx, faresLeft, holdT}
    this.marker = markerMesh(scene, 0xffd23f);
    // waypoint arrow above the player
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.arrow.visible = false;
    this.arrow.rotation.x = Math.PI / 2;
    scene.add(this.arrow);
    this.raceIdx = 0;
  }
  _defs() {
    return [
      {
        id: 1, name: 'First Wheels', reward: 400,
        brief: 'Marisol needs a clean sedan — no questions, no plates. Lift the marked car on 5th and bring it to the chop shop on the east side.',
        goal: 'Steal the marked sedan, then deliver it to the chop shop.',
      },
      {
        id: 2, name: 'Hot Delivery', reward: 700,
        brief: 'A package that must not be opened, a client across town, and two stars of heat already on your tail. Drive like the whole city is watching — it is.',
        goal: 'Grab the package, then deliver it across town while wanted.',
      },
      {
        id: 3, name: 'The Big Score', reward: 1500, night: true,
        brief: 'The Solmar National Bank keeps its vault light at night — light enough. Get in, grab the cash, and lose the three-star chase at the hideout.',
        goal: 'Reach the bank, hold the vault for 3s, escape to the hideout.',
      },
      {
        id: 4, name: 'Solmar Grand Prix', reward: 900,
        brief: 'The street racers run a five-checkpoint loop tonight and the pot is real money. Beat the clock — every checkpoint counts.',
        goal: 'Hit all 5 checkpoints before the timer runs out. You need a car.',
      },
      {
        id: 5, name: 'Turf War', reward: 1200,
        brief: 'The Red Jackets are moving on Vega\'s corner. Eight of them, one of you. Take the corner back and make it stick.',
        goal: 'Eliminate all 8 Red Jackets at the turf corner.',
      },
      {
        id: 6, name: 'Fare Game', reward: 1000,
        brief: 'Last job: drive the cab, keep the meter running. Three fares, three drops, one very impatient city. Finish this and the debt is gone.',
        goal: 'Pick up 3 fares in the taxi and drop each one off.',
      },
    ];
  }
  nextDef() { return this.defs.find((d) => !this.done.has(d.id)) || null; }
  isComplete() { return this.done.size === this.defs.length; }
  start(def) {
    const W = this.W, S = W.city.spots;
    const m = { def, stage: 'go', timer: 0, target: null, holdT: 0, faresLeft: 3, fareIdx: 0, raceIdx: 0, gangLeft: 0 };
    if (def.night) W.city.setNight(true);
    if (def.id === 1) {
      m.timer = 150; m.target = { ...S.sedanSpawn, label: 'Marked sedan' }; m.stage = 'steal';
      W.traffic.spawnTyped('sedan', S.sedanSpawn.x, S.sedanSpawn.z, true);
    }
    if (def.id === 2) { m.timer = 180; m.target = { x: -72, z: 36, label: 'Package pickup' }; m.stage = 'pickup'; W.setWanted(2); }
    if (def.id === 3) { m.timer = 240; m.target = { ...S.bank, label: 'Solmar National Bank' }; m.stage = 'bank'; }
    if (def.id === 4) { m.timer = 200; m.target = { ...S.race[0], label: 'Checkpoint 1/5' }; m.stage = 'race'; m.raceIdx = 0; }
    if (def.id === 5) { m.timer = 200; m.target = { ...S.turfCorner, label: 'Turf corner' }; m.stage = 'fight'; W.combat.spawnGang(8, S.turfCorner.x, S.turfCorner.z); m.gangLeft = 8; }
    if (def.id === 6) {
      m.timer = 300; m.stage = 'taxi';
      m.fares = [{ x: -36, z: -36 }, { x: 72, z: 72 }, { x: -108, z: -108 }];
      m.drops = [{ x: 108, z: 36 }, { x: -72, z: 108 }, { x: 36, z: -108 }];
      m.target = { ...S.taxiSpawn, label: 'Get the taxi' };
      W.traffic.spawnTyped('taxi', S.taxiSpawn.x, S.taxiSpawn.z, true);
      W.hud.announce(def.name, 'Job started — follow the yellow marker.');
    }
    this.active = m;
    this._placeMarker();
    W.audio.jingle();
    W.saveGame();
  }
  _placeMarker() {
    const m = this.active;
    if (!m || !m.target) { this.marker.visible = false; this.arrow.visible = false; return; }
    this.marker.visible = true;
    this.marker.position.set(m.target.x, 0, m.target.z);
    this.arrow.visible = true;
  }
  fail(reason) {
    const W = this.W;
    W.audio.fail();
    W.hud.announce('JOB FAILED', reason);
    if (this.active?.def.night) W.city.setNight(false);
    W.combat.clearGang();
    this.active = null;
    this.marker.visible = false; this.arrow.visible = false;
  }
  complete() {
    const W = this.W, m = this.active;
    W.addCash(m.def.reward, W.player.x, W.player.z);
    W.audio.jingle();
    this.done.add(m.def.id);
    W.hud.announce('JOB DONE — ' + m.def.name, '+' + money(m.def.reward) + '  ·  ' + (this.done.size) + '/6 jobs complete');
    if (m.def.night) W.city.setNight(false);
    W.combat.clearGang();
    W.setWanted(0);
    this.active = null;
    this.marker.visible = false; this.arrow.visible = false;
    W.saveGame();
    if (this.isComplete()) {
      W.addCash(5000, W.player.x, W.player.z);
      setTimeout(() => W.showEnd('story', 'All six jobs done. The debt is paid, the city is yours. Marisol Vega sends her regards — and a $5,000 bonus.'), 1200);
    } else {
      setTimeout(() => { const n = this.nextDef(); if (n) W.hud.showBrief(n); }, 1600);
    }
  }
  update(dt) {
    const W = this.W, m = this.active;
    if (!m) return;
    const P = W.player;
    const px = P.inCar ? P.carX : P.x, pz = P.inCar ? P.carZ : P.z;
    if (m.timer > 0) {
      m.timer -= dt;
      if (m.timer <= 0) { this.fail('Out of time. Marisol is not happy.'); return; }
    }
    this.marker.rotation.y += dt * 1.2;
    // waypoint arrow above player
    if (m.target) {
      this.arrow.position.set(px, P.inCar ? 3.4 : 2.8, pz);
      const ang = Math.atan2(m.target.x - px, m.target.z - pz);
      this.arrow.rotation.y = ang;
    }
    const near = (t, r) => t && Math.hypot(t.x - px, t.z - pz) < r;
    switch (m.def.id) {
      case 1:
        if (m.stage === 'steal') {
          if (P.inCar && near(m.target, 6) && P.carType === 'sedan') {
            m.stage = 'deliver'; m.target = { ...W.city.spots.chopShop, label: 'Chop shop' }; m.timer = 150;
            W.hud.announce('CAR SECURED', 'Now deliver it to the chop shop.');
          }
        } else if (near(m.target, 9) && P.inCar) this.complete();
        break;
      case 2:
        if (m.stage === 'pickup' && near(m.target, 5)) {
          m.stage = 'deliver'; m.target = { x: 108, z: -108, label: 'Drop-off' }; m.timer = 150;
          W.hud.announce('PACKAGE SECURED', 'Deliver it — and lose the cops if you can.');
        } else if (m.stage === 'deliver' && near(m.target, 8)) this.complete();
        break;
      case 3:
        if (m.stage === 'bank' && near(m.target, 7)) {
          m.holdT += dt;
          if (m.holdT > 0.5) W.hud.setObjective('Grabbing the cash… ' + Math.ceil(3 - m.holdT) + 's');
          if (m.holdT >= 3) {
            m.stage = 'escape'; m.target = { ...W.city.spots.hideout, label: 'Hideout' }; m.timer = 150;
            W.setWanted(3); W.audio.cash();
            W.hud.announce('CASH GRABBED', 'Three stars! Lose them at the hideout.');
          }
        } else if (m.stage === 'bank') m.holdT = 0;
        if (m.stage === 'escape' && near(m.target, 9)) this.complete();
        break;
      case 4: {
        if (!P.inCar) break;
        if (near(m.target, 10)) {
          m.raceIdx++;
          if (m.raceIdx >= 5) { this.complete(); break; }
          m.target = { ...W.city.spots.race[m.raceIdx], label: 'Checkpoint ' + (m.raceIdx + 1) + '/5' };
          W.audio.pickup();
          W.hud.announce('CHECKPOINT ' + m.raceIdx + '/5', 'Keep it floored.');
        }
        break;
      }
      case 5:
        m.gangLeft = W.combat.gang.length;
        if (m.gangLeft === 0) this.complete();
        else if (m.stage === 'fight' && near(m.target, 40)) m.stage = 'fighting';
        break;
      case 6: {
        if (m.stage === 'taxi') {
          if (P.inCar && P.carType === 'taxi' && near(m.target, 6)) {
            m.stage = 'pickup';
            m.target = { ...m.fares[m.fareIdx], label: 'Fare ' + (m.fareIdx + 1) + ' pickup' };
            W.hud.announce('TAXI READY', 'Pick up fare ' + (m.fareIdx + 1) + '.');
          }
        } else if (m.stage === 'pickup' && near(m.target, 6)) {
          m.stage = 'drop';
          m.target = { ...m.drops[m.fareIdx], label: 'Fare ' + (m.fareIdx + 1) + ' drop-off' };
          W.audio.pickup();
        } else if (m.stage === 'drop' && near(m.target, 7)) {
          W.addCash(250, px, pz);
          m.fareIdx++;
          if (m.fareIdx >= 3) { this.complete(); break; }
          m.stage = 'pickup';
          m.target = { ...m.fares[m.fareIdx], label: 'Fare ' + (m.fareIdx + 1) + ' pickup' };
          W.hud.announce('FARE PAID +$250', 'Next fare, keep moving.');
        }
        break;
      }
    }
  }
}
