const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  spawnLocal: (id) => ipcRenderer.send('terminal.spawnLocal', id),
  spawnSSH: (id, config) => ipcRenderer.send('terminal.spawnSSH', id, config),
  onTerminalData: (id, callback) => {
    const channel = `terminal.incData.${id}`
    // Remove existing listener to avoid duplicates if re-mounted
    ipcRenderer.removeAllListeners(channel)
    ipcRenderer.on(channel, (_event, data) => callback(data))
  },
  sendToTerminal: (id, data) => ipcRenderer.send('terminal.toTerm', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal.resize', id, cols, rows),
  closeTerminal: (id) => ipcRenderer.send('terminal.close', id),
  selectFile: () => ipcRenderer.invoke('dialog.selectFile'),
  selectUploadFiles: () => ipcRenderer.invoke('dialog.selectUploadFiles'),
  getFonts: () => ipcRenderer.invoke('system.getFonts'),
  testSSHConnection: (config) => ipcRenderer.invoke('terminal.testSSH', config),
  
  // SFTP
  initSftp: (id) => ipcRenderer.invoke('sftp.init', id),
  listSftpDir: (id, remotePath) => ipcRenderer.invoke('sftp.listDir', id, remotePath),
  uploadSftpFile: (id, localPath, remotePath) => ipcRenderer.invoke('sftp.upload', id, localPath, remotePath),
  downloadSftpFile: (id, remotePath, fileName) => ipcRenderer.invoke('sftp.download', id, remotePath, fileName),
  deleteSftpFile: (id, remotePath, isDirectory) => ipcRenderer.invoke('sftp.delete', id, remotePath, isDirectory),
  renameSftpFile: (id, oldPath, newPath) => ipcRenderer.invoke('sftp.rename', id, oldPath, newPath),
  getSshStats: (id) => ipcRenderer.invoke('ssh.getStats', id),
  readSftpFile: (id, remotePath) => ipcRenderer.invoke('sftp.readFile', id, remotePath),
  writeSftpFile: (id, remotePath, content) => ipcRenderer.invoke('sftp.writeFile', id, remotePath, content),
  openInLocalEditor: (id, remotePath, customEditor) => ipcRenderer.invoke('sftp.openInLocalEditor', id, remotePath, customEditor),
  vaultEncrypt: (text, password) => ipcRenderer.invoke('vault.encrypt', text, password),
  vaultDecrypt: (cipherText, password) => ipcRenderer.invoke('vault.decrypt', cipherText, password),
})
