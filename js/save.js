/* =============================================================
   save.js — local persistence + JSON export / import.
   Works entirely in the browser; no server required.

   Stores under localStorage key 'silentEntrySave'. Export creates
   a JSON blob and triggers a download; import reads a file via
   the standard browser picker. Both work fine from file:// on
   Chrome OS, Chrome desktop, and Edge.
   ============================================================= */

window.SilentSave = (function () {

  const STORAGE_KEY = 'silentEntrySave';

  // Single source of truth for the save shape. New fields added here
  // are automatically present on existing saves through the merge in load().
  const DEFAULT_SAVE = {
    version: 1,
    bestTime: null,            // ms, fastest standard / timed completion
    missionsCompleted: 0,
    civiliansRescuedTotal: 0,
    intelCollectedTotal: 0,
    nightmareUnlocked: false,
    // Settings
    difficulty: 'Standard',
    graphics: 'Medium',
    sensitivity: 1.0,
    flashlightIntensity: 1.0,
    flashlightDefaultOn: true,
    flashlightColor: '#ffffff',
    screenShake: true,
    objectiveMarkers: true,
  };

  let _save = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge against defaults so newer fields are present.
        _save = Object.assign({}, DEFAULT_SAVE, parsed);
        return _save;
      }
    } catch (e) {
      console.warn('Save load failed, resetting:', e);
    }
    _save = Object.assign({}, DEFAULT_SAVE);
    return _save;
  }

  function get() {
    if (!_save) load();
    return _save;
  }

  function set(partial) {
    if (!_save) load();
    Object.assign(_save, partial);
    persist();
    return _save;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_save));
    } catch (e) {
      console.warn('Save persist failed:', e);
    }
  }

  function reset() {
    _save = Object.assign({}, DEFAULT_SAVE);
    persist();
    return _save;
  }

  // Trigger a normal browser download for the current save JSON.
  function exportToFile() {
    if (!_save) load();
    const json = JSON.stringify(_save, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `silent-entry-save-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // Accepts a File from <input type="file">; merges into current save.
  function importFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file'));
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('Read failed'));
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (typeof data !== 'object' || data === null) throw new Error('Bad shape');
          _save = Object.assign({}, DEFAULT_SAVE, data);
          persist();
          resolve(_save);
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  }

  // Record a completed mission. Updates best time if improved.
  function recordMission({ timeMs, civiliansRescued, intel, mode }) {
    if (!_save) load();
    _save.missionsCompleted += 1;
    _save.civiliansRescuedTotal += (civiliansRescued || 0);
    _save.intelCollectedTotal += (intel || 0);
    if (typeof timeMs === 'number' && (_save.bestTime == null || timeMs < _save.bestTime)) {
      _save.bestTime = timeMs;
    }
    if (!_save.nightmareUnlocked && mode !== 'nightmare') {
      _save.nightmareUnlocked = true;
    }
    persist();
    return _save;
  }

  // Helper used by both menu and HUD for consistent time formatting.
  function formatTime(ms) {
    if (ms == null) return '—';
    const total = ms / 1000;
    const m = Math.floor(total / 60);
    const s = total - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
  }

  return {
    DEFAULT_SAVE,
    load,
    get,
    set,
    reset,
    exportToFile,
    importFromFile,
    recordMission,
    formatTime,
  };
})();

// Load immediately so other modules can read settings during init.
window.SilentSave.load();
