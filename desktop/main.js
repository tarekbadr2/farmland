// Herd OS desktop shell.
//
// A thin native window around the deployed web app. The app already handles its
// own offline (service worker + Firestore persistence), so this just gives it a
// real desktop home: its own window, taskbar/Start-menu entry, and icon — no
// browser chrome. Point it at a different deployment with the HERDOS_URL env var.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const APP_URL = process.env.HERDOS_URL || "https://farmland.vercel.app";

// Present as normal Chrome. Google's OAuth refuses sign-in from user agents it
// tags as "embedded" (the default Electron UA), so we speak plain Chrome.
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Hosts that belong inside the app window — the app itself and its auth
// providers. Everything else opens in the user's real browser.
const INTERNAL = [
  /(^|\.)vercel\.app$/,
  /(^|\.)firebaseapp\.com$/,
  /(^|\.)google\.com$/,
  /(^|\.)googleapis\.com$/,
  /(^|\.)gstatic\.com$/,
];
const isInternal = (url) => {
  try {
    return INTERNAL.some((re) => re.test(new URL(url).hostname));
  } catch {
    return false;
  }
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f1319",
    icon: path.join(__dirname, "app-icon.png"),
    title: "Herd OS",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  win.loadURL(APP_URL, { userAgent: CHROME_UA });

  // OAuth sign-in popups open as child windows; other external links go to the
  // system browser instead of hijacking the app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!isInternal(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

app.whenReady().then(() => {
  app.userAgentFallback = CHROME_UA;
  Menu.setApplicationMenu(null); // no menu bar — this is an app, not a browser
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
