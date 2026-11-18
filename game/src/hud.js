// HUD: the DOM readouts (cash, stars, clock, bars, speed, ammo) and the 2D
// canvas minimap (roads, player arrow, traffic, police, mission blip). The
// banner and floating cash popups are one-shot DOM messages.
import { HALF, PITCH, GRID } from './city.js';
import { missionTarget } from './missions.js';

export function createHud() {
  const els = {
    cash: document.getElementById('cash'),
    objective: document.getElementById('objective'),
    stars: document.getElementById('stars'),
    clock: document.getElementById('clock'),
    healthFill: document.getElementById('healthFill'),
    armourFill: document.getElementById('armourFill'),
    speed: document.getElementById('speed'),
    ammo: document.getElementById('ammo'),
    crosshair: document.getElementById('crosshair'),
    banner: document.getElementById('banner'),
    bannerTitle: document.getElementById('bannerTitle'),
    bannerSub: document.getElementById('bannerSub'),
    vignette: document.getElementById('vignette'),
    popups: document.getElementById('popups'),
    minimap: document.getElementById('minimap'),
  };
  const mapCtx = els.minimap.getContext('2d');
  let bannerAt = 0;

  function banner(title, sub) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.style.display = 'block';
    bannerAt = performance.now();
  }

  function popup(text) {
    const div = document.createElement('div');
    div.className = 'popup';
    div.textContent = text;
    els.popups.appendChild(div);
    setTimeout(() => div.remove(), 1700);
  }

  function drawMinimap(G) {
    const ctx = mapCtx;
    const S = 180;
    const toPx = (v) => ((v + HALF + 16) / (2 * HALF + 32)) * S;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = '#10151d';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#5a636e';
    ctx.lineWidth = 2;
    for (let k = 0; k <= GRID; k += 1) {
      const c = toPx(-HALF + k * PITCH);
      ctx.beginPath(); ctx.moveTo(c, 0); ctx.lineTo(c, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, c); ctx.lineTo(S, c); ctx.stroke();
    }
    // Hideout (green) and bank (gold).
    ctx.fillStyle = '#3ddc5f';
    ctx.fillRect(toPx(G.city.spots.hideout.x) - 3, toPx(G.city.spots.hideout.z) - 3, 6, 6);
    ctx.fillStyle = '#ffd23e';
    ctx.fillRect(toPx(G.city.spots.bank.x) - 3, toPx(G.city.spots.bank.z) - 3, 6, 6);
    // Mission blip, pulsing.
    const target = missionTarget(G);
    if (target) {
      const r = 4 + Math.sin(performance.now() / 200) * 1.5;
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath();
      ctx.arc(toPx(target.x), toPx(target.z), r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Traffic (white), police (blue/red flashing).
    ctx.fillStyle = '#dfe6ee';
    for (const car of G.cars) {
      if (car.kind === 'traffic' || car.kind === 'taxi') ctx.fillRect(toPx(car.x) - 1.5, toPx(car.z) - 1.5, 3, 3);
    }
    const flash = Math.floor(performance.now() / 300) % 2 === 0;
    ctx.fillStyle = flash ? '#ff4040' : '#4080ff';
    for (const car of G.police) ctx.fillRect(toPx(car.x) - 2, toPx(car.z) - 2, 4, 4);
    // Player arrow.
    const px = toPx(G.player.x);
    const pz = toPx(G.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-G.player.heading);
    ctx.fillStyle = '#7dff9a';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function update(G) {
    const p = G.player;
    els.cash.textContent = `$${Math.floor(p.cash)}`;
    const stars = G.wanted.stars;
    els.stars.textContent = stars > 0 ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '';
    const hh = Math.floor(G.clockH);
    const mm = Math.floor((G.clockH - hh) * 60);
    els.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}  •  ${G.missionsDone}/3 jobs`;
    els.healthFill.style.width = `${Math.max(0, p.health)}%`;
    els.armourFill.style.width = `${Math.max(0, p.armour)}%`;
    els.speed.textContent = G.playerCar ? `${Math.round(Math.abs(G.playerCar.speed) * 2.24)} mph` : '';
    els.ammo.textContent = G.playerCar ? '' : `AMMO ${p.ammo} / ${p.ammoReserve}`;
    els.crosshair.style.display = G.playerCar ? 'none' : 'block';
    if (G.hudFlash > 0) {
      els.vignette.style.opacity = String(Math.min(1, G.hudFlash));
      G.hudFlash = Math.max(0, G.hudFlash - 0.02);
    } else {
      els.vignette.style.opacity = '0';
    }
    if (bannerAt && performance.now() - bannerAt > 4200) {
      els.banner.style.display = 'none';
      bannerAt = 0;
    }
    drawMinimap(G);
  }

  return { update, banner, popup };
}
