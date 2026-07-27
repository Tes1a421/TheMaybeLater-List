const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Notification,
  Tray,
  Menu,
  nativeImage
} = require("electron");
const path = require("path");
const fs = require("fs");

const COLLAPSED = { width: 62, height: 184 };
const EXPANDED = { width: 430, height: 720 };

let mainWindow;
let collapseTimer;
let tray;
let isQuitting = false;
let windowExpanded = false;
let transitionId = 0;
let settings = {
  openAtLogin: false,
  closeAction: "hide",
  workStart: "09:00",
  workEnd: "18:00"
};

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function migrateLegacyUserData() {
  const currentPath = app.getPath("userData");
  fs.mkdirSync(currentPath, { recursive: true });
  for (const legacyName of ["浮光待办", "小羊鸽蛋"]) {
    const legacyPath = path.join(app.getPath("appData"), legacyName);
    if (!fs.existsSync(legacyPath) || legacyPath === currentPath) continue;
    for (const entry of fs.readdirSync(legacyPath)) {
      const source = path.join(legacyPath, entry);
      const target = path.join(currentPath, entry);
      if (!fs.existsSync(target)) {
        fs.cpSync(source, target, { recursive: true });
      }
    }
  }
}

function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) };
  } catch {
    // 首次运行时使用默认设置。
  }
}

function saveSettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf8");

  const loginOptions = {
    openAtLogin: settings.openAtLogin,
    path: process.execPath
  };
  if (process.defaultApp) loginOptions.args = [app.getAppPath()];
  app.setLoginItemSettings(loginOptions);
  return settings;
}

function rightEdgeBounds(size) {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    width: size.width,
    height: Math.min(size.height, area.height - 24),
    x: area.x + area.width - size.width - 10,
    y: area.y + Math.round((area.height - Math.min(size.height, area.height - 24)) / 2)
  };
}

function setExpanded(expanded) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  clearTimeout(collapseTimer);

  if (!expanded) {
    if (!windowExpanded) return;
    const attemptCollapse = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const cursor = screen.getCursorScreenPoint();
      const bounds = mainWindow.getBounds();
      const cursorIsInside =
        cursor.x >= bounds.x &&
        cursor.x < bounds.x + bounds.width &&
        cursor.y >= bounds.y &&
        cursor.y < bounds.y + bounds.height;

      // 透明圆角或浮层可能产生虚假的 mouseleave。
      // 鼠标实际仍在窗口范围内时继续等待，直到真正离开。
      if (cursorIsInside) {
        collapseTimer = setTimeout(attemptCollapse, 220);
        return;
      }

      windowExpanded = false;
      const currentTransition = ++transitionId;
      mainWindow.setOpacity(0);
      mainWindow.setBounds(rightEdgeBounds(COLLAPSED), false);
      mainWindow.webContents.send("window-state", false, currentTransition);
      setTimeout(() => {
        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          transitionId === currentTransition
        ) {
          mainWindow.setOpacity(1);
        }
      }, 90);
    };
    collapseTimer = setTimeout(attemptCollapse, 650);
    return;
  }

  if (windowExpanded) return;
  windowExpanded = true;
  const currentTransition = ++transitionId;
  mainWindow.setOpacity(0);
  mainWindow.setBounds(rightEdgeBounds(EXPANDED), false);
  mainWindow.webContents.send("window-state", true, currentTransition);
  setTimeout(() => {
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      transitionId === currentTransition
    ) {
      mainWindow.setOpacity(1);
    }
  }, 90);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    ...rightEdgeBounds(COLLAPSED),
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: path.join(__dirname, "assets", "app-icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile("index.html");
  mainWindow.once("ready-to-show", () => mainWindow.showInactive());
  mainWindow.on("close", (event) => {
    if (!isQuitting && settings.closeAction === "hide") {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, "assets", "tray-icon.png")
  );

  tray = new Tray(trayIcon);
  tray.setToolTip("小羊鸽单");
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: "打开小羊鸽单",
      click: () => {
        mainWindow.show();
        setExpanded(true);
        mainWindow.focus();
      }
    },
    {
      label: "设置",
      click: () => {
        mainWindow.show();
        setExpanded(true);
        mainWindow.focus();
        mainWindow.webContents.send("open-settings");
      }
    },
    { type: "separator" },
    {
      label: "关闭",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on("double-click", () => {
    mainWindow.show();
    setExpanded(true);
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.xiaoyang-gedan.desktop");
  }
  migrateLegacyUserData();
  loadSettings();
  createWindow();
  createTray();
  ipcMain.on("hover-state", (_event, expanded) => setExpanded(Boolean(expanded)));
  ipcMain.on("window-render-ready", (_event, readyTransitionId) => {
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      readyTransitionId === transitionId
    ) {
      mainWindow.setOpacity(1);
    }
  });
  ipcMain.handle("get-settings", () => settings);
  ipcMain.handle("save-settings", (_event, nextSettings) => saveSettings(nextSettings));
  ipcMain.on("show-notification", (_event, payload) => {
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: payload?.title || "小羊鸽单",
      body: payload?.body || "你有一项待办需要处理",
      urgency: "critical",
      timeoutType: "never"
    });
    notification.on("click", () => {
      setExpanded(true);
      mainWindow.show();
      mainWindow.focus();
    });
    notification.show();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.flashFrame(true);
    }
  });
  ipcMain.on("window-close-request", () => {
    if (settings.closeAction === "hide") {
      mainWindow.hide();
    } else {
      isQuitting = true;
      app.quit();
    }
  });
});

app.on("window-all-closed", () => {
  if (isQuitting && process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  isQuitting = true;
});
