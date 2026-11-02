import React, { useEffect, useRef, useState, useMemo } from 'react'

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import { SiJavascript, SiTypescript, SiPython, SiHtml5, SiCss, SiMarkdown, SiJson, SiGnubash, SiReact, SiYaml, SiCplusplus } from 'react-icons/si';
import { FaJava, FaMicrochip, FaMemory, FaHdd, FaPlay, FaCheck, FaCopy, FaTrash, FaPlus, FaHistory, FaTimes, FaBolt, FaPaste, FaThumbtack } from 'react-icons/fa';
import { VscFile, VscFolder, VscSettingsGear, VscSymbolKey, VscLock, VscArchive, VscSparkle, VscGraph, VscSearch, VscTools, VscPackage } from 'react-icons/vsc';
import { FcImageFile } from 'react-icons/fc';
import {
  detectModelCategory,
  smartTruncateTerminalContext,
  estimateTokens,
  cleanReasoningOutput,
  parseActions,
  buildSystemPrompt,
  buildQuickCommandPrompt,
  inspectCommandSecurity,
  redactSensitiveData,
  saveMemory,
  type AppAction,
  type EnvContext,
  FIXED_AGENTS
} from './aiEngine';
import { EngramModal } from './EngramModal';
import { playWelcomeBanner } from './welcomeBanner';
import { 
  executeLiveCommand, 
  stripAnsiCodes, 
  isErrorOutput,
  getCommandHistory, 
  clearCommandHistory, 
  subscribeCommandHistory, 
  updateCommandLogOutput,
  type LiveExecutionHandle,
  type CommandLogEntry 
} from './terminalExecution';
import { FaBrain } from 'react-icons/fa';
import 'xterm/css/xterm.css';

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
      readClipboard?: () => Promise<string>;
      writeClipboard?: (text: string) => Promise<boolean>;
      systemFetch?: (url: string, options: any) => Promise<{ success: boolean, data?: any, message?: string, status?: number }>;
      systemFetchStream?: (reqId: string, url: string, options: any, callbacks: { onDelta: (chunk: string) => void, onDone: () => void, onError: (err: string) => void }) => Promise<{ success: boolean, message?: string }>;
    };
  }
}

export interface AiProfile {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'opencode' | 'ollama' | 'deepseek' | 'custom';
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
  theme?: 'light' | 'dark' | 'vincent';
  language?: 'en' | 'es';
  aiProfiles?: AiProfile[];
  activeAiProfileId?: string;
  aiAgents?: AiAgent[];
  activeAiAgentId?: string;
  gentleAi?: {
    enableGentleman?: boolean;
    enableEngram?: boolean;
    enableContext7?: boolean;
    enableGuardrails?: boolean;
    context7ApiKey?: string;
  };
  
  // Legacy
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiProvider?: 'openai' | 'google' | 'opencode' | 'ollama' | 'deepseek' | 'custom';
}

