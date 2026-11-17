// save.js — localStorage save/load for Solmar Heat.
const KEY = 'solmar-heat-save-v1';

export function saveGame(G) {
  try {
    const data = {
      cash: Math.floor(G.cash),
      missionsDone: G.missionDone,
      missionIndex: G.missionIndex,
      bestCash: Math.max(G.bestCash || 0, Math.floor(G.cash)),
      kills: G.stats?.kills || 0,
      carsStolen: G.stats?.carsStolen || 0,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame(G) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    G.cash = d.cash || 0;
    G.missionDone = d.missionsDone || [false, false, false];
    G.missionIndex = d.missionIndex || 0;
    G.bestCash = d.bestCash || 0;
    G.stats = { kills: d.kills || 0, carsStolen: d.carsStolen || 0 };
    return d;
  } catch { return null; }
}

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
