// Velora City — save / load through localStorage. Nothing leaves the browser.
const SAVE_KEY = 'velora-city-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      savedAt: Date.now(),
      money: Math.round(state.money),
      health: Math.round(state.player.health),
      missionIndex: state.missions.index,
      missionsDone: state.missions.doneCount,
      cashFound: state.missions.cashFound,
      player: {
        x: state.player.pos.x,
        z: state.player.pos.z,
        heading: state.player.heading,
      },
      stats: state.stats,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false; // storage off (private window): the session just does not persist
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