interface TerminalProps {
  id: string;
  type: 'local' | 'ssh' | 'gcp';
  config?: any;
  isActive: boolean;
  settings?: TerminalSettings;
  onApplyAction?: (action: AppAction) => void;
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
                    <VscFolder size={16} color="#dcb67a" style={{ marginRight: '6px', flexShrink: 0 }} />
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
                    <VscFile size={16} color="#aaa" style={{ marginRight: '6px', flexShrink: 0 }} />
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
                  <td style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <VscFolder size={16} color="#dcb67a" />
                    <span>..</span>
                  </td>
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
              style={{ padding: '8px 15px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <VscFolder size={14} color="#dcb67a" />
              <span>Crear Carpeta</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thinking?: string;
  actions?: AppAction[];
};

type ChatSession = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const QUICK_PROMPTS: { id: string; label: string; iconType: 'folder' | 'package' | 'search' | 'tools' | 'graph' | 'lock'; prompt: string }[] = [
  { id: 'explore', label: 'Explorar carpetas', iconType: 'folder', prompt: 'Inspecciona la carpeta actual con pwd y ls -la para ver la estructura de archivos y subdirectorios.' },
  { id: 'deps', label: 'Instalar dependencias', iconType: 'package', prompt: 'Inspecciona los archivos del proyecto actual (ls -la o cat package.json / requirements.txt). Si hay package.json ejecuta npm install a secas; si hay requirements.txt ejecuta pip install -r requirements.txt. NUNCA inventes dependencias que no existan.' },
  { id: 'explain', label: 'Explicar error', iconType: 'search', prompt: 'Analiza el último error que ocurrió en la terminal y dime cuál fue la causa y cómo solucionarlo.' },
  { id: 'fix', label: 'Corregir fallo', iconType: 'tools', prompt: 'Sugiere el comando bash exacto para solucionar el problema o error actual en la terminal sin inventar paquetes inexistentes.' },
  { id: 'diag', label: 'Diagnóstico', iconType: 'graph', prompt: 'Ejecuta un diagnóstico rápido del servidor (CPU, RAM, espacio en disco y procesos principales).' },
  { id: 'ports', label: 'Red y Puertos', iconType: 'lock', prompt: 'Verifica los puertos abiertos, conexiones activas y estado del firewall en este sistema.' }
];

interface LiveExecState {
  command: string;
  isRunning: boolean;
  output: string;
  elapsedMs: number;
  status: 'running' | 'completed' | 'interrupted' | 'idle';
}

const CommandActionCard: React.FC<{ 
  command: string; 
  onExecute: (cmd: string) => void; 
  onInsert: (cmd: string) => void;
  liveExecState?: LiveExecState | null;
  onCancelLiveExec?: () => void;
  onFixError?: (cmd: string, output: string) => void;
}> = ({ command, onExecute, onInsert, liveExecState, onCancelLiveExec, onFixError }) => {
  const [copied, setCopied] = useState(false);
  const [executed, setExecuted] = useState(false);
  const [savedToEngram, setSavedToEngram] = useState(false);
  const [showLiveOutput, setShowLiveOutput] = useState(true);

  const security = inspectCommandSecurity(command);
  const isCurrentLive = Boolean(
    liveExecState && 
    liveExecState.command.trim() === command.trim() && 
    liveExecState.status !== 'idle'
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    setShowLiveOutput(true);
    onExecute(command);
    setExecuted(true);
    setTimeout(() => setExecuted(false), 2500);
  };

  const handleSaveEngram = () => {
    saveMemory({
      title: command.slice(0, 45),
      content: command,
      type: 'snippet'
    });
    setSavedToEngram(true);
    setTimeout(() => setSavedToEngram(false), 2000);
  };

  return (
    <div style={{ 
      margin: '8px 0', 
      borderRadius: '6px', 
      border: isCurrentLive && liveExecState?.isRunning
        ? '1px solid #22c55e'
        : (!security.isSafe ? '1px solid #ef4444' : '1px solid var(--border-color, rgba(255,255,255,0.15))'), 
      backgroundColor: 'rgba(0, 0, 0, 0.45)', 
      overflow: 'hidden',
      boxShadow: isCurrentLive && liveExecState?.isRunning
        ? '0 0 16px rgba(34, 197, 94, 0.25)'
        : (!security.isSafe ? '0 4px 14px rgba(239,68,68,0.3)' : '0 4px 12px rgba(0,0,0,0.3)'),
      transition: 'border-color 0.2s, box-shadow 0.2s'
    }}>
      {/* Action Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '6px 10px', 
        backgroundColor: 'rgba(255,255,255,0.04)', 
        borderBottom: '1px solid rgba(255,255,255,0.08)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ 
            fontSize: '10px', 
            fontWeight: 800, 
            letterSpacing: '0.6px',
            color: 'var(--neon-green, #00ff00)', 
            backgroundColor: 'rgba(0, 255, 0, 0.12)', 
            border: '1px solid rgba(0, 255, 0, 0.3)',
            padding: '2px 6px', 
            borderRadius: '3px',
            textTransform: 'uppercase'
          }}>
            ⚡ BASH
          </span>
          {isCurrentLive && liveExecState?.isRunning && (
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              color: '#4ade80',
              backgroundColor: 'rgba(34, 197, 94, 0.2)',
              border: '1px solid #22c55e',
              padding: '2px 6px',
              borderRadius: '3px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 1s infinite' }} />
              EN VIVO
            </span>
          )}
          {!security.isSafe && (
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              color: '#f87171',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid #ef4444',
              padding: '2px 6px',
              borderRadius: '3px'
            }}>
              🛡️ {security.severity === 'critical' ? 'LETAL' : 'RIESGO'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button 
            type="button"
            onClick={handleSaveEngram}
            title="Guardar snippet en memoria Engram"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', fontSize: '11px', 
              backgroundColor: savedToEngram ? 'rgba(52, 211, 153, 0.2)' : 'rgba(168, 85, 247, 0.12)', 
              color: savedToEngram ? '#34d399' : '#c084fc', 
              border: '1px solid rgba(168, 85, 247, 0.25)', 
              borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {savedToEngram ? '✓ Guardado' : '🧠 Recordar'}
          </button>
          <button 
            type="button"
            onClick={handleCopy}
            title="Copiar comando al portapapeles"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', fontSize: '11px', 
              backgroundColor: 'rgba(255,255,255,0.08)', 
              color: 'var(--text-main, #fff)', 
              border: '1px solid rgba(255,255,255,0.15)', 
              borderRadius: '4px', cursor: 'pointer'
            }}
          >
            {copied ? <><FaCheck size={10} color="#4ade80" /> Copiado</> : <><FaCopy size={10} /> Copiar</>}
          </button>
          <button 
            type="button"
            onClick={() => onInsert(command)}
            title="Insertar en la consola sin ejecutar"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 8px', fontSize: '11px', 
              backgroundColor: 'rgba(255,255,255,0.08)', 
              color: 'var(--text-main, #fff)', 
              border: '1px solid rgba(255,255,255,0.15)', 
              borderRadius: '4px', cursor: 'pointer'
            }}
          >
            ✏️ Insertar
          </button>
          <button 
            type="button"
            onClick={handleRun}
            title="Ejecutar en la terminal activa inmediatamente"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 10px', fontSize: '11px', fontWeight: 700,
              backgroundColor: isCurrentLive && liveExecState?.isRunning ? '#eab308' : (executed ? '#22c55e' : (!security.isSafe ? '#ef4444' : 'var(--neon-green, #00ff00)')), 
              color: '#000', 
              border: 'none', 
              borderRadius: '4px', cursor: 'pointer',
              boxShadow: !security.isSafe ? '0 0 10px rgba(239, 68, 68, 0.4)' : '0 0 10px rgba(0, 255, 0, 0.25)'
            }}
          >
            {isCurrentLive && liveExecState?.isRunning ? '⚡ Ejecutando...' : (executed ? <><FaCheck size={10} /> Ejecutado</> : <><FaPlay size={10} /> Ejecutar</>)}
          </button>
        </div>
      </div>
      
      {!security.isSafe && (
        <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.2)', padding: '6px 10px', fontSize: '11px', color: '#fca5a5' }}>
          ⚠️ <strong>Gentleman Guardrail:</strong> {security.warning}
        </div>
      )}

      {/* Code Body */}
      <pre style={{ 
        margin: 0, 
        padding: '10px 12px', 
        fontSize: '12px', 
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        color: '#f1f5f9', 
        backgroundColor: 'rgba(0,0,0,0.55)',
        overflowX: 'auto',
        lineHeight: '1.5',
        whiteSpace: 'pre-wrap'
      }}>
        <code>{command}</code>
      </pre>

      {/* Live Server Output Stream Box */}
      {isCurrentLive && liveExecState && (
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.12)',
          backgroundColor: '#0a0d14',
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {liveExecState.status === 'running' ? (
                <>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#4ade80', letterSpacing: '0.5px' }}>
                    RESPUESTA EN VIVO DEL SERVIDOR
                  </span>
                </>
              ) : liveExecState.status === 'interrupted' ? (
                <>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#f87171' }}>
                    INTERRUMPIDO (SIGINT)
                  </span>
                </>
              ) : (
                <>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#38bdf8' }} />
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#38bdf8' }}>
                    SALIDA FINALIZADA
                  </span>
                </>
              )}
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                ⏱️ {(liveExecState.elapsedMs / 1000).toFixed(1)}s
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {liveExecState.isRunning && onCancelLiveExec && (
                <button
                  type="button"
                  onClick={onCancelLiveExec}
                  title="Interrumpir proceso en el servidor (Ctrl+C)"
                  style={{
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    backgroundColor: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <FaTimes size={9} /> Interrumpir (Ctrl+C)
                </button>
              )}
              {liveExecState.output && (
                <button
                  type="button"
                  onClick={() => setShowLiveOutput(!showLiveOutput)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    cursor: 'pointer'
                  }}
                >
                  {showLiveOutput ? 'Ocultar ▲' : 'Ver ▼'}
                </button>
              )}
            </div>
          </div>

          {showLiveOutput && (
            liveExecState.output ? (
              <>
                <pre style={{
                  margin: 0,
                  padding: '6px 8px',
                  fontSize: '11px',
                  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                  color: '#e2e8f0',
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '4px',
                  maxHeight: '140px',
                  overflowY: 'auto',
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all'
                }}>
                  {liveExecState.output.slice(-1500)}
                </pre>
                {isErrorOutput(liveExecState.output) && !liveExecState.isRunning && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', padding: '5px 8px', backgroundColor: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px' }}>
                    <span style={{ fontSize: '10px', color: '#fca5a5', fontWeight: 600 }}>
                      ⚠️ Error detectado en la salida
                    </span>
                    <button
                      type="button"
                      onClick={() => onFixError?.(command, liveExecState.output)}
                      style={{
                        padding: '3px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#dc2626'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ef4444'}
                    >
                      <VscTools size={11} /> Auto-corregir con Vincent AI
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px' }}>
                Conectando con la consola del servidor...
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

const ActionCardComponent: React.FC<{ action: AppAction; onApply: (action: AppAction) => void }> = ({ action, onApply }) => {
  const [applied, setApplied] = useState(false);
  return (
    <div style={{ 
      margin: '6px 0', 
      borderRadius: '6px', 
      border: '1px solid #00e5ff', 
      backgroundColor: 'rgba(0, 229, 255, 0.08)', 
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#00e5ff', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ⚡ ACCIÓN RECOMENDADA
        </span>
        <button 
          type="button"
          disabled={applied}
          onClick={() => {
            onApply(action);
            setApplied(true);
          }}
          style={{ 
            padding: '3px 10px', 
            fontSize: '11px', 
            fontWeight: 700,
            backgroundColor: applied ? '#22c55e' : '#00e5ff', 
            color: '#000', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: applied ? 'default' : 'pointer'
          }}
        >
          {applied ? '✓ Aplicado' : '⚡ Aplicar configuración'}
        </button>
      </div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#fff' }}>{action.title}</div>
      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{action.description}</div>
    </div>
  );
};

const QuickAiBar: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onExecute: (cmd: string) => void;
  onInsert: (cmd: string) => void;
  settings: TerminalSettings;
  env: EnvContext;
  selectedText?: string;
}> = ({ isOpen, onClose, onExecute, onInsert, settings, env, selectedText }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedCommand, setGeneratedCommand] = useState('');
  const [tokensEstimate, setTokensEstimate] = useState(0);
  const [error, setError] = useState('');
  const [securityWarning, setSecurityWarning] = useState<string | null>(null);
  const [isSavedToEngram, setIsSavedToEngram] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeProfile = settings?.aiProfiles?.find(p => p.id === settings?.activeAiProfileId)
    || settings?.aiProfiles?.[0]
    || { provider: settings?.aiProvider || 'openai', baseUrl: settings?.aiBaseUrl || 'https://api.openai.com/v1', apiKey: settings?.aiApiKey || '', model: settings?.aiModel || 'gpt-4o-mini', name: 'Legacy', id: 'legacy' };

  const gentleConfig = settings?.gentleAi || {
    enableGentleman: true,
    enableEngram: true,
    enableContext7: true,
    enableGuardrails: true,
    context7ApiKey: ''
  };

  useEffect(() => {
    if (isOpen) {
      if (selectedText && selectedText.trim()) {
        const preview = selectedText.trim().slice(0, 120);
        setQuery(`Solucionar error: ${preview}`);
      }
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setGeneratedCommand('');
      setError('');
      setSecurityWarning(null);
      setIsSavedToEngram(false);
    }
  }, [isOpen, selectedText]);

  const handleSubmit = async (overrideQuery?: string) => {
    const text = overrideQuery || query.trim();
    if (!text) return;

    if (generatedCommand && !overrideQuery) {
      onExecute(generatedCommand);
      onClose();
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedCommand('');
    setSecurityWarning(null);
    setIsSavedToEngram(false);

    try {
      const apiKey = activeProfile.apiKey || '';
      const baseUrl = activeProfile.baseUrl || '';
      const provider = activeProfile.provider;
      const model = activeProfile.model;

      const headers: any = { 'Content-Type': 'application/json' };
      if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey}`;

      const sysPrompt = await buildQuickCommandPrompt(env, {
        enableGentleman: gentleConfig.enableGentleman,
        enableEngram: gentleConfig.enableEngram,
        enableContext7: gentleConfig.enableContext7,
        context7ApiKey: gentleConfig.context7ApiKey,
        query: text
      });
      const estTokens = estimateTokens(sysPrompt + text);
      setTokensEstimate(estTokens);

      let fetchUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      if (provider === 'ollama' && !fetchUrl.endsWith('/v1')) {
        if (fetchUrl.endsWith('/api')) fetchUrl = fetchUrl.slice(0, -4);
        fetchUrl = fetchUrl + '/v1';
      }
      if (fetchUrl.endsWith('/chat/completions')) fetchUrl = fetchUrl.replace('/chat/completions', '');

      const modelCat = detectModelCategory(provider, model);
      const body: any = {
        model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: text }
        ],
        stream: true
      };
      if (modelCat !== 'reasoning') {
        body.temperature = modelCat === 'compact-local' ? 0.05 : 0.1;
      }

      const reqId = `cmd_k_${Date.now()}`;
      let accumulatedRaw = '';

      if (window.electronAPI.systemFetchStream) {
        await new Promise<void>((resolve, reject) => {
          window.electronAPI.systemFetchStream!(
            reqId,
            `${fetchUrl}/chat/completions`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(body)
            },
            {
              onDelta: (delta: string) => {
                accumulatedRaw += delta;
                const { cleanContent } = cleanReasoningOutput(accumulatedRaw);
                const match = cleanContent.match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/);
                const partialCmd = match && match[1] ? match[1].trim() : cleanContent.trim();
                setGeneratedCommand(partialCmd);
              },
              onDone: () => resolve(),
              onError: (err: string) => reject(new Error(err))
            }
          ).then(initRes => {
            if (!initRes.success) reject(new Error(initRes.message || 'Error inicializando stream'));
          }).catch(reject);
        });
      } else {
        const res = await (window as any).electronAPI.systemFetch(`${fetchUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });
        if (!res.success) throw new Error(res.message || 'Error en petición de IA');
        accumulatedRaw = res.data.choices[0].message.content;
      }

      const { cleanContent } = cleanReasoningOutput(accumulatedRaw);
      const match = cleanContent.match(/```(?:bash|sh|shell)?\n([\s\S]*?)```/);
      const cmd = match && match[1] ? match[1].trim() : cleanContent.trim();

      setGeneratedCommand(cmd);

      // Gentleman Security Guardrail Check
      if (gentleConfig.enableGuardrails) {
        const sec = inspectCommandSecurity(cmd);
        if (!sec.isSafe) {
          setSecurityWarning(sec.warning || 'Comando potencialmente riesgoso detectado');
        }
      }
    } catch (e: any) {
      setError(e.message || 'Error conectando con la IA');
    } finally {
      setLoading(false);
    }
  };

  const handlePasteToQuickBar = async () => {
    try {
      const pastePromise = window.electronAPI.readClipboard
        ? window.electronAPI.readClipboard()
        : navigator.clipboard.readText();
      const text = await Promise.resolve(pastePromise);
      if (text) {
        setQuery(prev => prev ? `${prev} ${text}` : text);
        if (generatedCommand) setGeneratedCommand('');
      }
    } catch (e) {}
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'absolute',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '92%',
        maxWidth: '680px',
        backgroundColor: 'var(--bg-panel, #1e1e1e)',
        border: '1px solid var(--accent, #00e5ff)',
        borderRadius: '10px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
        padding: '12px 14px',
        zIndex: 1000,
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        animation: 'fadeIn 0.15s ease'
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <VscSparkle color="var(--neon-green, #00ff00)" size={16} />
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
            Vincent AI • Comando Rápido (⌘K / Ctrl+K)
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', backgroundColor: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
            {activeProfile.model}
          </span>
          {gentleConfig.enableGentleman && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }} title="Modo Gentleman activo (Clean Code)">
              🎩 Gentleman
            </span>
          )}
          {gentleConfig.enableEngram && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(168,85,247,0.15)', color: '#c084fc' }} title="Memoria Engram persistente conectada">
              🧠 Engram
            </span>
          )}
          {gentleConfig.enableContext7 && (
            <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(56,189,248,0.15)', color: '#38bdf8' }} title="Documentación oficial Context7 en vivo">
              📚 Context7
            </span>
          )}
          {tokensEstimate > 0 && (
            <span style={{ fontSize: '10px', color: '#4ade80', fontWeight: 600 }}>
              ⚡ ~{tokensEstimate} tokens
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}
        >
          <FaTimes size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            if (generatedCommand) setGeneratedCommand('');
          }}
          onPaste={async (e) => {
            const clipboardText = e.clipboardData?.getData('text');
            if (!clipboardText && window.electronAPI.readClipboard) {
              e.preventDefault();
              const nativeText = await window.electronAPI.readClipboard();
              if (nativeText) {
                setQuery(prev => prev ? `${prev} ${nativeText}` : nativeText);
              }
            }
          }}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              onClose();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            } else if (e.key === 'Tab' && generatedCommand) {
              e.preventDefault();
              onInsert(generatedCommand);
              onClose();
            }
          }}
          placeholder="Escribe lo que necesitas (ej: buscar archivos >100M, ver puertos 8080, ver uso de RAM)..."
          style={{
            flex: 1,
            padding: '8px 12px',
            backgroundColor: 'var(--bg-input, #111)',
            color: 'var(--text-main, #fff)',
            border: '1px solid var(--border-color, #444)',
            borderRadius: '6px',
            fontSize: '13px',
            outline: 'none'
          }}
        />
        <button
          type="button"
          onClick={handlePasteToQuickBar}
          title="Pegar texto del portapapeles"
          style={{
            padding: '8px 10px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <FaPaste size={11} color="#00e5ff" /> Pegar
        </button>
        <button
          type="button"
          disabled={loading || !query.trim()}
          onClick={() => handleSubmit()}
          style={{
            padding: '8px 14px',
            backgroundColor: loading ? 'rgba(255,255,255,0.1)' : 'var(--neon-green, #00ff00)',
            color: '#000',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '12px',
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          {loading ? 'Generando...' : (generatedCommand ? 'Ejecutar ↵' : 'Generar ↵')}
        </button>
      </div>

      {error && (
        <div style={{ color: '#ff6b6b', fontSize: '11px', padding: '4px 6px' }}>
          ❌ {error}
        </div>
      )}

      {securityWarning && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid #ef4444',
          borderRadius: '6px',
          padding: '8px 10px',
          color: '#fca5a5',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <strong>🛡️ Guardrail Gentleman:</strong> {securityWarning}
        </div>
      )}

      {generatedCommand && (
        <div style={{
          backgroundColor: 'rgba(0,0,0,0.6)',
          border: '1px solid var(--neon-green, #00ff00)',
          borderRadius: '6px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--neon-green, #00ff00)', fontWeight: 800 }}>
              ⚡ COMANDO LISTO
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {gentleConfig.enableEngram && (
                <button
                  type="button"
                  onClick={() => {
                    saveMemory({
                      title: query.slice(0, 50),
                      content: generatedCommand,
                      type: 'snippet'
                    });
                    setIsSavedToEngram(true);
                    setTimeout(() => setIsSavedToEngram(false), 2000);
                  }}
                  title="Persistir este comando en la memoria local de Engram"
                  style={{
                    padding: '4px 8px',
                    fontSize: '11px',
                    backgroundColor: isSavedToEngram ? 'rgba(52, 211, 153, 0.2)' : 'rgba(168, 85, 247, 0.15)',
                    color: isSavedToEngram ? '#34d399' : '#c084fc',
                    border: '1px solid rgba(168, 85, 247, 0.3)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {isSavedToEngram ? '✓ Guardado' : '🧠 Recordar'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onInsert(generatedCommand);
                  onClose();
                }}
                title="Insertar en la terminal sin ejecutar (Tab)"
                style={{
                  padding: '4px 8px',
                  fontSize: '11px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ✏️ Insertar [Tab]
              </button>
              <button
                type="button"
                onClick={() => {
                  onExecute(generatedCommand);
                  onClose();
                }}
                title="Ejecutar en la terminal inmediatamente (Enter)"
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  backgroundColor: 'var(--neon-green, #00ff00)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                ⚡ Ejecutar [Enter]
              </button>
            </div>
          </div>
          <code style={{
            fontSize: '12px',
            fontFamily: 'Menlo, Monaco, monospace',
            color: '#f8fafc',
            backgroundColor: 'rgba(0,0,0,0.4)',
            padding: '6px 8px',
            borderRadius: '4px',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap'
          }}>
            {generatedCommand}
          </code>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--text-muted)' }}>
        <span>Presiona <strong>Enter</strong> para generar/ejecutar • <strong>Tab</strong> para insertar • <strong>Esc</strong> para cerrar</span>
        <span>Ahorro máximo: solicitud compacta de alta velocidad</span>
      </div>
    </div>
  );
};

const AiDrawer = ({
  id,
  isActive,
  onClose,
  settings,
  getTerminalContext,
  getSelectedText,
  onAutoRunChange,
  isPinned,
  onTogglePin,
  onApplyAction,
  initialPrompt,
  onClearInitialPrompt,
  env,
  onOpenEngram,
  term,
  subscribeToTerminalData
}: {
  id: string;
  isActive: boolean;
  onClose?: () => void;
  settings: TerminalSettings;
  getTerminalContext?: () => string;
  getSelectedText?: () => string;
  onAutoRunChange?: (running: boolean) => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onApplyAction?: (action: AppAction) => void;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  env?: EnvContext;
  onOpenEngram?: () => void;
  term?: Terminal | null;
  subscribeToTerminalData?: (cb: (chunk: string) => void) => () => void;
}) => {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(settings?.activeAiProfileId || '');
  const [selectedAgentId, setSelectedAgentId] = useState<string>(settings?.activeAiAgentId || '');
  const [contextMode, setContextMode] = useState<'smart' | 'selection' | 'none'>('smart');
  
  // Lazy snapshot state: updated on open or before submit, NOT on every keystroke
  const [cachedTermContext, setCachedTermContext] = useState('');
  const [cachedSelText, setCachedSelText] = useState('');

  useEffect(() => {
    if (isActive) {
      if (getTerminalContext) setCachedTermContext(getTerminalContext());
      if (getSelectedText) setCachedSelText(getSelectedText());
    }
  }, [isActive]);

  const smartContextResult = useMemo(() => smartTruncateTerminalContext(cachedTermContext, 35), [cachedTermContext]);

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
  const [autoStep, setAutoStep] = useState(0);
  const [autoCurrentCommand, setAutoCurrentCommand] = useState('');
  const [autoStatusStage, setAutoStatusStage] = useState<'idle' | 'planning' | 'executing' | 'observing' | 'analyzing'>('idle');
  
  const [showHistory, setShowHistory] = useState(false);
  const [historyTab, setHistoryTab] = useState<'sessions' | 'commands'>('sessions');
  const [commandLogs, setCommandLogs] = useState<CommandLogEntry[]>(() => getCommandHistory());
  const [commandFilter, setCommandFilter] = useState('');

  useEffect(() => {
    return subscribeCommandHistory(() => {
      setCommandLogs(getCommandHistory());
    });
  }, []);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');

  // Handle external initial prompt (e.g. from context menu)
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleAsk(initialPrompt.trim());
      onClearInitialPrompt?.();
    }
  }, [initialPrompt]);

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
      
      newSessions.sort((a, b) => b.updatedAt - a.updatedAt);
      
      try {
        localStorage.setItem('vincent_chat_history', JSON.stringify(newSessions));
      } catch (e) {}
      
      return newSessions;
    });
  }, [messages, currentSessionId]);

  useEffect(() => {
    isAutoLoopingRef.current = isAutoLooping;
    onAutoRunChange?.(isAutoLooping);
  }, [isAutoLooping, onAutoRunChange]);
  
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
          
          const res = await (window as any).electronAPI.systemFetch(`${url}/models`, { headers });
          if (res.success && mounted) {
            const data = res.data;
            if (data && Array.isArray(data.data)) {
              const models = data.data.map((m: any) => (m.id || '').replace(/^models\//, '')).filter(Boolean);
              const chatModels = models.filter((m: string) => 
                !m.includes('whisper') && 
                !m.includes('tts') && 
                !m.includes('dall-e') && 
                !m.includes('embedding') && 
                !m.includes('babbage') && 
                !m.includes('davinci') &&
                !m.includes('aqa')
              );
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
    if (availableModels.length > 0 && !availableModels.includes(selectedModel)) {
      setSelectedModel(availableModels[0]);
    }
  }, [availableModels, selectedModel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const extractCommand = (content: string) => {
    if (!content) return '';
    const match = content.match(/```(?:bash|sh|shell|zsh)?[\r\n]+([\s\S]*?)```/);
    let raw = match && match[1] ? match[1].trim() : content.trim();
    raw = raw.replace(/^`+|`+$/g, '').trim();
    raw = raw.replace(/^[$#]\s+/, '').trim();
    return raw;
  };

  const [liveExecState, setLiveExecState] = useState<LiveExecState>({
    command: '',
    isRunning: false,
    output: '',
    elapsedMs: 0,
    status: 'idle'
  });
  const liveExecHandleRef = useRef<LiveExecutionHandle | null>(null);
  const liveExecTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unsubscribeTerminalRef = useRef<(() => void) | null>(null);
  const liveExecOutputRef = useRef<string>('');
  const lastExecutedCommandRef = useRef<string>('');

  const stopLiveExecution = () => {
    if (liveExecHandleRef.current?.isRunning()) {
      liveExecHandleRef.current.cancel();
    }
    liveExecHandleRef.current = null;
    if (liveExecTimerRef.current) {
      clearInterval(liveExecTimerRef.current);
      liveExecTimerRef.current = null;
    }
    if (unsubscribeTerminalRef.current) {
      unsubscribeTerminalRef.current();
      unsubscribeTerminalRef.current = null;
    }
    setLiveExecState(prev => ({
      ...prev,
      isRunning: false,
      status: 'interrupted'
    }));
    onAutoRunChange?.(false);
  };

  useEffect(() => {
    return () => {
      if (liveExecHandleRef.current?.isRunning()) liveExecHandleRef.current.cancel();
      liveExecHandleRef.current = null;
      if (liveExecTimerRef.current) clearInterval(liveExecTimerRef.current);
      if (unsubscribeTerminalRef.current) unsubscribeTerminalRef.current();
    };
  }, []);

  const executeCommand = (cmd: string) => {
    const cleanCmd = extractCommand(cmd);
    if (!cleanCmd) return;

    if (liveExecHandleRef.current?.isRunning()) {
      liveExecHandleRef.current.cancel();
    }
    liveExecHandleRef.current = null;
    if (liveExecTimerRef.current) clearInterval(liveExecTimerRef.current);
    if (unsubscribeTerminalRef.current) unsubscribeTerminalRef.current();

    liveExecOutputRef.current = '';
    lastExecutedCommandRef.current = cleanCmd;
    onAutoRunChange?.(true);

    const startTime = Date.now();
    setLiveExecState({
      command: cleanCmd,
      isRunning: true,
      output: '',
      elapsedMs: 0,
      status: 'running'
    });

    if (subscribeToTerminalData) {
      unsubscribeTerminalRef.current = subscribeToTerminalData((chunk: string) => {
        const clean = stripAnsiCodes(chunk);
        liveExecOutputRef.current += clean;
        if (liveExecHandleRef.current?.logId) {
          updateCommandLogOutput(liveExecHandleRef.current.logId, clean);
        }
        setLiveExecState(prev => {
          if (!prev.isRunning && prev.status !== 'running') return prev;
          const newOut = prev.output + clean;
          return {
            ...prev,
            output: newOut.length > 6000 ? newOut.slice(-6000) : newOut
          };
        });
      });
    }

    liveExecTimerRef.current = setInterval(() => {
      setLiveExecState(prev => {
        if (!prev.isRunning) return prev;
        return { ...prev, elapsedMs: Date.now() - startTime };
      });
    }, 100);

    const isAuto = isAutoLoopingRef.current;
    const handle = executeLiveCommand({
      id,
      command: cleanCmd,
      term: term || null,
      agentName: activeAgent?.name || 'Vincent AI',
      trigger: isAuto ? 'autonomous' : 'ai_card',
      sessionType: env?.connectionType || 'local',
      onComplete: (elapsed) => {
        liveExecHandleRef.current = null;
        setLiveExecState(prev => ({
          ...prev,
          isRunning: false,
          elapsedMs: elapsed,
          status: 'completed'
        }));
        onAutoRunChange?.(false);
      },
      onCancelled: () => {
        liveExecHandleRef.current = null;
        setLiveExecState(prev => ({
          ...prev,
          isRunning: false,
          status: 'interrupted'
        }));
        onAutoRunChange?.(false);
      }
    });

    liveExecHandleRef.current = handle;
  };

  const insertCommand = (cmd: string) => {
    if (cmd) window.electronAPI.sendToTerminal(id, extractCommand(cmd));
  };

  const stopAutoRun = () => {
    setIsAutoLooping(false);
    setAutoStatusStage('idle');
    stopLiveExecution();
  };

  const startCommandObserver = () => {
    if (!getTerminalContext) {
      setIsAutoLooping(false);
      setAutoStatusStage('idle');
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
        if (liveExecTimerRef.current) {
          clearInterval(liveExecTimerRef.current);
          liveExecTimerRef.current = null;
        }
        if (unsubscribeTerminalRef.current) {
          unsubscribeTerminalRef.current();
          unsubscribeTerminalRef.current = null;
        }
        setLiveExecState(prev => ({
          ...prev,
          isRunning: false,
          status: 'completed'
        }));
        onAutoRunChange?.(false);
        setAutoStatusStage('analyzing');

        const lastCmd = lastExecutedCommandRef.current || autoCurrentCommand || 'comando anterior';
        const capturedOutput = liveExecOutputRef.current.trim();
        const hasError = isErrorOutput(capturedOutput);

        let followUp = `El comando ejecutado fue:\n\`\`\`bash\n${lastCmd}\n\`\`\`\n`;
        if (capturedOutput) {
          const truncatedOutput = capturedOutput.length > 2500 ? capturedOutput.slice(-2500) : capturedOutput;
          followUp += `Salida obtenida en el terminal:\n\`\`\`\n${truncatedOutput}\n\`\`\`\n`;
        } else {
          followUp += `(El comando se ejecutó sin salida de texto en la consola)\n`;
        }

        if (hasError) {
          followUp += `⚠️ ATENCIÓN - SE DETECTÓ UN ERROR EN LA SALIDA:
1. Analiza el error específico reportado por el terminal (permisos de root, archivo/carpeta no encontrado, flag incorrecto, dependencia ausente, etc.).
2. Genera de inmediato el comando bash ajustado y corregido para resolver el fallo y seguir con la tarea.
3. Si la tarea ya no puede continuar de ninguna forma, explica el motivo. Si ya está completada con éxito a pesar de una advertencia inocua, responde ÚNICAMENTE con [DONE].`;
        } else {
          followUp += `Revisa la salida anterior. Si el objetivo está completamente cumplido y verificado, responde ÚNICAMENTE con [DONE]. Si se requiere dar el siguiente paso, proporciona el comando bash correspondiente.`;
        }

        handleAsk(followUp);
      }
    }, 500);
  };

  const handleFixError = (failedCmd: string, errorOut: string) => {
    const cleanErr = errorOut.slice(-2000).trim();
    handleAsk(`El comando ejecutado:\n\`\`\`bash\n${failedCmd}\n\`\`\`\nProdujo el siguiente error en la terminal:\n\`\`\`\n${cleanErr}\n\`\`\`\nPor favor analiza la causa del fallo y proporciona el comando corregido para solucionarlo.`);
  };

  const handleAsk = async (customPrompt?: string) => {
    const textToSubmit = customPrompt !== undefined ? customPrompt : prompt.trim();
    if (!textToSubmit || (provider !== 'ollama' && !apiKey.trim())) return;
    
    if (customPrompt === undefined) {
      setMessages(prev => [...prev, { role: 'user', content: textToSubmit }]);
      setPrompt('');
      if (autoMode) {
        setAutoStep(0);
        setAutoStatusStage('planning');
      }
    } else {
      setMessages(prev => [...prev, { role: 'system', content: textToSubmit }]);
      if (autoMode) {
        setAutoStatusStage('planning');
      }
    }
    
    setLoading(true);
    setError('');
    
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (apiKey.trim()) headers['Authorization'] = `Bearer ${apiKey}`;
      
      const modelCat = detectModelCategory(provider, selectedModel);
      const effectiveEnv: EnvContext = env || {
        platform: typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac') ? 'darwin' : 'linux',
        connectionType: 'local'
      };

      const gentleConfig = settings?.gentleAi || {
        enableGentleman: true,
        enableEngram: true,
        enableContext7: true,
        enableGuardrails: true,
        context7ApiKey: ''
      };

      let systemPrompt = await buildSystemPrompt(
        activeAgent.systemPrompt,
        modelCat,
        effectiveEnv,
        autoMode,
        true,
        {
          enableGentleman: gentleConfig.enableGentleman,
          enableEngram: gentleConfig.enableEngram,
          enableContext7: gentleConfig.enableContext7,
          context7ApiKey: gentleConfig.context7ApiKey,
          query: textToSubmit
        }
      );

      // Refresh terminal context snapshot right before submitting
      const currentRaw = getTerminalContext ? getTerminalContext() : '';
      const currentSel = getSelectedText ? getSelectedText() : '';
      setCachedTermContext(currentRaw);
      setCachedSelText(currentSel);
      const currentSmart = smartTruncateTerminalContext(currentRaw, 35);

      // Attach context according to selected mode to drastically save tokens
      if (contextMode === 'selection' && currentSel.trim()) {
        systemPrompt += `\n\nTexto/error seleccionado en la consola:\n\`\`\`\n${currentSel.trim()}\n\`\`\``;
      } else if (contextMode === 'smart' && currentSmart.context) {
        systemPrompt += `\n\nContexto actual de la sesión de terminal:\n\`\`\`\n${currentSmart.context}\n\`\`\``;
      }

      // Redact sensitive secrets from system prompt & context
      if (gentleConfig.enableGuardrails) {
        systemPrompt = redactSensitiveData(systemPrompt);
      }
      
      // Sliding window: keep up to 6 recent messages to save tokens
      const recentMessages = messages.slice(-6).map(m => ({
        role: m.role === 'system' ? 'user' : m.role,
        content: m.content
      }));

      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...recentMessages,
        { role: 'user', content: textToSubmit }
      ];
      
      let fetchUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      if (provider === 'ollama' && !fetchUrl.endsWith('/v1')) {
          if (fetchUrl.endsWith('/api')) fetchUrl = fetchUrl.slice(0, -4);
          fetchUrl = fetchUrl + '/v1';
      }
      if (fetchUrl.endsWith('/chat/completions')) fetchUrl = fetchUrl.replace('/chat/completions', '');
      
      const requestBody: any = {
        model: selectedModel,
        messages: apiMessages,
        stream: true
      };
      if (modelCat !== 'reasoning') {
        requestBody.temperature = modelCat === 'compact-local' ? 0.05 : 0.1;
      }

      let accumulatedRaw = '';

      if (window.electronAPI.systemFetchStream) {
        // Pre-create temporary assistant message for live streaming
        setMessages(prev => [...prev, { role: 'assistant', content: '', thinking: undefined }]);

        const reqId = `drawer_${Date.now()}`;
        await new Promise<void>((resolve, reject) => {
          window.electronAPI.systemFetchStream!(
            reqId,
            `${fetchUrl}/chat/completions`,
            {
              method: 'POST',
              headers: headers,
              body: JSON.stringify(requestBody)
            },
            {
              onDelta: (delta: string) => {
                accumulatedRaw += delta;
                const { thinking: partialThinking, cleanContent: partialClean } = cleanReasoningOutput(accumulatedRaw);
                const { text: partialNarrative, actions: partialActions } = parseActions(partialClean);
                setMessages(prev => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === 'assistant') {
                    updated[updated.length - 1] = {
                      ...last,
                      content: partialNarrative,
                      thinking: partialThinking,
                      actions: partialActions
                    };
                  }
                  return updated;
                });
              },
              onDone: () => resolve(),
              onError: (err: string) => reject(new Error(err))
            }
          ).then(initRes => {
            if (!initRes.success) reject(new Error(initRes.message || 'Error inicializando stream'));
          }).catch(reject);
        });
      } else {
        const res = await (window as any).electronAPI.systemFetch(`${fetchUrl}/chat/completions`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });
        if (!res.success) throw new Error(res.message || 'Error fetching response');
        accumulatedRaw = res.data.choices[0].message.content;
      }

      const { thinking, cleanContent } = cleanReasoningOutput(accumulatedRaw);
      const { text: narrativeText, actions } = parseActions(cleanContent);
      
      if (autoMode) {
        if (narrativeText.includes('[DONE]')) {
          const finalAnalysis = narrativeText.replace('[DONE]', '').trim();
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { role: 'assistant', content: `✅ Tarea autónoma finalizada con éxito.\n\n${finalAnalysis}`, thinking, actions };
              return copy;
            }
            return [...copy, { role: 'assistant', content: `✅ Tarea autónoma finalizada con éxito.\n\n${finalAnalysis}`, thinking, actions }];
          });
          setIsAutoLooping(false);
          setAutoStatusStage('idle');
        } else {
          setMessages(prev => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { role: 'assistant', content: narrativeText, thinking, actions };
              return copy;
            }
            return [...copy, { role: 'assistant', content: narrativeText, thinking, actions }];
          });
          setIsAutoLooping(true);
          const cmd = extractCommand(narrativeText);
          if (cmd) {
            if (gentleConfig.enableGuardrails) {
              const sec = inspectCommandSecurity(cmd);
              if (!sec.isSafe && sec.severity === 'critical') {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `🛑 **Comando bloqueado por Gentleman Guardrails**:\n\`\`\`bash\n${cmd}\n\`\`\`\n**Motivo:** ${sec.warning}\nLa ejecución automática se detuvo por seguridad preventiva.`
                }]);
                setIsAutoLooping(false);
                setAutoStatusStage('idle');
                return;
              }
            }

            const nextStep = autoStep + 1;
            setAutoStep(nextStep);
            setAutoCurrentCommand(cmd);
            setAutoStatusStage('executing');
            executeCommand(cmd);
          }
          startCommandObserver();
        }
      } else {
        setMessages(prev => {
          const copy = [...prev];
          const last = copy[copy.length - 1];
          if (last && last.role === 'assistant') {
            copy[copy.length - 1] = { role: 'assistant', content: narrativeText, thinking, actions };
            return copy;
          }
          return [...copy, { role: 'assistant', content: narrativeText, thinking, actions }];
        });
      }
    } catch (e: any) {
      setError(e.message || 'Error en la petición de IA');
      setIsAutoLooping(false);
      setAutoStatusStage('idle');
    } finally {
      setLoading(false);
    }
  };

  const handlePasteToPrompt = async () => {
    try {
      const pastePromise = (window as any).electronAPI?.readClipboard
        ? (window as any).electronAPI.readClipboard()
        : navigator.clipboard.readText();
      const text = await Promise.resolve(pastePromise);
      if (text) {
        setPrompt(prev => prev ? `${prev}\n${text}` : text);
      }
    } catch (e) {}
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

  const deleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const newSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(newSessions);
    try {
      localStorage.setItem('vincent_chat_history', JSON.stringify(newSessions));
    } catch (err) {}
    if (currentSessionId === sessionId) {
      startNewChat();
    }
  };

  const renderAssistantContent = (msg: ChatMessage) => {
    const { content, thinking, actions } = msg;
    const topElements: React.ReactNode[] = [];

    if (thinking) {
      topElements.push(
        <details key="thinking" style={{ margin: '4px 0 8px 0', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '6px 10px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <summary style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--text-muted)', userSelect: 'none' }}>
            💭 Razonamiento del modelo ({thinking.length} caracteres)
          </summary>
          <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: '1.4', maxHeight: '160px', overflowY: 'auto' }}>
            {thinking}
          </div>
        </details>
      );
    }

    if (actions && actions.length > 0) {
      actions.forEach((act, idx) => {
        topElements.push(
          <ActionCardComponent key={`act-${idx}`} action={act} onApply={onApplyAction || (() => {})} />
        );
      });
    }

    if (content.includes('✅') || content.includes('[DONE]')) {
      const cleanText = content.replace('[DONE]', '').trim();
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
          {topElements}
          <div style={{ 
            padding: '10px 12px', 
            borderRadius: '6px', 
            backgroundColor: 'rgba(0, 229, 255, 0.08)', 
            border: '1px solid #00e5ff', 
            color: '#00e5ff',
            fontSize: '12px',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap'
          }}>
            {cleanText}
          </div>
        </div>
      );
    }

    const codeBlockRegex = /```(?:bash|sh|shell|zsh)?[\r\n]+([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [...topElements];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push(
          <div key={`text-${lastIndex}`} style={{ fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>
            {textBefore}
          </div>
        );
      }
      const cmd = extractCommand(match[0]);
      parts.push(
        <CommandActionCard 
          key={`cmd-${match.index}`} 
          command={cmd} 
          onExecute={executeCommand} 
          onInsert={insertCommand} 
          liveExecState={liveExecState}
          onCancelLiveExec={stopLiveExecution}
          onFixError={handleFixError}
        />
      );
      lastIndex = match.index + match[0].length;
    }

    const textAfter = content.substring(lastIndex);
    if (textAfter.trim()) {
      if (parts.length === topElements.length) {
        const lines = textAfter.split('\n');
        const hasOnlyCommandsOrComments = lines.every(l => l.trim() === '' || l.trim().startsWith('#') || !/^[A-Z¿¡]/.test(l.trim()));
        
        if (hasOnlyCommandsOrComments && lines.some(l => l.trim() && !l.trim().startsWith('#'))) {
          const commentLines = lines.filter(l => l.trim().startsWith('#')).map(l => l.replace(/^#\s*/, '')).join('\n');
          const cmdLines = lines.filter(l => l.trim() && !l.trim().startsWith('#')).join('\n');

          if (commentLines) {
            parts.push(
              <div key="comments" style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '6px' }}>
                💡 {commentLines}
              </div>
            );
          }
          parts.push(
            <CommandActionCard 
              key="raw-cmd" 
              command={cmdLines} 
              onExecute={executeCommand} 
              onInsert={insertCommand} 
              liveExecState={liveExecState}
              onCancelLiveExec={stopLiveExecution}
              onFixError={handleFixError}
            />
          );
        } else {
          parts.push(
            <div key="full-text" style={{ fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>
              {textAfter}
            </div>
          );
        }
      } else {
        parts.push(
          <div key={`text-${lastIndex}`} style={{ fontSize: '12px', lineHeight: 1.5, whiteSpace: 'pre-wrap', color: 'var(--text-main)', marginTop: '6px' }}>
            {textAfter}
          </div>
        );
      }
    }

    return <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>{parts}</div>;
  };

  if (!isActive) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)', padding: '12px', borderLeft: '1px solid var(--border-light)' }}>
      
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <VscSparkle color="var(--neon-green, #00ff00)" size={18} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-main)' }}>
              Vincent AI
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: loading ? '#eab308' : '#22c55e', display: 'inline-block', boxShadow: `0 0 6px ${loading ? '#eab308' : '#22c55e'}` }} />
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Antigravity Console Agent</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button 
            type="button"
            onClick={onTogglePin} 
            title={isPinned ? "Desanclar panel de IA (actualmente fijado)" : "Fijar panel de IA abierto"}
            style={{ 
              padding: '5px 8px', 
              fontSize: '11px', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              backgroundColor: isPinned ? 'rgba(0, 255, 0, 0.15)' : 'var(--bg-input)', 
              color: isPinned ? 'var(--neon-green, #00ff00)' : 'var(--text-muted)', 
              border: isPinned ? '1px solid var(--neon-green, #00ff00)' : '1px solid var(--border-color)', 
              borderRadius: '4px', 
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <FaThumbtack size={10} style={{ transform: isPinned ? 'rotate(0deg)' : 'rotate(45deg)', transition: 'transform 0.2s' }} /> 
            {isPinned ? 'Fijado' : 'Fijar'}
          </button>
          <button 
            type="button"
            onClick={onOpenEngram} 
            title="Gestor de Memoria Engram"
            style={{ padding: '5px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(168, 85, 247, 0.12)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '4px', cursor: 'pointer' }}
          >
            <FaBrain size={10} /> Engram
          </button>
          <button 
            type="button"
            onClick={() => setShowHistory(!showHistory)} 
            title="Historial de conversaciones"
            style={{ padding: '5px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: showHistory ? 'var(--accent)' : 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
          >
            <FaHistory size={10} /> Historial
          </button>
          <button 
            type="button"
            onClick={startNewChat} 
            title="Nueva sesión"
            style={{ padding: '5px 8px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'var(--bg-input)', color: 'var(--neon-green, #00ff00)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
          >
            <FaPlus size={10} /> Nuevo
          </button>
          <button 
            type="button"
            onClick={() => { setIsAutoLooping(false); onClose?.(); }} 
            title="Cerrar panel"
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <FaTimes size={12} />
          </button>
        </div>
      </div>

      {/* Model & Agent Badges Selector */}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px', backgroundColor: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
        {/* Profile Pill */}
        {settings?.aiProfiles && settings.aiProfiles.length > 1 && (
          <select 
            value={activeProfile.id}
            onChange={(e) => setSelectedProfileId(e.target.value)}
            style={{ padding: '3px 6px', fontSize: '11px', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', maxWidth: '140px' }}
          >
            {settings.aiProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Model Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {availableModels.length > 0 ? (
            <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ padding: '3px 6px', fontSize: '11px', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', maxWidth: '160px', fontWeight: 600 }}
            >
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-main)', backgroundColor: 'var(--bg-panel)', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              {fetchingModels ? '⏳ Modelos...' : selectedModel}
            </span>
          )}
        </div>

        {/* Agent Persona Pill */}
        {allAgents.length > 0 && (
          <select 
            value={selectedAgentId || activeAgent.id}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            style={{ padding: '3px 6px', fontSize: '11px', backgroundColor: 'var(--bg-panel)', color: 'var(--text-muted)', border: '1px solid var(--border-color)', borderRadius: '4px', maxWidth: '130px' }}
          >
            {allAgents.filter(a => a.id !== 'agent_meta').map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        {/* Auto-run Toggle */}
        <label 
          title="Modo Autónomo: La IA ejecuta comandos iterativamente hasta completar el objetivo."
          style={{ 
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
            color: autoMode ? 'var(--neon-green, #00ff00)' : 'var(--text-muted)',
            backgroundColor: autoMode ? 'rgba(0,255,0,0.12)' : 'transparent',
            padding: '2px 6px', borderRadius: '4px', border: autoMode ? '1px solid rgba(0,255,0,0.3)' : '1px solid transparent'
          }}
        >
          <input 
            type="checkbox" 
            checked={autoMode} 
            onChange={e => { setAutoMode(e.target.checked); if(!e.target.checked) setIsAutoLooping(false); }} 
            style={{ margin: 0, cursor: 'pointer' }} 
          />
          <FaBolt size={10} /> Auto-run
        </label>
      </div>

      {/* Live Running Pill (when executing outside auto-run) */}
      {liveExecState.isRunning && !autoMode && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.4)',
          borderRadius: '6px',
          marginBottom: '4px',
          boxShadow: '0 0 10px rgba(34, 197, 94, 0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 1s infinite' }} />
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#4ade80', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ⚡ Ejecutando: <code style={{ color: '#fff', backgroundColor: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '3px' }}>{liveExecState.command.slice(0, 30)}</code>
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              ⏱️ {(liveExecState.elapsedMs / 1000).toFixed(1)}s
            </span>
          </div>
          <button
            type="button"
            onClick={stopLiveExecution}
            title="Interrumpir proceso (Ctrl+C)"
            style={{
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: 700,
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <FaTimes size={9} /> Detener (Ctrl+C)
          </button>
        </div>
      )}
      
      {/* Body Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '8px' }}>
        {showHistory ? (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
            {/* Header Tabs for History */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', gap: '6px', paddingBottom: '4px' }}>
              <button
                type="button"
                onClick={() => setHistoryTab('sessions')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: historyTab === 'sessions' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: historyTab === 'sessions' ? 'var(--text-main)' : 'var(--text-muted)',
                  fontWeight: historyTab === 'sessions' ? 600 : 400,
                  fontSize: '11px',
                  padding: '4px 8px',
                  cursor: 'pointer'
                }}
              >
                💬 Conversaciones ({sessions.length})
              </button>
              <button
                type="button"
                onClick={() => setHistoryTab('commands')}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: historyTab === 'commands' ? '2px solid var(--accent)' : '2px solid transparent',
                  color: historyTab === 'commands' ? 'var(--neon-green, #00ff00)' : 'var(--text-muted)',
                  fontWeight: historyTab === 'commands' ? 600 : 400,
                  fontSize: '11px',
                  padding: '4px 8px',
                  cursor: 'pointer'
                }}
              >
                ⚡ Comandos ({commandLogs.length})
              </button>
            </div>

            {historyTab === 'sessions' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sessions.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', marginTop: '30px' }}>
                    No hay historial de conversaciones guardado todavía.
                  </div>
                )}
                {sessions.map(session => (
                  <div 
                    key={session.id} 
                    onClick={() => loadSession(session)}
                    style={{ 
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 10px', backgroundColor: currentSessionId === session.id ? 'var(--accent)' : 'var(--bg-input)', 
                      border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' 
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: currentSessionId === session.id ? '#fff' : 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {session.title || 'Conversación'}
                      </span>
                      <span style={{ fontSize: '9px', color: currentSessionId === session.id ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)' }}>
                        {new Date(session.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => deleteSession(e, session.id)}
                      style={{ background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', padding: '4px' }}
                      title="Eliminar sesión"
                    >
                      <FaTrash size={10} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Filtrar historial de comandos..."
                    value={commandFilter}
                    onChange={e => setCommandFilter(e.target.value)}
                    style={{ flex: 1, padding: '5px 8px', fontSize: '11px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
                  />
                  {commandLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => clearCommandHistory()}
                      title="Vaciar historial de comandos"
                      style={{ padding: '4px 8px', fontSize: '10px', backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      Vaciar
                    </button>
                  )}
                </div>

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '2px 4px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '4px' }}>
                  💡 <strong>Tip:</strong> Puedes ver y exportar este log en DevTools escribiendo <code style={{ color: '#38bdf8' }}>getCommandHistory()</code> en la consola.
                </div>

                {commandLogs
                  .filter(c => !commandFilter.trim() || c.command.toLowerCase().includes(commandFilter.toLowerCase()) || (c.trigger && c.trigger.toLowerCase().includes(commandFilter.toLowerCase())))
                  .length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center', marginTop: '20px' }}>
                    {commandFilter ? 'No se encontraron comandos coincidentes.' : 'Aún no hay ejecuciones registradas.'}
                  </div>
                )}

                {commandLogs
                  .filter(c => !commandFilter.trim() || c.command.toLowerCase().includes(commandFilter.toLowerCase()) || (c.trigger && c.trigger.toLowerCase().includes(commandFilter.toLowerCase())))
                  .slice()
                  .reverse()
                  .map(item => (
                    <div
                      key={item.id}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'rgba(0,0,0,0.35)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: item.status === 'completed' ? '#22c55e' : item.status === 'interrupted' ? '#f59e0b' : '#ef4444'
                          }} />
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                          <span style={{
                            fontSize: '9px',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            backgroundColor: 'rgba(56,189,248,0.1)',
                            color: '#38bdf8',
                            border: '1px solid rgba(56,189,248,0.2)'
                          }}>
                            {item.trigger === 'autonomous' ? 'Auto-Run' : item.trigger === 'quick_palette' ? 'Paleta' : 'Vincent AI'}
                          </span>
                        </div>
                        {item.elapsedMs !== undefined && item.elapsedMs > 0 && (
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                            ⏱️ {item.elapsedMs}ms
                          </span>
                        )}
                      </div>

                      <div style={{
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        padding: '6px 8px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: '#4ade80',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}>
                        {item.command}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '2px' }}>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(item.command)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                        >
                          <FaCopy size={9} /> Copiar
                        </button>
                        <button
                          type="button"
                          onClick={() => executeCommand(item.command)}
                          style={{ background: 'none', border: 'none', color: 'var(--neon-green, #00ff00)', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}
                        >
                          <FaPlay size={8} /> Re-ejecutar
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Autonomous execution live status banner */}
            {isAutoLooping && (
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '6px', 
                backgroundColor: 'rgba(0, 255, 0, 0.08)', 
                border: '1px solid var(--neon-green, #00ff00)', 
                padding: '8px 10px', 
                borderRadius: '6px',
                boxShadow: '0 0 15px rgba(0, 255, 0, 0.15)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--neon-green, #00ff00)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--neon-green, #00ff00)', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                    ⚡ MODO AUTÓNOMO EN VIVO (Paso #{autoStep || 1})
                  </span>
                  <button 
                    type="button"
                    onClick={stopAutoRun} 
                    style={{ padding: '3px 8px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontWeight: 800 }}
                  >
                    ⏹ DETENER
                  </button>
                </div>
                
                <div style={{ fontSize: '11px', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {autoStatusStage === 'planning' && <span>🧠 <em>Analizando contexto de consola y planificando...</em></span>}
                  {autoStatusStage === 'executing' && <span>⚡ <strong>Ejecutando:</strong> <code style={{ color: 'var(--neon-green, #00ff00)', backgroundColor: 'rgba(0,0,0,0.4)', padding: '2px 4px', borderRadius: '3px' }}>{autoCurrentCommand}</code></span>}
                  {autoStatusStage === 'observing' && <span>⏳ <em>Esperando salida y respuesta de la terminal...</em></span>}
                  {autoStatusStage === 'analyzing' && <span>🔍 <em>Analizando nuevo output de la terminal...</em></span>}
                </div>
              </div>
            )}

            {/* Conversation Stream */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', paddingRight: '4px' }}>
              {messages.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, textAlign: 'center', padding: '20px', gap: '12px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: 'rgba(0, 255, 0, 0.1)', border: '1px solid rgba(0, 255, 0, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <VscSparkle size={24} color="var(--neon-green, #00ff00)" />
                  </div>
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: 'var(--text-main)' }}>¿En qué puedo ayudarte hoy?</h4>
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', maxWidth: '300px' }}>
                      Asistente DevOps interactivo con contexto sincronizado de tu terminal activa.
                    </p>
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', width: msg.role === 'user' ? 'auto' : '100%', maxWidth: msg.role === 'user' ? '85%' : '100%' }}>
                  {msg.role === 'user' ? (
                    <div style={{ 
                      padding: '8px 12px', 
                      backgroundColor: 'var(--accent)', 
                      color: 'var(--button-text)', 
                      borderRadius: '12px 12px 2px 12px', 
                      fontSize: '12px', 
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}>
                      {msg.content}
                    </div>
                  ) : msg.role === 'system' ? (
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      padding: '6px 10px', 
                      backgroundColor: 'rgba(0, 229, 255, 0.05)', 
                      border: '1px solid rgba(0, 229, 255, 0.2)', 
                      borderRadius: '6px', 
                      fontSize: '11px', 
                      color: 'var(--text-main)',
                      alignSelf: 'stretch',
                      margin: '2px 0'
                    }}>
                      <span style={{ 
                        color: '#00e5ff', 
                        fontWeight: 800, 
                        fontSize: '9px', 
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase', 
                        backgroundColor: 'rgba(0, 229, 255, 0.12)', 
                        padding: '2px 5px', 
                        borderRadius: '3px',
                        border: '1px solid rgba(0, 229, 255, 0.3)'
                      }}>
                        ⚡ AUTO-RUN LOG
                      </span>
                      <span style={{ flex: 1, fontSize: '11px', color: 'var(--text-muted)' }}>{msg.content}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 600, color: 'var(--neon-green, #00ff00)', marginBottom: '2px' }}>
                        <VscSparkle size={12} /> Vincent AI
                      </div>
                      {renderAssistantContent(msg)}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '6px', border: '1px solid var(--border-light)', width: 'fit-content' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--neon-green, #00ff00)', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Analizando contexto y generando respuesta...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Action Chips */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', paddingTop: '4px' }}>
              {QUICK_PROMPTS.map((chip) => {
                const renderChipIcon = () => {
                  switch (chip.iconType) {
                    case 'folder': return <VscFolder size={12} color="#f59e0b" />;
                    case 'package': return <VscPackage size={12} color="#38bdf8" />;
                    case 'search': return <VscSearch size={12} color="#a855f7" />;
                    case 'tools': return <VscTools size={12} color="#f97316" />;
                    case 'graph': return <VscGraph size={12} color="#22c55e" />;
                    case 'lock': return <VscLock size={12} color="#ec4899" />;
                    default: return null;
                  }
                };

                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => handleAsk(chip.prompt)}
                    disabled={loading || (provider !== 'ollama' && !apiKey.trim())}
                    style={{
                      padding: '4px 9px',
                      fontSize: '11px',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: (loading || (provider !== 'ollama' && !apiKey.trim())) ? 'not-allowed' : 'pointer',
                      opacity: (loading || (provider !== 'ollama' && !apiKey.trim())) ? 0.5 : 1,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                  >
                    {renderChipIcon()}
                    <span>{chip.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Input Composer */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px' }}>
              
              {/* Context Selector Bar for Token Optimization */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>📎 Contexto:</span>
                  <select
                    value={contextMode}
                    onChange={e => setContextMode(e.target.value as any)}
                    style={{
                      backgroundColor: 'var(--bg-panel)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      fontSize: '10px',
                      padding: '2px 4px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="smart">⚡ Inteligente (~{smartContextResult.sentLines} líneas, ~{estimateTokens(smartContextResult.context)} tokens)</option>
                    <option value="selection" disabled={!cachedSelText}>
                      {cachedSelText ? `📝 Solo selección (~${estimateTokens(cachedSelText)} tokens)` : '📝 Selección (ninguna)'}
                    </option>
                    <option value="none">🚫 Sin contexto (0 tokens extra)</option>
                  </select>
                  {contextMode === 'smart' && smartContextResult.savedTokensEstimate > 0 && (
                    <span style={{ color: '#4ade80', fontWeight: 600 }}>
                      (ahorro ~{smartContextResult.savedTokensEstimate} tokens)
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handlePasteToPrompt}
                    title="Pegar contenido copiado desde cualquier aplicación"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 8px',
                      fontSize: '10px',
                      backgroundColor: 'rgba(255,255,255,0.08)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <FaPaste size={9} color="#00e5ff" /> Pegar portapapeles
                  </button>
                  <span>Enter ↵ enviar • Shift+Enter nueva línea</span>
                </div>
              </div>

              {error && <div style={{ color: '#ff6b6b', fontSize: '11px' }}>❌ {error}</div>}

              <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: '6px' }}>
                <textarea 
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onPaste={async (e) => {
                    const clipboardText = e.clipboardData?.getData('text');
                    if (!clipboardText && (window as any).electronAPI?.readClipboard) {
                      e.preventDefault();
                      const nativeText = await (window as any).electronAPI.readClipboard();
                      if (nativeText) {
                        const target = e.target as HTMLTextAreaElement;
                        const start = target.selectionStart;
                        const end = target.selectionEnd;
                        const newPrompt = prompt.substring(0, start) + nativeText + prompt.substring(end);
                        setPrompt(newPrompt);
                      }
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAsk();
                    }
                  }}
                  disabled={loading || (provider !== 'ollama' && !apiKey.trim())}
                  placeholder={(!apiKey.trim() && provider !== 'ollama') ? "Configura tu API Key en Ajustes para interactuar..." : "Pregunta a Vincent o describe la tarea que deseas automatizar..."}
                  rows={2}
                  style={{ 
                    flex: 1, 
                    resize: 'none', 
                    padding: '6px 8px', 
                    backgroundColor: 'transparent', 
                    border: 'none', 
                    outline: 'none',
                    color: '#fff', 
                    fontSize: '12px', 
                    fontFamily: 'inherit',
                    lineHeight: 1.4
                  }}
                />

                <button 
                  type="button"
                  onClick={() => handleAsk()}
                  disabled={loading || !prompt.trim() || (provider !== 'ollama' && !apiKey.trim())}
                  style={{ 
                    padding: '6px 12px', 
                    backgroundColor: (loading || !prompt.trim() || (provider !== 'ollama' && !apiKey.trim())) ? 'rgba(255,255,255,0.05)' : 'var(--neon-green, #00ff00)', 
                    color: (loading || !prompt.trim() || (provider !== 'ollama' && !apiKey.trim())) ? 'var(--text-muted)' : '#000', 
                    border: 'none', 
                    borderRadius: '6px', 
                    cursor: (loading || !prompt.trim() || (provider !== 'ollama' && !apiKey.trim())) ? 'not-allowed' : 'pointer', 
                    fontWeight: 700,
                    fontSize: '11px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Enviar mensaje"
                >
                  <FaPlay size={9} /> Enviar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export const TerminalComponent: React.FC<TerminalProps> = ({ id, type, config, isActive, settings = defaultTermSettings, onApplyAction }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isInitialized = useRef(false);
  const [showSftp, setShowSftp] = useState(false);
  const [showQuickAi, setShowQuickAi] = useState(false);
  const [showEngramModal, setShowEngramModal] = useState(false);
  const [initialAiPrompt, setInitialAiPrompt] = useState('');
  const [isPinned, setIsPinned] = useState(() => {
    try {
      return localStorage.getItem('vincent_ai_pinned') === 'true';
    } catch {
      return false;
    }
  });
  const [showAi, setShowAi] = useState(() => {
    try {
      return localStorage.getItem('vincent_ai_pinned') === 'true';
    } catch {
      return false;
    }
  });
  const [sftpWidth, setSftpWidth] = useState(440);
  const [isResizing, setIsResizing] = useState(false);
  const [termContextMenu, setTermContextMenu] = useState<{ x: number, y: number, hasSelection: boolean, selectionText: string } | null>(null);
  const [isAutoRunning, setIsAutoRunning] = useState(false);
  const isAutoRunningRef = useRef(false);
  const terminalDataSubscribersRef = useRef<Set<(chunk: string) => void>>(new Set());

  const subscribeToTerminalData = React.useCallback((cb: (chunk: string) => void) => {
    terminalDataSubscribersRef.current.add(cb);
    return () => {
      terminalDataSubscribersRef.current.delete(cb);
    };
  }, []);

  const envContext: EnvContext = useMemo(() => {
    const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
    const isWin = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('win');
    const platform = isMac ? 'darwin' : isWin ? 'win32' : 'linux';
    return {
      platform,
      connectionType: type,
      shell: type === 'local' ? (isMac ? 'zsh' : isWin ? 'powershell' : 'bash') : 'bash',
      username: config?.username,
      hostname: config?.host,
    };
  }, [type, config]);

  const getSelectedText = () => {
    return xtermRef.current?.getSelection() || '';
  };

  const togglePin = () => {
    setIsPinned(prev => {
      const next = !prev;
      try {
        localStorage.setItem('vincent_ai_pinned', String(next));
      } catch (e) {}
      if (next) setShowAi(true);
      return next;
    });
  };

  useEffect(() => {
    isAutoRunningRef.current = isAutoRunning;
    if (xtermRef.current) {
      xtermRef.current.options.disableStdin = isAutoRunning;
    }
  }, [isAutoRunning]);

  useEffect(() => {
    const handleOutsideClick = () => setTermContextMenu(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (isActive && fitAddonRef.current && !isResizing && terminalRef.current) {
      const raf = requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          if (xtermRef.current) {
            window.electronAPI.resizeTerminal(id, xtermRef.current.cols, xtermRef.current.rows);
          }
        } catch (e) {}
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [showSftp, isActive, id, isResizing]);

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
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          if (xtermRef.current) {
            window.electronAPI.resizeTerminal(id, xtermRef.current.cols, xtermRef.current.rows);
          }
        } catch (e) {}
      });
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
      fastScrollModifier: 'alt',
      fastScrollSensitivity: 5,
      scrollback: 5000,
      theme: {
        background: getComputedColor(settings?.background) || '#1e1e1e',
        foreground: getComputedColor(settings?.foreground) || '#ffffff',
      }
    });
      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      
      term.open(terminalRef.current);

      let webglAddonInstance: WebglAddon | null = null;
      try {
        webglAddonInstance = new WebglAddon();
        webglAddonInstance.onContextLoss(() => {
          try {
            webglAddonInstance?.dispose();
          } catch (e) {}
          webglAddonInstance = null;
        });
        term.loadAddon(webglAddonInstance);
      } catch (e) {
        console.warn('[VinTerm] WebGL2 no disponible, usando canvas fallback:', e);
      }

      // Custom key handler for Ctrl+C / Cmd+C (copy when selected), Ctrl+V (paste), etc.
      term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
        // Ctrl+C or Cmd+C: Copy selected text without interrupting the process
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
          if (term.hasSelection()) {
            if (event.type === 'keydown') {
              const selectedText = term.getSelection();
              if (selectedText) {
                navigator.clipboard.writeText(selectedText);
              }
            }
            return false; // prevent sending \x03 (SIGINT)
          }
          if (isAutoRunningRef.current) {
            return false; // locked during auto-run
          }
          return true; // no selection, send SIGINT as usual
        }

        // If Auto-run is running, block any user keystrokes / pastes
        if (isAutoRunningRef.current) {
          return false;
        }

        // Ctrl+V or Cmd+V: Paste from clipboard
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
          if (event.type === 'keydown') {
            const pastePromise = window.electronAPI.readClipboard
              ? window.electronAPI.readClipboard()
              : navigator.clipboard.readText();
            Promise.resolve(pastePromise).then(text => {
              if (text) {
                window.electronAPI.sendToTerminal(id, text);
              }
            }).catch(() => {});
          }
          return false;
        }

        // Cmd+K or Ctrl+K: Quick AI Command Palette
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
          if (event.type === 'keydown') {
            setShowQuickAi(prev => !prev);
          }
          return false;
        }

        // Ctrl+Shift+A or Cmd+A: Select all text
        if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
          if (event.type === 'keydown') {
            term.selectAll();
          }
          return false;
        }

        return true;
      });

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

      // Animated ANSI Welcome Banner & pty output buffer
      let isBannerPlaying = true;
      const bufferedPtyChunks: string[] = [];

      const flushBufferedPtyData = () => {
        isBannerPlaying = false;
        while (bufferedPtyChunks.length > 0) {
          const chunk = bufferedPtyChunks.shift();
          if (chunk) {
            try {
              term.write(chunk);
            } catch (e) {}
          }
        }
      };

      const bannerHandle = playWelcomeBanner(term, { type, config }, () => {
        flushBufferedPtyData();
      });

      window.electronAPI.onTerminalData(id, (data: string) => {
        if (isBannerPlaying) {
          bufferedPtyChunks.push(data);
        } else {
          term.write(data);
        }
        terminalDataSubscribersRef.current.forEach(cb => {
          try { cb(data); } catch (e) {}
        });
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
        if (isBannerPlaying) {
          bannerHandle.cancel();
          flushBufferedPtyData();
        }
        if (isAutoRunningRef.current) {
          return; // Block user typing during Auto-run
        }
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
      bannerHandle.cancel(true);
      if (isInitialized.current) {
        window.electronAPI.closeTerminal(id);
      }
      isInitialized.current = false;
      const t = xtermRef.current;
      xtermRef.current = null;
      fitAddonRef.current = null;
      try {
        webglAddonInstance?.dispose();
      } catch (e) {}
      webglAddonInstance = null;
      try {
        t?.dispose();
      } catch (e) {}
    };
  }, []);

  useEffect(() => {
    if (!terminalRef.current) return;

    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (isActive && fitAddonRef.current && isInitialized.current) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          try {
            fitAddonRef.current?.fit();
            if (xtermRef.current) {
              window.electronAPI.resizeTerminal(id, xtermRef.current.cols, xtermRef.current.rows);
            }
          } catch (e) {}
        });
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
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
        <div 
          style={{ flex: 1, position: 'relative', height: '100%', minWidth: 0 }}
          onContextMenu={(e) => {
            e.preventDefault();
            const hasSelection = xtermRef.current ? xtermRef.current.hasSelection() : false;
            const selectionText = xtermRef.current ? xtermRef.current.getSelection() : '';
            setTermContextMenu({
              x: e.clientX,
              y: e.clientY,
              hasSelection,
              selectionText
            });
          }}
        >
          <div ref={terminalRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />

          {/* Floating lock badge when Auto-run is active */}
          {isAutoRunning && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '16px',
              backgroundColor: 'rgba(15, 15, 15, 0.88)',
              border: '1px solid var(--neon-green, #00ff00)',
              borderRadius: '20px',
              padding: '5px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '11px',
              color: 'var(--neon-green, #00ff00)',
              fontWeight: 600,
              zIndex: 40,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
              pointerEvents: 'none'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--neon-green, #00ff00)', animation: 'pulse 1s infinite' }} />
              🔒 Entrada bloqueada (Modo Autónomo activo)
            </div>
          )}

          {/* Quick AI Command Palette (Cmd+K / Ctrl+K) */}
          <QuickAiBar
            isOpen={showQuickAi}
            onClose={() => setShowQuickAi(false)}
            onExecute={(cmd) => {
              executeLiveCommand({
                id,
                command: cmd,
                term: xtermRef.current,
                agentName: 'Vincent AI',
                trigger: 'quick_palette',
                sessionType: type
              });
            }}
            onInsert={(cmd) => {
              window.electronAPI.sendToTerminal(id, cmd);
            }}
            settings={settings}
            env={envContext}
            selectedText={xtermRef.current?.getSelection()}
          />

          {/* Engram Persistent Memory Modal */}
          <EngramModal 
            isOpen={showEngramModal} 
            onClose={() => setShowEngramModal(false)} 
          />
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
            <AiDrawer 
              id={id} 
              isActive={showAi && isActive} 
              onClose={() => { 
                if (isPinned) {
                  setIsPinned(false);
                  try { localStorage.setItem('vincent_ai_pinned', 'false'); } catch (e) {}
                }
                setShowAi(false); 
              }} 
              settings={settings} 
              getTerminalContext={getTerminalContext} 
              getSelectedText={getSelectedText}
              onAutoRunChange={setIsAutoRunning} 
              isPinned={isPinned}
              onTogglePin={togglePin}
              onApplyAction={onApplyAction}
              initialPrompt={initialAiPrompt}
              onClearInitialPrompt={() => setInitialAiPrompt('')}
              env={envContext}
              onOpenEngram={() => setShowEngramModal(true)}
              term={xtermRef.current}
              subscribeToTerminalData={subscribeToTerminalData}
            />
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

      {/* Terminal Right-Click Context Menu */}
      {termContextMenu && (
        <div 
          style={{
            position: 'fixed',
            top: `${Math.min(termContextMenu.y, window.innerHeight - 220)}px`,
            left: `${Math.min(termContextMenu.x, window.innerWidth - 230)}px`,
            backgroundColor: 'var(--bg-panel, #1e1e1e)',
            border: '1px solid var(--border-color, #333)',
            borderRadius: '8px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.65)',
            padding: '5px',
            zIndex: 99999,
            minWidth: '210px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            backdropFilter: 'blur(12px)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Copiar selección */}
          <div 
            onClick={() => {
              if (termContextMenu.selectionText) {
                navigator.clipboard.writeText(termContextMenu.selectionText);
              }
              setTermContextMenu(null);
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              cursor: termContextMenu.hasSelection ? 'pointer' : 'not-allowed',
              opacity: termContextMenu.hasSelection ? 1 : 0.4,
              color: 'var(--text-main, #fff)',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => { if (termContextMenu.hasSelection) e.currentTarget.style.backgroundColor = 'var(--accent, #007acc)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <FaCopy size={12} /> Copiar
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>Ctrl+C / ⌘C</span>
          </div>

          {/* Pegar */}
          <div 
            onClick={() => {
              if (isAutoRunning) return;
              const pastePromise = window.electronAPI.readClipboard
                ? window.electronAPI.readClipboard()
                : navigator.clipboard.readText();
              Promise.resolve(pastePromise).then(text => {
                if (text) {
                  window.electronAPI.sendToTerminal(id, text);
                }
              }).catch(() => {});
              setTermContextMenu(null);
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              cursor: isAutoRunning ? 'not-allowed' : 'pointer',
              opacity: isAutoRunning ? 0.4 : 1,
              color: 'var(--text-main, #fff)',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => { if (!isAutoRunning) e.currentTarget.style.backgroundColor = 'var(--accent, #007acc)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <FaPaste size={12} /> Pegar
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>Ctrl+V / ⌘V</span>
          </div>

          <div style={{ height: '1px', backgroundColor: 'var(--border-color, rgba(255,255,255,0.1))', margin: '3px 0' }} />

          {/* Quick Command Bar */}
          <div 
            onClick={() => {
              setShowQuickAi(true);
              setTermContextMenu(null);
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              cursor: 'pointer',
              color: 'var(--neon-green, #00ff00)',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0, 255, 0, 0.12)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <FaBolt size={12} /> Línea Rápida con IA
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>⌘K / Ctrl+K</span>
          </div>

          {/* Contextual actions if text is selected */}
          {termContextMenu.hasSelection && (
            <>
              <div 
                onClick={() => {
                  setInitialAiPrompt(`Explica qué significa este fragmento o error de mi terminal:\n\n\`\`\`\n${termContextMenu.selectionText}\n\`\`\``);
                  setShowAi(true);
                  setShowSftp(false);
                  setTermContextMenu(null);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: '#00e5ff',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0, 229, 255, 0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <VscSparkle size={13} /> Explicar selección con IA
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>Explicar</span>
              </div>

              <div 
                onClick={() => {
                  setInitialAiPrompt(`Analiza este error de la terminal y genera el comando bash exacto para solucionarlo:\n\n\`\`\`\n${termContextMenu.selectionText}\n\`\`\``);
                  setShowAi(true);
                  setShowSftp(false);
                  setTermContextMenu(null);
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  borderRadius: '5px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  color: '#4ade80',
                  transition: 'background-color 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.12)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  🛠️ Corregir error con IA
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>Fix</span>
              </div>
            </>
          )}

          <div style={{ height: '1px', backgroundColor: 'var(--border-color, rgba(255,255,255,0.1))', margin: '3px 0' }} />

          {/* Vincent AI Panel */}
          <div 
            onClick={() => {
              setShowAi(true);
              setShowSftp(false);
              setTermContextMenu(null);
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              cursor: 'pointer',
              color: 'var(--text-main, #fff)',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent, #007acc)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <VscSparkle size={13} /> Abrir Panel Vincent AI
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>Panel</span>
          </div>

          {/* Seleccionar todo */}
          <div 
            onClick={() => {
              xtermRef.current?.selectAll();
              setTermContextMenu(null);
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              cursor: 'pointer',
              color: 'var(--text-main, #fff)',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--accent, #007acc)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              ☑️ Seleccionar todo
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>Ctrl+Shift+A</span>
          </div>

          <div style={{ height: '1px', backgroundColor: 'var(--border-color, rgba(255,255,255,0.1))', margin: '3px 0' }} />

          {/* Limpiar terminal */}
          <div 
            onClick={() => {
              if (isAutoRunning) return;
              window.electronAPI.sendToTerminal(id, "clear\r");
              setTermContextMenu(null);
            }}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '7px 10px',
              borderRadius: '5px',
              fontSize: '12px',
              cursor: isAutoRunning ? 'not-allowed' : 'pointer',
              opacity: isAutoRunning ? 0.4 : 1,
              color: '#ff6b6b',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => { if (!isAutoRunning) e.currentTarget.style.backgroundColor = 'rgba(255, 107, 107, 0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaTrash size={11} /> Limpiar terminal
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted, #888)' }}>Ctrl+L</span>
          </div>
        </div>
      )}

    </div>
  );
};
