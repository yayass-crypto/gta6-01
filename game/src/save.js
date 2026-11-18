// Save: one localStorage row for cash, jobs done and best stats. Storage can
// be off (private windows) — then the game simply starts fresh each visit.
const KEY = 'solmar-heat-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage off: the session still plays, it just does not persist.
  }
}
