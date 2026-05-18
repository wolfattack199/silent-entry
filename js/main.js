/* =============================================================
   main.js — bootstrap. Waits for window load (so Three.js is
   ready) and then hands control to SilentGame.init().
   ============================================================= */

window.addEventListener('load', () => {
  // Guard against the CDN failing in offline environments.
  if (typeof THREE === 'undefined') {
    const el = document.getElementById('loading');
    el.classList.remove('hidden');
    el.innerHTML = `
      <div style="text-align:center;max-width:520px;line-height:1.6;font-size:13px;letter-spacing:1.5px;color:#bbb;">
        <div style="color:#ff6b6b;font-weight:700;letter-spacing:3px;margin-bottom:10px;">
          THREE.JS FAILED TO LOAD
        </div>
        This game pulls Three.js from a CDN on first open. Please connect to the
        internet once, refresh, and it will cache for offline play afterwards.
      </div>`;
    return;
  }
  SilentGame.init();
});
