import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  spawnLocal: (id: string) => ipcRenderer.send('terminal.spawnLocal', id),
  spawnSSH: (id: string, config: any) => ipcRenderer.send('terminal.spawnSSH', id, config),
  spawnGCP: (id: string, config: any) => ipcRenderer.send('terminal.spawnGCP', id, config),
  onTerminalData: (id: string, callback: (data: string) => void) => {
    ipcRenderer.removeAllListeners(`terminal.incData.${id}`)
    ipcRenderer.on(`terminal.incData.${id}`, (_event, data) => callback(data))
  },
  sendToTerminal: (id: string, data: string) => ipcRenderer.send('terminal.toTerm', id, data),
  resizeTerminal: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal.resize', id, cols, rows),
  closeTerminal: (id: string) => ipcRenderer.send('terminal.close', id),
  
  testSSHConnection: (config: any) => ipcRenderer.invoke('terminal.testSSH', config),
  
  // SFTP
  initSftp: (id: string) => ipcRenderer.invoke('sftp.init', id),
  listSftpDir: (id: string, remotePath: string) => ipcRenderer.invoke('sftp.listDir', id, remotePath),
  readFile: (id: string, remotePath: string) => ipcRenderer.invoke('sftp.readFile', id, remotePath),
  writeFile: (id: string, remotePath: string, content: string) => ipcRenderer.invoke('sftp.writeFile', id, remotePath, content),
  rename: (id: string, oldPath: string, newPath: string) => ipcRenderer.invoke('sftp.rename', id, oldPath, newPath),
  openInLocalEditor: (id: string, remotePath: string, customEditor?: string) => ipcRenderer.invoke('sftp.openInLocalEditor', id, remotePath, customEditor),
  mkdir: (id: string, remotePath: string) => ipcRenderer.invoke('sftp.mkdir', id, remotePath),
  uploadSftpFile: (id: string, localPath: string, remotePath: string) => ipcRenderer.invoke('sftp.upload', id, localPath, remotePath),
  downloadSftpFile: (id: string, remotePath: string, fileName: string) => ipcRenderer.invoke('sftp.download', id, remotePath, fileName),
  deleteSftpFile: (id: string, remotePath: string, isDirectory: boolean) => ipcRenderer.invoke('sftp.delete', id, remotePath, isDirectory),
  
  // Stats
  getSshStats: (id: string) => ipcRenderer.invoke('ssh.getStats', id),
  
  // Dashboard
  dashboardConnect: (id: string, config: any, type: string) => ipcRenderer.invoke('dashboard.connect', id, config, type),
  dashboardDisconnect: (id: string) => ipcRenderer.invoke('dashboard.disconnect', id),
  
  // System/Dialogs
  openExternal: (url: string) => ipcRenderer.invoke('system.openExternal', url),
  getFonts: () => ipcRenderer.invoke('system.getFonts'),
  selectFile: () => ipcRenderer.invoke('dialog.selectFile'),
  selectUploadFiles: () => ipcRenderer.invoke('dialog.selectUploadFiles'),
  saveExportFile: (data: string) => ipcRenderer.invoke('dialog.saveExportFile', data),
  openImportFile: () => ipcRenderer.invoke('dialog.openImportFile'),
  showMessageBox: (options: any) => ipcRenderer.invoke('dialog.showMessageBox', options),
  runOllamaList: () => ipcRenderer.invoke('system.runOllamaList'),
  systemFetch: (url: string, options: any) => ipcRenderer.invoke('system.fetch', url, options),
  systemFetchStream: (reqId: string, url: string, options: any, callbacks: { onDelta: (chunk: string) => void, onDone: () => void, onError: (err: string) => void }) => {
    ipcRenderer.removeAllListeners(`ai.stream.delta.${reqId}`);
    ipcRenderer.removeAllListeners(`ai.stream.done.${reqId}`);
    ipcRenderer.removeAllListeners(`ai.stream.error.${reqId}`);

    ipcRenderer.on(`ai.stream.delta.${reqId}`, (_e, delta) => callbacks.onDelta(delta));
    ipcRenderer.once(`ai.stream.done.${reqId}`, () => {
      ipcRenderer.removeAllListeners(`ai.stream.delta.${reqId}`);
      ipcRenderer.removeAllListeners(`ai.stream.error.${reqId}`);
      callbacks.onDone();
    });
    ipcRenderer.once(`ai.stream.error.${reqId}`, (_e, err) => {
      ipcRenderer.removeAllListeners(`ai.stream.delta.${reqId}`);
      ipcRenderer.removeAllListeners(`ai.stream.done.${reqId}`);
      callbacks.onError(err);
    });

    return ipcRenderer.invoke('system.fetchStream', reqId, url, options);
  },
  readClipboard: () => ipcRenderer.invoke('system.readClipboard'),
  writeClipboard: (text: string) => ipcRenderer.invoke('system.writeClipboard', text),
  
  // Vault
  vaultEncrypt: (text: string, masterPass: string) => ipcRenderer.invoke('vault.encrypt', text, masterPass),
  vaultDecrypt: (cipherText: string, masterPass: string) => ipcRenderer.invoke('vault.decrypt', cipherText, masterPass)
})
