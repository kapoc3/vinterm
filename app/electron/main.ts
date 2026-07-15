import { app, BrowserWindow, ipcMain, dialog, shell as electronShell, Menu } from 'electron'
import { exec } from 'child_process'
import * as path from 'path'
import * as pty from 'node-pty'

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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
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
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
      env: process.env as Record<string, string>
    })

    ptyProcess.onData((data) => {
      mainWindow?.webContents.send(`terminal.incData.${id}`, data)
    })

    sessions.set(id, { type: 'local', instance: ptyProcess })
  } catch (err: any) {
    console.error("Local PTY Spawn Error:", err);
    mainWindow?.webContents.send(`terminal.incData.${id}`, `\r\n\x1b[31mFailed to spawn local terminal:\x1b[0m ${err.message}\r\n`)
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

  if (session.type === 'local') {
    session.instance.write(data)
  } else if (session.type === 'ssh') {
    session.instance.write(data)
  }
})

ipcMain.on('terminal.resize', (event, id, cols, rows) => {
  const session = sessions.get(id)
  if (!session) return

  if (session.type === 'local') {
    session.instance.resize(cols, rows)
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

  if (session.type === 'local') {
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
    if (!session || session.type !== 'ssh' || !session.client) {
      return resolve({ success: false });
    }

    const cmd = `echo "$(free -m | awk 'NR==2{print $2","$3}')---$(ps -eo pcpu | awk 'BEGIN {sum=0.0} {sum+=$1} END {print sum}')---$(nproc 2>/dev/null || echo 1)---$(df -m / | awk 'NR==2{print $2","$3}')"`;
    
    session.client.exec(cmd, (err, stream) => {
      if (err) return resolve({ success: false });
      
      let data = '';
      stream.on('data', (chunk: any) => { data += chunk.toString(); });
      stream.on('close', () => {
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
      });
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
