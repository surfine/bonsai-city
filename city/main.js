// Bonsai City's page: start the runtime, draw the window, hand over.
(async function startBonsaiCity() {
  "use strict";
  await window.BonsaiRuntime.start({ appId: "bonsaiCity", window: "bonsaiCity" });
  // Letters Joyride queued while the box was refused land here once state is up.
  try { window.PotWorld?.letterbox?.drainJoyrideQueue?.(); } catch { /* leave the queue */ }
  const game = window.BonsaiCity;
  window.BonsaiRuntime.lifecycle(game.lifecycle());
  window.BonsaiRuntime.menu(game.menu);
  window.BonsaiRuntime.onLanguage(() => {
    window.BonsaiRuntime.setTitle(t("bonsai_city_title"));
    game.refreshLanguage();
  });
  await game.attach();
  window.BonsaiRuntime.setTitle(t("bonsai_city_title"));
  window.BonsaiRuntime.snapshots(document.querySelector('[data-window="bonsaiCity"]') || document.getElementById("app"), "canvas");
  window.BonsaiRuntime.ready();
})();
