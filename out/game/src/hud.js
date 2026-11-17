// hud.js — HUD DOM + 2D minimap canvas.
import { PITCH, HALF } from './city.js';

export function initHud(G) {
  const el = (id) => document.getElementById(id);
  G.hudEls = {
    cash: el('hud-cash'), health: el('hud-health'), armor: el('hud-armor'),
    ammo: el('hud-ammo'), stars: el('hud-stars'), clock: el('hud-clock'),
    objective: el('hud-objective'), speed: el('hud-speed'),
    toast: el('hud-toast'), brief: el('hud-brief'), vignette: el('hud-vignette'),
    minimap: el('minimap'), popups: el('hud-popups'),
  };
  G.minimapCtx = G.hudEls.minimap.getContext('2d');
  G.hud = {
    update: () => updateHud(G),
  };
}

export function updateHud(G) {
  const e = G.hudEls;
  if (!e) return;
  e.cash.textContent = '$' + Math.floor(G.cash).toLocaleString('en-US');
  const hp = Math.max(0, Math.ceil(G.player.health));
  e.health.style.width = hp + '%';
  e.health.textContent = hp > 0 ? hp : '';
  e.armor.style.width = Math.max(0, Math.ceil(G.player.armor)) + '%';
  e.ammo.textContent = G.ammo + ' / ' + G.ammoReserve;
  e.stars.textContent = '★'.repeat(G.stars) + '☆'.repeat(5 - G.stars);
  e.stars.style.color = G.stars > 0 ? '#ffcc00' : '#888';
  const mins = Math.floor(G.gameClock % 1440);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  e.clock.textContent = hh + ':' + mm;
  e.objective.textContent = G.mission?.def
    ? `${G.mission.def.name}: ${G.mission.def.steps[G.mission.step].text}${G.mission.timer > 0 ? ' — ' + Math.ceil(G.mission.timer) + 's' : ''}`
    : (G.missionIndex < 3 ? `Next: ${['First Wheels', 'Hot Delivery', 'The Big Score'][G.missionIndex]} — go to the yellow marker` : 'Story complete — free roam!');
  e.speed.textContent = G.player.inCar ? Math.round(G.playerSpeed || 0) + ' km/h' : '';
  e.speed.style.display = G.player.inCar ? 'block' : 'none';
  e.vignette.style.opacity = String(Math.min(0.85, G.damageFlash));
  drawMinimap(G);
}

export function drawMinimap(G) {
  const ctx = G.minimapCtx;
  if (!ctx) return;
  const S = 170, scale = S / (HALF * 2 + 40);
  const w2m = (x) => (x + HALF + 20) * scale;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#1c2733';
  ctx.fillRect(0, 0, S, S);
  // roads
  ctx.strokeStyle = '#5a6068';
  ctx.lineWidth = 4;
  for (const l of G.roadLines) {
    ctx.beginPath(); ctx.moveTo(w2m(l), 0); ctx.lineTo(w2m(l), S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, w2m(l)); ctx.lineTo(S, w2m(l)); ctx.stroke();
  }
  // beach
  ctx.fillStyle = '#d9c184';
  ctx.fillRect(0, w2m(176), S, S - w2m(176));
  // mission target blip
  const tgt = G.missionTarget ? G.missionTarget() : null;
  if (tgt) {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath(); ctx.arc(w2m(tgt.x), w2m(tgt.z), 6, 0, 7); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // traffic (white), cops (blue), gang (red)
  ctx.fillStyle = '#ddd';
  for (const t of G.traffic || []) { ctx.fillRect(w2m(t.pos.x) - 1.5, w2m(t.pos.z) - 1.5, 3, 3); }
  ctx.fillStyle = '#4488ff';
  for (const c of G.police || []) { ctx.fillRect(w2m(c.pos.x) - 2, w2m(c.pos.z) - 2, 4, 4); }
  ctx.fillStyle = '#ff4444';
  for (const gm of G.gang || []) { ctx.fillRect(w2m(gm.pos.x) - 2, w2m(gm.pos.z) - 2, 4, 4); }
  // player arrow
  const px = w2m(G.playerPos.x), pz = w2m(G.playerPos.z);
  const heading = G.player.inCar && G.playerCar ? G.playerCar.heading : G.player.heading;
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-heading + Math.PI); // map north = -z
  ctx.fillStyle = '#00ff88';
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  // north tick
  ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.fillText('N', S - 12, 14);
}

export function showToast(G, msg, ms = 3500) {
  const e = G.hudEls?.toast;
  if (!e) return;
  e.textContent = msg;
  e.style.opacity = '1';
  clearTimeout(G._toastT);
  G._toastT = setTimeout(() => { e.style.opacity = '0'; }, ms);
}

export function showBrief(G, text) {
  const e = G.hudEls?.brief;
  if (!e) return;
  e.textContent = text;
  e.style.display = 'block';
  clearTimeout(G._briefT);
  G._briefT = setTimeout(() => { e.style.display = 'none'; }, 9000);
}

// Floating cash popups (bottom-right stack).
export function hudPopup(G, text, color = '#FFD700') {
  const box = G.hudEls?.popups;
  if (!box) return;
  const d = document.createElement('div');
  d.className = 'cash-pop';
  d.textContent = text;
  d.style.color = color;
  box.appendChild(d);
  setTimeout(() => d.classList.add('rise'), 20);
  setTimeout(() => d.remove(), 2200);
}
