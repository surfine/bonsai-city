// Joyride's page: start the runtime, draw the window, hand over.
(async function startJoyride() {
  "use strict";
  await window.BonsaiRuntime.start({ appId: "joyride", window: "joyride" });
  const game = window.Joyride;
  window.BonsaiRuntime.lifecycle(game.lifecycle());
  window.BonsaiRuntime.menu(game.menu);
  window.BonsaiRuntime.onLanguage(() => {
    window.BonsaiRuntime.setTitle(t("joyride_title"));
    game.refreshLanguage();
  });
  await game.attach();
  window.BonsaiRuntime.setTitle(t("joyride_title"));
  window.BonsaiRuntime.snapshots(document.querySelector('[data-window="joyride"]') || document.getElementById("app"), "canvas");
  window.BonsaiRuntime.ready();
})();
