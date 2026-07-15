import React, { useEffect, useRef, useState } from 'react'

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SiJavascript, SiTypescript, SiPython, SiHtml5, SiCss, SiMarkdown, SiJson, SiGnubash, SiReact, SiYaml, SiCplusplus } from 'react-icons/si';
import { FaJava, FaMicrochip, FaMemory, FaHdd } from 'react-icons/fa';
import { VscFile, VscFolder, VscSettingsGear, VscSymbolKey, VscLock, VscArchive } from 'react-icons/vsc';
import { FcImageFile } from 'react-icons/fc';
import 'xterm/css/xterm.css';

declare global {
  interface Window {
    electronAPI: {
      spawnLocal: (id: string) => void;
      spawnSSH: (id: string, config: any) => void;
      onTerminalData: (id: string, callback: (data: string) => void) => void;
      sendToTerminal: (id: string, data: string) => void;
      resizeTerminal: (id: string, cols: number, rows: number) => void;
      closeTerminal: (id: string) => void;
      selectFile: () => Promise<string | null>;
      selectUploadFiles: () => Promise<string[] | null>;
      getFonts: () => Promise<string[]>;
      testSSHConnection: (config: any) => Promise<{ success: boolean, message: string }>;
      initSftp: (id: string) => Promise<{ success: boolean, message?: string }>;
      listSftpDir: (id: string, remotePath: string) => Promise<{ success: boolean, files?: any[], message?: string }>;
      uploadSftpFile: (id: string, localPath: string, remotePath: string) => Promise<{ success: boolean, message?: string }>;
      downloadSftpFile: (id: string, remotePath: string, fileName: string) => Promise<{ success: boolean, message?: string }>;
      deleteSftpFile: (id: string, remotePath: string, isDirectory: boolean) => Promise<{ success: boolean, message?: string }>;
      renameSftpFile: (id: string, oldPath: string, newPath: string) => Promise<{ success: boolean, message?: string }>;
      getSshStats: (id: string) => Promise<{ success: boolean, data?: { cpu: number, memTotal: number, memUsed: number, diskTotal: number, diskUsed: number } }>;
      readSftpFile: (id: string, remotePath: string) => Promise<{ success: boolean, data?: string, message?: string }>;
      writeSftpFile: (id: string, remotePath: string, content: string) => Promise<{ success: boolean, message?: string }>;
      openInLocalEditor: (id: string, remotePath: string, customEditor?: string) => Promise<{ success: boolean, message?: string, localPath?: string }>;
      vaultEncrypt: (text: string, password: string) => Promise<{ success: boolean, data?: string, message?: string }>;
      vaultDecrypt: (cipherText: string, password: string) => Promise<{ success: boolean, data?: string, message?: string }>;
    };
  }
}

export {};

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  foreground: string;
  background: string;
}

interface TerminalProps {
  id: string;
  type: 'local' | 'ssh';
  config?: any;
  isActive: boolean;
  settings?: TerminalSettings;
}

const defaultTermSettings: TerminalSettings = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  foreground: '#ffffff',
  background: 'var(--bg-panel)'
};

const getFileIcon = (filename: string, isDirectory: boolean) => {
  if (isDirectory) return <VscFolder size={18} color="#42a5f5" style={{ marginRight: '6px' }} />;
  
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const size = 16;
  const style = { marginRight: '8px' };
  
  if (filename === 'package.json') return <SiJson size={size} color="#cb3837" style={style} />;
  
  switch (ext) {
    case 'js': return <SiJavascript size={size} color="#f1e05a" style={style} />;
    case 'jsx': case 'tsx': return <SiReact size={size} color="#61dafb" style={style} />;
    case 'ts': return <SiTypescript size={size} color="#3178c6" style={style} />;
    case 'json': return <SiJson size={size} color="#cb3837" style={style} />;
    case 'md': return <SiMarkdown size={size} color="#58a6ff" style={style} />;
    case 'py': return <SiPython size={size} color="#3572A5" style={style} />;
    case 'sh': case 'bash': return <SiGnubash size={size} color="#89e051" style={style} />;
    case 'yml': case 'yaml': return <SiYaml size={size} color="#cb171e" style={style} />;
    case 'html': return <SiHtml5 size={size} color="#e34c26" style={style} />;
    case 'css': return <SiCss size={size} color="#563d7c" style={style} />;
    case 'java': return <FaJava size={size} color="#b07219" style={style} />;
    case 'cpp': case 'c': return <SiCplusplus size={size} color="#f34b7d" style={style} />;
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return <FcImageFile size={size} style={style} />;
    case 'zip': case 'tar': case 'gz': case 'rar': return <VscArchive size={size} color="#ffb300" style={style} />;
    case 'env': return <VscSettingsGear size={size} color="#8bc34a" style={style} />;
    case 'conf': case 'ini': return <VscSettingsGear size={size} color="#607d8b" style={style} />;
    case 'pem': case 'key': return <VscSymbolKey size={size} color="#ff9800" style={style} />;
    case 'lock': return <VscLock size={size} color="#e0e0e0" style={style} />;
    default: return <VscFile size={size} color="#aaa" style={style} />;
  }
};

