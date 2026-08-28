// Herd OS desktop shell.
//
// The whole app is bundled inside this installer as a static export (./out,
// packaged into resources/app). At launch we serve it from a private localhost
// port and load that — so the app runs entirely on the machine, no server and
// no internet needed to open it. Firebase (client SDK) still talks to the cloud
// directly for data, exactly as it does on the web.

const {
  app,
  BrowserWindow,
  shell,
  Menu,
  ipcMain,
  dialog,
  Tray,
  nativeImage,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const handler = require("serve-handler");
const { autoUpdater } = require("electron-updater");
// Deep-link scheme + parser (herdos://invite/<token> …). Split into its own
// module so the parsing is unit-testable without launching Electron.
const { PROTOCOL, deepLinkFromArgv } = require("./deep-link");

// ------------------------------- Single instance -------------------------------
// A desktop app should be ONE running process. A second launch (or a deep link
// opened while we're already running) must focus the existing window, not spin
// up a duplicate that fights over the fixed auth port. If we don't hold the
// lock, we're the second instance — hand our arguments to the first and exit.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Background mode: when on, closing the window hides it to a system-tray icon
// instead of quitting, so the app keeps running and can raise desktop
// notifications. Toggled from the sidebar (renderer -> "background:set").
let tray = null;
let mainWin = null;
let backgroundEnabled = false;
let isQuitting = false;

// Start-hidden: when the app is launched at login with "start in tray" on, it
// registers a "--hidden" arg (Windows) / openAsHidden flag (macOS). Detect it
// at startup so the first window opens straight into the tray.
function launchedHidden() {
  const s = app.getLoginItemSettings();
  return Boolean(s.wasOpenedAsHidden) || process.argv.includes("--hidden");
}

// The hosted site that carries the Google sign-in bridge page (real browser).
const WEB_ORIGIN = process.env.HERDOS_WEB || "https://farmland-tarekbadr2s-projects.vercel.app";

// Google refuses OAuth inside the app window, so sign-in happens in the user's
// real browser: open the hosted /desktop-signin page, and catch the returned
// Google credential on a one-shot localhost listener. The token only touches
// 127.0.0.1 on this machine.
ipcMain.handle("desktop-google-signin", () =>
  new Promise((resolve, reject) => {
    let settled = false;
    const page = (heading, note) =>
      "<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;text-align:center;padding-top:18vh;color:#12161c\">" +
      `<h2>${heading}</h2><p>${note}</p></body>`;
    const finish = (res, heading, note, done) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(page(heading, note));
      if (!settled) {
        settled = true;
        done();
        setTimeout(() => server.close(), 500);
      }
    };
    const server = http.createServer((req, res) => {
      const q = new URL(req.url, "http://localhost").searchParams;
      const idToken = q.get("idToken");
      const error = q.get("error");
      if (idToken) {
        finish(res, "Signed in", "You can close this tab and return to Herd OS.", () => resolve(idToken));
      } else if (error) {
        finish(res, "Sign-in failed", "Close this tab and try again from Herd OS.", () =>
          reject(new Error(error)),
        );
      } else {
        // A stray hit (favicon, reload) — don't claim anything happened.
        res.writeHead(204);
        res.end();
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      shell.openExternal(`${WEB_ORIGIN}/desktop-signin?port=${port}`);
    });
    // Give up if the user never finishes.
    setTimeout(() => {
      if (!settled) {
        settled = true;
        server.close();
        reject(new Error("Sign-in timed out"));
      }
    }, 5 * 60 * 1000);
  }),
);

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

// Serve on a FIXED port. Firebase's auth session (and IndexedDB) is scoped to
// the page origin, so a random port each launch would change the origin and lose
// the login every time — the fixed port keeps the origin stable so users stay
// signed in. If it's ever busy we fall back to an ephemeral port (the app still
// opens; only that session may need a fresh sign-in).
const APP_PORT = 43117;

function startServer() {
  if (appUrl) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const serve = (req, res) => handler(req, res, { public: APP_DIR, directoryListing: false });
    const done = (server) => {
      appUrl = `http://localhost:${server.address().port}/`;
      resolve();
    };
    const server = http.createServer(serve);
    server.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        const fallback = http.createServer(serve);
        fallback.once("error", reject);
        fallback.listen(0, "127.0.0.1", () => done(fallback));
      } else {
        reject(err);
      }
    });
    server.listen(APP_PORT, "127.0.0.1", () => done(server));
  });
}

