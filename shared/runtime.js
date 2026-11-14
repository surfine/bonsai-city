// Bonsai City's runtime: the one place the games meet their host.
//
// Bonsai City, Rootline and Joyride each run in a page of their own. In a desk
// the page is a same-origin frame and every desk service is a bridge call
// (ais6-bridge.js, bridge contract v1); on its own the same calls are
// answered by the bridge's standalone adapter. The game modules call a
// handful of plain functions — t(), html``, setStatus(), openWindow() — and
// this file is where those functions are defined, so the games do not know
// which of the two they are running in.
//
// window.BonsaiRuntime offers:
//   start({ appId, window, version })  connect, read the small state, take the language; resolves to welcome
//   ready()                            tell the desk the page is drawn
//   snapshots(target, producer)        let the desk take the window's picture (Peek, minimize); producer "dom" or "canvas"
//   welcome() / hosted() / version() / launch() / phone()   what the desk said at start
//   createWindow(options)              draw .window / status bar / .window-pane below the desk's title bar
//   setTitle(text)                     the window's title
//   resources()                        listeners that go with the page: listen, add, dispose
//   openWindow(name, launch?)          open a sibling window, optionally on a city (launch)
//   onLaunch(fn)                       a launch handed to a window that is already open
//   state.get(key)                     cached value, synchronous; null when absent
//   state.load(key)                    read a key not preloaded (city:<id>, plan:<id>), cached
//   state.set(key, value) / remove(key)
//   state.setBytes(key, buffer, meta)  write { ...meta, bytes } with the buffer transferred
//   state.getBytes(key)                read it back: { ...meta, bytes } with a private copy of the bytes
//                                      (a city copied from the old desk comes back as { ...meta, saveData })
//   state.keys(prefix)                 list the keys the group holds
//   state.onChanged(key, fn)           another frame wrote key ("city:*" matches by prefix)
//   onLanguage(fn)                     the desk's language switch
//   onAppearance(fn)                   the desk's appearance changed
//   colorMode() / oneBit()             "light" | "dark"; true when the desk draws 1-bit chrome
//   lifecycle({ onSuspend, onResume, onDispose })   the desk pausing, resuming and quitting the window
//   menu(definition) / refreshMenu()   answer menu commands; push availability and check marks
//   hostState(phase)                   loading / ready / fail honesty (app.status host)
//   exportFile({ name, mime, body|bytes })   hand the desk a file to save
//   clipToFileFloppy(items)            put images or text on the File Floppy (a "clip" intent)
//   pickMicropolisCity() / saveMicropolisCity({ name, bytes }) / readMicropolisCity(id)
//                                      desk exchange for micropolis-city (pick/save/one-shot read)
//   confirmSheet({ text, confirmLabel, cancelLabel })   a question drawn in the page; Promise<boolean>
//   markGrayAffordance(el, disabled, reasonKey)   grey a control and keep it explainable
//   access() / visitAppearance(theme)  the desk's public gate; the era visit
// Free globals installed for the games: t, html, escapeHtml, translateWithin,
// setStatus, openWindow, currentLanguage, markGrayAffordance. Strings come from
// window.BonsaiStrings = { en: {...}, zh: {...} }. The page's fetch of an /api/
// route answers a verification request through the desk and tries once more.
//
// State is read in part before a game starts, so the games' small reads stay
// synchronous: the indexes (cities:index, plans:index), the session and the
// games' own keys. A city or a plan is read when it is asked for; they are
// large and most of them are never opened. Writes go to the bridge and keep
// the copy here current.
(function installBonsaiRuntime(root) {
  "use strict";

  // The version this tree is; the desk's pin must name the same one.
  const VERSION = "1.0.0";
  // Keys read at start. Everything else (city:<id>, plan:<id>) is read on demand.
  const PRELOAD_KEYS = ["cities:index", "plans:index", "session"];
  const PRELOAD_PREFIXES = ["rootline:", "joyride:"];
  const strings = () => root.BonsaiStrings || { en: {}, zh: {} };
  let bridge = null;
  let welcome = null;
  let started = null;
  let appearance = null;
  let currentLaunch = null;
  const cache = new Map();
  const loading = new Map();
  const stateListeners = new Map();
  const languageListeners = [];
  const appearanceListeners = [];
  const launchListeners = [];
  let lifecycleHandlers = {};
  let menu = null;
  let menuSignature = "";
  let menuTimer = 0;

  // ---------------------------------------------------------------------------
  // Strings: the app's own tables, the same keys the desk once held.

  root.currentLanguage = "zh";

  function t(key, ...args) {
    const tables = strings();
    const table = tables[root.currentLanguage] || tables.zh || {};
    const value = table[key] ?? tables.en?.[key] ?? key;
    return typeof value === "function" ? value(...args) : value;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Tagged template for innerHTML assembly: every interpolation is escaped;
  // html.raw(markup) is the explicit hatch for markup this app built.
  function html(parts, ...values) {
    let out = "";
    parts.forEach((part, index) => {
      out += part;
      if (index < values.length) out += htmlValue(values[index]);
    });
    return out;
  }
  function htmlValue(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.map(htmlValue).join("");
    if (value && typeof value === "object" && typeof value.safeHtml === "string") return value.safeHtml;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return escapeHtml(value);
  }
  html.raw = (markup) => Array.isArray(markup)
    ? { safeHtml: markup.map((part) => String(part ?? "")).join("") }
    : { safeHtml: String(markup ?? "") };

  // The data-i18n sweep a freshly drawn surface needs.
  function translateWithin(scope) {
    if (!scope || typeof scope.querySelectorAll !== "function") return;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const value = t(el.dataset.i18n);
      if (String(value).includes("<")) el.innerHTML = value;
      else el.textContent = value;
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAriaLabel)); });
    scope.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  }

  function setLanguage(language) {
    root.currentLanguage = language === "en" ? "en" : "zh";
    if (root.document?.documentElement) root.document.documentElement.lang = root.currentLanguage === "zh" ? "zh-Hans" : "en";
  }

  // ---------------------------------------------------------------------------
  // The desk's status line, and the host honesty contract.

  function setStatus(text) {
    const line = String(text ?? "");
    if (bridge && line) bridge.status({ text: line });
  }

  // The phases the games name (loading, driving, failed, crashed...) fold into
  // the four the desk knows. "idle" is the desk's own starting state, so
  // nothing is sent for it.
  const HOST_OF_PHASE = Object.freeze({
    loading: "loading",
    ready: "ready", driving: "ready", paused: "ready", running: "ready", play: "ready",
    failed: "fail", fail: "fail", error: "fail", timeout: "fail",
    crashed: "crash", crash: "crash",
  });

  function hostState(phase) {
    const host = HOST_OF_PHASE[String(phase || "idle")];
    if (!host || !bridge) return false;
    return bridge.status({ host });
  }

  // ---------------------------------------------------------------------------
  // The window. The desk draws the frame and the title bar; the app draws
  // what sits below them, in the shape the desk's own window shell builds, so
  // the games' stylesheets find the same elements they always styled.

  function createWindow(options = {}) {
    const doc = root.document;
    const windowName = String(options.windowName || "");
    const existing = doc.querySelector(`[data-window="${windowName}"]`);
    if (existing) return existing;
    const win = doc.createElement("section");
    win.className = ["window", options.windowClass].filter(Boolean).join(" ");
    win.dataset.window = windowName;
    if (options.labelledBy) win.setAttribute("aria-labelledby", options.labelledBy);
    if (options.statusClass || options.statusHtml) {
      const bar = doc.createElement("div");
      bar.className = ["details-bar", "kit-status-bar", options.statusClass].filter(Boolean).join(" ");
      bar.innerHTML = String(options.statusHtml || "");
      win.append(bar);
      win.applicationStatusBar = bar;
    }
    if (options.beforePaneHtml) {
      const slot = doc.createElement("div");
      slot.innerHTML = String(options.beforePaneHtml);
      while (slot.firstChild) win.append(slot.firstChild);
    }
    const pane = doc.createElement("div");
    pane.className = ["window-pane", options.paneClass].filter(Boolean).join(" ");
    pane.innerHTML = String(options.paneHtml || "");
    win.append(pane);
    win.applicationPane = pane;
    (doc.getElementById("app") || doc.body).append(win);
    translateWithin(win);
    if (options.title) setTitle(options.title);
    return win;
  }

  function setTitle(text) {
    if (bridge) bridge.setTitle(String(text || ""));
    else if (root.document) root.document.title = String(text || "");
  }

  // Listeners that go with the page; the shape the desk's instance resources had.
  function resources() {
    const offs = [];
    const set = {
      disposed: false,
      listen(target, type, fn, options) {
        target?.addEventListener?.(type, fn, options);
        offs.push(() => target?.removeEventListener?.(type, fn, options));
      },
      add(fn) {
        if (typeof fn === "function") offs.push(fn);
      },
      dispose() {
        offs.splice(0).forEach((off) => { try { off(); } catch { /* gone */ } });
        set.disposed = true;
      },
    };
    return set;
  }

  // ---------------------------------------------------------------------------
  // Other windows of the group: Bonsai City opens Rootline and Joyride, and
  // both open Bonsai City on a given city. `launch` is handed to the opened
  // window (its welcome, or launch.changed when it is already open). A desk
  // that does not carry launch yet opens the window and drops it. A window of
  // this page itself is already open, so it hears the launch directly.

  function deliverLaunch(launch) {
    currentLaunch = launch || null;
    launchListeners.forEach((fn) => { try { fn(currentLaunch); } catch (error) { console.error(error); } });
  }

  function openWindow(name, launch) {
    const target = String(name || "");
    if (!target) return Promise.resolve(false);
    if (target === welcome?.window) {
      if (launch !== undefined) deliverLaunch(launch);
      return Promise.resolve(true);
    }
    if (!bridge) return Promise.resolve(false);
    const params = { window: target };
    if (launch !== undefined && launch !== null) params.launch = launch;
    return bridge.call("window.open", params).then(() => true, () => false);
  }

  function onLaunch(fn) {
    if (typeof fn === "function") launchListeners.push(fn);
  }

  // ---------------------------------------------------------------------------
  // State. Small keys are read at start; a city or a plan is read when asked
  // for. Bytes cross the bridge as a transferred ArrayBuffer.

  const stateGet = (key) => (cache.has(key) ? cache.get(key) : null);
  const isBuffer = (value) => Object.prototype.toString.call(value) === "[object ArrayBuffer]";
  const lazyKey = (key) => /^(city|plan):/.test(key);

  // On its own the page keeps its state as JSON text, which cannot hold bytes:
  // they are kept as base64 there and turned back on the way in.
  function toBase64(buffer) {
    const view = new Uint8Array(buffer);
    let binary = "";
    for (let at = 0; at < view.length; at += 0x8000) binary += String.fromCharCode.apply(null, view.subarray(at, at + 0x8000));
    return root.btoa(binary);
  }
  function fromBase64(text) {
    const binary = root.atob(text);
    const view = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at += 1) view[at] = binary.charCodeAt(at);
    return view.buffer;
  }
  function received(value) {
    if (value && typeof value === "object" && typeof value.bytesBase64 === "string") {
      const { bytesBase64, ...rest } = value;
      try { return { ...rest, bytes: fromBase64(bytesBase64) }; } catch { return rest; }
    }
    return value;
  }

  function stateSet(key, value) {
    cache.set(key, value);
    if (!bridge) return Promise.resolve(false);
    return bridge.call("state.set", { key, value }).then(() => true, () => false);
  }

  // The buffer is detached by the transfer, so the copy kept here is taken
  // first; one memcpy, small beside the write it saves.
  function stateSetBytes(key, buffer, meta = {}) {
    let bytes = buffer;
    if (ArrayBuffer.isView(buffer)) bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    if (!isBuffer(bytes)) return Promise.resolve(false);
    cache.set(key, { ...meta, bytes: bytes.slice(0) });
    if (!bridge) return Promise.resolve(false);
    try {
      if (bridge.standalone) {
        return bridge.call("state.set", { key, value: { ...meta, bytesBase64: toBase64(bytes) } }).then(() => true, () => false);
      }
      return bridge.call("state.set", { key, value: { ...meta, bytes } }, { transfer: [bytes] }).then(() => true, () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  function stateRemove(key) {
    cache.delete(key);
    if (!bridge) return Promise.resolve(false);
    return bridge.call("state.remove", { key }).then(() => true, () => false);
  }

  // Read a key that was not preloaded; the answer is cached like any other.
  function stateLoad(key) {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (!bridge) return Promise.resolve(null);
    if (!loading.has(key)) {
      loading.set(key, bridge.call("state.get", { key })
        .then((got) => {
          const value = got ? received(got.value) : null;
          cache.set(key, value);
          return value;
        }, () => null)
        .finally(() => { loading.delete(key); }));
    }
    return loading.get(key);
  }

  async function stateGetBytes(key) {
    const value = await stateLoad(key);
    if (!value || typeof value !== "object") return null;
    if (isBuffer(value.bytes)) return { ...value, bytes: value.bytes.slice(0) };
    // A city copied once from the old desk keeps its save as text until the
    // game saves it again; the games' readers take either shape.
    if (typeof value.saveData === "string") return { ...value };
    return null;
  }

  async function stateKeys(prefix = "") {
    if (!bridge) return [...cache.keys()].filter((key) => key.startsWith(prefix) && cache.get(key) !== null).sort();
    try {
      const answer = await bridge.call("state.keys", { prefix: String(prefix) });
      return (answer?.keys || []).filter((key) => key !== "_import");
    } catch {
      return [];
    }
  }

  // "city:*" listens to every key that starts with "city:".
  function onStateChanged(key, fn) {
    if (!stateListeners.has(key)) stateListeners.set(key, []);
    stateListeners.get(key).push(fn);
  }
  function listenersFor(key) {
    const out = [];
    stateListeners.forEach((fns, pattern) => {
      if (pattern === key || (pattern.endsWith("*") && key.startsWith(pattern.slice(0, -1)))) out.push(...fns);
    });
    return out;
  }

  async function loadState() {
    const answer = await bridge.call("state.keys", {});
    const keys = (answer?.keys || []).filter((key) => key !== "_import");
    const wanted = keys.filter((key) => PRELOAD_KEYS.includes(key) || PRELOAD_PREFIXES.some((prefix) => key.startsWith(prefix)));
    await Promise.all(wanted.map((key) => stateLoad(key)));
  }

  // ---------------------------------------------------------------------------
  // The desk's public gate. On the public deployment an /api/ request without
  // a verified session answers 401 verification_required; the desk's own
  // fetch shows its verification sheet and retries. This page's fetch is not
  // the desk's, so it asks the desk for the sheet (access.verify) and retries.

  const nativeFetch = root.fetch ? root.fetch.bind(root) : null;

  function sameOriginApi(input) {
    try {
      const url = new URL(typeof input === "string" ? input : input?.url || "", root.location.href);
      return url.origin === root.location.origin && url.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }
  if (nativeFetch) {
    root.fetch = async function bonsaiFetch(input, init) {
      const retryInput = typeof Request !== "undefined" && input instanceof Request ? input.clone() : input;
      const response = await nativeFetch(input, init);
      if (response.status !== 401 || !bridge || !sameOriginApi(input)) return response;
      const data = await response.clone().json().catch(() => ({}));
      if (data.code !== "verification_required") return response;
      const verified = await bridge.call("access.verify", {}, { timeout: 10 * 60 * 1000 }).catch(() => ({ verified: false }));
      return verified?.verified ? nativeFetch(retryInput, init) : response;
    };
  }

  function access() {
    if (!bridge) return Promise.resolve({ profile: "standalone", verified: true });
    return bridge.call("access.session", {}).catch(() => ({ profile: "", verified: false }));
  }

  // ---------------------------------------------------------------------------
  // The desk's appearance: dark or light, and whether the chrome is 1-bit.
  // A desk that does not send oneBit yet is not 1-bit.

  const colorMode = () => (appearance?.colorMode === "dark" ? "dark" : "light");
  const oneBit = () => appearance?.oneBit === true;
  function onAppearance(fn) {
    if (typeof fn === "function") appearanceListeners.push(fn);
  }

  // The era visit (the games do not use it today; kept with One More's shape).
  function visitAppearance(theme) {
    if (!bridge) return Promise.resolve(null);
    return bridge.call("appearance.visit", { theme: theme || null }).catch(() => null);
  }

  // ---------------------------------------------------------------------------
  // Files the writer takes out: a saved city, an image, a .cty.

  function exportFile({ name, mime, body, bytes } = {}) {
    if (!bridge || !String(name || "").trim()) return Promise.resolve(false);
    const params = { name: String(name), mime: String(mime || "application/octet-stream") };
    if (bytes !== undefined && bytes !== null) params.bytes = bytes;
    else params.body = String(body ?? "");
    return bridge.call("files.export", params).then(() => true, () => false);
  }

  // A button's step into the writer's project: images and text cards for the
  // File Floppy. items are { kind: "image" | "text", name, type, blob }. The
  // answer is the desk's own; standing alone there is no File Floppy.
  function clipToFileFloppy(items) {
    const list = Array.isArray(items) ? items : [];
    if (!bridge || bridge.standalone || !list.length) return Promise.resolve({ ok: false, reason: "unavailable" });
    return bridge.call("intent.dispatch", { intent: "clip", appId: "fileFloppy", items: list })
      .then((reply) => (reply && typeof reply === "object" ? reply : { ok: false, reason: "unavailable" }),
        (error) => ({ ok: false, reason: String(error?.code || "unavailable") }));
  }

  // Micropolis exchange through the desk (files.pick / files.save, kind
  // micropolis-city). A build without Micropolis answers unavailable; the
  // menu row hides when that is the case.
  let micropolisCityOk = null;
  function noteMicropolisAvailability(error) {
    if (String(error?.code || "") === "unavailable") micropolisCityOk = false;
    else if (error) micropolisCityOk = true;
  }
  // Resolves to the picked city, or null when cancelled / no cities / unavailable.
  // The host returns empty items for both cancel and an empty list (plan 9.9.3).
  function pickMicropolisCity() {
    if (!bridge || bridge.standalone) {
      micropolisCityOk = false;
      return Promise.resolve(null);
    }
    return bridge.call("files.pick", { kind: "micropolis-city" })
      .then((answer) => {
        micropolisCityOk = true;
        const item = Array.isArray(answer?.items) ? answer.items[0] : null;
        return item || null;
      }, (error) => {
        noteMicropolisAvailability(error);
        return null;
      });
  }
  // One-time grant from Micropolis' Open in Bonsai City: files.read of that id.
  function readMicropolisCity(id) {
    if (!bridge || bridge.standalone || !id) return Promise.resolve(null);
    return bridge.call("files.read", { kind: "micropolis-city", id: String(id) })
      .then((answer) => {
        micropolisCityOk = true;
        return answer?.item || null;
      }, (error) => {
        noteMicropolisAvailability(error);
        return null;
      });
  }
  function saveMicropolisCity({ name, bytes } = {}) {
    if (!bridge || bridge.standalone) return Promise.resolve(null);
    return bridge.call("files.save", { kind: "micropolis-city", name: String(name || ""), bytes })
      .then((answer) => {
        micropolisCityOk = true;
        return answer && typeof answer === "object" ? answer : null;
      }, (error) => {
        noteMicropolisAvailability(error);
        return null;
      });
  }
  // Probe without opening a picker: a one-byte save is invalid when the kind
  // exists, unavailable when Micropolis is not on this desk.
  function micropolisCityAvailable() {
    if (micropolisCityOk === true) return Promise.resolve(true);
    if (micropolisCityOk === false) return Promise.resolve(false);
    if (!bridge || bridge.standalone) return Promise.resolve(false);
    return bridge.call("files.save", { kind: "micropolis-city", name: "probe", bytes: new Uint8Array(1) })
      .then(() => { micropolisCityOk = true; return true; }, (error) => {
        if (String(error?.code || "") === "unavailable") {
          micropolisCityOk = false;
          return false;
        }
        micropolisCityOk = true;
        return true;
      });
  }
  function micropolisCtyCodec() {
    return root.MicropolisCtyCodec || null;
  }

  // ---------------------------------------------------------------------------
  // A question inside the page, in place of the desk's modal.

  function confirmSheet({ text = "", confirmLabel = "", cancelLabel = "" } = {}) {
    const doc = root.document;
    if (!doc?.body) return Promise.resolve(false);
    const label = (given, key, fallback) => {
      if (given) return String(given);
      const value = t(key);
      return value && value !== key ? String(value) : fallback;
    };
    return new Promise((resolve) => {
      const previous = doc.activeElement;
      const scrim = doc.createElement("div");
      scrim.className = "bonsai-confirm";
      scrim.style.cssText = "position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.25)";
      const sheet = doc.createElement("div");
      sheet.className = "kit-sheet";
      sheet.setAttribute("role", "alertdialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.style.cssText = "box-sizing:border-box;max-width:min(420px,100%);padding:16px;display:grid;gap:14px";
      const message = doc.createElement("p");
      message.style.cssText = "margin:0;white-space:pre-line";
      message.textContent = String(text);
      const row = doc.createElement("div");
      row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap";
      const cancel = doc.createElement("button");
      cancel.type = "button";
      cancel.className = "kit-button";
      cancel.textContent = label(cancelLabel, "cancel", "Cancel");
      const confirm = doc.createElement("button");
      confirm.type = "button";
      confirm.className = "kit-button is-default";
      confirm.textContent = label(confirmLabel, "ok", "OK");
      row.append(cancel, confirm);
      sheet.append(message, row);
      scrim.append(sheet);
      let settled = false;
      const finish = (answer) => {
        if (settled) return;
        settled = true;
        doc.removeEventListener("keydown", onKey, true);
        scrim.remove();
        try { previous?.focus?.(); } catch { /* gone */ }
        resolve(answer);
      };
      function onKey(event) {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
        else if (event.key === "Tab") {
          // Two buttons: keep the focus on the sheet.
          event.preventDefault();
          (doc.activeElement === confirm ? cancel : confirm).focus();
        }
      }
      cancel.addEventListener("click", () => finish(false));
      confirm.addEventListener("click", () => finish(true));
      scrim.addEventListener("pointerdown", (event) => { if (event.target === scrim) finish(false); });
      doc.addEventListener("keydown", onKey, true);
      doc.body.append(scrim);
      confirm.focus();
    });
  }

  // The desk's gray affordance, kept in the page: a control that cannot act
  // right now stays focusable and clickable, so a tap can still ask why.
  // reasonKey names the string that explains it.
  function markGrayAffordance(control, unavailable, reasonKey = "") {
    if (!control) return;
    const blocked = Boolean(unavailable);
    control.classList.toggle("is-disabled", blocked);
    if (blocked) {
      control.setAttribute("aria-disabled", "true");
      if (reasonKey) {
        control.disabled = false;
        control.dataset.balloonHelpDisabled = reasonKey;
        control.dataset.grayAffordance = "1";
      }
    } else {
      control.removeAttribute("aria-disabled");
      if (control.dataset.grayAffordance === "1") {
        // The grey flag and the reason were set together, so they go together.
        control.disabled = false;
        delete control.dataset.grayAffordance;
        delete control.dataset.balloonHelpDisabled;
      }
      if (reasonKey && control.dataset.balloonHelpDisabled === reasonKey) {
        delete control.dataset.balloonHelpDisabled;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Menus: the commands live in the manifest; the app answers menu.command
  // and pushes availability whenever what it shows changes.

  function pushMenuState() {
    menuTimer = 0;
    if (!bridge || !menu) return;
    const available = {};
    const checked = {};
    const reasons = {};
    menu.commands().forEach((action) => {
      const answer = menu.availability(action) || {};
      available[action] = answer.available === true;
      if (!available[action] && answer.reason) reasons[action] = String(answer.reason);
      if (menu.checked) checked[action] = menu.checked(action) === true;
    });
    const signature = JSON.stringify([available, checked, reasons]);
    if (signature === menuSignature) return;
    menuSignature = signature;
    bridge.menuState({ available, checked, reasons });
  }
  function scheduleMenuState() {
    if (menuTimer) return;
    menuTimer = setTimeout(pushMenuState, 30);
  }

  function setMenu(definition) {
    menu = definition;
    if (typeof MutationObserver === "function" && root.document?.body) {
      new MutationObserver(scheduleMenuState).observe(root.document.body, { attributes: true, childList: true, subtree: true, characterData: true });
    }
    scheduleMenuState();
  }

  // ---------------------------------------------------------------------------
  // Start: connect, read the state, take the language, then hand over.

  function start(options = {}) {
    if (started) return started;
    started = (async () => {
      try {
        bridge = await root.AIS6Bridge.connect({ appId: options.appId, window: options.window, version: options.version || VERSION });
      } catch (error) {
        bridge = null;
      }
      welcome = bridge?.welcome || null;
      appearance = welcome?.appearance || null;
      currentLaunch = welcome?.launch || null;
      setLanguage(welcome?.language || (new URLSearchParams(root.location?.search || "").get("lang") === "en" ? "en" : "zh"));
      // A game starts with nothing saved if the state cannot be read.
      if (bridge) {
        try { await loadState(); } catch { /* nothing saved */ }
      }
      if (bridge) {
        bridge.on("language.changed", ({ language }) => {
          setLanguage(language);
          translateWithin(root.document);
          languageListeners.forEach((fn) => { try { fn(root.currentLanguage); } catch (error) { console.error(error); } });
        });
        bridge.on("appearance.changed", (next) => {
          appearance = next || appearance;
          appearanceListeners.forEach((fn) => { try { fn({ colorMode: colorMode(), oneBit: oneBit() }); } catch (error) { console.error(error); } });
        });
        // A desk that never sends this event leaves the listeners unused.
        bridge.on("launch.changed", ({ launch } = {}) => { deliverLaunch(launch); });
        bridge.on("state.changed", async ({ key }) => {
          // A city can weigh a megabyte and a half and most are never opened:
          // one that is not held here is only reported, read when asked for.
          if (lazyKey(key) && !cache.has(key)) {
            listenersFor(key).forEach((fn) => { try { fn(null, { key, loaded: false }); } catch (error) { console.error(error); } });
            return;
          }
          // The old value stays readable until the new one lands: a reader in
          // that gap (the letterbox) would take an empty answer for an empty
          // value and write it back over another frame's letters.
          const value = bridge
            ? await bridge.call("state.get", { key }).then((got) => (got ? received(got.value) : null), () => (cache.has(key) ? cache.get(key) : null))
            : null;
          if (value === null) cache.delete(key);
          else cache.set(key, value);
          listenersFor(key).forEach((fn) => { try { fn(value, { key, loaded: true }); } catch (error) { console.error(error); } });
        });
        const lifecycle = (name) => async () => {
          try { await lifecycleHandlers[name]?.(); } catch (error) { console.error(error); }
          return {};
        };
        // A close the game cannot finish (its city did not save) keeps the
        // window open; the desk only closes a frame that let go.
        bridge.handle("lifecycle.suspend", async (params = {}) => {
          try {
            await lifecycleHandlers.onSuspend?.(params);
          } catch (error) {
            console.error(error);
            if (params.cause === "close") return { keepOpen: true };
          }
          return {};
        });
        bridge.handle("lifecycle.resume", lifecycle("onResume"));
        bridge.handle("lifecycle.dispose", lifecycle("onDispose"));
        bridge.handle("menu.command", async ({ action }) => {
          if (!menu || !menu.commands().includes(action)) return { handled: false };
          await menu.run(action);
          scheduleMenuState();
          return { handled: true };
        });
      }
      return welcome;
    })();
    return started;
  }

  function ready() {
    if (bridge) bridge.ready();
  }

  // The window's picture for the desk's Peek and minimize (bridge contract
  // 3.7): the DOM producer, taken off the interaction path.
  // A game whose picture is its canvas passes "canvas": its status line
  // changes every tick, and a DOM picture would be retaken every second.
  function snapshots(target, producer = "dom") {
    if (bridge && !bridge.standalone && (welcome?.capabilities || []).includes("snapshot")) {
      bridge.enableSnapshots({ producer: producer === "canvas" ? "canvas" : "dom", target: target || root.document?.body || null });
    }
  }

  root.t = t;
  root.html = html;
  root.escapeHtml = escapeHtml;
  root.translateWithin = translateWithin;
  root.setStatus = setStatus;
  root.openWindow = openWindow;
  root.markGrayAffordance = markGrayAffordance;

  root.BonsaiRuntime = Object.freeze({
    start,
    ready,
    snapshots,
    welcome: () => welcome,
    hosted: () => Boolean(bridge && !bridge.standalone),
    version: () => welcome?.version || "dev",
    launch: () => currentLaunch,
    phone: () => Number(welcome?.phone) || 0,
    createWindow,
    setTitle,
    resources,
    openWindow,
    onLaunch,
    state: Object.freeze({
      get: stateGet,
      load: stateLoad,
      set: stateSet,
      remove: stateRemove,
      setBytes: stateSetBytes,
      getBytes: stateGetBytes,
      keys: stateKeys,
      onChanged: onStateChanged,
    }),
    onLanguage: (fn) => { languageListeners.push(fn); },
    onAppearance,
    colorMode,
    oneBit,
    lifecycle: (handlers) => { lifecycleHandlers = handlers || {}; },
    menu: setMenu,
    refreshMenu: scheduleMenuState,
    hostState,
    exportFile,
    clipToFileFloppy,
    pickMicropolisCity,
    readMicropolisCity,
    saveMicropolisCity,
    micropolisCityAvailable,
    micropolisCtyCodec,
    confirmSheet,
    markGrayAffordance,
    access,
    visitAppearance,
  });
})(typeof window !== "undefined" ? window : globalThis);
