import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  spawnTerminal: () => ipcRenderer.send('terminal.spawn'),
  onTerminalData: (callback: (data: string) => void) => {
    ipcRenderer.on('terminal.incData', (_event, data) => callback(data))
  },
  sendToTerminal: (data: string) => ipcRenderer.send('terminal.toTerm', data),
  resizeTerminal: (cols: number, rows: number) => ipcRenderer.send('terminal.resize', cols, rows)
})
