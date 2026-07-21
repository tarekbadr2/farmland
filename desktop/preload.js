// Bridges a minimal, safe API into the app so the login screen can trigger the
// system-browser Google sign-in. Nothing else is exposed; context isolation
// stays on and the app has no Node access.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAuth", {
  // Opens Google sign-in in the real browser and resolves with the Google
  // OAuth id token, which the app exchanges for a Firebase session.
  signInWithGoogle: () => ipcRenderer.invoke("desktop-google-signin"),
});
