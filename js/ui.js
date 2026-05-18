/* =============================================================
   ui.js — menu navigation + HUD update helpers.

   Maintains a tiny state machine for which screen is visible
   ('mainMenu', 'missionSelect', 'settingsMenu', 'howToPlay',
   'saveMenu', 'creditsMenu', 'pauseMenu', 'endScreen', or
   'gameplay'). Also wires up settings inputs to SilentSave.
   ============================================================= */

window.SilentUI = (function () {

  const screens = [
    'mainMenu', 'missionSelect', 'settingsMenu', 'howToPlay',
    'saveMenu', 'creditsMenu', 'pauseMenu', 'endScreen', 'loading',
  ];

  let currentScreen = 'mainMenu';
  let onMissionStart  = () => {};
  let onMissionAbort  = () => {};
  let onMissionResume = () => {};
  let onMissionRetry  = () => {};
  let onReturnToMenu  = () => {};
  let menuBgRender    = () => {}; // called per frame while a menu is open

  // ---------- public ----------

  function init(handlers) {
    onMissionStart  = handlers.startMission;
    onMissionAbort  = handlers.abortMission;
    onMissionResume = handlers.resumeMission;
    onMissionRetry  = handlers.retryMission;
    onReturnToMenu  = handlers.returnToMenu || (() => showScreen('mainMenu'));
    menuBgRender    = handlers.menuBgRender || (() => {});

    wireNavigation();
    wireSettings();
    wireSaveMenu();
    wirePause();
    wireEnd();
    refreshStats();
    refreshSettingsInputs();
    refreshSaveReadout();
    refreshNightmareLock();
    showScreen('mainMenu');
    hideLoading();
  }

  function showScreen(name) {
    currentScreen = name;
    for (const s of screens) {
      const el = document.getElementById(s);
      if (!el) continue;
      el.classList.toggle('hidden', s !== name);
    }
    const hud = document.getElementById('hud');
    if (hud) hud.classList.add('hidden');
    document.exitPointerLock && document.exitPointerLock();
    // Repaint the stats every time we enter menus so they stay fresh.
    if (name === 'mainMenu') refreshStats();
    if (name === 'saveMenu') refreshSaveReadout();
  }

  function showGameplay() {
    currentScreen = 'gameplay';
    for (const s of screens) {
      const el = document.getElementById(s);
      if (el) el.classList.add('hidden');
    }
    document.getElementById('hud').classList.remove('hidden');
  }

  function isInGameplay() { return currentScreen === 'gameplay'; }
  function getCurrentScreen() { return currentScreen; }

  function hideLoading() {
    const el = document.getElementById('loading');
    if (el) el.classList.add('hidden');
  }

  // ---------- HUD ----------

  function setHUD({ timeMs, civSecured, civTotal, intelCollected, intelTotal, mode, stance, lightOn, detection, objective }) {
    if (timeMs != null)
      document.getElementById('missionTimer').textContent = SilentSave.formatTime(timeMs);
    if (civTotal != null)
      document.getElementById('civCounter').textContent = `${civSecured} / ${civTotal}`;
    if (intelTotal != null)
      document.getElementById('intelCounter').textContent = `${intelCollected} / ${intelTotal}`;
    if (mode != null)
      document.getElementById('modeLabel').textContent = mode;
    if (stance != null)
      document.getElementById('stanceLabel').textContent = stance;
    if (lightOn != null)
      document.getElementById('lightLabel').textContent = lightOn ? 'LIGHT ON' : 'LIGHT OFF';
    if (objective != null)
      document.getElementById('objectiveText').textContent = objective;
    if (detection != null) {
      const pct = Math.max(0, Math.min(1, detection)) * 100;
      document.getElementById('detectionFill').style.width = `${pct}%`;
      const flash = document.getElementById('alertFlash');
      flash.classList.toggle('active', detection > 0.45);
    }
  }

  function setInteractPrompt(text) {
    const el = document.getElementById('interactPrompt');
    if (!text) { el.classList.add('hidden'); return; }
    document.getElementById('interactText').textContent = text;
    el.classList.remove('hidden');
  }

  function setMapVisible(show) {
    document.getElementById('mapOverlay').classList.toggle('hidden', !show);
  }

  function showEnd({ won, timeMs, civSecured, civTotal, intel, mode, reason }) {
    document.getElementById('endTitle').textContent = won ? 'Mission Complete' : 'Mission Failed';
    document.getElementById('endTitle').style.color = won ? '#4fd1c5' : '#ff6b6b';
    const lines = [];
    lines.push(`<div class="row"><span>Result</span><b>${won ? 'SUCCESS' : 'FAILURE'}</b></div>`);
    lines.push(`<div class="row"><span>Time</span><b>${SilentSave.formatTime(timeMs)}</b></div>`);
    lines.push(`<div class="row"><span>Civilians Secured</span><b>${civSecured} / ${civTotal}</b></div>`);
    lines.push(`<div class="row"><span>Intel Collected</span><b>${intel}</b></div>`);
    lines.push(`<div class="row"><span>Mode</span><b>${mode}</b></div>`);
    if (reason) lines.push(`<div class="row"><span>Reason</span><b>${reason}</b></div>`);
    document.getElementById('endStats').innerHTML = lines.join('');
    showScreen('endScreen');
  }

  // ---------- wiring ----------

  function wireNavigation() {
    document.querySelectorAll('[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => showScreen(btn.dataset.screen));
    });
    document.querySelectorAll('.play-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        onMissionStart(btn.dataset.mode);
      });
    });
  }

  function wireSettings() {
    const sensSlider  = document.getElementById('sensSlider');
    const flashSlider = document.getElementById('flashSlider');
    const diffSel     = document.getElementById('difficultySel');
    const gfxSel      = document.getElementById('graphicsSel');
    const shakeChk    = document.getElementById('shakeChk');
    const markersChk  = document.getElementById('markersChk');
    const flDefault   = document.getElementById('flashlightDefaultChk');
    const resetBtn    = document.getElementById('resetSettingsBtn');

    const set = SilentSave.set;

    sensSlider.addEventListener('input', () => {
      set({ sensitivity: parseFloat(sensSlider.value) });
      document.getElementById('sensVal').textContent = parseFloat(sensSlider.value).toFixed(2);
    });
    flashSlider.addEventListener('input', () => {
      set({ flashlightIntensity: parseFloat(flashSlider.value) });
      document.getElementById('flashVal').textContent = parseFloat(flashSlider.value).toFixed(2);
    });
    diffSel.addEventListener('change',    () => set({ difficulty: diffSel.value }));
    gfxSel.addEventListener('change',     () => set({ graphics: gfxSel.value }));
    shakeChk.addEventListener('change',   () => set({ screenShake: shakeChk.checked }));
    markersChk.addEventListener('change', () => set({ objectiveMarkers: markersChk.checked }));
    flDefault.addEventListener('change',  () => set({ flashlightDefaultOn: flDefault.checked }));

    resetBtn.addEventListener('click', () => {
      const reset = SilentSave.reset();
      refreshSettingsInputs();
      refreshStats();
      refreshSaveReadout();
      refreshNightmareLock();
    });
  }

  function refreshSettingsInputs() {
    const s = SilentSave.get();
    document.getElementById('sensSlider').value = s.sensitivity;
    document.getElementById('flashSlider').value = s.flashlightIntensity;
    document.getElementById('sensVal').textContent  = s.sensitivity.toFixed(2);
    document.getElementById('flashVal').textContent = s.flashlightIntensity.toFixed(2);
    document.getElementById('difficultySel').value = s.difficulty;
    document.getElementById('graphicsSel').value = s.graphics;
    document.getElementById('shakeChk').checked = s.screenShake;
    document.getElementById('markersChk').checked = s.objectiveMarkers;
    document.getElementById('flashlightDefaultChk').checked = s.flashlightDefaultOn;
  }

  function wireSaveMenu() {
    document.getElementById('exportSaveBtn').addEventListener('click', () => {
      SilentSave.exportToFile();
    });

    const importInput = document.getElementById('importSaveInput');
    document.getElementById('importSaveBtn').addEventListener('click', () => {
      importInput.click();
    });
    importInput.addEventListener('change', () => {
      const file = importInput.files && importInput.files[0];
      if (!file) return;
      SilentSave.importFromFile(file)
        .then(() => {
          refreshStats();
          refreshSettingsInputs();
          refreshSaveReadout();
          refreshNightmareLock();
        })
        .catch(err => alert('Could not import save: ' + err.message));
      importInput.value = '';
    });

    document.getElementById('resetSaveBtn').addEventListener('click', () => {
      if (!confirm('Reset all save data? This cannot be undone.')) return;
      SilentSave.reset();
      refreshStats();
      refreshSettingsInputs();
      refreshSaveReadout();
      refreshNightmareLock();
    });
  }

  function refreshSaveReadout() {
    const s = SilentSave.get();
    const $ = id => document.getElementById(id);
    $('sBestTime').textContent   = SilentSave.formatTime(s.bestTime);
    $('sMissions').textContent   = s.missionsCompleted;
    $('sRescued').textContent    = s.civiliansRescuedTotal;
    $('sDifficulty').textContent = s.difficulty;
    $('sGraphics').textContent   = s.graphics;
    $('sSens').textContent       = s.sensitivity.toFixed(2);
    $('sFlash').textContent      = s.flashlightIntensity.toFixed(2);
    $('sNight').textContent      = s.nightmareUnlocked ? 'Yes' : 'No';
  }

  function refreshStats() {
    const s = SilentSave.get();
    document.getElementById('statBestTime').textContent  = SilentSave.formatTime(s.bestTime);
    document.getElementById('statMissions').textContent  = s.missionsCompleted;
    document.getElementById('statRescued').textContent   = s.civiliansRescuedTotal;
    document.getElementById('statNightmare').textContent = s.nightmareUnlocked ? 'Unlocked' : 'Locked';
  }

  function refreshNightmareLock() {
    const card = document.getElementById('nightmareCard');
    const btn  = card.querySelector('.play-btn');
    if (SilentSave.get().nightmareUnlocked) {
      card.classList.remove('locked');
      btn.disabled = false;
      btn.textContent = 'Deploy';
    } else {
      card.classList.add('locked');
      btn.disabled = true;
      btn.textContent = 'Locked';
    }
  }

  function wirePause() {
    document.getElementById('resumeBtn').addEventListener('click', () => onMissionResume());
    document.getElementById('pauseSettingsBtn').addEventListener('click', () => showScreen('settingsMenu'));
    document.getElementById('abortBtn').addEventListener('click', () => {
      if (confirm('Abort mission and return to menu?')) onMissionAbort();
    });
  }

  function wireEnd() {
    document.getElementById('endReturnBtn').addEventListener('click', () => onReturnToMenu());
    document.getElementById('endRetryBtn').addEventListener('click', () => onMissionRetry());
  }

  // Render the minimap (called by game when Tab held)
  function drawMinimap({ rooms, civs, intel, enemies, player, extraction, hostileMarkers, showMarkers }) {
    const c = document.getElementById('minimap');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    // Map a world rect into the canvas.
    const worldMinX = -23, worldMaxX = 23;
    const worldMinZ = -19, worldMaxZ = 22;
    const scaleX = c.width  / (worldMaxX - worldMinX);
    const scaleZ = c.height / (worldMaxZ - worldMinZ);
    const wx = x => (x - worldMinX) * scaleX;
    const wz = z => (z - worldMinZ) * scaleZ;

    // Room fills + labels
    rooms.forEach(r => {
      ctx.fillStyle = r.color;
      ctx.fillRect(wx(r.x1), wz(r.z1), (r.x2 - r.x1) * scaleX, (r.z2 - r.z1) * scaleZ);
      ctx.strokeStyle = 'rgba(120, 180, 255, 0.25)';
      ctx.strokeRect(wx(r.x1), wz(r.z1), (r.x2 - r.x1) * scaleX, (r.z2 - r.z1) * scaleZ);
      ctx.fillStyle = 'rgba(180, 200, 220, 0.55)';
      ctx.font = '10px ui-monospace, Consolas, monospace';
      ctx.fillText(r.name, wx(r.x1) + 4, wz(r.z1) + 14);
    });

    // Extraction
    if (showMarkers) {
      ctx.fillStyle = '#f6c453';
      circle(ctx, wx(extraction.x), wz(extraction.z), 5);
    }

    // Civilians
    if (showMarkers) {
      civs.forEach(c2 => {
        if (c2.secured) return;
        const p = c2.group.position;
        ctx.fillStyle = '#6bd87a';
        circle(ctx, wx(p.x), wz(p.z), 3);
      });

      // Intel
      intel.forEach(i => {
        if (i.userData.collected) return;
        const p = i.position;
        ctx.fillStyle = '#5fb7ff';
        circle(ctx, wx(p.x), wz(p.z), 2.5);
      });

      // Hostiles last seen
      enemies.forEach(e => {
        const p = e.group.position;
        ctx.fillStyle = 'rgba(255, 59, 88, 0.85)';
        circle(ctx, wx(p.x), wz(p.z), 3);
      });
    }

    // Player
    const pp = player.position;
    ctx.fillStyle = '#4fd1c5';
    circle(ctx, wx(pp.x), wz(pp.z), 4);
    // Player facing
    ctx.strokeStyle = '#4fd1c5';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx(pp.x), wz(pp.z));
    ctx.lineTo(wx(pp.x + Math.sin(player.yaw) * 2.4), wz(pp.z + Math.cos(player.yaw) * 2.4));
    ctx.stroke();
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    init,
    showScreen,
    showGameplay,
    isInGameplay,
    getCurrentScreen,
    hideLoading,
    setHUD,
    setInteractPrompt,
    setMapVisible,
    showEnd,
    drawMinimap,
    refreshSettingsInputs,
    refreshStats,
    refreshSaveReadout,
    refreshNightmareLock,
  };
})();
