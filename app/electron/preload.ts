import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  spawnTerminal: () => ipcRenderer.send('terminal.spawn'),
  onTerminalData: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal.incData', (_event, data) => callback(data))
  },
  sendToTerminal: (data: string) => ipcRenderer.send('terminal.toTerm', data),
  resizeTerminal: (cols: number, rows: number) => ipcRenderer.send('terminal.resize', cols, rows),
  readFile: (id: string, remotePath: string) => ipcRenderer.invoke('sftp.readFile', id, remotePath),
  writeFile: (id: string, remotePath: string, content: string) => ipcRenderer.invoke('sftp.writeFile', id, remotePath, content),
  rename: (id: string, oldPath: string, newPath: string) => ipcRenderer.invoke('sftp.rename', id, oldPath, newPath),
  openInLocalEditor: (id: string, remotePath: string, customEditor?: string) => ipcRenderer.invoke('sftp.openInLocalEditor', id, remotePath, customEditor),
  mkdir: (id: string, remotePath: string) => ipcRenderer.invoke('sftp.mkdir', id, remotePath)
})
