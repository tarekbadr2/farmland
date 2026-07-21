// Herd OS desktop shell.
//
// The whole app is bundled inside this installer as a static export (./out,
// packaged into resources/app). At launch we serve it from a private localhost
// port and load that — so the app runs entirely on the machine, no server and
// no internet needed to open it. Firebase (client SDK) still talks to the cloud
// directly for data, exactly as it does on the web.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");
const http = require("http");
const handler = require("serve-handler");

// Present as normal Chrome — Google's OAuth refuses sign-in from user agents it
// tags as "embedded" (the default Electron UA).
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Stays inside the app window: the local server plus the auth providers.
// Anything else opens in the user's real browser.
const INTERNAL = [
  /^localhost$/,
  /^127\.0\.0\.1$/,
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

// The bundled export. In a packaged app it's copied to resources/app; running
// `electron .` from the desktop folder in dev, it's the repo-root ./out.
const APP_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.join(__dirname, "..", "out");

// HERDOS_URL still overrides for testing against a hosted deployment.
let appUrl = process.env.HERDOS_URL || null;

function startServer() {
  if (appUrl) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) =>
      handler(req, res, { public: APP_DIR, directoryListing: false }),
    );
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      appUrl = `http://localhost:${server.address().port}/`;
      resolve();
    });
  });
}

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

  win.loadURL(appUrl, { userAgent: CHROME_UA });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: "allow" }; // OAuth popups
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

app.whenReady().then(async () => {
  app.userAgentFallback = CHROME_UA;
  Menu.setApplicationMenu(null);
  try {
    await startServer();
  } catch {
    appUrl = "https://farmland.vercel.app"; // last-resort fallback
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
