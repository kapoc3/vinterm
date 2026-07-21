import { app, BrowserWindow, ipcMain, dialog, shell as electronShell, Menu } from 'electron'
import { exec } from 'child_process'
import * as path from 'path'
import * as pty from 'node-pty'

// Ignore EPIPE errors on stdout/stderr (happens when writing to console.log in built macOS app)
if (process.stdout) {
  process.stdout.on('error', (err: any) => {
    if (err.code === 'EPIPE') return;
  });
}
if (process.stderr) {
  process.stderr.on('error', (err: any) => {
    if (err.code === 'EPIPE') return;
  });
}

process.on('uncaughtException', (err: any) => {
  if (err.code === 'EPIPE') {
    return; // Ignore EPIPE globally
  }
  console.error('Uncaught Exception:', err);
});

console.log('--- MAIN PROCESS STARTED ---');
console.log('PTY object:', Object.keys(pty));
console.log('PTY spawn type:', typeof pty.spawn);
import { Client as SSHClient } from 'ssh2'
import os from 'os'
import fs from 'fs'
import fontManager from 'font-list'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
app.setName('Vinterm')

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Vinterm',
    icon: path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../public/vinterm.png' : '../dist/vinterm.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    }
  })

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../public/vinterm.png' : '../dist/vinterm.png'))
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('PRELOAD ERROR in path:', preloadPath);
    console.error(error);
  });

  mainWindow.on('closed', () => {
    // Clear sessions to avoid background processes running after window close
    for (const [id, session] of sessions.entries()) {
      if (session.type === 'local' || session.type === 'gcp') {
        try { session.instance.kill(); } catch (e) {}
      } else if (session.type === 'ssh') {
        try { if (session.instance.end) session.instance.end(); } catch (e) {}
        try { if (session.client.end) session.client.end(); } catch (e) {}
      }
    }
    sessions.clear();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const template: any[] = [
      {
        label: 'Vinterm',
        submenu: [
          { role: 'about', label: 'About Vinterm' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide', label: 'Hide Vinterm' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: 'Quit Vinterm' }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Session Management
// id -> { type: 'local'|'ssh', instance: any }
const sessions = new Map<string, any>()

const shell = process.env[process.platform === 'win32' ? 'COMSPEC' : 'SHELL'] || (process.platform === 'win32' ? 'powershell.exe' : 'bash');

ipcMain.on('terminal.spawnLocal', (event, id) => {
  console.log(`[IPC] terminal.spawnLocal received for id: ${id}`);
  try {
    const args = process.platform === 'win32' ? [] : ['--login'];
    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
      env: process.env as Record<string, string>
    })

    ptyProcess.onData((data) => {
      mainWindow?.webContents.send(`terminal.incData.${id}`, data)
    })
    ptyProcess.onExit((e) => {
      mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[31m[Process exited with code ${e.exitCode}]\x1b[0m\r\n`)
    })

    sessions.set(id, { type: 'local', instance: ptyProcess })
  } catch (err: any) {
    console.error("Local PTY Spawn Error:", err);
    mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[31mFailed to spawn local terminal:\x1b[0m ${err.message}\r\n`)
  }
})

ipcMain.on('terminal.spawnGCP', (event, id, config) => {
  console.log(`[IPC] terminal.spawnGCP received for id: ${id}`);
  try {
    const { gcpProject, gcpZone, gcpInstance } = config;
    const command = `gcloud compute ssh ${gcpInstance} --project=${gcpProject} --zone=${gcpZone}`;
    
    // Send initial status message
    mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[36mConnecting to GCP instance [${gcpInstance}] via gcloud...\x1b[0m\r\n`);
    
    // Ensure common paths are included for macOS GUI apps
    const extendedPath = process.platform !== 'win32' 
      ? `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/google-cloud-sdk/bin`
      : process.env.PATH;
      
    const args = process.platform === 'win32' ? ['/c', command] : ['-l', '-c', command];
    const ptyProcess = pty.spawn(process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || 'bash'), args, {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
      env: { ...process.env, PATH: extendedPath } as Record<string, string>
    })

    ptyProcess.onData((data) => {
      mainWindow?.webContents.send(`terminal.incData.${id}`, data)
    })
    ptyProcess.onExit((e) => {
      mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[31m[Process exited with code ${e.exitCode}]\x1b[0m\r\n`)
    })

    sessions.set(id, { type: 'gcp', instance: ptyProcess, config })
  } catch (err: any) {
    console.error("GCP PTY Spawn Error:", err);
    mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[31mFailed to spawn GCP SSH via gcloud:\x1b[0m ${err.message}\r\n`)
  }
})

ipcMain.on('terminal.spawnSSH', (event, id, config) => {
  const conn = new SSHClient()
  
  conn.on('ready', () => {
    conn.shell({ term: 'xterm-color' }, (err, stream) => {
      if (err) {
        mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\nSSH Error: ${err.message}\r\n`)
        return
      }

      sessions.set(id, { type: 'ssh', instance: stream, client: conn })

      stream.on('close', () => {
        conn.end()
      }).on('data', (data: Buffer) => {
        mainWindow?.webContents.send(`terminal.incData.${id}`, data.toString('utf8'))
      })
    })
  }).on('error', (err) => {
    mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\nSSH Connection Error: ${err.message}\r\n`)
  })

  const connectConfig: any = {
    host: config.host,
    port: config.port || 22,
    username: config.username,
    readyTimeout: 30000
  }

  if (config.privateKeyPath) {
    try {
      let keyPath = config.privateKeyPath;
      if (keyPath.startsWith('~')) {
        keyPath = path.join(os.homedir(), keyPath.slice(1));
      }
      connectConfig.privateKey = fs.readFileSync(keyPath);
      if (config.password) {
        connectConfig.passphrase = config.password;
      }
    } catch (e: any) {
      mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[31mFailed to read private key:\x1b[0m ${e.message}\r\n`)
      return;
    }
  } else if (config.password) {
    connectConfig.password = config.password
  }

  try {
    conn.connect(connectConfig)
  } catch (err: any) {
    console.error("SSH Connect Error:", err);
    mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[31mFailed to initialize SSH connection:\x1b[0m ${err.message}\r\n`)
  }
})

ipcMain.handle('terminal.testSSH', async (event, config) => {
  if (config.type === 'gcp') {
    return new Promise((resolve) => {
      const { gcpProject, gcpZone, gcpInstance } = config;
      const command = `gcloud compute ssh ${gcpInstance} --project=${gcpProject} --zone=${gcpZone} --command="echo Success"`;
      
      const extendedPath = process.platform !== 'win32' 
        ? `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/google-cloud-sdk/bin`
        : process.env.PATH;

      exec(command, { 
        timeout: 30000,
        env: { ...process.env, PATH: extendedPath },
        shell: process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')
      }, (error, stdout, stderr) => {
        if (error) {
          resolve({ success: false, message: `GCP Test Error: ${stderr || error.message}` });
        } else if (stdout.includes('Success')) {
          resolve({ success: true, message: 'Connection successful!' });
        } else {
          resolve({ success: false, message: `GCP Test failed. Output: ${stdout}` });
        }
      });
    });
  }

  return new Promise((resolve) => {
    const conn = new SSHClient();
    const connectConfig: any = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      readyTimeout: 30000
    };

    if (config.privateKeyPath) {
      try {
        let keyPath = config.privateKeyPath;
        if (keyPath.startsWith('~')) {
          keyPath = path.join(os.homedir(), keyPath.slice(1));
        }
        connectConfig.privateKey = fs.readFileSync(keyPath);
        if (config.password) {
          connectConfig.passphrase = config.password;
        }
      } catch (e: any) {
        return resolve({ success: false, message: `Failed to read private key: ${e.message}` });
      }
    } else if (config.password) {
      connectConfig.password = config.password;
    }

    conn.on('ready', () => {
      conn.end();
      resolve({ success: true, message: 'Connection successful!' });
    }).on('error', (err) => {
      resolve({ success: false, message: `SSH Error: ${err.message}` });
    });

    try {
      conn.connect(connectConfig);
    } catch (err: any) {
      resolve({ success: false, message: `Init Error: ${err.message}` });
    }
  });
});

ipcMain.on('terminal.toTerm', (event, id, data) => {
  const session = sessions.get(id)
  if (!session) return

  if (session.type === 'local' || session.type === 'gcp') {
    try {
      session.instance.write(data)
    } catch (e) {}
  } else if (session.type === 'ssh') {
    try {
      session.instance.write(data)
    } catch (e) {}
  }
})

ipcMain.on('terminal.resize', (event, id, cols, rows) => {
  const session = sessions.get(id)
  if (!session) return

  if (session.type === 'local' || session.type === 'gcp') {
    try {
      session.instance.resize(cols, rows)
    } catch (e) {}
  } else if (session.type === 'ssh') {
    // some SSH streams support resize via setWindow
    if (session.instance.setWindow) {
      session.instance.setWindow(rows, cols, 0, 0)
    }
  }
})

ipcMain.on('terminal.close', (event, id) => {
  const session = sessions.get(id)
  if (!session) return

  if (session.type === 'local' || session.type === 'gcp') {
    session.instance.kill()
  } else if (session.type === 'ssh') {
    if (session.instance.end) session.instance.end()
    if (session.client.end) session.client.end()
  }
  sessions.delete(id)
})

ipcMain.handle('dialog.selectFile', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'showHiddenFiles'],
    title: 'Select Private Key',
    message: 'Select your SSH private key file (e.g. id_rsa)'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle('dialog.selectUploadFiles', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections', 'showHiddenFiles'],
    title: 'Select Files to Upload'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths;
});

ipcMain.handle('dialog.saveExportFile', async (event, data: string) => {
  if (!mainWindow) return { success: false, message: 'No main window' };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export Settings',
    defaultPath: 'vinterm_export.enc',
    filters: [
      { name: 'VinTerm Export', extensions: ['enc', 'vinterm'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (canceled || !filePath) return { success: false, message: 'Canceled' };
  
  try {
    fs.writeFileSync(filePath, data, 'utf-8');
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});
ipcMain.handle('dialog.showMessageBox', async (event, options: any) => {
  if (!mainWindow) return;
  const iconPath = path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../public/vinterm.png' : '../dist/vinterm.png');
  await dialog.showMessageBox(mainWindow, {
    ...options,
    icon: fs.existsSync(iconPath) ? iconPath : undefined
  });
});


ipcMain.handle('system.openExternal', async (event, url: string) => {
  await electronShell.openExternal(url);
  return true;
});

ipcMain.handle('dialog.openImportFile', async () => {
  if (!mainWindow) return { success: false, message: 'No main window' };
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'showHiddenFiles'],
    title: 'Import Settings',
    filters: [
      { name: 'Supported Exports', extensions: ['enc', 'vinterm', 'mxtsessions'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: 'Canceled' };
  }
  
  try {
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, data };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('system.getFonts', async () => {
  try {
    return await fontManager.getFonts();
  } catch (e) {
    return ['Courier New', 'Consolas', 'Monaco', 'Menlo', 'monospace'];
  }
});

// --- SFTP Handlers ---

ipcMain.handle('sftp.init', async (event, id) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || session.type !== 'ssh' || !session.client) {
      return resolve({ success: false, message: 'Invalid session' });
    }
    
    if (session.sftp) {
      return resolve({ success: true });
    }

    session.client.sftp((err: any, sftp: any) => {
      if (err) {
        return resolve({ success: false, message: err.message });
      }
      session.sftp = sftp;
      resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp.listDir', async (event, id, remotePath) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || !session.sftp) {
      return resolve({ success: false, message: 'SFTP not initialized' });
    }

    session.sftp.readdir(remotePath, (err: any, list: any) => {
      if (err) {
        return resolve({ success: false, message: err.message });
      }
      // Format the list for frontend
      const files = list.map((item: any) => ({
        name: item.filename,
        isDirectory: item.longname.startsWith('d'),
        size: item.attrs.size,
        mtime: item.attrs.mtime * 1000 // Convert to ms
      }));
      
      // Sort: folders first, then alphabetically
      files.sort((a: any, b: any) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      
      resolve({ success: true, files });
    });
  });
});

ipcMain.handle('sftp.upload', async (event, id, localPath, remotePath) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || !session.sftp) {
      return resolve({ success: false, message: 'SFTP not initialized' });
    }

    session.sftp.fastPut(localPath, remotePath, (err: any) => {
      if (err) {
        return resolve({ success: false, message: err.message });
      }
      resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp.download', async (event, id, remotePath, fileName) => {
  return new Promise(async (resolve) => {
    const session = sessions.get(id);
    if (!session || !session.sftp) {
      return resolve({ success: false, message: 'SFTP not initialized' });
    }

    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: fileName,
      title: 'Download File'
    });

    if (canceled || !filePath) {
      return resolve({ success: false, message: 'Canceled' });
    }

    session.sftp.fastGet(remotePath, filePath, (err: any) => {
      if (err) {
        return resolve({ success: false, message: err.message });
      }
      resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp.delete', async (event, id, remotePath, isDirectory) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || !session.sftp) {
      return resolve({ success: false, message: 'SFTP not initialized' });
    }

    const callback = (err: any) => {
      if (err) {
        return resolve({ success: false, message: err.message });
      }
      resolve({ success: true });
    };

    if (isDirectory) {
      session.sftp.rmdir(remotePath, callback);
    } else {
      session.sftp.unlink(remotePath, callback);
    }
  });
});

ipcMain.handle('sftp.mkdir', async (event, id, remotePath) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || !session.sftp) {
      return resolve({ success: false, message: 'SFTP not initialized' });
    }
    session.sftp.mkdir(remotePath, (err: any) => {
      if (err) {
        return resolve({ success: false, message: err.message });
      }
      resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp.readFile', async (event, id, remotePath) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || !session.sftp) {
      return resolve({ success: false, message: 'SFTP not initialized' });
    }

    session.sftp.readFile(remotePath, 'utf8', (err: any, data: string) => {
      if (err) {
        return resolve({ success: false, message: err.message });
      }
      resolve({ success: true, data });
    });
  });
});

ipcMain.handle('sftp.writeFile', async (event, id, remotePath, content) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || session.type !== 'ssh' || !session.sftp) {
      return resolve({ success: false, message: 'Invalid session or SFTP not initialized' });
    }
    const buffer = Buffer.from(content, 'utf-8');
    session.sftp.writeFile(remotePath, buffer, (err) => {
      if (err) return resolve({ success: false, message: err.message });
      resolve({ success: true });
    });
  });
});

ipcMain.handle('sftp.rename', async (event, id, oldPath, newPath) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || session.type !== 'ssh' || !session.sftp) {
      return resolve({ success: false, message: 'Invalid session or SFTP not initialized' });
    }
    session.sftp.rename(oldPath, newPath, (err) => {
      if (err) return resolve({ success: false, message: err.message });
      resolve({ success: true });
    });
  });
});

ipcMain.handle('ssh.getStats', async (event, id) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || (session.type !== 'ssh' && session.type !== 'gcp')) {
      return resolve({ success: false });
    }

    const cmd = `echo "$(free -m | awk 'NR==2{print $2","$3}')---$(ps -eo pcpu | awk 'BEGIN {sum=0.0} {sum+=$1} END {print sum}')---$(nproc 2>/dev/null || echo 1)---$(df -m / | awk 'NR==2{print $2","$3}')"`;
    
    const handleOutput = (data: string) => {
      try {
        const parts = data.trim().split('---');
        if (parts.length >= 3) {
          const memParts = parts[0].split(',');
          const memTotal = parseInt(memParts[0], 10);
          const memUsed = parseInt(memParts[1], 10);
          
          const rawCpu = parseFloat(parts[1]);
          const cores = parseInt(parts[2], 10) || 1;
          const cpuPercent = Math.min(100, Math.max(0, rawCpu / cores));
          
          let diskTotal = 0;
          let diskUsed = 0;
          if (parts.length >= 4) {
             const diskParts = parts[3].split(',');
             diskTotal = parseInt(diskParts[0], 10);
             diskUsed = parseInt(diskParts[1], 10);
          }

          resolve({
            success: true,
            data: { cpu: cpuPercent, memTotal, memUsed, diskTotal, diskUsed }
          });
        } else {
          resolve({ success: false });
        }
      } catch (e) {
        resolve({ success: false });
      }
    };

    if (session.type === 'gcp') {
      if (!session.config) return resolve({ success: false });
      const { gcpProject, gcpZone, gcpInstance } = session.config;
      
      // Escape single quotes for bash so we can wrap the whole command in single quotes
      const escapedCmd = cmd.replace(/'/g, "'\\''");
      const command = `gcloud compute ssh ${gcpInstance} --project=${gcpProject} --zone=${gcpZone} --command='${escapedCmd}'`;
      
      const extendedPath = process.platform !== 'win32' 
        ? `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin:${process.env.HOME}/google-cloud-sdk/bin`
        : process.env.PATH;
      exec(command, { 
        timeout: 20000,
        env: { ...process.env, PATH: extendedPath },
        shell: process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || '/bin/bash')
      }, (error, stdout, stderr) => {
        if (error) {
          console.error("GCP Stats Error:", error, stderr);
          return resolve({ success: false });
        }
        handleOutput(stdout);
      });
      return;
    }

    if (!session.client) return resolve({ success: false });
    session.client.exec(cmd, (err, stream) => {
      if (err) return resolve({ success: false });
      
      let data = '';
      stream.on('data', (chunk: any) => { data += chunk.toString(); });
      stream.on('close', () => handleOutput(data));
    });
  });
});

const activeWatchers = new Map<string, fs.FSWatcher>();

ipcMain.handle('sftp.openInLocalEditor', async (event, id, remotePath, customEditor) => {
  return new Promise((resolve) => {
    const session = sessions.get(id);
    if (!session || session.type !== 'ssh' || !session.sftp) {
      return resolve({ success: false, message: 'SFTP not initialized' });
    }

    const tempDir = path.join(os.tmpdir(), 'vinterm-sync');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const fileName = path.basename(remotePath);
    const localPath = path.join(tempDir, `${id}-${fileName}`);

    session.sftp.fastGet(remotePath, localPath, (err) => {
      if (err) return resolve({ success: false, message: err.message });

      const handleWatchAndResolve = () => {
        if (activeWatchers.has(localPath)) {
          activeWatchers.get(localPath)?.close();
        }

        const watcher = fs.watch(localPath, (eventType) => {
          if (eventType === 'change') {
            const sftp = sessions.get(id)?.sftp;
            if (sftp && fs.existsSync(localPath)) {
              sftp.fastPut(localPath, remotePath, (err) => {
                if (err) console.error('Error auto-syncing file:', err.message);
                else console.log(`Auto-synced ${fileName} to remote.`);
              });
            }
          }
        });
        activeWatchers.set(localPath, watcher);
        resolve({ success: true, localPath });
      };

      if (customEditor && customEditor !== 'default' && process.platform === 'darwin') {
        exec(`open -a "${customEditor}" "${localPath}"`, (execErr) => {
          if (execErr) {
            console.error(`Failed to open with ${customEditor}:`, execErr.message);
            // Fallback to default
            electronShell.openPath(localPath).then((errorMessage) => {
              if (errorMessage) return resolve({ success: false, message: errorMessage });
              handleWatchAndResolve();
            });
          } else {
            handleWatchAndResolve();
          }
        });
      } else {
        electronShell.openPath(localPath).then((errorMessage) => {
          if (errorMessage) return resolve({ success: false, message: errorMessage });
          handleWatchAndResolve();
        });
      }
    });
  });
});

// --- Vault Handlers ---
const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

ipcMain.handle('vault.encrypt', async (event, text: string, masterPass: string) => {
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.scryptSync(masterPass, salt, 32);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return {
      success: true,
      data: `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
    };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
});

ipcMain.handle('vault.decrypt', async (event, cipherText: string, masterPass: string) => {
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 4) throw new Error('Invalid vault format');
    
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];
    
    const key = crypto.scryptSync(masterPass, salt, 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return { success: true, data: decrypted };
  } catch (e: any) {
    return { success: false, message: 'Decryption failed (Wrong password or corrupted data)' };
  }
});

// --- System ---
ipcMain.handle('system.runOllamaList', async () => {
  return new Promise((resolve) => {
    const homeDir = os.homedir();
    let ollamaPath = 'ollama'; // Default to PATH

    // Platform-specific checks
    if (process.platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
      const winPath = path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe');
      if (fs.existsSync(winPath)) {
        ollamaPath = `"${winPath}"`;
      }
    } else if (process.platform === 'darwin') {
      const macPathApp = '/Applications/Ollama.app/Contents/Resources/ollama';
      const macPathBrew = '/opt/homebrew/bin/ollama';
      if (fs.existsSync(macPathApp)) {
        ollamaPath = macPathApp;
      } else if (fs.existsSync(macPathBrew)) {
        ollamaPath = macPathBrew;
      }
    } else if (process.platform === 'linux') {
      const linuxLocalPath = path.join(homeDir, 'ollama', 'bin', 'ollama');
      if (fs.existsSync(linuxLocalPath)) {
        ollamaPath = linuxLocalPath;
      }
    }

    exec(`${ollamaPath} list`, (err, stdout, stderr) => {
      if (err) {
        return resolve({ success: false, message: stderr || err.message });
      }
      resolve({ success: true, data: stdout });
    });
  });
});



ipcMain.handle('system.fetch', async (event, url: string, options: any) => {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    
    return {
      success: res.ok,
      status: res.status,
      data: json || text,
      message: res.ok ? 'OK' : (json?.error?.message || text || 'Error')
    };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
});
