// Rootline's page: start the runtime, draw the window, hand over.
(async function startRootline() {
  "use strict";
  await window.BonsaiRuntime.start({ appId: "rootline", window: "rootline" });
  // Letters Joyride queued while the box was refused land here once state is up.
  try { window.PotWorld?.letterbox?.drainJoyrideQueue?.(); } catch { /* leave the queue */ }
  const game = window.Rootline;
  window.BonsaiRuntime.lifecycle(game.lifecycle());
  window.BonsaiRuntime.menu(game.menu);
  window.BonsaiRuntime.onLanguage(() => {
    window.BonsaiRuntime.setTitle(t("rootline_title"));
    game.refreshLanguage();
  });
  const launch = window.BonsaiRuntime.launch();
  if (launch) game.handleLaunch(launch);
  game.attach();
  window.BonsaiRuntime.setTitle(t("rootline_title"));
  window.BonsaiRuntime.snapshots(document.querySelector('[data-window="rootline"]') || document.getElementById("app"));
  window.BonsaiRuntime.ready();
})();
