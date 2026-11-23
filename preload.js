const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("projectFlame", {
  discordLogin: () => ipcRenderer.invoke("discord-login"),
  getSession: () => ipcRenderer.invoke("get-session"),
  logout: () => ipcRenderer.invoke("discord-logout")
});