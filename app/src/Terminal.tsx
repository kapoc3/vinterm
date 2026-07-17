import React, { useEffect, useRef, useState } from 'react'

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SiJavascript, SiTypescript, SiPython, SiHtml5, SiCss, SiMarkdown, SiJson, SiGnubash, SiReact, SiYaml, SiCplusplus } from 'react-icons/si';
import { FaJava, FaMicrochip, FaMemory, FaHdd } from 'react-icons/fa';
import { VscFile, VscFolder, VscSettingsGear, VscSymbolKey, VscLock, VscArchive, VscSparkle } from 'react-icons/vsc';
import { FcImageFile } from 'react-icons/fc';
import 'xterm/css/xterm.css';
import { t } from './i18n';

declare global {
  interface Window {
    electronAPI: {
      spawnLocal: (id: string) => void;
      spawnSSH: (id: string, config: any) => void;
      spawnGCP: (id: string, config: any) => void;
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
      mkdir: (id: string, remotePath: string) => Promise<{ success: boolean, message?: string }>;
      vaultEncrypt: (text: string, password: string) => Promise<{ success: boolean, data?: string, message?: string }>;
      vaultDecrypt: (cipherText: string, password: string) => Promise<{ success: boolean, data?: string, message?: string }>;
    };
  }
}

export {};

export interface AiProfile {
  id: string;
  name: string;
  provider: 'openai' | 'ollama' | 'deepseek' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiAgent {
  id: string;
  name: string;
  systemPrompt: string;
}

export interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  foreground: string;
  background: string;
  language?: 'en' | 'es';
  aiProfiles?: AiProfile[];
  activeAiProfileId?: string;
  aiAgents?: AiAgent[];
  activeAiAgentId?: string;
  
  // Legacy
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiProvider?: 'openai' | 'ollama' | 'deepseek' | 'custom';
}

interface TerminalProps {
  id: string;
  type: 'local' | 'ssh' | 'gcp';
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
  
  const handleMkdir = async (folderName: string) => {
    if (!folderName.trim()) return;
    const targetPath = currentPath.endsWith('/') ? `${currentPath}${folderName.trim()}` : `${currentPath}/${folderName.trim()}`;
    setIsLoading(true);
    const res = await window.electronAPI.mkdir(id, targetPath);
    setIsLoading(false);
    if (!res.success) {
      setError(`Mkdir failed: ${res.message}`);
      setTimeout(() => setError(''), 3000);
    } else {
      initAndLoad(currentPath);
    }
  };
  