const SvgIcon = ({ children, color, hoverColor, onClick, title }: any) => {
  const [hover, setHover] = useState(false);
  return (
    <span 
      onClick={onClick} title={title}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        cursor: 'pointer', padding: '4px',
        color: hover ? (hoverColor || color) : color, transition: 'color 0.2s',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
      }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
};

const SftpViewer = ({ id, isActive, onClose }: { id: string, isActive: boolean, onClose?: () => void }) => {
  const [currentPath, setCurrentPath] = useState('.');
  const [files, setFiles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState('');
  
  // New File State
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  
  // Renaming State
  const [renamingFile, setRenamingFile] = useState<any>(null);
  const [renamingInput, setRenamingInput] = useState('');
  
  // Custom Editor State
  const [selectedEditor, setSelectedEditor] = useState(() => localStorage.getItem('kapocxterm-editor') || 'default');
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, file: any } | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const initAndLoad = async (path: string = '.') => {
    setIsLoading(true);
    setError(null);
    try {
      const initRes = await window.electronAPI.initSftp(id);
      if (!initRes.success) {
        throw new Error(initRes.message);
      }
      setIsReady(true);
      
      const listRes = await window.electronAPI.listSftpDir(id, path);
      if (!listRes.success) {
        throw new Error(listRes.message);
      }
      
      setFiles(listRes.files || []);
      setCurrentPath(path);
    } catch (e: any) {
      setError(e.message || 'Failed to load directory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isActive && !isReady && !isLoading) {
      initAndLoad(currentPath);
    }
  }, [isActive, isReady]);

  const handleNavigate = (path: string) => {
    let target = path;
    if (path === '..') {
      const parts = currentPath.replace(/\/$/, '').split('/');
      parts.pop();
      target = parts.length === 0 ? '/' : parts.join('/');
      if (target === '') target = '/';
    } else if (!path.startsWith('/')) {
      target = currentPath === '.' ? path : `${currentPath.replace(/\/$/, '')}/${path}`;
    }
    initAndLoad(target);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!isReady) return;
    
    const localFiles = Array.from(e.dataTransfer.files) as File[];
    if (localFiles.length === 0) return;

    setIsLoading(true);
    try {
      for (const file of localFiles) {
        const localPath = (file as any).path;
        if (!localPath) continue;
        
        const remotePath = currentPath === '.' || currentPath === '/' 
            ? `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${file.name}` 
            : `${currentPath}/${file.name}`;
            
        const res = await window.electronAPI.uploadSftpFile(id, localPath, remotePath);
        if (!res.success) {
          alert(`Upload failed: ${res.message}`);
        }
      }
      await initAndLoad(currentPath);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualUpload = async () => {
    if (!isReady) return;
    const filePaths = await window.electronAPI.selectUploadFiles();
    if (!filePaths || filePaths.length === 0) return;

    setIsLoading(true);
    try {
      for (const localPath of filePaths) {
        const fileName = localPath.split(/[/\\]/).pop();
        if (!fileName) continue;
        
        const remotePath = currentPath === '.' || currentPath === '/' 
            ? `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${fileName}` 
            : `${currentPath}/${fileName}`;
            
        const res = await window.electronAPI.uploadSftpFile(id, localPath, remotePath);
        if (!res.success) {
          alert(`Upload failed for ${fileName}: ${res.message}`);
        }
      }
      await initAndLoad(currentPath);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (file: any) => {
    const remotePath = `${currentPath === '.' || currentPath === '/' ? (currentPath.endsWith('/') ? currentPath : currentPath + '/') : currentPath + '/'}${file.name}`;
    setIsLoading(true);
    const res = await window.electronAPI.downloadSftpFile(id, remotePath, file.name);
    setIsLoading(false);
    if (!res.success && res.message !== 'Canceled') {
      alert(`Download failed: ${res.message}`);
    }
  };

  const handleDelete = async (file: any) => {
    if (!confirm(`Delete ${file.name}?`)) return;
    
    const remotePath = `${currentPath === '.' || currentPath === '/' ? (currentPath.endsWith('/') ? currentPath : currentPath + '/') : currentPath + '/'}${file.name}`;
    setIsLoading(true);
    const res = await window.electronAPI.deleteSftpFile(id, remotePath, file.isDirectory);
    if (!res.success) {
      alert(`Delete failed: ${res.message}`);
      setIsLoading(false);
    } else {
      await initAndLoad(currentPath);
    }
  };

  const handleEdit = async (file: any) => {
    const remotePath = currentPath === '.' || currentPath === '/' 
      ? `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${file.name}` 
      : `${currentPath}/${file.name}`;
      
    try {
      setSyncStatus(`Abriendo ${file.name}...`);
      const res = await window.electronAPI.openInLocalEditor(id, remotePath, selectedEditor);
      if (!res.success) {
        setError(`Error abriendo editor local: ${res.message}`);
        setTimeout(() => setError(''), 3000);
      } else {
        setSyncStatus(`¡${file.name} sincronizado! Guardalo en tu editor para subir cambios.`);
        setTimeout(() => setSyncStatus(''), 5000);
      }
    } catch (e: any) {
      setError(`Error IPC: ${e.message}`);
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleNewFileSubmit = () => {
    if (!newFileName.trim()) {
      setIsCreatingFile(false);
      return;
    }
    const fileName = newFileName.trim();
    const remotePath = currentPath === '.' || currentPath === '/' 
            ? `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${fileName}` 
            : `${currentPath}/${fileName}`;
            
    setIsCreatingFile(false);
    setNewFileName('');
    window.electronAPI.writeSftpFile(id, remotePath, '').then(() => {
      initAndLoad(currentPath);
      handleEdit({ name: fileName, isDirectory: false });
    });
  };

  const handleRenameSubmit = async (file: any) => {
    if (!renamingInput.trim() || renamingInput === file.name) {
      setRenamingFile(null);
      return;
    }
    const oldPath = currentPath === '.' || currentPath === '/' 
      ? `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${file.name}` 
      : `${currentPath}/${file.name}`;
    const newPath = currentPath === '.' || currentPath === '/' 
      ? `${currentPath.endsWith('/') ? currentPath : currentPath + '/'}${renamingInput.trim()}` 
      : `${currentPath}/${renamingInput.trim()}`;
    
    setRenamingFile(null);
    try {
      const res = await window.electronAPI.renameSftpFile(id, oldPath, newPath);
      if (!res.success) {
        setError(`Error renombrando: ${res.message}`);
        setTimeout(() => setError(''), 3000);
      } else {
        initAndLoad(currentPath);
      }
    } catch (e: any) {
      setError(`Error IPC: ${e.message}`);
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div 
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-panel)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-muted)',
        fontSize: '0.85rem',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-editor)' }}>
        <SvgIcon onClick={() => initAndLoad(currentPath)} title="Refresh" color="#4caf50" hoverColor="#81c784">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
        </SvgIcon>
        <SvgIcon onClick={handleManualUpload} title="Upload Files" color="#2196f3" hoverColor="#64b5f6">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </SvgIcon>
        <SvgIcon onClick={() => { setIsCreatingFile(true); setNewFileName(''); }} title="Nuevo Archivo" color="#00bcd4" hoverColor="#4dd0e1">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/>
        </SvgIcon>
        <div style={{ marginLeft: '5px' }}>
          <select 
            value={selectedEditor}
            onChange={(e) => {
              setSelectedEditor(e.target.value);
              localStorage.setItem('kapocxterm-editor', e.target.value);
            }}
            title="Seleccionar Editor Local"
            style={{ backgroundColor: 'var(--bg-input)', color: 'var(--text-muted)', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.75rem', padding: '2px 4px', maxWidth: '80px' }}
          >
            <option value="default">Sistema</option>
            <option value="Visual Studio Code">VS Code</option>
            <option value="Cursor">Cursor</option>
            <option value="Sublime Text">Sublime</option>
            <option value="TextEdit">TextEdit</option>
          </select>
        </div>
        <div style={{ flex: 1 }} />
        {onClose && (
          <SvgIcon onClick={onClose} title="Cerrar Panel" color="#aaa" hoverColor="var(--text-main)">
            <path d="M18 6L6 18M6 6l12 12"/>
          </SvgIcon>
        )}
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {syncStatus && <div style={{ color: '#4caf50', padding: '10px', fontSize: '0.8rem', backgroundColor: 'var(--bg-hover)' }}>✨ {syncStatus}</div>}
        {error && <div style={{ color: '#f48771', padding: '10px' }}>{error}</div>}
        {isLoading && !error && <div style={{ padding: '10px', textAlign: 'center' }}>Loading...</div>}
        
        {!isLoading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              {isCreatingFile && (
                <tr style={{ borderBottom: '1px solid var(--bg-hover)', backgroundColor: 'var(--bg-editor)' }}>
                  <td style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.2em', marginRight: '5px' }}>📄</span>
                    <input 
                      type="text" 
                      autoFocus
                      value={newFileName}
                      onChange={(e) => setNewFileName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNewFileSubmit();
                        if (e.key === 'Escape') setIsCreatingFile(false);
                      }}
                      onBlur={() => setIsCreatingFile(false)}
                      placeholder="filename.txt"
                      style={{ 
                        flex: 1, backgroundColor: 'var(--bg-panel)', color: 'var(--text-muted)', 
                        border: '1px solid var(--accent)', outline: 'none', padding: '2px 4px' 
                      }}
                    />
                  </td>
                </tr>
              )}
              {currentPath !== '.' && currentPath !== '/' && (
                <tr 
                  onDoubleClick={() => handleNavigate('..')}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--bg-hover)' }}
                >
                  <td style={{ padding: '4px 8px' }}>📁 ..</td>
                </tr>
              )}
              {files.map((f, i) => (
                <tr 
                  key={i} 
                  onDoubleClick={() => f.isDirectory ? handleNavigate(f.name) : handleEdit(f)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file: f }); }}
                  style={{ cursor: 'pointer', borderBottom: '1px solid var(--bg-hover)' }}
                >
                  <td style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '16px' }}>
                      {getFileIcon(f.name, f.isDirectory)}
                    </div>
                    <div style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={f.name}>
                      {renamingFile && renamingFile.name === f.name ? (
                        <input
                          autoFocus
                          value={renamingInput}
                          onChange={(e) => setRenamingInput(e.target.value)}
                          onBlur={() => handleRenameSubmit(f)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setRenamingFile(null);
                            if (e.key === 'Enter') handleRenameSubmit(f);
                          }}
                          style={{ width: '100%', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: '1px solid var(--accent)', padding: '2px 4px', borderRadius: '2px', outline: 'none' }}
                        />
                      ) : (
                        f.name
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Path Breadcrumbs Footer */}
      <div style={{ 
        padding: '8px 12px', 
        borderTop: '1px solid var(--border-color)', 
        backgroundColor: 'var(--bg-editor)', 
        fontSize: '0.85rem', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px',
        overflowX: 'auto',
        whiteSpace: 'nowrap'
      }}>
        <VscFolder color="#dcb67a" size={16} style={{ flexShrink: 0 }} />
        {(() => {
          if (currentPath === '.' || currentPath === '') {
            return <span style={{ cursor: 'pointer', color: 'var(--text-main)', fontWeight: 'bold' }} onClick={() => initAndLoad('/')}>/</span>;
          }
          const parts = currentPath.split('/').filter(Boolean);
          let accumulatedPath = '';
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span 
                onClick={() => initAndLoad('/')} 
                style={{ cursor: 'pointer', color: 'var(--text-muted)' }} 
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'} 
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
              >/</span>
              {parts.map((part, idx) => {
                accumulatedPath += '/' + part;
                const target = accumulatedPath;
                const isLast = idx === parts.length - 1;
                return (
                  <React.Fragment key={idx}>
                    <span style={{ color: '#555' }}>›</span>
                    <span 
                      onClick={() => initAndLoad(target)} 
                      style={{ cursor: 'pointer', color: isLast ? 'var(--text-main)' : 'var(--text-muted)', fontWeight: isLast ? 'bold' : 'normal' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-main)'; e.currentTarget.style.textDecoration = 'underline'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = isLast ? 'var(--text-main)' : 'var(--text-muted)'; e.currentTarget.style.textDecoration = 'none'; }}
                    >
                      {part}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          );
        })()}
      </div>
      
      <style>{`
        tr:hover { background-color: var(--bg-hover); }
      `}</style>
      
      {contextMenu && (
        <div 
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            backgroundColor: 'var(--bg-editor)',
            border: '1px solid #454545',
            boxShadow: '0 4px 15px var(--overlay)',
            borderRadius: '4px',
            zIndex: 9999,
            minWidth: '150px',
            display: 'flex',
            flexDirection: 'column',
            padding: '4px 0',
            fontSize: '0.9rem'
          }}
        >
          <div style={{ padding: '5px 15px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 'bold' }}>
            {contextMenu.file.name.length > 15 ? contextMenu.file.name.substring(0, 15) + '...' : contextMenu.file.name}
          </div>
          {!contextMenu.file.isDirectory && (
            <div 
              onClick={() => { handleEdit(contextMenu.file); setContextMenu(null); }}
              style={{ padding: '8px 15px', cursor: 'pointer', color: 'var(--text-muted)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0060c0'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              ✏️ Editar
            </div>
          )}
          <div 
            onClick={() => { 
              setRenamingFile(contextMenu.file); 
              setRenamingInput(contextMenu.file.name); 
              setContextMenu(null); 
            }}
            style={{ padding: '8px 15px', cursor: 'pointer', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0060c0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            📝 Renombrar
          </div>
          <div 
            onClick={() => { handleDownload(contextMenu.file); setContextMenu(null); }}
            style={{ padding: '8px 15px', cursor: 'pointer', color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0060c0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            ⬇️ Descargar
          </div>
          <div 
            onClick={() => { handleDelete(contextMenu.file); setContextMenu(null); }}
            style={{ padding: '8px 15px', cursor: 'pointer', color: '#f48771', borderTop: '1px solid var(--border-color)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#0060c0'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            🗑️ Eliminar
          </div>
        </div>
      )}
    </div>
  );
};

export const TerminalComponent: React.FC<TerminalProps> = ({ id, type, config, isActive, settings = defaultTermSettings }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isInitialized = useRef(false);
  const [showSftp, setShowSftp] = useState(false);
  const [sftpWidth, setSftpWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (isActive && fitAddonRef.current && !isResizing) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
      }, 250); // wait for css transition
    }
  }, [showSftp, isActive]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = Math.max(150, Math.min(rect.right - e.clientX, rect.width - 100));
      setSftpWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      setTimeout(() => fitAddonRef.current?.fit(), 50);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const [stats, setStats] = useState<{ cpu: number, memTotal: number, memUsed: number, diskTotal: number, diskUsed: number } | null>(null);

  useEffect(() => {
    if (!isActive || type !== 'ssh') return;
    let mounted = true;
    const fetchStats = async () => {
      try {
        const res = await window.electronAPI.getSshStats(id);
        if (mounted && res.success && res.data) {
          setStats(res.data);
        }
      } catch (e) {
        // ignore stats errors
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isActive, type, id]);

  // Get true hex color from CSS variables for xterm
  const getComputedColor = (color: string | undefined) => {
    if (!color) return undefined;
    if (color.startsWith('var(')) {
      const varName = color.match(/var\(([^)]+)\)/)?.[1]?.trim();
      if (varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
      }
    }
    return color;
  };

  useEffect(() => {
    if (!terminalRef.current || isInitialized.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: settings?.fontSize || 14,
      fontFamily: settings?.fontFamily || 'monospace',
      theme: {
        background: getComputedColor(settings?.background) || '#1e1e1e',
        foreground: getComputedColor(settings?.foreground) || '#ffffff',
      }
    });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      
      term.open(terminalRef.current);

      setTimeout(() => {
        if (isActive && terminalRef.current && terminalRef.current.clientWidth > 0) {
          try {
            fitAddon.fit();
          } catch (e) {
            console.warn('fitAddon failed', e);
          }
        }
      }, 50);

      xtermRef.current = term;
      fitAddonRef.current = fitAddon;

      window.electronAPI.onTerminalData(id, (data: string) => {
        term.write(data);
      });

      if (type === 'local') {
        window.electronAPI.spawnLocal(id);
      } else {
        term.write(`\x1b[36mConnecting to ${config?.username}@${config?.host}...\x1b[0m\r\n`);
        window.electronAPI.spawnSSH(id, config);
      }

      term.onData((data) => {
        window.electronAPI.sendToTerminal(id, data);
      });

      const handleResize = () => {
        if (terminalRef.current?.offsetParent && terminalRef.current.clientWidth > 0 && isActive) {
          try {
            fitAddon.fit();
            window.electronAPI.resizeTerminal(id, term.cols, term.rows);
          } catch (e) {}
        }
      };

      window.addEventListener('resize', handleResize);
      isInitialized.current = true;

    return () => {
      if (isInitialized.current) {
        window.electronAPI.closeTerminal(id);
      }
    };
  }, []);

  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (e) {}
      }, 50);
    }
  }, [isActive]);

  useEffect(() => {
    if (xtermRef.current && isInitialized.current) {
      if (settings?.fontSize) xtermRef.current.options.fontSize = settings.fontSize;
        if (xtermRef.current) {
          xtermRef.current.options.fontSize = settings.fontSize || 14;
          xtermRef.current.options.fontFamily = settings.fontFamily || 'monospace';
          xtermRef.current.options.theme = {
            background: getComputedColor(settings.background) || '#1e1e1e',
            foreground: getComputedColor(settings.foreground) || '#ffffff',
          };
          
          setTimeout(() => {
            try {
              if (isActive && terminalRef.current && terminalRef.current.clientWidth > 0) {
                fitAddonRef.current?.fit();
              }
            } catch (e) {}
          }, 50);
        }
    }
  }, [settings]);

  useEffect(() => {
    if (isActive && fitAddonRef.current && terminalRef.current && xtermRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
          window.electronAPI.resizeTerminal(id, xtermRef.current!.cols, xtermRef.current!.rows);
        } catch (e) {}
      }, 50);
    }
  }, [isActive, id]);

  return (
    <div ref={containerRef} style={{ 
      display: 'flex',
      flexDirection: 'column',
      width: '100%', 
      height: '100%', 
      position: 'absolute',
      top: isActive ? 0 : '-9999px',
      left: isActive ? 0 : '-9999px',
      opacity: isActive ? 1 : 0,
      zIndex: isActive ? 1 : -1,
      overflow: 'hidden',
      backgroundColor: settings?.background
    }}>
      
      {/* Main Terminal + SFTP Area */}
      <div style={{ display: 'flex', flex: 1, width: '100%', position: 'relative', overflow: 'hidden' }}>
        
        {/* Terminal Area */}
        <div style={{ flex: 1, position: 'relative', height: '100%', minWidth: 0 }}>
          <div ref={terminalRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />
        </div>

        {/* SFTP Collapsible Drawer */}
        <div style={{
          position: 'relative',
          width: showSftp ? `${sftpWidth}px` : '0px',
          height: '100%',
          zIndex: 50,
          transition: isResizing ? 'none' : 'width 0.2s ease-in-out',
          backgroundColor: 'var(--bg-panel)',
          borderLeft: showSftp ? '1px solid var(--border-color)' : 'none',
          flexShrink: 0
        }}>
          
          {/* Resize Handle Area */}
          <div 
            style={{
              position: 'absolute',
              top: 0,
              left: '-3px',
              width: '6px',
              height: '100%',
              cursor: showSftp ? 'col-resize' : 'default',
              backgroundColor: isResizing ? 'var(--accent)' : 'transparent',
              transition: 'background-color 0.2s',
              zIndex: 60,
            }}
            onMouseDown={(e) => {
              if (showSftp) {
                e.preventDefault();
                setIsResizing(true);
              }
            }}
          />

          {/* Solapa / Tab */}
          <div
            onClick={() => setShowSftp(!showSftp)}
            title="Explorador de Archivos (SFTP)"
            style={{
              position: 'absolute',
              top: '20px',
              left: '-38px',
              width: '38px',
              backgroundColor: showSftp ? 'var(--bg-input)' : 'var(--accent)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-light)',
              borderRight: showSftp ? 'none' : '1px solid var(--accent)',
              borderRadius: '4px 0 0 4px',
              padding: '12px 0px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '-2px 2px 10px rgba(0,0,0,0.4)',
              opacity: showSftp ? 0.8 : 1,
              transition: 'all 0.2s ease',
              zIndex: 61,
            }}
            onMouseEnter={(e) => {
               e.currentTarget.style.opacity = '1';
               e.currentTarget.style.backgroundColor = showSftp ? 'var(--border-color)' : '#0098ff';
            }}
            onMouseLeave={(e) => {
               e.currentTarget.style.opacity = showSftp ? '0.8' : '1';
               e.currentTarget.style.backgroundColor = showSftp ? 'var(--bg-input)' : 'var(--accent)';
            }}
          >
            <VscFolder color={showSftp ? '#aaa' : 'var(--text-main)'} size={20} />
          </div>

          {/* SFTP Content Wrapper */}
          <div style={{ width: `${sftpWidth}px`, height: '100%', overflow: 'hidden' }}>
            {type === 'ssh' && (
              <SftpViewer id={id} isActive={showSftp && isActive} onClose={() => setShowSftp(false)} />
            )}
          </div>
        </div>
      </div>

      {/* Footer / Status Bar */}
      {type === 'ssh' && (
        <div style={{
          height: '24px',
          backgroundColor: 'var(--accent)',
          color: 'var(--text-main)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          fontSize: '0.75rem',
          borderTop: '1px solid #111',
          zIndex: 70
        }}>
          
          <div style={{ opacity: 0.8, fontStyle: 'italic', letterSpacing: '0.5px' }}>
            Developed by Kappsco 2026
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            {stats ? (
            <>
              {/* Disk Status */}
              {stats.diskTotal > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`Disk Usage (/): ${(stats.diskUsed/1024).toFixed(1)}GB / ${(stats.diskTotal/1024).toFixed(1)}GB`}>
                  <FaHdd size={18} color="#FFD700" style={{ filter: 'drop-shadow(0px 1px 2px var(--overlay))' }} />
                  <div style={{ width: '80px', height: '10px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ 
                      position: 'absolute', top: 0, left: 0, height: '100%', 
                      width: `${Math.min(100, (stats.diskUsed / stats.diskTotal) * 100)}%`, 
                      backgroundColor: (stats.diskUsed / stats.diskTotal) > 0.85 ? '#f44336' : (stats.diskUsed / stats.diskTotal) > 0.65 ? '#ff9800' : '#4caf50',
                      transition: 'width 1s ease-in-out'
                    }} />
                  </div>
                  <span style={{ width: '80px', textAlign: 'right', fontWeight: 600 }}>{(stats.diskUsed/1024).toFixed(1)}/{(stats.diskTotal/1024).toFixed(1)}GB</span>
                </div>
              )}

              {/* RAM Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`RAM Usage: ${(stats.memUsed/1024).toFixed(1)}GB / ${(stats.memTotal/1024).toFixed(1)}GB`}>
                <FaMemory size={18} color="#00FFFF" style={{ filter: 'drop-shadow(0px 1px 2px var(--overlay))' }} />
                <div style={{ width: '80px', height: '10px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ 
                    position: 'absolute', top: 0, left: 0, height: '100%', 
                    width: `${Math.min(100, (stats.memUsed / stats.memTotal) * 100)}%`, 
                    backgroundColor: (stats.memUsed / stats.memTotal) > 0.85 ? '#f44336' : (stats.memUsed / stats.memTotal) > 0.65 ? '#ff9800' : '#4caf50',
                    transition: 'width 1s ease-in-out'
                  }} />
                </div>
                <span style={{ width: '80px', textAlign: 'right', fontWeight: 600 }}>{(stats.memUsed/1024).toFixed(1)}/{(stats.memTotal/1024).toFixed(1)}GB</span>
              </div>

              {/* CPU Status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`CPU Usage: ${stats.cpu.toFixed(1)}%`}>
                <FaMicrochip size={18} color="#FF5722" style={{ filter: 'drop-shadow(0px 1px 2px var(--overlay))' }} />
                <div style={{ width: '80px', height: '10px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '5px', overflow: 'hidden', position: 'relative' }}>
                  <div style={{ 
                    position: 'absolute', top: 0, left: 0, height: '100%', 
                    width: `${Math.min(100, stats.cpu)}%`, 
                    backgroundColor: stats.cpu > 80 ? '#f44336' : stats.cpu > 50 ? '#ff9800' : '#4caf50',
                    transition: 'width 1s ease-in-out'
                  }} />
                </div>
                <span style={{ width: '45px', textAlign: 'right' }}>{stats.cpu.toFixed(1)}%</span>
              </div>
            </>
          ) : (
            <span style={{ color: 'var(--text-main)' }}>Monitoreando estado del servidor...</span>
          )}
          </div>
        </div>
      )}

    </div>
  );
};
