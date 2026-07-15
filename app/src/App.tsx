import React, { useState, useEffect } from 'react'
import { t } from './i18n'
import { TerminalComponent } from './Terminal'
import './App.css'

interface TerminalSettings {
  fontFamily: string;
  fontSize: number;
  foreground: string;
  background: string;
  theme?: 'light' | 'dark' | 'vincent';
  language?: 'en' | 'es';
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  isOpen?: boolean;
}

interface SavedSession {
  id: string;
  name: string;
  folderId: string | null;
  config: {
    host: string;
    port?: number;
    username: string;
    password?: string;
    privateKeyPath?: string;
  };
}

interface Tab {
  id: string;
  type: 'local' | 'ssh';
  title: string;
  config?: any;
}

const defaultSettings: TerminalSettings = {
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  foreground: '#ffffff',
  background: '#1e1e1e',
  theme: 'dark',
  language: 'es'
}

function App() {
  
  const [vaultStatus, setVaultStatus] = useState<'checking' | 'setup' | 'locked' | 'unlocked'>('checking');
  const [masterPassword, setMasterPassword] = useState('');
  const [vaultError, setVaultError] = useState('');

  useEffect(() => {
    const setup = localStorage.getItem('kx_vault_setup');
    if (!setup) setVaultStatus('setup');
    else setVaultStatus('locked');
  }, []);

  const [tabs, setTabs] = useState<Tab[]>([{ id: 'tab-1', type: 'local', title: t('localTerminal', defaultSettings.language) }])
  const [activeTab, setActiveTab] = useState('tab-1')
  
  // Persisted state
  const [folders, setFolders] = useState<Folder[]>(() => {
    const saved = localStorage.getItem('kx_folders');
    return saved ? JSON.parse(saved).map((f: any) => ({ ...f, parentId: f.parentId || null })) : [];
  })
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])
  const [settings, setSettings] = useState<TerminalSettings>(() => {
    const saved = localStorage.getItem('kx_settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  })

  useEffect(() => {
    localStorage.setItem('kx_folders', JSON.stringify(folders));
  }, [folders])

  useEffect(() => {
    if (vaultStatus === 'unlocked' && masterPassword) {
      window.electronAPI.vaultEncrypt(JSON.stringify(savedSessions), masterPassword).then(res => {
        if (res.success && res.data) {
          localStorage.setItem('kx_vault_data', res.data);
        }
      });
    }
  }, [savedSessions])

  useEffect(() => {
    localStorage.setItem('kx_settings', JSON.stringify(settings));
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings])
  
  // Modals state
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  
  const [folderForm, setFolderForm] = useState({ name: '', parentId: '' })
  const [sshForm, setSshForm] = useState({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: '', usePrivateKey: false })
  const [settingsForm, setSettingsForm] = useState<TerminalSettings>(settings)
  
  const [availableFonts, setAvailableFonts] = useState<string[]>(['Menlo', 'Monaco', 'Courier New', 'monospace'])

  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, targetId: string, type: 'session' | 'folder' } | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const openSettings = async () => {
    setSettingsForm(settings); 
    setShowSettingsModal(true);
    if (availableFonts.length <= 4) {
      const fonts = await window.electronAPI.getFonts();
      // font-list sometimes returns fonts wrapped in quotes, let's clean them up for display
      setAvailableFonts(fonts.map(f => f.replace(/"/g, '')));
    }
  }

  const addLocal = () => {
    const id = `tab-${Date.now()}`
    setTabs([...tabs, { id, type: 'local', title: `🖥️ Local ${tabs.length + 1}` }])
    setActiveTab(id)
  }

  const openSavedSession = (session: SavedSession) => {
    const id = `tab-${Date.now()}`
    setTabs([...tabs, { id, type: 'ssh', title: `🔒 ${session.name}`, config: session.config }])
    setActiveTab(id)
  }

  const handleSshSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!sshForm.usePrivateKey && !sshForm.password) {
      alert("Password is required if not using a private key.");
      return;
    }
    const newSession: SavedSession = {
      id: editingSessionId || `session-${Date.now()}`,
      name: sshForm.name || sshForm.host,
      folderId: sshForm.folderId || null,
      config: {
        host: sshForm.host,
        port: sshForm.port,
        username: sshForm.username,
        password: sshForm.usePrivateKey ? undefined : sshForm.password,
        privateKeyPath: sshForm.usePrivateKey ? sshForm.privateKeyPath : undefined
      }
    }
    if (editingSessionId) {
      setSavedSessions(savedSessions.map(s => s.id === editingSessionId ? newSession : s));
    } else {
      setSavedSessions([...savedSessions, newSession]);
    }
    setShowSessionModal(false)
    setEditingSessionId(null);
    setSshForm({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: '', usePrivateKey: false })
  }

  const handleFolderSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (folderForm.name.trim()) {
      setFolders([...folders, { id: `folder-${Date.now()}`, name: folderForm.name.trim(), parentId: folderForm.parentId || null, isOpen: true }])
    }
    setShowFolderModal(false)
    setFolderForm({ name: '', parentId: '' })
  }

  const handleSettingsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSettings(settingsForm)
    setShowSettingsModal(false)
  }

  const toggleFolder = (id: string) => {
    setFolders(folders.map(f => f.id === id ? { ...f, isOpen: !f.isOpen } : f))
  }

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    if (activeTab === id && newTabs.length > 0) {
      setActiveTab(newTabs[newTabs.length - 1].id)
    }
  }

  const handleSessionContextMenu = (e: React.MouseEvent, session: SavedSession) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: session.id, type: 'session' });
  }

  const editSession = (id: string) => {
    const session = savedSessions.find(s => s.id === id);
    if (session) {
      setSshForm({
        name: session.name,
        host: session.config.host,
        port: session.config.port || 22,
        username: session.config.username,
        password: session.config.password || '',
        privateKeyPath: session.config.privateKeyPath || '',
        folderId: session.folderId || '',
        usePrivateKey: !!session.config.privateKeyPath
      });
      setEditingSessionId(session.id);
      setTestStatus('idle');
      setTestMessage('');
      setShowSessionModal(true);
    }
    setContextMenu(null);
  }

  const handleTestConnection = async () => {
    if (!sshForm.host || !sshForm.username) {
      setTestStatus('error');
      setTestMessage('Host and Username are required to test.');
      return;
    }
    setTestStatus('testing');
    setTestMessage('Testing connection...');
    const result = await window.electronAPI.testSSHConnection({
      host: sshForm.host,
      port: sshForm.port,
      username: sshForm.username,
      password: sshForm.usePrivateKey ? undefined : sshForm.password,
      privateKeyPath: sshForm.usePrivateKey ? sshForm.privateKeyPath : undefined
    });
    setTestStatus(result.success ? 'success' : 'error');
    setTestMessage(result.message);
  }

  const deleteSession = (id: string) => {
    setSavedSessions(savedSessions.filter(s => s.id !== id));
    setContextMenu(null);
  }

  const deleteFolder = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if(confirm(t('confirmDeleteFolder', settings.language))) {
      let toDelete = new Set<string>([id])
      let added = true;
      while (added) {
        added = false;
        folders.forEach(f => {
          if (f.parentId && toDelete.has(f.parentId) && !toDelete.has(f.id)) {
            toDelete.add(f.id)
            added = true
          }
        })
      }
      setFolders(folders.filter(f => !toDelete.has(f.id)))
      setSavedSessions(savedSessions.filter(s => s.folderId === null || !toDelete.has(s.folderId)))
    }
  }

  // Drag and Drop Handlers
  const onDragStart = (e: React.DragEvent, type: 'folder' | 'session', id: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('type', type);
    e.dataTransfer.setData('id', id);
  }

  const onDragOver = (e: React.DragEvent, dropId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverId !== dropId) setDragOverId(dropId);
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);
  }

  const onDrop = (e: React.DragEvent, targetFolderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverId(null);

    const dragType = e.dataTransfer.getData('type');
    const dragId = e.dataTransfer.getData('id');

    if (!dragType || !dragId) return;

    if (dragType === 'session') {
      setSavedSessions(savedSessions.map(s => s.id === dragId ? { ...s, folderId: targetFolderId } : s));
    } else if (dragType === 'folder') {
      if (dragId === targetFolderId) return;
      
      if (targetFolderId) {
        let currentTarget: Folder | undefined = folders.find(f => f.id === targetFolderId);
        while (currentTarget) {
          if (currentTarget.id === dragId) return;
          currentTarget = currentTarget.parentId ? folders.find(f => f.id === currentTarget?.parentId) : undefined;
        }
      }

      setFolders(folders.map(f => f.id === dragId ? { ...f, parentId: targetFolderId } : f));
    }
  }

  // Recursive Tree Rendering
  const renderTree = (parentId: string | null, depth: number = 0) => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    const childSessions = savedSessions.filter(s => s.folderId === parentId);

    return (
      <div style={{ marginLeft: depth > 0 ? '15px' : '0' }}>
        {childFolders.map(folder => (
          <div key={folder.id} style={{ marginBottom: '2px' }}>
            <div 
              draggable
              onDragStart={(e) => onDragStart(e, 'folder', folder.id)}
              onDragOver={(e) => onDragOver(e, folder.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, folder.id)}
              onClick={() => toggleFolder(folder.id)}
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                padding: '6px 10px', 
                backgroundColor: dragOverId === folder.id ? 'var(--accent)' : 'var(--bg-editor)', 
                borderRadius: '4px', 
                cursor: 'pointer', 
                userSelect: 'none',
                border: '1px solid transparent',
                transition: 'background-color 0.2s'
              }}
            >
              <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                {folder.isOpen ? '📂' : '📁'} {folder.name}
              </span>
              <span onClick={(e) => deleteFolder(e, folder.id)} style={{ color: 'var(--text-muted)' }}>×</span>
            </div>
            
            {folder.isOpen && (
              <div style={{ marginTop: '2px' }}>
                {renderTree(folder.id, depth + 1)}
                {folders.filter(f => f.parentId === folder.id).length === 0 && savedSessions.filter(s => s.folderId === folder.id).length === 0 && (
                  <div style={{ padding: '4px 10px', marginLeft: '15px', color: '#666', fontSize: '0.85rem', fontStyle: 'italic' }}>Empty folder</div>
                )}
              </div>
            )}
          </div>
        ))}

        {childSessions.map(session => (
          <div 
            key={session.id} 
            draggable
            onDragStart={(e) => onDragStart(e, 'session', session.id)}
            onContextMenu={(e) => handleSessionContextMenu(e, session)}
            onDoubleClick={() => openSavedSession(session)}
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              padding: '6px 10px', 
              cursor: 'pointer', 
              borderRadius: '4px', 
              fontSize: '0.9rem',
              backgroundColor: 'transparent'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <span>🖥️ {session.name}</span>
          </div>
        ))}
      </div>
    );
  }

  
  if (vaultStatus !== 'unlocked') {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ backgroundColor: 'var(--bg-panel)', padding: '30px', borderRadius: '8px', width: '400px', border: '1px solid var(--border-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
          <h2 style={{ marginTop: 0, color: 'var(--accent)' }}>{t('vaultTitle', settings.language)}</h2>
          
          {vaultStatus === 'checking' && <p>{t('vaultChecking', settings.language)}</p>}
          
          {vaultStatus === 'setup' && (() => {
            const getPasswordStrength = (pass: string) => {
              if (!pass) return { score: 0, color: 'transparent' };
              let score = 0;
              if (pass.length >= 6) score += 25;
              if (pass.length >= 10) score += 10;
              if (/[A-Z]/.test(pass)) score += 20;
              if (/[a-z]/.test(pass)) score += 15;
              if (/\d/.test(pass)) score += 15;
              if (/[!@#$%^&*]/.test(pass)) score += 15;
              
              let color = '#ff4d4f'; // red
              if (score >= 50) color = '#faad14'; // orange
              if (score >= 75) color = 'var(--accent)'; // blue
              if (score >= 90) color = '#52c41a'; // green
              
              return { score: Math.min(score, 100), color };
            };
            const strength = getPasswordStrength(masterPassword);
            
            return (
            <form onSubmit={async (e) => {
              e.preventDefault();
              const pass = masterPassword;
              if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{6,12}$/.test(pass)) {
                setVaultError(t('vaultError', settings.language));
                return;
              }
              const oldSessionsStr = localStorage.getItem('kx_sessions');
              const sessionsToSave = oldSessionsStr ? JSON.parse(oldSessionsStr) : [];
              
              const res = await window.electronAPI.vaultEncrypt(JSON.stringify(sessionsToSave), pass);
              if (res.success && res.data) {
                localStorage.setItem('kx_vault_data', res.data);
                localStorage.setItem('kx_vault_setup', 'true');
                localStorage.removeItem('kx_sessions');
                setSavedSessions(sessionsToSave);
                setVaultStatus('unlocked');
              } else {
                setVaultError(t('vaultFailed', settings.language));
              }
            }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('vaultWelcome', settings.language)}</p>
              {vaultError && <p style={{ color: 'var(--error-bg)', fontSize: '0.9rem' }}>{vaultError}</p>}
              <div style={{ marginBottom: '15px' }}>
                <input required autoFocus type="password" placeholder={t("masterPassword", settings.language)} value={masterPassword} onChange={e => { setMasterPassword(e.target.value); setVaultError(''); }} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                <div style={{ height: '4px', width: '100%', backgroundColor: 'var(--border-color)', marginTop: '5px', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${strength.score}%`, backgroundColor: strength.color, transition: 'all 0.3s ease' }}></div>
                </div>
                <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px', paddingLeft: '20px' }}>
                  <li>{t('vaultRules1', settings.language)}</li>
                  <li>{t('vaultRules2', settings.language)}</li>
                  <li>{t('vaultRules3', settings.language)}</li>
                  <li>{t('vaultRules4', settings.language)}</li>
                </ul>
              </div>
              <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: 'var(--accent)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{t('createVault', settings.language)}</button>
            </form>
          )})()}

          {vaultStatus === 'locked' && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              const vaultData = localStorage.getItem('kx_vault_data');
              if (!vaultData) { setVaultError(t('vaultCorrupted', settings.language)); return; }
              const res = await window.electronAPI.vaultDecrypt(vaultData, masterPassword);
              if (res.success && res.data) {
                setSavedSessions(JSON.parse(res.data));
                setVaultStatus('unlocked');
                setVaultError('');
              } else {
                setVaultError(t('vaultInvalidPass', settings.language));
              }
            }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('vaultUnlockMsg', settings.language)}</p>
              {vaultError && <p style={{ color: 'var(--error-bg)', fontSize: '0.9rem' }}>{vaultError}</p>}
              <div style={{ marginBottom: '15px' }}>
                <input required autoFocus type="password" placeholder={t("masterPassword", settings.language)} value={masterPassword} onChange={e => { setMasterPassword(e.target.value); setVaultError(''); }} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
              </div>
              <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: 'var(--accent)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{t('unlockVault', settings.language)}</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', overflow: 'hidden' }}>
      
      {/* Sidebar */}
      <div style={{ width: '260px', backgroundColor: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 20px 10px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>VinTerm</h2>
            <button 
              onClick={openSettings}
              style={{ cursor: 'pointer', backgroundColor: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem' }}
              title="Settings"
            >
              ⚙️
            </button>
          </div>
          
          <button 
            onClick={addLocal}
            style={{ width: '100%', padding: '8px', marginBottom: '10px', cursor: 'pointer', backgroundColor: 'var(--accent)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
            + Local Terminal
          </button>
          
          <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
            <button 
              onClick={() => {
                setEditingSessionId(null);
                setSshForm({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: '', usePrivateKey: false });
                setTestStatus('idle');
                setTestMessage('');
                setShowSessionModal(true);
              }} 
              style={{ flex: 1, padding: '8px', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
            >  + Session
            </button>
            <button 
              onClick={() => setShowFolderModal(true)}
              style={{ flex: 1, padding: '8px', cursor: 'pointer', backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem' }}>
              + Folder
            </button>
          </div>
        </div>

        {/* Sessions Tree */}
        <div 
          style={{ flex: 1, overflowY: 'auto', padding: '0 10px', backgroundColor: dragOverId === null ? 'transparent' : 'var(--bg-hover-light)' }}
          onDragOver={(e) => onDragOver(e, null)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, null)}
        >
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '10px', paddingLeft: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
            Saved Sessions
          </div>
          
          {renderTree(null)}

        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* Tabs Bar */}
        <div style={{ height: '40px', backgroundColor: 'var(--bg-editor)', display: 'flex', borderBottom: '1px solid var(--border-color)', overflowX: 'auto' }}>
          {tabs.map(tab => (
            <div 
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{ 
                padding: '0 15px', 
                height: '40px', 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                backgroundColor: activeTab === tab.id ? settings.background : 'transparent',
                borderTop: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                borderRight: '1px solid var(--border-color)',
                fontSize: '0.9rem',
                minWidth: '150px',
                justifyContent: 'space-between'
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px', color: activeTab === tab.id ? settings.foreground : 'var(--text-muted)' }}>
                {tab.title}
              </span>
              <span onClick={(e) => closeTab(e, tab.id)} style={{ color: 'var(--text-muted)', padding: '0 5px' }}>x</span>
            </div>
          ))}
        </div>

        {/* Terminal View */}
        <div style={{ flex: 1, position: 'relative', padding: '10px', backgroundColor: settings.background }}>
          {tabs.map(tab => (
            <TerminalComponent 
              key={tab.id} 
              id={tab.id} 
              type={tab.type} 
              config={tab.config} 
              isActive={activeTab === tab.id}
              settings={settings}
            />
          ))}
          {tabs.length === 0 && (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#666', flexDirection: 'column' }}>
              <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🖥️</div>
              <div>Select a session from the sidebar or open a local terminal</div>
            </div>
          )}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', padding: '30px', borderRadius: '8px', width: '400px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0 }}>{t('settingsTitle', settings.language)}</h3>
            <form onSubmit={handleSettingsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Font Size:</label>
                <input required type="number" min="8" max="48" value={settingsForm.fontSize} onChange={e => setSettingsForm({...settingsForm, fontSize: parseInt(e.target.value) || 14})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('appTheme', settings.language)}:</label>
                <select required value={settingsForm.theme || 'dark'} onChange={e => {
                  const newTheme = e.target.value as 'light' | 'dark';
                  const newBg = newTheme === 'light' ? '#ffffff' : '#1e1e1e';
                  const newFg = newTheme === 'light' ? '#000000' : '#ffffff';
                  setSettingsForm({...settingsForm, theme: newTheme, background: newBg, foreground: newFg});
                }} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }}>
                  <option value="dark">{t('darkTheme', settings.language)}</option>
                  <option value="light">{t('lightTheme', settings.language)}</option>
                  <option value="vincent">{t('vincentTheme', settings.language)}</option>
                </select>
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('language', settings.language)}:</label>
                <select required value={settingsForm.language || 'es'} onChange={e => setSettingsForm({...settingsForm, language: e.target.value as 'en'|'es'})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }}>
                  <option value="es">Español</option>
                  <option value="en">English</option>
                </select>
              </div>
<div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('fontFamily', settings.language)}:</label>
                <select required value={settingsForm.fontFamily} onChange={e => setSettingsForm({...settingsForm, fontFamily: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }}>
                  {availableFonts.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Text Color:</label>
                  <input required type="color" value={settingsForm.foreground} onChange={e => setSettingsForm({...settingsForm, foreground: e.target.value})} style={{ width: '100%', height: '40px', padding: '2px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Background Color:</label>
                  <input required type="color" value={settingsForm.background} onChange={e => setSettingsForm({...settingsForm, background: e.target.value})} style={{ width: '100%', height: '40px', padding: '2px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Preview:</label>
                <div style={{
                  padding: '10px 15px',
                  backgroundColor: settingsForm.background,
                  color: settingsForm.foreground,
                  fontFamily: settingsForm.fontFamily,
                  fontSize: `${settingsForm.fontSize}px`,
                  borderRadius: '4px',
                  border: '1px solid var(--border-light)',
                  minHeight: '80px',
                  boxShadow: 'inset 0 0 10px var(--overlay)',
                  wordBreak: 'break-all'
                }}>
                  vicente@local:~$ echo "Hello VinTerm!"<br/>
                  Hello VinTerm!
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowSettingsModal(false)} style={{ padding: '8px 15px', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('cancel', settings.language)}</button>
                <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('saveSettings', settings.language)}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Folder Modal */}
      {showFolderModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', padding: '30px', borderRadius: '8px', width: '350px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0 }}>{t('newFolder', settings.language)}</h3>
            <form onSubmit={handleFolderSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Folder Name:</label>
                <input required autoFocus type="text" value={folderForm.name} onChange={e => setFolderForm({...folderForm, name: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Parent Folder:</label>
                <select value={folderForm.parentId} onChange={e => setFolderForm({...folderForm, parentId: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }}>
                  <option value="">-- Root --</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowFolderModal(false)} style={{ padding: '8px 15px', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('cancel', settings.language)}</button>
                <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SSH Session Modal */}
      {showSessionModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', padding: '30px', borderRadius: '8px', width: '450px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0 }}>{editingSessionId ? 'Edit' : 'New'} Saved Session</h3>
            <form onSubmit={handleSshSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Session Name:</label>
                  <input required type="text" value={sshForm.name} onChange={e => setSshForm({...sshForm, name: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Folder:</label>
                  <select value={sshForm.folderId} onChange={e => setSshForm({...sshForm, folderId: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }}>
                    <option value="">-- Root --</option>
                    {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
              </div>
              
              <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '5px 0' }} />

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 3 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Host / IP:</label>
                  <input required type="text" placeholder="192.168.1.10" value={sshForm.host} onChange={e => setSshForm({...sshForm, host: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Port:</label>
                  <input required type="number" value={sshForm.port} onChange={e => setSshForm({...sshForm, port: parseInt(e.target.value) || 22})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Username:</label>
                  <input required type="text" value={sshForm.username} onChange={e => setSshForm({...sshForm, username: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', marginBottom: '5px' }}>
                <input type="checkbox" id="usePrivateKey" checked={sshForm.usePrivateKey} onChange={e => setSshForm({...sshForm, usePrivateKey: e.target.checked})} style={{ cursor: 'pointer' }} />
                <label htmlFor="usePrivateKey" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>Use Private Key for Authentication</label>
              </div>

              {!sshForm.usePrivateKey ? (
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Password:</label>
                  <input type="password" value={sshForm.password} onChange={e => setSshForm({...sshForm, password: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Private Key Path:</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <input required type="text" placeholder="/Users/kapoc/.ssh/id_rsa" value={sshForm.privateKeyPath} onChange={e => setSshForm({...sshForm, privateKeyPath: e.target.value})} style={{ flex: 1, padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                      <button type="button" onClick={async () => {
                        const path = await window.electronAPI.selectFile();
                        if (path) setSshForm({...sshForm, privateKeyPath: path});
                      }} style={{ padding: '8px 15px', backgroundColor: 'var(--border-light)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('browse', settings.language)}</button>
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Passphrase (optional, if key is encrypted):</label>
                    <input type="password" value={sshForm.password} onChange={e => setSshForm({...sshForm, password: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                  </div>
                </div>
              )}
              
              {testStatus !== 'idle' && (
                <div style={{ padding: '10px', borderRadius: '4px', backgroundColor: testStatus === 'testing' ? 'var(--border-color)' : testStatus === 'success' ? 'var(--success-bg)' : 'var(--error-bg)', color: 'var(--text-main)', fontSize: '0.85rem' }}>
                  {testStatus === 'testing' ? '⏳ ' : testStatus === 'success' ? '✅ ' : '❌ '}
                  {testMessage}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                <button type="button" onClick={handleTestConnection} disabled={testStatus === 'testing'} style={{ padding: '8px 15px', backgroundColor: 'var(--border-light)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: testStatus === 'testing' ? 'not-allowed' : 'pointer' }}>
                  {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                </button>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button type="button" onClick={() => setShowSessionModal(false)} style={{ padding: '8px 15px', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('cancel', settings.language)}</button>
                  <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{editingSessionId ? 'Update' : 'Save'} Session</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div style={{
          position: 'absolute',
          top: contextMenu.y,
          left: contextMenu.x,
          backgroundColor: 'var(--bg-input)',
          border: '1px solid var(--border-light)',
          borderRadius: '4px',
          padding: '5px 0',
          zIndex: 1000,
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          minWidth: '150px'
        }}>
          {contextMenu.type === 'session' && (
            <>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.9rem' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => editSession(contextMenu.targetId)}
              >
                ✏️ Edit Session
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.9rem', color: '#ff6b6b' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => deleteSession(contextMenu.targetId)}
              >
                🗑️ {t('delete', settings.language)} Session
              </div>
            </>
          )}
        </div>
      )}

    </div>
  )
}

export default App