  // New File State
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleNewFolderSubmit = async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      return;
    }
    await handleMkdir(newFolderName.trim());
    setIsCreatingFolder(false);
    setNewFolderName('');
  };
  
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
    try {
      const res = await window.electronAPI.deleteSftpFile(id, remotePath, file.isDirectory);
      if (!res.success) {
        alert(`Delete failed: ${res.message}`);
      } else {
        await initAndLoad(currentPath);
      }
    } catch (e: any) {
      alert(`Delete error: ${e.message}`);
    } finally {
      setIsLoading(false);
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
      
      <div 
        className="sftp-file-list" 
        style={{ flex: 1, overflowY: 'auto' }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'DIV' && (e.target as HTMLElement).style.flex === '1') {
            setContextMenu({ x: e.clientX, y: e.clientY, file: null });
          }
        }}
      >
        {syncStatus && <div style={{ color: '#4caf50', padding: '10px', fontSize: '0.8rem', backgroundColor: 'var(--bg-hover)' }}>✨ {syncStatus}</div>}
        {error && <div style={{ color: '#f48771', padding: '10px' }}>{error}</div>}
        {isLoading && !error && <div style={{ padding: '10px', textAlign: 'center' }}>Loading...</div>}
        
        {!isLoading && !error && (
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <tbody>
              {isCreatingFolder && (
                <tr style={{ borderBottom: '1px solid var(--bg-hover)', backgroundColor: 'var(--bg-editor)' }}>
                  <td style={{ padding: '4px 8px', display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.2em', marginRight: '5px' }}>📁</span>
                    <input 
                      type="text" 
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleNewFolderSubmit();
                        if (e.key === 'Escape') setIsCreatingFolder(false);
                      }}
                      onBlur={() => setIsCreatingFolder(false)}
                      placeholder="nombre_carpeta"
                      style={{ 
                        flex: 1, backgroundColor: 'var(--bg-panel)', color: 'var(--text-muted)', 
                        border: '1px solid var(--accent)', outline: 'none', padding: '2px 4px' 
                      }}
                    />
                  </td>
                  <td></td><td></td>
                </tr>
              )}
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
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, file: f }); }}
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
          {contextMenu.file ? (
            <>
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
            </>
          ) : (
            <div 
              onClick={() => { 
                setContextMenu(null); 
                setIsCreatingFolder(true);
                setNewFolderName('');
              }}
              style={{ padding: '8px 15px', cursor: 'pointer', color: 'var(--text-muted)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              📁 Crear Carpeta
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TypewriterText = ({ text, animate }: { text: string, animate: boolean }) => {
  const [currentText, setCurrentText] = useState(animate ? '' : text);

  useEffect(() => {
    if (!animate) {
      setCurrentText(text);
      return;
    }
    
    let i = 0;
    const interval = setInterval(() => {
      setCurrentText(text.substring(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 15);
    return () => clearInterval(interval);
  }, [text, animate]);

  return <>{currentText}</>;
};

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: string; };

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const FIXED_AGENTS: AiAgent[] = [
  {
    id: 'agent_devops',
    name: 'Vincent AI (DevOps)',
    systemPrompt: 'Eres Vincent AI, un ingeniero DevOps y SysAdmin Senior de élite experto en servidores Linux, redes y entornos de consola. Tu objetivo es ayudar al usuario a administrar su sistema y resolver problemas con la máxima eficiencia y seguridad.'
  },
  {
    id: 'agent_meta',
    name: 'Creador de Agentes (Meta)',
    systemPrompt: 'Eres un experto Creador de Agentes de IA. El usuario te dará una descripción en lenguaje natural de la personalidad, rol o tarea que necesita automatizar. Tu trabajo es responder ÚNICAMENTE con el "System Prompt" ideal, detallado y altamente efectivo que el usuario debe configurar para ese nuevo agente. No incluyas saludos ni explicaciones, solo devuelve el texto del System Prompt listo para copiar y pegar.'
  }
];

const AiDrawer = ({ id, isActive, onClose, settings, getTerminalContext }: { id: string, isActive: boolean, onClose?: () => void, settings: TerminalSettings, getTerminalContext?: () => string }) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(settings?.activeAiProfileId || '');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(settings?.activeAiAgentId || '');
  
  const activeProfile = settings?.aiProfiles?.find(p => p.id === (selectedProfileId || settings?.activeAiProfileId)) 
    || settings?.aiProfiles?.[0] 
    || { provider: settings?.aiProvider || 'openai', baseUrl: settings?.aiBaseUrl || 'https://api.openai.com/v1', apiKey: settings?.aiApiKey || '', model: settings?.aiModel || 'gpt-4o-mini', name: 'Legacy', id: 'legacy' };

  const allAgents = [...FIXED_AGENTS, ...(settings?.aiAgents || [])];
  
  const activeAgent = allAgents.find(a => a.id === (selectedAgentId || settings?.activeAiAgentId))
    || FIXED_AGENTS[0];


  const apiKey = activeProfile.apiKey;
  const baseUrl = activeProfile.baseUrl;
  const model = activeProfile.model;
  const provider = activeProfile.provider;
  
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(model);
  const [fetchingModels, setFetchingModels] = useState(false);
  
  const [autoMode, setAutoMode] = useState(false);
  const [isAutoLooping, setIsAutoLooping] = useState(false);
  const isAutoLoopingRef = useRef(false);
  
  const [showHistory, setShowHistory] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  // Load history on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('vincent_chat_history');
      if (stored) {
        setSessions(JSON.parse(stored));
      }
    } catch (e) {}
  }, []);

  // Save history whenever messages change
  useEffect(() => {
    if (messages.length === 0) return;
    
    setSessions(prev => {
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = Date.now().toString();
        setCurrentSessionId(sessionId);
      }
      
      const title = messages[0].content.slice(0, 40) + (messages[0].content.length > 40 ? '...' : '');
      const existingIdx = prev.findIndex(s => s.id === sessionId);
      
      let newSessions = [...prev];
      if (existingIdx >= 0) {
        newSessions[existingIdx] = { ...newSessions[existingIdx], messages, updatedAt: Date.now() };
      } else {
        newSessions.unshift({ id: sessionId, title, updatedAt: Date.now(), messages });
      }
      
      // Sort by newest first
      newSessions.sort((a, b) => b.updatedAt - a.updatedAt);
      
      try {
        localStorage.setItem('vincent_chat_history', JSON.stringify(newSessions));
      } catch (e) {}
      
      return newSessions;
    });
  }, [messages]);

  useEffect(() => {
    isAutoLoopingRef.current = isAutoLooping;
  }, [isAutoLooping]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedModel(model);
  }, [model]);

  useEffect(() => {
    if (!isActive) return;
    let mounted = true;
    
    const fetchModels = async () => {
      setFetchingModels(true);
      setAvailableModels([]); // clear old models
      try {
        if (provider === 'ollama') {
          const res = await (window as any).electronAPI.runOllamaList();
          if (res.success && mounted) {
            const lines = res.data.split('\n').filter((l: string) => l.trim() !== '');
            const models = lines.slice(1).map((l: string) => l.split(/\s+/)[0]);
            if (models.length > 0) {
              setAvailableModels(models);
            }
          }
        } else {
          if (!apiKey && provider !== 'custom') return;
          const headers: any = {};
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
          
          let url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          if (url.endsWith('/chat/completions')) url = url.replace('/chat/completions', '');
          
          const res = await fetch(`${url}/models`, { headers });
          if (res.ok && mounted) {
            const data = await res.json();
            if (data.data) {
              const models = data.data.map((m: any) => m.id);
              const chatModels = models.filter((m: string) => !m.includes('whisper') && !m.includes('tts') && !m.includes('dall-e') && !m.includes('embedding') && !m.includes('babbage') && !m.includes('davinci'));
              setAvailableModels(chatModels.length > 0 ? chatModels : models);
            }
          }
        }
      } catch (e) {
      } finally {
        if (mounted) setFetchingModels(false);
      }
    };
    
    fetchModels();
    return () => { mounted = false; };
  }, [isActive, provider, baseUrl, apiKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const extractCommand = (content: string) => {
    const match = content.match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/);
    if (match && match[1]) return match[1].trim();
    return content.trim();
  };

  const isConversational = (content: string) => {
    if (content.includes('```')) return false;
    const lines = content.trim().split('\n');
    if (lines.length > 4) return true;
    if (/^[A-Z¿¡].*[.!?]$/.test(lines[0])) return true;
    return false;
  };

  const executeCommand = (cmd: string) => {
    if (cmd) window.electronAPI.sendToTerminal(id, extractCommand(cmd) + "\r");
  };

  const startCommandObserver = () => {
    if (!getTerminalContext) {
      setIsAutoLooping(false);
      return;
    }
    
    let lastContext = getTerminalContext();
    let unchangedCount = 0;
    
    const checkInterval = setInterval(() => {
      if (!isAutoLoopingRef.current) {
        clearInterval(checkInterval);
        return;
      }
      
      const currentContext = getTerminalContext();
      if (currentContext !== lastContext) {
        lastContext = currentContext;
        unchangedCount = 0;
      } else {
        unchangedCount++;
      }
      
      const lines = currentContext.split('\n');
      const lastLine = lines[lines.length - 1] || '';
      const looksLikePrompt = /[$#%>]\s*$/.test(lastLine);
      
      if (unchangedCount >= 3 && looksLikePrompt) {
        clearInterval(checkInterval);
        const followUp = "El comando ha sido ejecutado. Por favor, revisa el nuevo contexto de la terminal. Si la tarea está completada, responde ÚNICAMENTE con [DONE]. Si no, proporciona el siguiente comando bash.";
        handleAsk(followUp);
      }
    }, 500);
  };

  const handleAsk = async (customPrompt?: string) => {
    const textToSubmit = customPrompt !== undefined ? customPrompt : prompt.trim();
    if (!textToSubmit || (provider !== 'ollama' && !apiKey.trim())) return;
    
    // Only show manual prompts in UI to avoid cluttering with system follow-ups
    if (customPrompt === undefined) {
      setMessages(prev => [...prev, { role: 'user', content: textToSubmit }]);
      setPrompt('');
    } else {
      // Add it to context but format it as a system action
      setMessages(prev => [...prev, { role: 'system', content: textToSubmit }]);
    }
    
    setLoading(true);
    setError('');
    
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey}`;
      
      let systemPrompt = activeAgent.systemPrompt;
      
      systemPrompt += `\n\nREGLAS ESTRICTAS DEL ENTORNO:
1. Responde SIEMPRE con comandos bash listos para ser ejecutados.
2. Si necesitas dar explicaciones, advertencias o contexto, DEBES escribir esas líneas comentadas (empezando con "#") para que la respuesta completa pueda ser ejecutada en la terminal sin errores de sintaxis.
3. NUNCA uses bloques de código markdown (\`\`\`) ni comillas invertidas.
4. PROHIBIDO sugerir comandos interactivos que abran editores o paginadores (nano, vim, vi, less, top). Usa SIEMPRE alternativas no interactivas (echo, cat, tee, sed, awk) para evitar que la terminal se bloquee.
5. Analiza el contexto de la terminal proporcionado para dar soluciones precisas a los errores.`;

      if (autoMode) {
        systemPrompt += `\n\nATENCIÓN - ESTÁS EN MODO AUTÓNOMO:\nSi la tarea requiere múltiples comandos, envía SOLO el siguiente comando bash a ejecutar (recuerda la regla de comentar explicaciones). El sistema lo ejecutará automáticamente y te devolverá el nuevo contexto de la terminal.\n\nCUANDO TERMINES LA TAREA (ya sea con éxito o si falló y no puedes continuar): No envíes más comandos. Escribe un ANÁLISIS FINAL (puedes omitir los comentarios "#" para este análisis) resumiendo qué hiciste, si el objetivo se logró o no, y por qué. Finalmente, en la ÚLTIMA LÍNEA de tu mensaje, debes escribir exactamente la palabra [DONE] para detener el agente.`;
      }

      const termContext = getTerminalContext ? getTerminalContext() : '';
      if (termContext) {
        systemPrompt += `\n\nHere is the recent context from the user's terminal session to help you understand their environment, recent errors, or context for their query:\n\`\`\`\n${termContext}\n\`\`\``;
      }
      
      // Filter out 'system' role messages for the API request if the provider doesn't support multiple system messages,
      // but OpenAI does support it or we can map them to 'user'. We will map internal 'system' updates to 'user'.
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role === 'system' ? 'user' : m.role, content: m.content })),
        { role: 'user', content: textToSubmit }
      ];
      
      let fetchUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      if (provider === 'ollama' && !fetchUrl.endsWith('/v1')) {
          if (fetchUrl.endsWith('/api')) fetchUrl = fetchUrl.slice(0, -4);
          fetchUrl = fetchUrl + '/v1';
      }
      if (fetchUrl.endsWith('/chat/completions')) fetchUrl = fetchUrl.replace('/chat/completions', '');
      
      const res = await (window as any).electronAPI.systemFetch(`${fetchUrl}/chat/completions`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          temperature: 0.1
        })
      });
      
      if (!res.success) {
        throw new Error(res.message || 'Error fetching response');
      }
      
      const data = res.data;
      const content = data.choices[0].message.content;
      const cleaned = content.replace(/^\s*```(bash|sh)?/gm, '').replace(/```\s*$/gm, '').trim();
      
      if (autoMode) {
        if (cleaned.includes('[DONE]')) {
          const finalAnalysis = cleaned.replace('[DONE]', '').trim();
          setMessages(prev => [...prev, { role: 'assistant', content: `✅ Tarea autónoma finalizada.\n\n${finalAnalysis}` }]);
          setIsAutoLooping(false);
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: cleaned }]);
          setIsAutoLooping(true);
          executeCommand(cleaned);
          startCommandObserver();
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: cleaned }]);
      }
    } catch (e: any) {
      setError(e.message);
      setIsAutoLooping(false);
    } finally {
      setLoading(false);
    }
  };

  const insertCommand = (cmd: string) => {
    if (cmd) window.electronAPI.sendToTerminal(id, extractCommand(cmd));
  };

  const startNewChat = () => {
    setMessages([]);
    setError('');
    setIsAutoLooping(false);
    setCurrentSessionId('');
    setShowHistory(false);
  };

  const loadSession = (session: ChatSession) => {
    setMessages(session.messages);
    setCurrentSessionId(session.id);
    setShowHistory(false);
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== id);
    setSessions(newSessions);
    try {
      localStorage.setItem('vincent_chat_history', JSON.stringify(newSessions));
    } catch (err) {}
    if (currentSessionId === id) {
      startNewChat();
    }
  };

  if (!isActive) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)', padding: '12px', borderLeft: '1px solid var(--border-light)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neon-green, #00ff00)' }}>
            <VscSparkle /> Vincent AI
          </h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <SvgIcon color="var(--text-muted)" hoverColor="var(--text-main)" onClick={() => setShowHistory(!showHistory)} title="Ver Historial">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
          </SvgIcon>
          <SvgIcon color="var(--text-muted)" hoverColor="var(--neon-green, #00ff00)" onClick={startNewChat} title="Nuevo Chat">
            <path d="M12 5v14M5 12h14"></path>
          </SvgIcon>
          <SvgIcon color="var(--text-muted)" hoverColor="var(--text-main)" onClick={() => { setIsAutoLooping(false); onClose?.(); }} title="Cerrar">
            <polyline points="18 15 12 9 6 15"></polyline>
          </SvgIcon>
        </div>
      </div>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '8px' }}>
        {showHistory ? (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-muted)' }}>Historial de Conversaciones</h4>
            {sessions.length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', marginTop: '20px' }}>
                No hay historial guardado.
              </div>
            )}
            {sessions.map(session => (
              <div 
                key={session.id} 
                onClick={() => loadSession(session)}
                style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px', backgroundColor: currentSessionId === session.id ? 'var(--accent)' : 'var(--bg-input)', 
                  border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' 
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                  <span style={{ fontSize: '11px', color: currentSessionId === session.id ? '#fff' : 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {session.title || 'Nueva conversación'}
                  </span>
                  <span style={{ fontSize: '9px', color: currentSessionId === session.id ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
                    {new Date(session.updatedAt).toLocaleString()}
                  </span>
                </div>
                <button 
                  onClick={(e) => deleteSession(e, session.id)}
                  style={{ background: 'none', border: 'none', color: '#f48771', cursor: 'pointer', padding: '4px' }}
                  title="Eliminar chat"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Chat History */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {messages.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', marginTop: '20px' }}>
                  Sin historial en esta sesión. ¿En qué te ayudo?
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : (msg.role === 'system' ? 'center' : 'flex-start'), maxWidth: msg.role === 'system' ? '100%' : '90%' }}>
                  <div style={{ 
                    padding: msg.role === 'system' ? '4px 8px' : '8px', 
                    backgroundColor: msg.role === 'user' ? 'var(--accent)' : (msg.role === 'system' ? 'transparent' : '#000'), 
                    color: msg.role === 'user' ? 'var(--button-text)' : (msg.role === 'system' ? 'var(--text-muted)' : (msg.content.includes('✅') ? '#00e5ff' : '#4ade80')),
                    border: msg.role === 'assistant' ? (msg.content.includes('✅') ? '1px solid #00e5ff' : '1px solid var(--border-color)') : 'none',
                    borderRadius: '4px', fontSize: msg.role === 'system' ? '10px' : '12px', 
                    fontStyle: msg.role === 'system' ? 'italic' : 'normal',
                    fontFamily: msg.role === 'assistant' ? (msg.content.includes('✅') ? 'inherit' : 'monospace') : 'inherit',
                    wordBreak: 'break-word', whiteSpace: 'pre-wrap' 
                  }}>
                    {msg.role === 'assistant' ? (
                      <TypewriterText text={msg.content} animate={i === messages.length - 1 && !msg.content.includes('✅') && !autoMode} />
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === 'assistant' && !msg.content.includes('✅') && !autoMode && !isConversational(msg.content) && (
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                      <button onClick={() => insertCommand(msg.content)} style={{ flex: 1, padding: '4px', fontSize: '10px', backgroundColor: 'var(--bg-input)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: '2px', cursor: 'pointer' }}>Insertar</button>
                      <button onClick={() => executeCommand(msg.content)} style={{ flex: 1, padding: '4px', fontSize: '10px', backgroundColor: 'var(--neon-green, #00ff00)', color: '#000', border: 'none', borderRadius: '2px', cursor: 'pointer', fontWeight: 'bold' }}>Ejecutar</button>
                    </div>
                  )}
                </div>
              ))}
              {loading && <div style={{ alignSelf: 'flex-start', fontSize: '11px', color: 'var(--text-muted)' }}>Pensando...</div>}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Box and Settings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              {isAutoLooping && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0, 255, 0, 0.1)', border: '1px solid var(--neon-green, #00ff00)', padding: '6px 8px', borderRadius: '4px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--neon-green, #00ff00)', animation: 'pulse 1.5s infinite' }}>Agente trabajando...</span>
                  <button onClick={() => setIsAutoLooping(false)} style={{ padding: '2px 8px', backgroundColor: '#f48771', color: '#000', border: 'none', borderRadius: '2px', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>DETENER</button>
                </div>
              )}
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {settings?.aiProfiles && settings.aiProfiles.length > 1 && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span>{t('labelProfile', settings?.language || 'es')}</span>
                      <select 
                        value={activeProfile.id}
                        onChange={(e) => setSelectedProfileId(e.target.value)}
                        style={{ padding: '2px 4px', fontSize: '12px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', maxWidth: '200px', textOverflow: 'ellipsis' }}
                      >
                        {settings.aiProfiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name} ({p.provider})</option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {allAgents.length > 0 && (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <span>{t('labelAgent', settings?.language || 'es')}</span>
                      <select 
                        value={selectedAgentId || activeAgent.id}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        style={{ padding: '2px 4px', fontSize: '12px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', maxWidth: '200px', textOverflow: 'ellipsis' }}
                      >
                        {allAgents.filter(a => a.id !== 'agent_meta').map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <span>{t('labelModel', settings?.language || 'es')}</span>
                    {availableModels.length > 0 ? (
                      <select 
                        value={selectedModel} 
                        onChange={(e) => setSelectedModel(e.target.value)}
                        style={{ 
                          backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', 
                          borderRadius: '4px', fontSize: '12px', padding: '2px', outline: 'none', maxWidth: '200px', textOverflow: 'ellipsis'
                        }}
                      >
                        {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    ) : (
                      <strong style={{ color: 'var(--text-main)' }}>{fetchingModels ? 'Cargando...' : selectedModel}</strong>
                    )}
                  </div>
                </div>
                <label 
                  title="Si está activado, la IA ejecutará comandos en la terminal y leerá el resultado de forma autónoma hasta resolver la tarea."
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'help', color: autoMode ? 'var(--neon-green, #00ff00)' : 'var(--text-muted)' }}
                >
                  <input type="checkbox" checked={autoMode} onChange={e => { setAutoMode(e.target.checked); if(!e.target.checked) setIsAutoLooping(false); }} style={{ margin: 0, cursor: 'pointer' }} />
                  Auto-run
                </label>
              </div>
              
              {error && <div style={{ color: '#ff6b6b', fontSize: '11px' }}>{error}</div>}
              <div style={{ position: 'relative' }}>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  disabled={loading || (provider !== 'ollama' && !apiKey.trim())}
                  placeholder="Escribe tu consulta y presiona Enter..."
                  style={{ height: '60px', width: '100%', resize: 'none', padding: '8px', paddingRight: '40px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px', fontSize: '12px', fontFamily: 'inherit' }}
                />
                <button 
                  onClick={() => handleAsk()}
                  disabled={loading || !prompt.trim() || (provider !== 'ollama' && !apiKey.trim())}
                  style={{ position: 'absolute', right: '4px', bottom: '8px', padding: '4px 8px', backgroundColor: 'transparent', color: 'var(--neon-green, #00ff00)', border: 'none', cursor: (loading || !prompt.trim() || (provider !== 'ollama' && !apiKey.trim())) ? 'not-allowed' : 'pointer', opacity: (loading || !prompt.trim() || (provider !== 'ollama' && !apiKey.trim())) ? 0.3 : 1 }}
                  title="Enviar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
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
  const [showAi, setShowAi] = useState(false);
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
    if (!isActive || (type !== 'ssh' && type !== 'gcp')) return;
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
    
    // GCP polling uses a sub-process per fetch which is heavy, so we poll slower
    const intervalTime = type === 'gcp' ? 15000 : 5000;
    const interval = setInterval(fetchStats, intervalTime);
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

  const getTerminalContext = () => {
    if (!xtermRef.current) return '';
    const buffer = xtermRef.current.buffer.active;
    const lines = [];
    const maxLines = 100;
    const startLine = Math.max(0, buffer.length - maxLines);
    for (let i = startLine; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
      lines.pop();
    }
    return lines.join('\n');
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
      } else if (type === 'gcp') {
        window.electronAPI.spawnGCP(id, config);
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
      window.removeEventListener('resize', handleResize);
      if (isInitialized.current) {
        window.electronAPI.closeTerminal(id);
      }
      term.dispose();
      isInitialized.current = false;
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (isActive && fitAddonRef.current && isInitialized.current) {
        try {
          fitAddonRef.current.fit();
          if (xtermRef.current) {
            window.electronAPI.resizeTerminal(id, xtermRef.current.cols, xtermRef.current.rows);
          }
        } catch (e) {}
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => resizeObserver.disconnect();
  }, [isActive, id]);

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

        {/* Sidebar Collapsible Drawer */}
        <div style={{
          position: 'relative',
          width: (showSftp || showAi) ? `${sftpWidth}px` : '0px',
          height: '100%',
          zIndex: 50,
          transition: isResizing ? 'none' : 'width 0.2s ease-in-out',
          backgroundColor: 'var(--bg-panel)',
          borderLeft: (showSftp || showAi) ? '1px solid var(--border-color)' : 'none',
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
              cursor: (showSftp || showAi) ? 'col-resize' : 'default',
              backgroundColor: isResizing ? 'var(--accent)' : 'transparent',
              transition: 'background-color 0.2s',
              zIndex: 60,
            }}
            onMouseDown={(e) => {
              if (showSftp || showAi) {
                e.preventDefault();
                setIsResizing(true);
              }
            }}
          />

          {/* Solapa / Tab */}
          <div
            onClick={() => {
              if (type === 'ssh') {
                setShowSftp(!showSftp);
                if (!showSftp) setShowAi(false);
              }
            }}
            title={type === 'ssh' ? "Explorador de Archivos (SFTP)" : "SFTP solo disponible en conexiones remotas"}
            style={{
              position: 'absolute',
              top: '20px',
              left: '-38px',
              width: '38px',
              backgroundColor: showSftp ? 'var(--bg-input)' : (type === 'ssh' ? 'var(--accent)' : 'var(--bg-panel)'),
              color: 'var(--text-main)',
              border: '1px solid var(--border-light)',
              borderRight: showSftp ? 'none' : (type === 'ssh' ? '1px solid var(--accent)' : '1px solid var(--border-light)'),
              borderRadius: '4px 0 0 4px',
              padding: '12px 0px',
              cursor: type === 'ssh' ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: type === 'ssh' ? '-2px 2px 10px rgba(0,0,0,0.4)' : 'none',
              opacity: type === 'ssh' ? (showSftp ? 0.8 : 1) : 0.5,
              transition: 'all 0.2s ease',
              zIndex: 61,
            }}
            onMouseEnter={(e) => {
               if (type !== 'ssh') return;
               e.currentTarget.style.opacity = '1';
               e.currentTarget.style.backgroundColor = showSftp ? 'var(--border-color)' : '#0098ff';
            }}
            onMouseLeave={(e) => {
               if (type !== 'ssh') return;
               e.currentTarget.style.opacity = showSftp ? '0.8' : '1';
               e.currentTarget.style.backgroundColor = showSftp ? 'var(--bg-input)' : 'var(--accent)';
            }}
          >
            <VscFolder color={showSftp ? '#aaa' : 'var(--button-text)'} size={20} />
          </div>

          {/* AI Tab */}
          <div
            onClick={() => {
              setShowAi(!showAi);
              if (!showAi) setShowSftp(false);
            }}
            title="Vincent AI"
            style={{
              position: 'absolute',
              top: '65px',
              left: '-38px',
              width: '38px',
              backgroundColor: showAi ? 'var(--bg-input)' : 'var(--accent)',
              color: 'var(--text-main)',
              border: '1px solid var(--border-light)',
              borderRight: showAi ? 'none' : '1px solid var(--accent)',
              borderRadius: '4px 0 0 4px',
              padding: '12px 0px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '-2px 2px 10px rgba(0,0,0,0.4)',
              opacity: showAi ? 0.8 : 1,
              transition: 'all 0.2s ease',
              zIndex: 61,
            }}
            onMouseEnter={(e) => {
               e.currentTarget.style.opacity = '1';
               e.currentTarget.style.backgroundColor = showAi ? 'var(--border-color)' : '#0098ff';
            }}
            onMouseLeave={(e) => {
               e.currentTarget.style.opacity = showAi ? '0.8' : '1';
               e.currentTarget.style.backgroundColor = showAi ? 'var(--bg-input)' : 'var(--accent)';
            }}
          >
            <VscSparkle color={showAi ? '#aaa' : 'var(--button-text)'} size={20} />
          </div>

          {/* Sidebar Content Wrapper */}
          <div style={{ width: (showSftp || showAi) ? `${sftpWidth}px` : '0px', borderLeft: (showSftp || showAi) ? '1px solid var(--border-light)' : 'none', height: '100%', overflow: 'hidden' }}>
            {type === 'ssh' && showSftp && <SftpViewer id={id} isActive={showSftp && isActive} onClose={() => setShowSftp(false)} />}
            <AiDrawer id={id} isActive={showAi && isActive} onClose={() => setShowAi(false)} settings={settings} getTerminalContext={getTerminalContext} />
          </div>
        </div>
      </div>

      {/* Footer / Status Bar */}
      {(type === 'ssh' || type === 'gcp') && (
        <div style={{
          height: '24px',
          backgroundColor: 'var(--accent)',
          color: 'var(--button-text)',
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
