// HUD for Solmar Heat: DOM panels, canvas minimap, popups, announcements.
import { money, fmtClock } from './common.js';
import { roadLines, HALF } from './city.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(W) {
    this.W = W;
    this.map = $('minimap').getContext('2d');
    this.announceT = 0;
    this.objOverride = null; this.objOverrideT = 0;
    this.onBriefGo = null; this.onBriefLater = null;
    $('btn-brief-go').addEventListener('click', () => { $('brief').classList.add('hidden'); this.onBriefGo && this.onBriefGo(); });
    $('btn-brief-later').addEventListener('click', () => { $('brief').classList.add('hidden'); this.onBriefLater && this.onBriefLater(); });
  }
  show(id) { $(id).classList.remove('hidden'); }
  hide(id) { $(id).classList.add('hidden'); }
  announce(title, sub = '') {
    const el = $('announce');
    el.innerHTML = title + (sub ? '<small>' + sub + '</small>' : '');
    el.style.opacity = 1;
    this.announceT = 2.6;
  }
  setObjective(text, secs = 3) { this.objOverride = text; this.objOverrideT = secs; }
  flashDamage() {
    const v = $('vignette');
    v.style.boxShadow = 'inset 0 0 120px 40px rgba(220,0,0,0.55)';
    setTimeout(() => { v.style.boxShadow = 'inset 0 0 120px 40px rgba(220,0,0,0)'; }, 220);
  }
  popup(text, wx, wz) {
    const box = $('popups');
    const el = document.createElement('div');
    el.className = 'cashpop';
    el.textContent = text;
    el.style.left = (42 + Math.random() * 16) + '%';
    el.style.top = (58 + Math.random() * 8) + '%';
    box.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }
  showBrief(def) {
    $('brief-title').textContent = 'JOB ' + def.id + ' — ' + def.name.toUpperCase();
    $('brief-text').textContent = def.brief;
    $('brief-goal').textContent = 'Goal: ' + def.goal;
    $('brief-reward').textContent = 'Reward: ' + money(def.reward) + (def.night ? '  ·  Night job' : '');
    $('brief').classList.remove('hidden');
  }
  update(dt) {
    const W = this.W, P = W.player;
    if (this.announceT > 0) {
      this.announceT -= dt;
      if (this.announceT <= 0) $('announce').style.opacity = 0;
    }
    if (this.objOverrideT > 0) {
      this.objOverrideT -= dt;
      if (this.objOverrideT <= 0) this.objOverride = null;
    }
    $('cash').firstChild.textContent = money(W.cash);
    $('star-row').textContent = '★'.repeat(W.wanted) + '☆'.repeat(5 - W.wanted);
    $('clock').textContent = fmtClock(W.clockMins);
    // objective
    const m = W.missions.active;
    if (this.objOverride) {
      $('obj-title').textContent = m ? 'JOB ' + m.def.id + ' — ' + m.def.name : 'Free Roam';
      $('obj-text').textContent = this.objOverride;
      $('obj-dist').textContent = '';
    } else if (m) {
      $('obj-title').textContent = 'JOB ' + m.def.id + ' — ' + m.def.name;
      let txt = m.def.goal;
      if (m.def.id === 3 && m.stage === 'bank') txt = 'Reach the bank and hold the vault.';
      if (m.def.id === 4) txt = 'Checkpoint ' + (m.raceIdx + 1) + '/5 — ' + m.def.goal;
      if (m.def.id === 5) txt = 'Red Jackets left: ' + W.combat.gang.length;
      if (m.def.id === 6) txt = 'Fares done: ' + m.fareIdx + '/3 — ' + m.def.goal;
      $('obj-text').textContent = txt;
      const px = P.inCar ? P.carX : P.x, pz = P.inCar ? P.carZ : P.z;
      if (m.target) {
        const d = Math.hypot(m.target.x - px, m.target.z - pz);
        $('obj-dist').textContent = '· ' + Math.round(d) + 'm' + (m.timer > 0 ? ' · ' + Math.ceil(m.timer) + 's' : '');
      } else $('obj-dist').textContent = m.timer > 0 ? '· ' + Math.ceil(m.timer) + 's' : '';
    } else {
      const n = W.missions.nextDef();
      $('obj-title').textContent = 'Free Roam';
      $('obj-text').textContent = n ? 'Press M for the next job: ' + n.name + ' (' + money(n.reward) + ')' : 'All jobs complete — Solmar is yours.';
      $('obj-dist').textContent = '';
    }
    // bars
    $('hp-fill').style.width = Math.max(0, P.hp) + '%';
    $('arm-fill').style.width = Math.max(0, P.armour) + '%';
    const mag = P.ammo, total = P.ammo + P.reserveAmmo;
    $('ammo-fill').style.width = (total > 0 ? (mag / 24) * 100 : 0) + '%';
    $('ammo-num').textContent = mag + ' / ' + P.reserveAmmo;
    // speed
    if (P.inCar) {
      $('speed').classList.remove('hidden');
      $('speed-num').textContent = Math.round(Math.abs(P.carSpeed) * 2.2);
      $('speed-label').textContent = 'MPH · ' + (P.carTypeLabel || 'SEDAN') + (P.carHp < 100 ? ' · CAR ' + Math.round(P.carHp) + '%' : '');
    } else $('speed').classList.add('hidden');
    this._drawMinimap();
  }
  _drawMinimap() {
    const W = this.W, P = W.player;
    const g = this.map, S = 190, C = S / 2;
    const scale = S / (HALF * 2 + 70);
    const toMap = (x, z) => [C + x * scale, C + z * scale];
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#10141d'; g.fillRect(0, 0, S, S);
    // sea + beach
    g.fillStyle = '#1e6f8e'; g.fillRect(0, C + HALF * scale, S, S);
    g.fillStyle = '#c2a878'; g.fillRect(0, C + (HALF - 6) * scale, S, 8 * scale);
    // blocks
    g.fillStyle = '#2c313a';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const [x, z] = toMap((i - 3.5) * 36 - 13, (j - 3.5) * 36 - 13);
      g.fillRect(x, z, 26 * scale, 26 * scale);
    }
    // roads
    g.strokeStyle = '#5a5f68'; g.lineWidth = 2;
    for (const line of roadLines) {
      const [x1] = toMap(line, 0); g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1, S); g.stroke();
      const [, z1] = toMap(0, line); g.beginPath(); g.moveTo(0, z1); g.lineTo(S, z1); g.stroke();
    }
    const dot = (x, z, r, color) => {
      const [mx, mz] = toMap(x, z);
      g.fillStyle = color; g.beginPath(); g.arc(mx, mz, r, 0, Math.PI * 2); g.fill();
    };
    const m = W.missions.active;
    if (m && m.target) {
      const [mx, mz] = toMap(m.target.x, m.target.z);
      const pulse = 5 + Math.sin(performance.now() / 220) * 2;
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(mx, mz, pulse, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1a1200'; g.beginPath(); g.arc(mx, mz, 2.5, 0, Math.PI * 2); g.fill();
    }
    for (const tc of W.traffic.cars) dot(tc.x, tc.z, 1.6, '#cfd6de');
    for (const pc of W.police.cars) dot(pc.x, pc.z, 2.4, '#3a86ff');
    for (const gg of W.combat.gang) dot(gg.x, gg.z, 2.2, '#ff4040');
    // player arrow
    const px = P.inCar ? P.carX : P.x, pz = P.inCar ? P.carZ : P.z;
    const [mx, mz] = toMap(px, pz);
    const heading = P.inCar ? P.carHeading : P.heading;
    g.save(); g.translate(mx, mz); g.rotate(-heading + Math.PI);
    g.fillStyle = '#7dff8a';
    g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 5); g.lineTo(-4.5, 5); g.closePath(); g.fill();
    g.restore();
    g.restore();
    // north tick
    g.fillStyle = '#ffd23f'; g.font = 'bold 10px sans-serif'; g.textAlign = 'center';
    g.fillText('N', C, 12);
  }
}
