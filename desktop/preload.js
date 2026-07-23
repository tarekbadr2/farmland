// Bridges a minimal, safe API into the app so the login screen can trigger the
// system-browser Google sign-in. Nothing else is exposed; context isolation
// stays on and the app has no Node access.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAuth", {
  // Opens Google sign-in in the real browser and resolves with the Google
  // OAuth id token, which the app exchanges for a Firebase session.
  signInWithGoogle: () => ipcRenderer.invoke("desktop-google-signin"),
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