function createWindow(hidden = false) {
  const saved = loadWindowState();
  const useSaved = saved && boundsOnSomeDisplay(saved);
  const win = new BrowserWindow({
    width: useSaved ? saved.width : 1440,
    height: useSaved ? saved.height : 900,
    x: useSaved ? saved.x : undefined,
    y: useSaved ? saved.y : undefined,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f1319",
    icon: path.join(__dirname, "app-icon.png"),
    title: "Herd OS",
    autoHideMenuBar: true,
    show: false, // shown after restoring state, to avoid a flash at the wrong size
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged, // no dev tools in the shipped app
      spellcheck: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // The first live window is the "primary" that the tray / background mode and
  // notifications target; extra windows (New Window) are secondary.
  if (!mainWin || mainWin.isDestroyed()) mainWin = win;

  if (useSaved && saved.maximized) win.maximize();
  if (useSaved && saved.fullScreen) win.setFullScreen(true);
  if (!hidden) win.show();

  win.loadURL(appUrl, { userAgent: CHROME_UA });

  // Remember size / position / state between launches (debounced).
  for (const ev of ["resize", "move", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) {
    win.on(ev, () => persistWindowState(win));
  }

  // Route a deep link that launched us cold, once the app is interactive.
  win.webContents.on("did-finish-load", () => {
    if (win === mainWin && pendingNavigate) {
      win.webContents.send("desktop:navigate", pendingNavigate);
      pendingNavigate = null;
    }
  });

  // Crash recovery: reload a dead renderer instead of leaving a blank window.
  win.webContents.on("render-process-gone", (_e, details) => {
    logError("render-process-gone", details && details.reason);
    if (!win.isDestroyed()) win.reload();
  });
  win.webContents.on("unresponsive", () => logError("unresponsive", "renderer"));

  attachContextMenu(win);

  // Launched straight into the tray: there must be a tray to get back from, and
  // the process must survive having no visible window, so force background mode
  // on. The renderer pushes the user's real preference once it loads.
  if (hidden) {
    backgroundEnabled = true;
    ensureTray();
  }

  // In background mode, the close button hides to tray instead of quitting.
  win.on("close", (event) => {
    // Save state before we hide/close, synchronously (the debounce may not fire
    // during a quit).
    clearTimeout(saveStateTimer);
    try {
      const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
      fs.writeFileSync(
        statePath(),
        JSON.stringify({ ...bounds, maximized: win.isMaximized(), fullScreen: win.isFullScreen() }),
      );
    } catch (e) {
      logError("saveStateOnClose", e);
    }
    if (win === mainWin && backgroundEnabled && !isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => {
    if (mainWin === win) mainWin = null;
  });

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

// ------------------------------ Auto-update -------------------------------
// So users never have to hunt down the installer and reinstall by hand: the
// app checks GitHub Releases on launch, downloads any newer version quietly in
// the background, and offers a one-click restart to apply it. Runs only in the
// packaged app — dev builds have no update feed (app-update.yml).
function setupAutoUpdates() {
  // The current version is always answerable, packaged or not, so Settings can
  // show it in dev too.
  ipcMain.handle("app-version", () => app.getVersion());

  if (!app.isPackaged) {
    // No update feed in dev — tell the UI so the button can explain itself.
    ipcMain.handle("check-for-updates", async () => ({ ok: false, reason: "dev" }));
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Push each step to the renderer (primary window) so a Settings button can
  // show live status.
  const send = (status, extra) => {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("update-status", { status, ...extra });
  };

  autoUpdater.on("checking-for-update", () => send("checking"));
  autoUpdater.on("update-available", (info) => send("available", { version: info.version }));
  autoUpdater.on("update-not-available", () => send("none", { version: app.getVersion() }));
  autoUpdater.on("download-progress", (p) => send("downloading", { percent: Math.round(p.percent) }));

  autoUpdater.on("update-downloaded", async (info) => {
    send("ready", { version: info.version });
    const parent = mainWin && !mainWin.isDestroyed() ? mainWin : null;
    const { response } = await dialog.showMessageBox(parent, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Herd OS ${info.version} is ready to install.`,
      detail: "Restart the app to apply it — your data is untouched.",
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // Never let a failed check (offline, rate-limited, no release yet) surface to
  // the user or block the app.
  autoUpdater.on("error", (err) => {
    console.error("Auto-update check failed:", err && err.message ? err.message : err);
    send("error");
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 6 * 60 * 60 * 1000); // re-check every 6h for always-on installs

  // Lets the app trigger a manual check (the Settings button). Progress comes
  // back through the update-status events above.
  ipcMain.handle("check-for-updates", async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

// ---------------------------- Background mode -----------------------------
// Bring the window back from the tray (or recreate it if it was destroyed).
function showWindow() {
  if (!mainWin) return createWindow();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

// Create the tray icon on demand (only once background mode is turned on).
function ensureTray() {
  if (tray) return;
  const icon = nativeImage
    .createFromPath(path.join(__dirname, "app-icon.png"))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Herd OS");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Herd OS", click: showWindow },
      { label: "Show Dashboard", click: () => navigateRenderer("/dashboard") },
      { type: "separator" },
      {
        label: "Check for Updates…",
        click: () => {
          try {
            autoUpdater.checkForUpdates();
          } catch {
            /* offline / dev */
          }
          showWindow();
        },
      },
      { label: "Settings", click: () => navigateRenderer("/settings") },
      { type: "separator" },
      {
        label: "Quit Herd OS",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("click", showWindow);
  tray.on("double-click", showWindow);
}

function setupBackgroundMode() {
  // The renderer (sidebar toggle) drives this; it also pushes the stored
  // preference up on launch so the tray matches what the user last chose.
  ipcMain.handle("background:set", (_e, on) => {
    backgroundEnabled = !!on;
    if (backgroundEnabled) ensureTray();
    else {
      if (tray) {
        tray.destroy();
        tray = null;
      }
      // Don't strand the app: if it was started hidden and the user turns
      // background mode off, bring the window back so there's still a way in.
      if (mainWin && !mainWin.isVisible()) showWindow();
    }
    return { ok: true };
  });

  // A real quit (tray menu, Cmd/Ctrl+Q, updater restart) must bypass hide-to-tray.
  app.on("before-quit", () => {
    isQuitting = true;
  });
}

// ---------------------------- Launch settings -----------------------------
// Start-with-Windows and start-hidden, backed by the OS login-item registry so
// the setting survives reinstalls and is the single source of truth.
function setupLaunchSettings() {
  ipcMain.handle("launch:get", () => {
    const s = app.getLoginItemSettings();
    // openAsHidden isn't reported back on Windows, so mirror it from the arg we
    // registered ourselves.
    const hiddenArg = (s.launchItems || []).some((i) =>
      (i.args || []).includes("--hidden"),
    );
    return {
      openAtLogin: Boolean(s.openAtLogin),
      openAsHidden: Boolean(s.openAsHidden) || hiddenArg,
    };
  });

  ipcMain.handle("launch:set", (_e, settings) => {
    const openAtLogin = Boolean(settings && settings.openAtLogin);
    const openAsHidden = openAtLogin && Boolean(settings && settings.openAsHidden);
    app.setLoginItemSettings({
      openAtLogin,
      openAsHidden, // macOS
      args: openAsHidden ? ["--hidden"] : [], // Windows: read by launchedHidden()
    });
    return { ok: true };
  });
}

// ------------------------------ Error logging -----------------------------
// A desktop app has no server logs, so crashes vanish unless we write them. Keep
// a rolling main-process log in userData for support/diagnostics.
function logPath() {
  return path.join(app.getPath("userData"), "logs", "main.log");
}
function logError(scope, err) {
  try {
    fs.mkdirSync(path.dirname(logPath()), { recursive: true });
    const line = `[${new Date().toISOString()}] ${scope}: ${(err && err.stack) || err}\n`;
    fs.appendFileSync(logPath(), line);
  } catch {
    /* logging must never throw */
  }
}
process.on("uncaughtException", (e) => logError("uncaughtException", e));
process.on("unhandledRejection", (e) => logError("unhandledRejection", e));

// ---------------------------- Window state --------------------------------
// Remember size, position and maximized/fullscreen state between launches, and
// only restore a saved position if it still lands on a connected display (so a
// window saved on a now-unplugged monitor doesn't open off-screen).
function statePath() {
  return path.join(app.getPath("userData"), "window-state.json");
}
function loadWindowState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return null;
  }
}
let saveStateTimer = null;
function persistWindowState(win) {
  if (!win || win.isDestroyed()) return;
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(() => {
    try {
      const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
      fs.writeFileSync(
        statePath(),
        JSON.stringify({ ...bounds, maximized: win.isMaximized(), fullScreen: win.isFullScreen() }),
      );
    } catch (e) {
      logError("persistWindowState", e);
    }
  }, 400);
}
function boundsOnSomeDisplay(b) {
  if (!b || typeof b.x !== "number" || typeof b.width !== "number") return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x < a.x + a.width && b.x + b.width > a.x && b.y < a.y + a.height && b.y + b.height > a.y;
  });
}

// ------------------------------- Deep links -------------------------------
// deepLinkFromArgv lives in ./deep-link (imported above) so it's unit-testable.
let pendingNavigate = null;
function navigateRenderer(routePath) {
  if (!routePath) return;
  showWindow();
  if (mainWin && !mainWin.isDestroyed() && !mainWin.webContents.isLoading()) {
    mainWin.webContents.send("desktop:navigate", routePath);
  } else {
    pendingNavigate = routePath; // flushed on did-finish-load
  }
}
// Forward a menu/keyboard action (New, Save, Find, Refresh…) to the renderer,
// which knows what "new" means on the current page.
function sendAction(name) {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send("desktop:action", name);
}

// ------------------------- Native application menu ------------------------
// Hidden by default (autoHideMenuBar) but its accelerators still fire, giving
// the expected desktop shortcuts. Editing/zoom/reload use built-in roles;
// New/Save/Find/Refresh are forwarded to the renderer.
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "New", accelerator: "CmdOrCtrl+N", click: () => sendAction("new") },
        { label: "Quick Add", accelerator: "CmdOrCtrl+Shift+N", click: () => sendAction("new-alt") },
        { label: "New Window", accelerator: "CmdOrCtrl+Shift+W", click: () => createWindow() },
        { type: "separator" },
        { label: "Save", accelerator: "CmdOrCtrl+S", click: () => sendAction("save") },
        {
          label: "Print…",
          accelerator: "CmdOrCtrl+P",
          click: () => {
            const w = BrowserWindow.getFocusedWindow() || mainWin;
            if (w && !w.isDestroyed()) w.webContents.print({});
          },
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        { label: "Find", accelerator: "CmdOrCtrl+F", click: () => sendAction("find") },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Refresh", accelerator: "CmdOrCtrl+R", click: () => sendAction("refresh") },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, ...(isMac ? [{ role: "front" }] : [{ role: "close" }])],
    },
  ]);
}

// ---------------------- Native right-click context menu -------------------
function attachContextMenu(win) {
  win.webContents.on("context-menu", (_e, props) => {
    const canEdit = props.isEditable;
    const hasText = props.selectionText && props.selectionText.trim().length > 0;
    const items = [];
    for (const s of (props.dictionarySuggestions || []).slice(0, 5)) {
      items.push({ label: s, click: () => win.webContents.replaceMisspelling(s) });
    }
    if (items.length) items.push({ type: "separator" });
    if (canEdit) items.push({ role: "cut", enabled: props.editFlags.canCut });
    if (canEdit || hasText) items.push({ role: "copy", enabled: props.editFlags.canCopy });
    if (canEdit) items.push({ role: "paste", enabled: props.editFlags.canPaste });
    items.push({ type: "separator" }, { role: "selectAll" });
    if (!app.isPackaged) {
      items.push({ type: "separator" }, {
        label: "Inspect Element",
        click: () => win.webContents.inspectElement(props.x, props.y),
      });
    }
    Menu.buildFromTemplate(items).popup({ window: win });
  });
}

// ------------------------- File-system integration ------------------------
// Native save dialog + open-file/open-folder, so exports (PDF/Excel/CSV) go to a
// location the user picks and can be opened straight away.
function setupFileIpc() {
  ipcMain.handle("fs:save", async (_e, payload) => {
    try {
      const win = BrowserWindow.getFocusedWindow() || mainWin;
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        defaultPath: payload && payload.name ? payload.name : "export",
        filters: (payload && payload.filters) || undefined,
      });
      if (canceled || !filePath) return { ok: false, canceled: true };
      const buf = Buffer.from(String((payload && payload.base64) || ""), "base64");
      await fs.promises.writeFile(filePath, buf);
      return { ok: true, path: filePath };
    } catch (e) {
      logError("fs:save", e);
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
  ipcMain.handle("fs:open-path", async (_e, p) => {
    const err = await shell.openPath(String(p || ""));
    return { ok: !err, error: err || undefined };
  });
  ipcMain.handle("fs:show-item", (_e, p) => {
    shell.showItemInFolder(String(p || ""));
    return { ok: true };
  });
  ipcMain.handle("app:paths", () => ({
    downloads: app.getPath("downloads"),
    documents: app.getPath("documents"),
    userData: app.getPath("userData"),
  }));

  // Bring the window back from the tray and focus it — used when the user clicks
  // a native notification while the app is minimized to the tray.
  ipcMain.handle("window:show", () => {
    showWindow();
    return { ok: true };
  });
}

app.whenReady().then(async () => {
  // A second instance quits during startup; don't let its whenReady build a
  // duplicate window/tray or grab the port.
  if (!app.hasSingleInstanceLock()) return;

  app.userAgentFallback = CHROME_UA;
  app.setAppUserModelId("farm.herdos.desktop"); // Windows: groups taskbar + toast attribution
  Menu.setApplicationMenu(buildAppMenu());

  // Register the deep-link scheme (dev needs the exec path + args).
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }

  try {
    await startServer();
  } catch {
    appUrl = "https://farmland-tarekbadr2s-projects.vercel.app"; // last-resort fallback
  }
  setupBackgroundMode();
  setupLaunchSettings();
  setupFileIpc();
  createWindow(launchedHidden());
  setupAutoUpdates();

  // A deep link may have launched us cold — route it once the window is up.
  const initialLink = deepLinkFromArgv(process.argv);
  if (initialLink) pendingNavigate = initialLink;

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Windows/Linux deliver deep links + duplicate launches here; macOS via open-url.
app.on("second-instance", (_event, argv) => {
  const link = deepLinkFromArgv(argv);
  if (link) navigateRenderer(link);
  else showWindow();
});
app.on("open-url", (event, url) => {
  event.preventDefault();
  const link = deepLinkFromArgv([url]);
  if (link) navigateRenderer(link);
});

app.on("window-all-closed", () => {
  // In background mode we keep the process alive (tray) even with no window.
  if (backgroundEnabled) return;
  if (process.platform !== "darwin") app.quit();
});
