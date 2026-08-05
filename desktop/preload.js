// Bridges a minimal, safe API into the app so the login screen can trigger the
// system-browser Google sign-in. Nothing else is exposed; context isolation
// stays on and the app has no Node access.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAuth", {
  // Opens Google sign-in in the real browser and resolves with the Google
  // OAuth id token, which the app exchanges for a Firebase session.
  signInWithGoogle: () => ipcRenderer.invoke("desktop-google-signin"),
});

// Background mode: the sidebar toggle tells the main process whether closing
// the window should hide to the tray (keep running) instead of quitting.
contextBridge.exposeInMainWorld("desktopBackground", {
  setEnabled: (on) => ipcRenderer.invoke("background:set", on),
});

// Launch behaviour: start with Windows, and optionally start hidden in the
// tray. The OS login-item registration is the source of truth, so the Settings
// screen reads current state via get() and writes through set().
contextBridge.exposeInMainWorld("desktopLaunch", {
  get: () => ipcRenderer.invoke("launch:get"),
  set: (settings) => ipcRenderer.invoke("launch:set", settings),
});

// Self-update controls for the Settings screen. check() triggers a manual
// look at GitHub Releases; onStatus() streams progress ("checking" → "none" |
// "available" → "downloading" → "ready"); version() returns the running build.
contextBridge.exposeInMainWorld("desktopUpdater", {
  check: () => ipcRenderer.invoke("check-for-updates"),
  version: () => ipcRenderer.invoke("app-version"),
  onStatus: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
});

// Navigation + menu/keyboard actions pushed from the main process: the tray
// ("Show Dashboard"/"Settings"), deep links (herdos://…), and menu accelerators
// (New, Save, Find, Refresh, Quick Add). onNavigate → route to a path;
// onAction → run the matching command on the current page. Both return an
// unsubscribe fn.
contextBridge.exposeInMainWorld("desktopNav", {
  onNavigate: (cb) => {
    const handler = (_e, routePath) => cb(routePath);
    ipcRenderer.on("desktop:navigate", handler);
    return () => ipcRenderer.removeListener("desktop:navigate", handler);
  },
  onAction: (cb) => {
    const handler = (_e, name) => cb(name);
    ipcRenderer.on("desktop:action", handler);
    return () => ipcRenderer.removeListener("desktop:action", handler);
  },
});

// Native file-system integration for exports: save() pops a native Save dialog
// and writes the base64 payload to the chosen location (returns its path);
// openPath() opens a saved file in its default app; showItem() reveals it in the
// file manager; paths() returns common OS folders (downloads/documents).
contextBridge.exposeInMainWorld("desktopFiles", {
  save: (payload) => ipcRenderer.invoke("fs:save", payload),
  openPath: (p) => ipcRenderer.invoke("fs:open-path", p),
  showItem: (p) => ipcRenderer.invoke("fs:show-item", p),
  paths: () => ipcRenderer.invoke("app:paths"),
});

// Window control: bring the app back from the tray and focus it (used when a
// native notification is clicked while minimized).
contextBridge.exposeInMainWorld("desktopWindow", {
  show: () => ipcRenderer.invoke("window:show"),
});
