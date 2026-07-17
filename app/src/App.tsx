import React, { useState, useEffect, useRef, useCallback } from 'react'
import { t } from './i18n'
import { TerminalComponent } from './Terminal'
import './App.css'

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

export const FIXED_AGENTS: AiAgent[] = [
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

interface TerminalSettings {
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
  
  // Legacy fields (kept for migration only)
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiProvider?: 'openai' | 'ollama' | 'deepseek' | 'custom';
}

interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  isOpen: boolean;
}

interface VaultInfo {
  id: string;
  name: string;
  hint: string;
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
  language: 'es',
  aiProfiles: [
    {
      id: 'default_ai',
      name: 'Default OpenAI',
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      apiKey: ''
    }
  ],
  activeAiProfileId: 'default_ai',
  aiAgents: [],
  activeAiAgentId: 'agent_devops'
}

function App() {
  
  const [vaultStatus, setVaultStatus] = useState<'checking' | 'selecting' | 'setup' | 'locked' | 'unlocked'>('checking');
  const [vaultsList, setVaultsList] = useState<VaultInfo[]>([]);
  const [currentVaultId, setCurrentVaultId] = useState<string | null>(null);
  
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showVaultPassword, setShowVaultPassword] = useState(false);
  const [vaultError, setVaultError] = useState('');

  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultHint, setNewVaultHint] = useState('');

  useEffect(() => {
    const vaultsIndexStr = localStorage.getItem('kx_vaults_index');
    if (vaultsIndexStr) {
      const vaults = JSON.parse(vaultsIndexStr);
      setVaultsList(vaults);
      setVaultStatus('selecting');
    } else {
      const setup = localStorage.getItem('kx_vault_setup');
      if (setup === 'true') {
        const legacyVault: VaultInfo = { id: 'default', name: 'Default Vault', hint: 'Migrated from legacy version.' };
        const newIndex = [legacyVault];
        localStorage.setItem('kx_vaults_index', JSON.stringify(newIndex));
        
        const oldData = localStorage.getItem('kx_vault_data');
        if (oldData) localStorage.setItem('kx_vault_data_default', oldData);
        
        const oldFolders = localStorage.getItem('kx_folders');
        if (oldFolders) localStorage.setItem('kx_folders_default', oldFolders);
        
        setVaultsList(newIndex);
        setVaultStatus('selecting');
      } else {
        setVaultStatus('setup');
      }
    }
  }, []);

  const [tabs, setTabs] = useState<Tab[]>([{ id: 'tab-1', type: 'local', title: t('localTerminal', defaultSettings.language) }])
  const [activeTab, setActiveTab] = useState('tab-1')
  
  // Persisted state
  const [folders, setFolders] = useState<Folder[]>([])
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([])
  const [settings, setSettings] = useState<TerminalSettings>(() => {
    const saved = localStorage.getItem('kx_settings');
    let parsed: TerminalSettings = saved ? JSON.parse(saved) : defaultSettings;
    
    // Migration logic
    if (!parsed.aiProfiles || parsed.aiProfiles.length === 0) {
      parsed.aiProfiles = [
        {
          id: 'migrated_ai',
          name: 'Default Profile',
          provider: parsed.aiProvider || 'openai',
          baseUrl: parsed.aiBaseUrl || 'https://api.openai.com/v1',
          model: parsed.aiModel || 'gpt-4o-mini',
          apiKey: parsed.aiApiKey || ''
        }
      ];
      parsed.activeAiProfileId = 'migrated_ai';
    }
    
    if (parsed.aiAgents) {
      parsed.aiAgents = parsed.aiAgents.filter(a => a.id !== 'agent_devops' && a.id !== 'agent_meta' && a.id !== 'fallback' && a.id !== 'meta-creator');
    } else {
      parsed.aiAgents = [];
    }
    
    if (parsed.activeAiAgentId === 'agent_devops' || parsed.activeAiAgentId === 'agent_meta' || parsed.activeAiAgentId === 'fallback' || parsed.activeAiAgentId === 'meta-creator') {
      parsed.activeAiAgentId = 'agent_devops';
    }
    
    return parsed;
  })

  useEffect(() => {
    if (vaultStatus === 'unlocked' && masterPassword && currentVaultId) {
      window.electronAPI.vaultEncrypt(JSON.stringify(folders), masterPassword).then(res => {
        if (res.success && res.data) {
          localStorage.setItem(`kx_folders_${currentVaultId}`, res.data);
        }
      });
    }
  }, [folders, vaultStatus, masterPassword, currentVaultId])

  // Auto-lock feature
  const autoLockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetAutoLock = useCallback(() => {
    if (autoLockTimer.current) clearTimeout(autoLockTimer.current);
    if (vaultStatus === 'unlocked') {
      autoLockTimer.current = setTimeout(() => {
        setVaultStatus('locked');
        setMasterPassword('');
        setSavedSessions([]);
        setFolders([]);
        setVaultError(t('vaultAutoLocked', settings.language) || 'Vault locked due to inactivity');
      }, 15 * 60 * 1000); // 15 minutes
    }
  }, [vaultStatus, settings.language]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    const handleActivity = () => resetAutoLock();
    
    events.forEach(e => window.addEventListener(e, handleActivity));
    resetAutoLock(); // init
    
    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      if (autoLockTimer.current) clearTimeout(autoLockTimer.current);
    }
  }, [resetAutoLock]);

  useEffect(() => {
    if (vaultStatus === 'unlocked' && masterPassword && currentVaultId) {
      window.electronAPI.vaultEncrypt(JSON.stringify(savedSessions), masterPassword).then(res => {
        if (res.success && res.data) {
          localStorage.setItem(`kx_vault_data_${currentVaultId}`, res.data);
        }
      });
    }
  }, [savedSessions, vaultStatus, masterPassword, currentVaultId])

  useEffect(() => {
    localStorage.setItem('kx_settings', JSON.stringify(settings));
    document.documentElement.setAttribute('data-theme', settings.theme || 'dark');
  }, [settings])
  
  // Modals state
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsSaveSuccess, setSettingsSaveSuccess] = useState(false)
  const [profileTestStatus, setProfileTestStatus] = useState<{[id: string]: 'idle' | 'testing' | 'success' | 'error'}>({})
  const [profileModels, setProfileModels] = useState<{[id: string]: string[]}>({})
  
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null)
  const [renameFolderName, setRenameFolderName] = useState('')
  
  // Vault deletion state
  const [vaultToDelete, setVaultToDelete] = useState<VaultInfo | null>(null)
  const [deleteVaultNameInput, setDeleteVaultNameInput] = useState('')

  const [folderForm, setFolderForm] = useState({ name: '', parentId: '' })
  const [sshForm, setSshForm] = useState({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: '', usePrivateKey: false })
  const [settingsForm, setSettingsForm] = useState<TerminalSettings>(settings)
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'terminal' | 'ai' | 'agents' | 'security' | 'data'>('general')
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [isGeneratingAgent, setIsGeneratingAgent] = useState(false)
  const [agentDescription, setAgentDescription] = useState('')
  const [showAgentGenerator, setShowAgentGenerator] = useState(false)
  
  const [availableFonts, setAvailableFonts] = useState<string[]>(['Menlo', 'Monaco', 'Courier New', 'monospace'])

  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, targetId: string, type: 'session' | 'folder' } | null>(null);

  const [passwordPrompt, setPasswordPrompt] = useState<{
    isOpen: boolean;
    type: 'export' | 'import';
    resolve: (password: string | null) => void;
  } | null>(null);

  const requestPassword = (type: 'export' | 'import'): Promise<string | null> => {
    return new Promise(resolve => {
      setPasswordPrompt({ isOpen: true, type, resolve });
    });
  };
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string>('');

  // Settings - Password change
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordChangeStatus, setPasswordChangeStatus] = useState<'idle'|'error'|'success'>('idle');
  const [passwordChangeMsg, setPasswordChangeMsg] = useState('');

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
    setSettingsSaveSuccess(true)
    setTimeout(() => {
      setSettingsSaveSuccess(false)
    }, 3000)
  }

  const testAiProfile = async (profile: AiProfile) => {
    setProfileTestStatus(prev => ({...prev, [profile.id]: 'testing'}));
    try {
      if (profile.provider === 'ollama') {
        const res = await (window as any).electronAPI.runOllamaList();
        if (res.success) {
          const lines = res.data.split('\n').filter((l: string) => l.trim() !== '');
          const models = lines.slice(1).map((l: string) => l.split(/\s+/)[0]);
          if (models.length > 0) {
            setProfileModels(prev => ({...prev, [profile.id]: models}));
          }
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'success'}));
        } else {
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
        }
      } else {
        if (!profile.apiKey && profile.provider !== 'custom') {
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
          return;
        }
        const headers: any = {};
        if (profile.apiKey) headers['Authorization'] = `Bearer ${profile.apiKey}`;
        
        let url = profile.baseUrl.endsWith('/') ? profile.baseUrl.slice(0, -1) : profile.baseUrl;
        if (url.endsWith('/chat/completions')) url = url.replace('/chat/completions', '');
        
        const res = await (window as any).electronAPI.systemFetch(`${url}/models`, { headers });
        if (res.success) {
          const data = res.data;
          if (data.data) {
            const models = data.data.map((m: any) => m.id);
            const chatModels = models.filter((m: string) => !m.includes('whisper') && !m.includes('tts') && !m.includes('dall-e') && !m.includes('embedding') && !m.includes('babbage') && !m.includes('davinci'));
            setProfileModels(prev => ({...prev, [profile.id]: chatModels.length > 0 ? chatModels : models}));
          }
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'success'}));
        } else {
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
        }
      }
    } catch (e) {
      setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
    }
  };

  const handleGenerateAgent = async () => {
    if (!agentDescription.trim()) return;
    
    // Find active AI Profile
    const activeProfile = settingsForm.aiProfiles?.find(p => p.id === settingsForm.activeAiProfileId) || settingsForm.aiProfiles?.[0];
    if (!activeProfile) {
      alert(t('alertNoAiProfiles', settingsForm.language));
      return;
    }

    setIsGeneratingAgent(true);
    
    try {
      const headers: any = { 'Content-Type': 'application/json' };
      if (activeProfile.apiKey && activeProfile.apiKey.trim() !== '') {
        headers['Authorization'] = `Bearer ${activeProfile.apiKey}`;
      }
      
      let url = activeProfile.baseUrl.endsWith('/') ? activeProfile.baseUrl.slice(0, -1) : activeProfile.baseUrl;
      if (!url.endsWith('/chat/completions') && activeProfile.provider !== 'ollama') {
        url = `${url}/chat/completions`;
      }
      
      if (activeProfile.provider === 'ollama' && !url.endsWith('/api/chat')) {
        url = `${url}/api/chat`; // Ollama standard API
      }

      const metaAgent = FIXED_AGENTS.find(a => a.id === 'agent_meta');

      const body = {
        model: activeProfile.model,
        messages: [
          { role: 'system', content: metaAgent?.systemPrompt || 'Eres un experto Creador de Agentes de IA.' },
          { role: 'user', content: agentDescription }
        ],
        stream: false
      };

      const res = await (window as any).electronAPI.systemFetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      });

      if (res.success && res.data) {
        let generatedPrompt = '';
        if (activeProfile.provider === 'ollama') {
          generatedPrompt = res.data.message?.content || '';
        } else {
          generatedPrompt = res.data.choices?.[0]?.message?.content || '';
        }

        if (generatedPrompt) {
          const newAgent: AiAgent = {
            id: `agent_${Date.now()}`,
            name: t('newAgentGenerated', settingsForm.language),
            systemPrompt: generatedPrompt.trim()
          };
          setSettingsForm({...settingsForm, aiAgents: [...(settingsForm.aiAgents || []), newAgent]});
          setEditingAgentId(newAgent.id);
          setShowAgentGenerator(false);
          setAgentDescription('');
        } else {
          alert(t('alertInvalidPrompt', settingsForm.language));
        }
      } else {
        alert(t('alertAiConnectionError', settingsForm.language) + (res.error || 'Unknown'));
      }
    } catch (e: any) {
      alert(t('alertGenerationError', settingsForm.language) + e.message);
    } finally {
      setIsGeneratingAgent(false);
    }
  };

  const handleExport = async () => {
    try {
      const password = await requestPassword('export');
      if (!password) return;
      
      const exportData = {
        format: 'vinterm',
        version: 1,
        data: {
          sessions: localStorage.getItem('kx_sessions'),
          folders: localStorage.getItem('kx_folders'),
          settings: localStorage.getItem('kx_settings')
        }
      };
      
      if (typeof (window as any).electronAPI.saveExportFile !== 'function') {
        (window as any).electronAPI.showMessageBox({
          type: 'error',
          title: 'VinTerm',
          message: settings.language === 'es' ? "Por favor reinicia la aplicación (cierra y vuelve a abrir) para aplicar los cambios del sistema de archivos." : "Please restart the application to apply file system changes."
        });
        return;
      }

      const res = await (window as any).electronAPI.vaultEncrypt(JSON.stringify(exportData), password);
      if (res.success && res.data) {
        const saveRes = await (window as any).electronAPI.saveExportFile(res.data);
        if (saveRes.success) {
          (window as any).electronAPI.showMessageBox({
            type: 'info',
            title: 'VinTerm',
            message: settings.language === 'es' ? "Exportación completada." : "Export successful!"
          });
        } else {
          if (saveRes.message !== 'Canceled') {
            (window as any).electronAPI.showMessageBox({
              type: 'error',
              title: 'VinTerm Error',
              message: "Error: " + saveRes.message
            });
          }
        }
      } else {
        (window as any).electronAPI.showMessageBox({
          type: 'error',
          title: 'VinTerm Error',
          message: settings.language === 'es' ? "Fallo en cifrado de exportación." : "Export encryption failed."
        });
      }
    } catch (e: any) {
      (window as any).electronAPI.showMessageBox({
        type: 'error',
        title: 'VinTerm Error',
        message: "Error inesperado en la exportación: " + e.message
      });
    }
  };

  const handleImport = async () => {
    try {
      if (typeof (window as any).electronAPI.openImportFile !== 'function') {
        (window as any).electronAPI.showMessageBox({
          type: 'error',
          title: 'VinTerm',
          message: settings.language === 'es' ? "Por favor reinicia la aplicación (cierra y vuelve a abrir) para aplicar los cambios del sistema de archivos." : "Please restart the application to apply file system changes."
        });
        return;
      }

      const openRes = await (window as any).electronAPI.openImportFile();
      if (!openRes.success || !openRes.data) {
        if (openRes.message !== 'Canceled') {
          (window as any).electronAPI.showMessageBox({
            type: 'error',
            title: 'VinTerm Error',
            message: "Error: " + openRes.message
          });
        }
        return;
      }
      
      const rawData = openRes.data.trim();
      if (rawData.startsWith('[Bookmarks]')) {
        const lines = rawData.split('\n');
        const newSessions: any[] = [];
        const mobaFolderId = 'folder-moba-' + Date.now();
        
        lines.forEach((line: string) => {
          const trimmed = line.trim();
          if (trimmed.includes('=#') && trimmed.includes('%')) {
            const parts = trimmed.split('=');
            if (parts.length >= 2) {
              let name = parts[0];
              if (name.includes(' (')) name = name.substring(0, name.lastIndexOf(' ('));
              
              const dataParts = parts.slice(1).join('=').split('%');
              if (dataParts.length >= 4) {
                const protocol = dataParts[0];
                if (protocol.includes('109') || protocol.includes('104')) {
                  const host = dataParts[1];
                  const portStr = dataParts[2];
                  const port = portStr ? parseInt(portStr, 10) : 22;
                  const username = dataParts[3];
                  
                  newSessions.push({
                    id: 'session-moba-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
                    name: name,
                    type: 'ssh',
                    folderId: mobaFolderId,
                    config: {
                      host,
                      port,
                      username,
                      password: ''
                    }
                  });
                }
              }
            }
          }
        });
        
        if (newSessions.length > 0) {
          setFolders(prev => {
            const newFolder = { id: mobaFolderId, name: 'MobaXterm Import', parentId: null, isOpen: true };
            const updated = [...prev, newFolder];
            localStorage.setItem('kx_folders', JSON.stringify(updated));
            return updated;
          });
          
          setSavedSessions(prev => {
            const updated = [...prev, ...newSessions];
            localStorage.setItem('kx_sessions', JSON.stringify(updated));
            return updated;
          });
          
          (window as any).electronAPI.showMessageBox({
            type: 'info',
            title: 'VinTerm',
            message: settings.language === 'es' ? `Importación exitosa de MobaXterm. Se agregaron ${newSessions.length} sesiones.` : `MobaXterm import successful. Added ${newSessions.length} sessions.`
          });
        } else {
          (window as any).electronAPI.showMessageBox({
            type: 'info',
            title: 'VinTerm',
            message: settings.language === 'es' ? "No se encontraron sesiones SSH válidas en el archivo de MobaXterm." : "No valid SSH sessions found in the MobaXterm file."
          });
        }
        return;
      }
      
      const password = await requestPassword('import');
      if (!password) return;
      
      const res = await (window as any).electronAPI.vaultDecrypt(openRes.data, password);
      if (res.success && res.data) {
        try {
          const parsed = JSON.parse(res.data);
          if (parsed.format === 'vinterm') {
            const { sessions, folders } = parsed.data;
            if (sessions) {
              const importedSessions = JSON.parse(sessions);
              setSavedSessions(prev => {
                const merged = [...prev];
                importedSessions.forEach((is: any) => {
                  if (!merged.find(s => s.id === is.id)) merged.push(is);
                });
                localStorage.setItem('kx_sessions', JSON.stringify(merged));
                return merged;
              });
            }
            if (folders) {
              const importedFolders = JSON.parse(folders);
              setFolders(prev => {
                const merged = [...prev];
                importedFolders.forEach((ifol: any) => {
                  if (!merged.find(f => f.id === ifol.id)) merged.push(ifol);
                });
                localStorage.setItem('kx_folders', JSON.stringify(merged));
                return merged;
              });
            }
            (window as any).electronAPI.showMessageBox({
              type: 'info',
              title: 'VinTerm',
              message: settings.language === 'es' ? "Importación exitosa. Los datos han sido fusionados." : "Import successful! Data has been merged."
            });
          } else if (parsed.format === 'mxtsessions') {
            (window as any).electronAPI.showMessageBox({
              type: 'info',
              title: 'VinTerm',
              message: "MobaXterm import is not yet supported."
            });
          } else {
            (window as any).electronAPI.showMessageBox({
              type: 'error',
              title: 'VinTerm',
              message: "Unknown format."
            });
          }
        } catch (e) {
          (window as any).electronAPI.showMessageBox({
            type: 'error',
            title: 'VinTerm',
            message: "Failed to parse imported data."
          });
        }
      } else {
        (window as any).electronAPI.showMessageBox({
          type: 'error',
          title: 'VinTerm',
          message: settings.language === 'es' ? "Error al descifrar. ¿Contraseña incorrecta?" : "Decryption failed. Incorrect password?"
        });
      }
    } catch (e: any) {
      (window as any).electronAPI.showMessageBox({
        type: 'error',
        title: 'VinTerm',
        message: "Error inesperado en la importación: " + e.message
      });
    }
  };

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
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: session.id, type: 'session' });
  }

  const handleFolderContextMenu = (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: folder.id, type: 'folder' });
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
      setTestMessage(t('hostRequired', settings.language));
      return;
    }
    setTestStatus('testing');
    setTestMessage(t('testing', settings.language));
    const result = await window.electronAPI.testSSHConnection({
      host: sshForm.host,
      port: sshForm.port,
      username: sshForm.username,
      password: sshForm.usePrivateKey ? undefined : sshForm.password,
      privateKeyPath: sshForm.usePrivateKey ? sshForm.privateKeyPath : undefined
    });
    setTestStatus(result.success ? 'success' : 'error');
    
    let displayMessage = result.message;
    if (result.success && result.message === 'Connection successful!') {
      displayMessage = t('testSuccess', settings.language);
    } else if (result.message.startsWith('SSH Error: ')) {
      displayMessage = t('testFailed', settings.language) + ': ' + result.message.replace('SSH Error: ', '');
    } else if (result.message.startsWith('Failed to read private key: ')) {
      displayMessage = t('testFailed', settings.language) + ' (Key): ' + result.message.replace('Failed to read private key: ', '');
    }
    
    setTestMessage(displayMessage);
  }

  const deleteSession = (id: string) => {
    setSavedSessions(savedSessions.filter(s => s.id !== id));
    setContextMenu(null);
  }

  const deleteFolder = (id: string) => {
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
              onContextMenu={(e) => handleFolderContextMenu(e, folder)}
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
      <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        
        {/* Logo on Start Screen */}
        <div style={{ position: 'absolute', top: '20px', left: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/vinterm.png" alt="VinTerm Logo" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--accent)', letterSpacing: '1px' }}>VinTerm</span>
        </div>

        {/* Language Switcher on Start Screen */}
        <div style={{ position: 'absolute', top: '20px', right: '20px' }}>
          <select 
            value={settings.language} 
            onChange={(e) => {
              const language = e.target.value as NonNullable<TerminalSettings['language']>;
              const newSettings: TerminalSettings = { ...settings, language };
              setSettings(newSettings);
              localStorage.setItem('kx_settings', JSON.stringify(newSettings));
            }}
            style={{ padding: '8px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
          >
            <option value="es">🇪🇸 Español</option>
            <option value="en">🇬🇧 English</option>
          </select>
        </div>

        <div style={{ backgroundColor: 'var(--bg-panel)', padding: '30px', borderRadius: '8px', width: '400px', border: '1px solid var(--border-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
          <h2 style={{ marginTop: 0, color: 'var(--accent)' }}>{t('vaultTitle', settings.language)}</h2>
          
          {vaultStatus === 'checking' && <p>{t('vaultChecking', settings.language)}</p>}
          
          {vaultStatus === 'selecting' && !vaultToDelete && (
            <div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '15px' }}>{t('selectVault', settings.language)}:</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {vaultsList.map(v => (
                  <div key={v.id} style={{ display: 'flex', gap: '5px' }}>
                    <button 
                      onClick={() => { 
                        setCurrentVaultId(v.id); 
                        setVaultStatus('locked'); 
                        setMasterPassword('');
                        setVaultError('');
                      }}
                      style={{ flex: 1, padding: '12px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold' }}
                    >
                      🔐 {v.name}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setVaultToDelete(v);
                        setDeleteVaultNameInput('');
                      }}
                      title={t('deleteVaultTitle', settings.language)}
                      style={{ width: '45px', padding: '12px', backgroundColor: 'var(--bg-input)', color: '#ff4d4f', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', textAlign: 'center', fontSize: '1.2rem' }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
                <button 
                  onClick={() => { 
                    setVaultStatus('setup'); 
                    setNewVaultName('');
                    setNewVaultHint('');
                    setMasterPassword('');
                    setConfirmPassword('');
                    setVaultError('');
                  }}
                  style={{ marginTop: '10px', padding: '10px', backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px dashed var(--border-color)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  + {t('createNewVault', settings.language)}
                </button>
              </div>
            </div>
          )}

          {vaultStatus === 'selecting' && vaultToDelete && (
            <div>
              <h3 style={{ color: '#ff4d4f', marginTop: 0 }}>{t('deleteVaultTitle', settings.language)}: {vaultToDelete.name}</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                {t('deleteVaultConfirmMsg', settings.language)} <strong style={{ color: 'var(--text-main)' }}>{vaultToDelete.name}</strong>
              </p>
              <input
                type="text"
                value={deleteVaultNameInput}
                onChange={(e) => setDeleteVaultNameInput(e.target.value)}
                placeholder={vaultToDelete.name}
                style={{ width: '100%', padding: '12px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid #ff4d4f', borderRadius: '4px', marginBottom: '15px' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button 
                  onClick={() => setVaultToDelete(null)}
                  style={{ flex: 1, padding: '10px', backgroundColor: 'var(--bg-input)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
                >
                  {t('cancel', settings.language)}
                </button>
                <button 
                  disabled={deleteVaultNameInput !== vaultToDelete.name}
                  onClick={() => {
                    if (deleteVaultNameInput === vaultToDelete.name) {
                      localStorage.removeItem(`kx_vault_data_${vaultToDelete.id}`);
                      localStorage.removeItem(`kx_folders_${vaultToDelete.id}`);
                      const updatedVaults = vaultsList.filter(v => v.id !== vaultToDelete.id);
                      localStorage.setItem('kx_vaults_index', JSON.stringify(updatedVaults));
                      setVaultsList(updatedVaults);
                      setVaultToDelete(null);
                    }
                  }}
                  style={{ flex: 1, padding: '10px', backgroundColor: deleteVaultNameInput === vaultToDelete.name ? '#ff4d4f' : 'var(--bg-panel)', color: deleteVaultNameInput === vaultToDelete.name ? '#fff' : 'var(--text-muted)', border: '1px solid #ff4d4f', borderRadius: '4px', cursor: deleteVaultNameInput === vaultToDelete.name ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}
                >
                  {t('deleteVaultAction', settings.language)}
                </button>
              </div>
            </div>
          )}
          
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
              if (pass !== confirmPassword) {
                setVaultError(t('vaultPasswordsMismatch', settings.language));
                return;
              }
              if (newVaultHint && pass === newVaultHint) {
                setVaultError(t('vaultHintMatchError', settings.language));
                return;
              }
              if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{6,12}$/.test(pass)) {
                setVaultError(t('vaultError', settings.language));
                return;
              }
              const sessionsToSave: SavedSession[] = [];
              const newId = `vault_${Date.now()}`;
              
              const res = await window.electronAPI.vaultEncrypt(JSON.stringify(sessionsToSave), pass);
              if (res.success && res.data) {
                localStorage.setItem(`kx_vault_data_${newId}`, res.data);
                localStorage.setItem(`kx_folders_${newId}`, '[]');
                
                const newVault: VaultInfo = { id: newId, name: newVaultName || t('vaultName', settings.language), hint: newVaultHint };
                const updatedVaults = [...vaultsList, newVault];
                localStorage.setItem('kx_vaults_index', JSON.stringify(updatedVaults));
                setVaultsList(updatedVaults);
                
                setCurrentVaultId(newId);
                setSavedSessions([]);
                setFolders([]);
                setVaultStatus('unlocked');
              } else {
                setVaultError(t('vaultFailed', settings.language));
              }
            }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('vaultWelcome', settings.language)}</p>
              {vaultError && <p style={{ color: 'var(--error-text)', fontSize: '0.9rem', fontWeight: 'bold' }}>{vaultError}</p>}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <input type="text" required placeholder={t('vaultName', settings.language)} value={newVaultName} onChange={e => setNewVaultName(e.target.value)} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <input required autoFocus type={showVaultPassword ? "text" : "password"} placeholder={t("masterPassword", settings.language)} value={masterPassword} onChange={e => { setMasterPassword(e.target.value); setVaultError(''); }} style={{ width: '100%', padding: '10px', paddingRight: '40px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px', boxSizing: 'border-box' }} />
                  <span onClick={() => setShowVaultPassword(!showVaultPassword)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0.6 }} title={t('vaultShowHide', settings.language)}>
                    {showVaultPassword ? '🙈' : '👁️'}
                  </span>
                </div>
                <div style={{ position: 'relative' }}>
                  <input required type={showVaultPassword ? "text" : "password"} placeholder={t('vaultConfirmPass', settings.language)} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setVaultError(''); }} style={{ width: '100%', padding: '10px', paddingRight: '40px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ position: 'relative', marginTop: '10px' }}>
                  <input type="text" placeholder={t('vaultHint', settings.language)} value={newVaultHint} onChange={e => { setNewVaultHint(e.target.value); setVaultError(''); }} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px', boxSizing: 'border-box' }} />
                </div>
                <div style={{ height: '4px', width: '100%', backgroundColor: 'var(--border-color)', marginTop: '8px', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${strength.score}%`, backgroundColor: strength.color, transition: 'all 0.3s ease' }}></div>
                </div>
                <ul style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '10px', paddingLeft: '20px' }}>
                  <li>{t('vaultRules1', settings.language)}</li>
                  <li>{t('vaultRules2', settings.language)}</li>
                  <li>{t('vaultRules3', settings.language)}</li>
                  <li>{t('vaultRules4', settings.language)}</li>
                </ul>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {vaultsList.length > 0 && (
                  <button type="button" onClick={() => setVaultStatus('selecting')} style={{ flex: 1, padding: '10px', backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {t('cancel', settings.language)}
                  </button>
                )}
                <button type="submit" style={{ flex: 2, padding: '10px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {t('createVault', settings.language)}
                </button>
              </div>
            </form>
          )})()}

          {vaultStatus === 'locked' && (
            <form onSubmit={async (e) => {
              e.preventDefault();
              const vaultData = localStorage.getItem(`kx_vault_data_${currentVaultId}`);
              if (!vaultData) { setVaultError(t('vaultCorrupted', settings.language)); return; }
              const res = await window.electronAPI.vaultDecrypt(vaultData, masterPassword);
              if (res.success && res.data) {
                setSavedSessions(JSON.parse(res.data));
                
                const savedFoldersEnc = localStorage.getItem(`kx_folders_${currentVaultId}`);
                if (savedFoldersEnc && savedFoldersEnc !== '[]') {
                  if (savedFoldersEnc.startsWith('[')) {
                    // Plaintext fallback (migration)
                    setFolders(JSON.parse(savedFoldersEnc).map((f: any) => ({ ...f, parentId: f.parentId || null })));
                  } else {
                    const folderRes = await window.electronAPI.vaultDecrypt(savedFoldersEnc, masterPassword);
                    if (folderRes.success && folderRes.data) {
                      setFolders(JSON.parse(folderRes.data).map((f: any) => ({ ...f, parentId: f.parentId || null })));
                    } else {
                      setFolders([]); // corrupted or failed decrypt
                    }
                  }
                } else {
                  setFolders([]);
                }
                
                setVaultStatus('unlocked');
                setVaultError('');
              } else {
                setVaultError(t('vaultInvalidPass', settings.language));
              }
            }}>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{t('vaultUnlockMsg', settings.language)}</p>
              
              {(() => {
                const vault = vaultsList.find(v => v.id === currentVaultId);
                return vault && vault.hint ? (
                  <div style={{ padding: '10px', backgroundColor: 'var(--bg-editor)', borderLeft: '3px solid var(--accent)', borderRadius: '4px', marginBottom: '15px' }}>
                    <p style={{ fontSize: '0.85rem', margin: 0 }}>
                      <strong>{t('vaultHintLabel', settings.language)}</strong> 
                      {vault.hint}
                    </p>
                  </div>
                ) : null;
              })()}
              
              {vaultError && <p style={{ color: 'var(--error-text)', fontSize: '0.9rem', fontWeight: 'bold' }}>{vaultError}</p>}
              <div style={{ marginBottom: '15px' }}>
                <input required autoFocus type="password" placeholder={t("masterPassword", settings.language)} value={masterPassword} onChange={e => { setMasterPassword(e.target.value); setVaultError(''); }} style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
              </div>
              <button type="submit" style={{ width: '100%', padding: '10px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{t('unlockVault', settings.language)}</button>
              
              <div style={{ textAlign: 'center', marginTop: '15px' }}>
                <button type="button" onClick={() => setVaultStatus('selecting')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                  {t('switchVault', settings.language) || 'Switch Vault'}
                </button>
              </div>
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
          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <img src="/vinterm.png" alt="VinTerm Logo" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>VinTerm</h2>
          </div>
          
          <button 
            onClick={addLocal}
            style={{ width: '100%', padding: '8px', marginBottom: '10px', cursor: 'pointer', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
            {t('localTerminal', settings.language)}
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
            >  + {t('newSession', settings.language)}
            </button>
            <button 
              onClick={() => setShowFolderModal(true)}
              style={{ flex: 1, padding: '8px', cursor: 'pointer', backgroundColor: 'var(--bg-hover)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', fontSize: '0.8rem' }}>
              + {t('newFolder', settings.language)}
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
            {t('sessions', settings.language)}
          </div>
          
          {renderTree(null)}

        </div>
        
        {/* Support Button */}
        <div 
          onClick={() => {
            if (typeof (window as any).electronAPI.openExternal === 'function') {
              (window as any).electronAPI.openExternal('https://ko-fi.com/kapssco');
            } else {
              window.open('https://ko-fi.com/kapssco', '_blank');
            }
          }}
          style={{ padding: '15px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'background-color 0.2s', color: '#ff5e5b' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: '1.2rem', marginRight: '10px' }}>☕</span>
          <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Support VinTerm</span>
        </div>
        
        {/* Switch Vault Button */}
        <div 
          onClick={() => {
            setVaultStatus('selecting');
            setFolders([]);
            setSavedSessions([]);
          }}
          style={{ padding: '15px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'background-color 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: '1.2rem', marginRight: '10px' }}>🔐</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: '500', fontSize: '0.9rem' }}>{t('switchVault', settings.language) || 'Switch Vault'}</span>
        </div>

        {/* Bottom Settings Button */}
        <div 
          onClick={openSettings}
          style={{ padding: '15px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', cursor: 'pointer', transition: 'background-color 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <span style={{ fontSize: '1.2rem', marginRight: '10px' }}>⚙️</span>
          <span style={{ color: 'var(--text-muted)', fontWeight: '500', fontSize: '0.9rem' }}>{t('settingsTitle', settings.language)}</span>
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
          <div style={{ backgroundColor: 'var(--bg-panel)', borderRadius: '8px', width: '80vw', maxWidth: '900px', height: '80vh', minHeight: '500px', maxHeight: '90vh', border: '1px solid var(--border-color)', display: 'flex', overflow: 'hidden', position: 'relative' }}>
            
            <button 
              type="button" 
              onClick={() => setShowSettingsModal(false)}
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}
              title={t('cancel', settings.language)}
            >
              ✕
            </button>

            {/* Sidebar Tabs */}
            <div style={{ width: '180px', backgroundColor: 'var(--bg-input)', borderRight: '1px solid var(--border-light)', padding: '20px 0' }}>
              <h3 style={{ marginTop: 0, padding: '0 20px', fontSize: '1.1rem' }}>{t('settingsTitle', settings.language)}</h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
                <li 
                  onClick={() => setActiveSettingsTab('general')}
                  style={{ padding: '12px 20px', cursor: 'pointer', backgroundColor: activeSettingsTab === 'general' ? 'var(--accent)' : 'transparent', color: activeSettingsTab === 'general' ? 'var(--button-text)' : 'var(--text-main)', borderLeft: activeSettingsTab === 'general' ? '3px solid var(--neon-green, #00ff00)' : '3px solid transparent', transition: 'all 0.2s' }}
                >
                  General
                </li>
                <li 
                  onClick={() => setActiveSettingsTab('terminal')}
                  style={{ padding: '12px 20px', cursor: 'pointer', backgroundColor: activeSettingsTab === 'terminal' ? 'var(--accent)' : 'transparent', color: activeSettingsTab === 'terminal' ? 'var(--button-text)' : 'var(--text-main)', borderLeft: activeSettingsTab === 'terminal' ? '3px solid var(--neon-green, #00ff00)' : '3px solid transparent', transition: 'all 0.2s' }}
                >
                  Terminal
                </li>
                <li 
                  onClick={() => setActiveSettingsTab('ai')}
                  style={{ padding: '12px 20px', cursor: 'pointer', backgroundColor: activeSettingsTab === 'ai' ? 'var(--accent)' : 'transparent', color: activeSettingsTab === 'ai' ? 'var(--button-text)' : 'var(--text-main)', borderLeft: activeSettingsTab === 'ai' ? '3px solid var(--neon-green, #00ff00)' : '3px solid transparent', transition: 'all 0.2s' }}
                >
                  Vincent AI
                </li>
                <li 
                  onClick={() => setActiveSettingsTab('agents')}
                  style={{ padding: '12px 20px', cursor: 'pointer', backgroundColor: activeSettingsTab === 'agents' ? 'var(--accent)' : 'transparent', color: activeSettingsTab === 'agents' ? 'var(--button-text)' : 'var(--text-main)', borderLeft: activeSettingsTab === 'agents' ? '3px solid var(--neon-green, #00ff00)' : '3px solid transparent', transition: 'all 0.2s' }}
                >
                  Agentes
                </li>
                <li 
                  onClick={() => setActiveSettingsTab('security')}
                  style={{ padding: '12px 20px', cursor: 'pointer', backgroundColor: activeSettingsTab === 'security' ? 'var(--accent)' : 'transparent', color: activeSettingsTab === 'security' ? 'var(--button-text)' : 'var(--text-main)', borderLeft: activeSettingsTab === 'security' ? '3px solid var(--neon-green, #00ff00)' : '3px solid transparent', transition: 'all 0.2s' }}
                >
                  {t('securityTab', settings.language) || 'Security'}
                </li>
                <li 
                  onClick={() => setActiveSettingsTab('data')}
                  style={{ padding: '12px 20px', cursor: 'pointer', backgroundColor: activeSettingsTab === 'data' ? 'var(--accent)' : 'transparent', color: activeSettingsTab === 'data' ? 'var(--button-text)' : 'var(--text-main)', borderLeft: activeSettingsTab === 'data' ? '3px solid var(--neon-green, #00ff00)' : '3px solid transparent', transition: 'all 0.2s' }}
                >
                  {settings.language === 'es' ? 'Datos' : 'Data'}
                </li>
              </ul>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, padding: '20px 30px', display: 'flex', flexDirection: 'column' }}>
              <form onSubmit={handleSettingsSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
                
                {/* GENERAL TAB */}
                {activeSettingsTab === 'general' && (
                  <>
                    <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>General</h2>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('appTheme', settings.language)}:</label>
                      <select required value={settingsForm.theme || 'dark'} onChange={e => {
                        const newTheme = e.target.value as 'light' | 'dark' | 'vincent';
                        const newBg = newTheme === 'light' ? '#ffffff' : (newTheme === 'vincent' ? '#0d1117' : '#1e1e1e');
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
                  </>
                )}

                {/* TERMINAL TAB */}
                {activeSettingsTab === 'terminal' && (
                  <>
                    <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>Terminal</h2>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('fontFamily', settings.language)}:</label>
                        <select required value={settingsForm.fontFamily} onChange={e => setSettingsForm({...settingsForm, fontFamily: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }}>
                          {availableFonts.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </div>
                      <div style={{ width: '100px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>Font Size:</label>
                        <input required type="number" min="8" max="48" value={settingsForm.fontSize} onChange={e => setSettingsForm({...settingsForm, fontSize: parseInt(e.target.value) || 14})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '15px' }}>
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
                  </>
                )}

                {/* AI COPILOT TAB */}
                {activeSettingsTab === 'ai' && (
                  <>
                    <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', color: 'var(--neon-green, #00ff00)' }}>Vincent AI - {t('aiProfiles', settings.language)}</h2>
                    
                    {!editingProfileId ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {settingsForm.aiProfiles?.map((profile) => (
                          <div key={profile.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-light)', padding: '15px', borderRadius: '8px', backgroundColor: 'var(--bg-input)' }}>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>{profile.name}</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{profile.provider} {profile.model ? `- ${profile.model}` : ''}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button 
                                onClick={() => setEditingProfileId(profile.id)}
                                style={{ padding: '6px 12px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                {t('btnEdit', settings.language)}
                              </button>
                              {settingsForm.aiProfiles && settingsForm.aiProfiles.length > 1 && (
                                <button 
                                  onClick={() => {
                                    if(confirm(t('confirmDeleteProfile', settings.language))) {
                                      const updatedProfiles = settingsForm.aiProfiles?.filter(p => p.id !== profile.id);
                                      setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                    }
                                  }}
                                  style={{ padding: '6px 12px', backgroundColor: 'transparent', color: '#ff4d4f', border: '1px solid #ff4d4f', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                  {t('btnDelete', settings.language)}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                        
                        <button 
                          type="button"
                          onClick={() => {
                            const newProfile: AiProfile = {
                              id: `profile_${Date.now()}`,
                              name: t('defaultNewProfile', settings.language),
                              provider: 'custom',
                              baseUrl: '',
                              apiKey: '',
                              model: ''
                            };
                            setSettingsForm({...settingsForm, aiProfiles: [...(settingsForm.aiProfiles || []), newProfile]});
                            setEditingProfileId(newProfile.id);
                          }}
                          style={{ padding: '10px', backgroundColor: 'transparent', color: 'var(--accent)', border: '1px dashed var(--accent)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          + {t('addProfile', settings.language)}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <button 
                          onClick={() => setEditingProfileId(null)}
                          style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}
                        >
                          &larr; {t('btnBackToList', settings.language)}
                        </button>
                        
                        {(() => {
                          const index = settingsForm.aiProfiles?.findIndex(p => p.id === editingProfileId) ?? -1;
                          if (index === -1) return null;
                          const profile = settingsForm.aiProfiles![index];
                          
                          return (
                            <div style={{ border: '1px solid var(--border-light)', padding: '15px', borderRadius: '8px', backgroundColor: 'var(--bg-input)' }}>
                              <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('profileName', settings.language)}</label>
                                <input 
                                  type="text" 
                                  value={profile.name} 
                                  onChange={e => {
                                    const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                    updatedProfiles[index].name = e.target.value;
                                    setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                  }} 
                                  style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', fontWeight: 'bold' }}
                                />
                              </div>

                              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('aiProvider', settings.language)}</label>
                                  <select 
                                    value={profile.provider} 
                                    onChange={e => {
                                      const provider = e.target.value as 'openai' | 'ollama' | 'deepseek' | 'custom';
                                      const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                      updatedProfiles[index].provider = provider;
                                      if (provider === 'openai') {
                                        updatedProfiles[index].baseUrl = 'https://api.openai.com/v1';
                                        updatedProfiles[index].model = 'gpt-4o-mini';
                                      } else if (provider === 'ollama') {
                                        updatedProfiles[index].baseUrl = 'http://localhost:11434/v1';
                                        updatedProfiles[index].model = 'llama3';
                                      } else if (provider === 'deepseek') {
                                        updatedProfiles[index].baseUrl = 'https://api.deepseek.com/v1';
                                        updatedProfiles[index].model = 'deepseek-chat';
                                      }
                                      setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                    }} 
                                    style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                  >
                                    <option value="openai">OpenAI (ChatGPT)</option>
                                    <option value="ollama">Ollama (Local)</option>
                                    <option value="deepseek">DeepSeek</option>
                                    <option value="custom">Custom (LMStudio, Groq, OpenCode)</option>
                                  </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('labelModel', settings.language)}</label>
                                  {profileModels[profile.id] && profileModels[profile.id].length > 0 ? (
                                    <select 
                                      value={profile.model} 
                                      onChange={e => {
                                        const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                        updatedProfiles[index].model = e.target.value;
                                        setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                      }} 
                                      style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                    >
                                      {profileModels[profile.id].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  ) : (
                                    <input 
                                      type="text" 
                                      value={profile.model} 
                                      onChange={e => {
                                        const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                        updatedProfiles[index].model = e.target.value;
                                        setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                      }} 
                                      style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                    />
                                  )}
                                </div>
                              </div>

                              <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Base URL</label>
                                <input 
                                  type="text" 
                                  value={profile.baseUrl} 
                                  onChange={e => {
                                    const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                    updatedProfiles[index].baseUrl = e.target.value;
                                    setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                  }} 
                                  readOnly={profile.provider === 'openai' || profile.provider === 'deepseek'}
                                  style={{ width: '100%', padding: '8px', backgroundColor: (profile.provider === 'openai' || profile.provider === 'deepseek') ? 'rgba(0,0,0,0.2)' : 'var(--bg-panel)', border: '1px solid var(--border-color)', color: (profile.provider === 'openai' || profile.provider === 'deepseek') ? 'var(--text-muted)' : 'var(--text-main)', borderRadius: '4px' }}
                                />
                              </div>

                              {profile.provider !== 'ollama' && (
                                <div style={{ marginBottom: '15px' }}>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>API Key</label>
                                  <input 
                                    type="password" 
                                    value={profile.apiKey} 
                                    onChange={e => {
                                      const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                      updatedProfiles[index].apiKey = e.target.value;
                                      setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                    }} 
                                    style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                  />
                                </div>
                              )}

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                                <div>
                                  {profileTestStatus[profile.id] === 'testing' && <span style={{ color: 'var(--text-muted)' }}>{t('testing', settings.language)}</span>}
                                  {profileTestStatus[profile.id] === 'success' && <span style={{ color: 'var(--neon-green, #00ff00)', fontWeight: 'bold' }}>✅ {t('testSuccess', settings.language)}</span>}
                                  {profileTestStatus[profile.id] === 'error' && <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>❌ {t('testFailed', settings.language)}</span>}
                                </div>
                                <button 
                                  type="button"
                                  onClick={() => testAiProfile(profile)}
                                  disabled={profileTestStatus[profile.id] === 'testing'}
                                  style={{ padding: '8px 16px', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: profileTestStatus[profile.id] === 'testing' ? 'not-allowed' : 'pointer' }}
                                >
                                  {t('testConnection', settings.language)}
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* AGENTS TAB */}
                {activeSettingsTab === 'agents' && (
                  <>
                    <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>{t('aiAgentsTab', settingsForm.language)}</h2>
                    
                    {!editingAgentId ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {(settingsForm.aiAgents || []).map((agent) => (
                          <div key={agent.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-light)', padding: '15px', borderRadius: '8px', backgroundColor: 'var(--bg-input)' }}>
                            <div>
                              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>{agent.name}</div>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{agent.systemPrompt.slice(0, 60)}...</div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button 
                                onClick={() => setEditingAgentId(agent.id)}
                                style={{ padding: '6px 12px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                {t('btnEdit', settingsForm.language)}
                              </button>
                              <button 
                                onClick={() => {
                                  if (confirm(t('confirmDeleteAgent', settingsForm.language))) {
                                    const newAgents = (settingsForm.aiAgents || []).filter(a => a.id !== agent.id);
                                    setSettingsForm({...settingsForm, aiAgents: newAgents});
                                  }
                                }}
                                style={{ padding: '6px 12px', backgroundColor: 'transparent', color: '#ff4d4f', border: '1px solid #ff4d4f', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                {t('btnDelete', settingsForm.language)}
                              </button>
                            </div>
                          </div>
                        ))}
                        
                        {!showAgentGenerator ? (
                            <button 
                              type="button"
                              disabled={!settingsForm.aiProfiles || settingsForm.aiProfiles.length === 0}
                              onClick={() => setShowAgentGenerator(true)}
                              style={{ padding: '10px', backgroundColor: 'transparent', color: (!settingsForm.aiProfiles || settingsForm.aiProfiles.length === 0) ? 'var(--text-muted)' : 'var(--accent)', border: (!settingsForm.aiProfiles || settingsForm.aiProfiles.length === 0) ? '1px dashed var(--text-muted)' : '1px dashed var(--accent)', borderRadius: '4px', cursor: (!settingsForm.aiProfiles || settingsForm.aiProfiles.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                              title={(!settingsForm.aiProfiles || settingsForm.aiProfiles.length === 0) ? t('reqAiProfileTitle', settingsForm.language) : t('createNewAgentTitle', settingsForm.language)}
                            >
                              {t('btnAddAgent', settingsForm.language)} {(!settingsForm.aiProfiles || settingsForm.aiProfiles.length === 0) && t('reqAiProfile', settingsForm.language)}
                            </button>
                          ) : (
                            <div style={{ padding: '15px', backgroundColor: 'var(--bg-editor)', border: '1px solid var(--accent)', borderRadius: '6px' }}>
                              <h3 style={{ marginTop: 0, fontSize: '1rem', color: 'var(--accent)' }}>{t('magicGenTitle', settingsForm.language)}</h3>
                              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                                {t('magicGenDesc', settingsForm.language)}
                              </p>
                            <textarea
                              value={agentDescription}
                              onChange={(e) => setAgentDescription(e.target.value)}
                              placeholder={t('magicGenPlaceholder', settingsForm.language)}
                              style={{ width: '100%', minHeight: '80px', padding: '10px', backgroundColor: 'var(--bg-panel)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '4px', marginBottom: '15px', resize: 'vertical' }}
                              disabled={isGeneratingAgent}
                            />
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                              <button 
                                type="button" 
                                onClick={() => { setShowAgentGenerator(false); setAgentDescription(''); }}
                                style={{ padding: '8px 16px', backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
                                disabled={isGeneratingAgent}
                              >
                                {t('cancel', settingsForm.language)}
                              </button>
                              <button 
                                type="button" 
                                onClick={handleGenerateAgent}
                                style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: isGeneratingAgent ? 'not-allowed' : 'pointer' }}
                                disabled={isGeneratingAgent || !agentDescription.trim()}
                              >
                                {isGeneratingAgent ? t('btnGeneratingPrompt', settingsForm.language) : t('btnGenerateAgent', settingsForm.language)}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <button 
                          onClick={() => setEditingAgentId(null)}
                          style={{ alignSelf: 'flex-start', padding: '6px 12px', background: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', marginBottom: '10px' }}
                        >
                          &larr; {t('btnBackToList', settingsForm.language)}
                        </button>
                        
                        {(() => {
                          const index = settingsForm.aiAgents?.findIndex(a => a.id === editingAgentId) ?? -1;
                          if (index === -1) return null;
                          const agent = settingsForm.aiAgents![index];
                          
                          return (
                            <div style={{ padding: '15px', backgroundColor: 'var(--bg-editor)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                              <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('agentName', settingsForm.language)}</label>
                                <input 
                                  type="text" 
                                  value={agent.name} 
                                  onChange={e => {
                                    const newAgents = [...(settingsForm.aiAgents || [])];
                                    newAgents[index].name = e.target.value;
                                    setSettingsForm({...settingsForm, aiAgents: newAgents});
                                  }} 
                                  style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', fontWeight: 'bold' }}
                                />
                              </div>

                                <div>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('systemPrompt', settingsForm.language)}</label>
                                  <textarea 
                                    value={agent.systemPrompt} 
                                    onChange={e => {
                                      const newAgents = [...(settingsForm.aiAgents || [])];
                                      newAgents[index].systemPrompt = e.target.value;
                                      setSettingsForm({...settingsForm, aiAgents: newAgents});
                                    }} 
                                    style={{ width: '100%', minHeight: '300px', resize: 'vertical', padding: '12px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', fontFamily: 'inherit', fontSize: '1rem', lineHeight: '1.4', marginBottom: '15px' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                  <button 
                                    onClick={() => setEditingAgentId(null)}
                                    style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                                  >
                                    {t('btnSaveAndBack', settingsForm.language)}
                                  </button>
                                </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* SECURITY TAB */}
                {activeSettingsTab === 'security' && (
                  <>
                    <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', color: 'var(--accent)' }}>
                      {t('changePasswordTitle', settings.language)}
                    </h2>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      {passwordChangeStatus === 'error' && <div style={{ color: 'var(--error-text)', fontWeight: 'bold' }}>{passwordChangeMsg}</div>}
                      {passwordChangeStatus === 'success' && <div style={{ color: 'var(--neon-green, #00ff00)', fontWeight: 'bold' }}>{passwordChangeMsg}</div>}
                      
                      <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('currentPassword', settings.language)}:</label>
                        <input type="password" value={oldPassword} onChange={e => { setOldPassword(e.target.value); setPasswordChangeStatus('idle'); }} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('newPassword', settings.language)}:</label>
                        <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); setPasswordChangeStatus('idle'); }} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('confirmNewPassword', settings.language)}:</label>
                        <input type="password" value={confirmNewPassword} onChange={e => { setConfirmNewPassword(e.target.value); setPasswordChangeStatus('idle'); }} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                      </div>
                      <button type="button" onClick={async () => {
                        if (oldPassword !== masterPassword) {
                          setPasswordChangeStatus('error');
                          setPasswordChangeMsg(t('wrongCurrentPassword', settings.language));
                          return;
                        }
                        if (newPassword !== confirmNewPassword) {
                          setPasswordChangeStatus('error');
                          setPasswordChangeMsg(t('passwordsDoNotMatch', settings.language));
                          return;
                        }
                        if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{6,12}$/.test(newPassword)) {
                          setPasswordChangeStatus('error');
                          setPasswordChangeMsg(t('vaultError', settings.language));
                          return;
                        }
                        
                        // Re-encrypt
                        const resSessions = await window.electronAPI.vaultEncrypt(JSON.stringify(savedSessions), newPassword);
                        const resFolders = await window.electronAPI.vaultEncrypt(JSON.stringify(folders), newPassword);
                        
                        if (resSessions.success && resFolders.success && resSessions.data && resFolders.data) {
                          localStorage.setItem(`kx_vault_data_${currentVaultId}`, resSessions.data);
                          localStorage.setItem(`kx_folders_${currentVaultId}`, resFolders.data);
                          setMasterPassword(newPassword);
                          setPasswordChangeStatus('success');
                          setPasswordChangeMsg(t('passwordChangedSuccess', settings.language));
                          setOldPassword('');
                          setNewPassword('');
                          setConfirmNewPassword('');
                        } else {
                          setPasswordChangeStatus('error');
                          setPasswordChangeMsg('Encryption error');
                        }
                      }} style={{ padding: '10px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
                        {t('changePasswordBtn', settings.language)}
                      </button>
                    </div>
                  </>
                )}

                {/* DATA TAB */}
                {activeSettingsTab === 'data' && (
                  <>
                    <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', color: 'var(--accent)' }}>
                      {settings.language === 'es' ? 'Gestión de Datos' : 'Data Management'}
                    </h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
                      {settings.language === 'es' ? 'Exporta o importa de forma segura tus configuraciones y sesiones guardadas. Los datos estarán cifrados con una contraseña.' : 'Securely export or import your configurations and saved sessions. The data will be encrypted with a password.'}
                    </p>
                    
                    <div style={{ display: 'flex', gap: '15px', flexDirection: 'column' }}>
                      <div style={{ padding: '15px', backgroundColor: 'var(--bg-editor)', border: '1px solid var(--border-light)', borderRadius: '4px' }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>{settings.language === 'es' ? 'Exportar' : 'Export'}</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px', margin: 0 }}>
                          {settings.language === 'es' ? 'Crea un archivo de respaldo cifrado con tus sesiones y carpetas actuales.' : 'Create an encrypted backup file with your current sessions and folders.'}
                        </p>
                        <button type="button" onClick={handleExport} style={{ marginTop: '10px', padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                          {settings.language === 'es' ? 'Exportar Datos' : 'Export Data'}
                        </button>
                      </div>

                      <div style={{ padding: '15px', backgroundColor: 'var(--bg-editor)', border: '1px solid var(--border-light)', borderRadius: '4px' }}>
                        <h4 style={{ margin: '0 0 10px 0' }}>{settings.language === 'es' ? 'Importar' : 'Import'}</h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px', margin: 0 }}>
                          {settings.language === 'es' ? 'Restaura tus datos desde un archivo de respaldo. Se fusionarán con los actuales.' : 'Restore your data from a backup file. They will be merged with the current ones.'}
                        </p>
                        <button type="button" onClick={handleImport} style={{ marginTop: '10px', padding: '8px 15px', backgroundColor: '#52c41a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                          {settings.language === 'es' ? 'Importar Datos' : 'Import Data'}
                        </button>
                      </div>
                    </div>
                  </>
                )}
                
                <div style={{ flex: 1 }}></div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '15px', borderTop: '1px solid var(--border-light)' }}>
                  <div>
                    {settingsSaveSuccess && <span style={{ color: 'var(--neon-green, #00ff00)', fontSize: '0.9rem', fontWeight: 'bold' }}>{settings.language === 'es' ? '¡Guardado exitoso!' : 'Successfully saved!'}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={() => setShowSettingsModal(false)} style={{ padding: '8px 15px', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('cancel', settings.language)}</button>
                    <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{t('saveSettings', settings.language)}</button>
                  </div>
                </div>
              </form>
            </div>

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
                <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Create</button>
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
                  <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{editingSessionId ? 'Update' : 'Save'} Session</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Prompt Modal */}
      {passwordPrompt?.isOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'var(--overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', padding: '20px', borderRadius: '8px', width: '350px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ marginTop: 0 }}>
              {passwordPrompt.type === 'export' 
                ? (settings.language === 'es' ? 'Contraseña para Exportar' : 'Export Password') 
                : (settings.language === 'es' ? 'Contraseña para Importar' : 'Import Password')}
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              {passwordPrompt.type === 'export'
                ? (settings.language === 'es' ? 'Ingresa una contraseña para cifrar tus datos:' : 'Enter a password to encrypt your data:')
                : (settings.language === 'es' ? 'Ingresa la contraseña para descifrar el archivo:' : 'Enter the password to decrypt the file:')}
            </p>
            <form onSubmit={e => {
              e.preventDefault();
              const input = (e.target as any).elements.password.value;
              passwordPrompt.resolve(input);
              setPasswordPrompt(null);
            }}>
              <input name="password" type="password" required autoFocus style={{ width: '100%', padding: '10px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px', marginBottom: '15px' }} />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => { passwordPrompt.resolve(null); setPasswordPrompt(null); }} style={{ padding: '8px 15px', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('cancel', settings.language)}</button>
                <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>OK</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'var(--overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'var(--bg-panel)', padding: '20px', borderRadius: '8px', width: '300px', border: '1px solid var(--border-color)', boxShadow: '0 4px 10px rgba(0,0,0,0.5)' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>{t('rename', settings.language) || 'Rename'}</h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (renameFolderName.trim() && renameFolderId) {
                setFolders(folders.map(f => f.id === renameFolderId ? { ...f, name: renameFolderName.trim() } : f));
                setShowRenameModal(false);
              }
            }}>
              <input 
                autoFocus 
                type="text" 
                value={renameFolderName} 
                onChange={e => setRenameFolderName(e.target.value)} 
                style={{ width: '100%', padding: '8px', marginBottom: '15px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px', boxSizing: 'border-box' }} 
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowRenameModal(false)} style={{ padding: '8px 15px', backgroundColor: 'var(--border-color)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{t('cancel', settings.language) || 'Cancel'}</button>
                <button type="submit" style={{ padding: '8px 15px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>OK</button>
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
          {contextMenu.type === 'folder' && (
            <>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.9rem' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => {
                  setFolderForm({ name: '', parentId: contextMenu.targetId });
                  setShowFolderModal(true);
                  setContextMenu(null);
                }}
              >
                📁 {t('newFolder', settings.language)}
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.9rem' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => {
                  setEditingSessionId(null);
                  setSshForm({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: contextMenu.targetId, usePrivateKey: false });
                  setTestStatus('idle');
                  setTestMessage('');
                  setShowSessionModal(true);
                  setContextMenu(null);
                }}
              >
                🖥️ {t('newSession', settings.language)}
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.9rem' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => {
                  const folder = folders.find(f => f.id === contextMenu.targetId);
                  if (folder) {
                    setRenameFolderId(folder.id);
                    setRenameFolderName(folder.name);
                    setShowRenameModal(true);
                  }
                  setContextMenu(null);
                }}
              >
                ✏️ {t('rename', settings.language) || 'Rename'}
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.9rem', color: '#ff6b6b' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => deleteFolder(contextMenu.targetId)}
              >
                🗑️ {t('delete', settings.language) || 'Delete'}
              </div>
            </>
          )}
        </div>
      )}

    </div>
  )
}

export default App
