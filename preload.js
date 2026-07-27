const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  setHover: (expanded) => ipcRenderer.send("hover-state", expanded),
  onWindowState: (callback) =>
    ipcRenderer.on("window-state", (_event, expanded, transitionId) =>
      callback(expanded, transitionId)
    ),
  renderReady: (transitionId) => ipcRenderer.send("window-render-ready", transitionId),
  onOpenSettings: (callback) => ipcRenderer.on("open-settings", callback),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  notify: (title, body) => ipcRenderer.send("show-notification", { title, body }),
  close: () => ipcRenderer.send("window-close-request")
});
