import React, { useState, useEffect, useRef, useCallback } from 'react'
import { t } from './i18n'
import { TerminalComponent } from './Terminal'
import { DashboardManager } from './DashboardManager'
import { Dashboard } from './Dashboard'
import { FaCloud, FaBrain, FaCoffee } from 'react-icons/fa'
import { 
  VscTerminal, 
  VscServer, 
  VscFolder, 
  VscFolderOpened, 
  VscChevronRight, 
  VscChevronDown, 
  VscAdd, 
  VscSearch, 
  VscEdit, 
  VscTrash, 
  VscPlay, 
  VscGear, 
  VscGraph, 
  VscLock, 
  VscClose 
} from 'react-icons/vsc'
import { type AppAction, type AiAgent, FIXED_AGENTS, cleanReasoningOutput } from './aiEngine'
import { EngramModal } from './EngramModal'
import { saveMemory } from './engram'
import './App.css'

export interface AiProfile {
  id: string;
  name: string;
  provider: 'openai' | 'google' | 'opencode' | 'ollama' | 'deepseek' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface DashboardWidget {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sessionId: string;
  color?: string;
}

export interface DashboardConfig {
  id: string;
  name: string;
  widgets: DashboardWidget[];
  vaultId?: string;
}

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
  dashboards?: DashboardConfig[];
  gentleAi?: {
    enableGentleman?: boolean;
    enableEngram?: boolean;
    enableContext7?: boolean;
    enableGuardrails?: boolean;
    context7ApiKey?: string;
  };
  
  // Legacy fields (kept for migration only)
  aiBaseUrl?: string;
  aiApiKey?: string;
  aiModel?: string;
  aiProvider?: 'openai' | 'google' | 'opencode' | 'ollama' | 'deepseek' | 'custom';
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

export interface SavedSession {
  id: string;
  name: string;
  folderId: string | null;
  type?: 'ssh' | 'gcp';
  config: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKeyPath?: string;
    gcpProject?: string;
    gcpZone?: string;
    gcpInstance?: string;
  };
}

interface Tab {
  id: string;
  type: 'local' | 'ssh' | 'gcp' | 'dashboard' | 'dashboard-view';
  title: string;
  config?: any;
  dashboardId?: string;
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
  activeAiAgentId: 'agent_devops',
  dashboards: [],
  gentleAi: {
    enableGentleman: true,
    enableEngram: true,
    enableContext7: true,
    enableGuardrails: true,
    context7ApiKey: ''
  }
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
  const [showEngramModal, setShowEngramModal] = useState(false);

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
  const [sessionSearch, setSessionSearch] = useState('')
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null)
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
  const [sshForm, setSshForm] = useState({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: '', usePrivateKey: false, type: 'ssh' as 'ssh' | 'gcp', gcpProject: '', gcpZone: '', gcpInstance: '' })
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

  const openDashboardManager = () => {
    const id = 'dashboard-manager';
    setTabs(prev => {
      if (!prev.find(t => t.id === id)) {
        return [...prev, { id, type: 'dashboard', title: settings.language === 'en' ? 'Monitoring' : 'Monitoreo' }];
      }
      return prev;
    });
    setActiveTab(id);
  }

  const handleSaveDashboard = async (db: DashboardConfig) => {
    db.vaultId = currentVaultId || 'default';
    const dbs = settings.dashboards || [];
    const idx = dbs.findIndex(d => d.id === db.id);
    let newDbs = [...dbs];
    if (idx >= 0) {
      newDbs[idx] = db;
    } else {
      newDbs.push(db);
    }
    const newSettings = { ...settings, dashboards: newDbs };
    setSettings(newSettings);
    localStorage.setItem('kx_settings', JSON.stringify(newSettings));
  };

  const handleDeleteDashboard = async (id: string) => {
    const dbs = settings.dashboards || [];
    const newDbs = dbs.filter(d => d.id !== id);
    const newSettings = { ...settings, dashboards: newDbs };
    setSettings(newSettings);
    localStorage.setItem('kx_settings', JSON.stringify(newSettings));
  };

  const handleOpenDashboard = (db: DashboardConfig) => {
    const id = `dashboard-view-${db.id}`;
    setTabs(prev => {
      if (!prev.find(t => t.id === id)) {
        return [...prev, { id, type: 'dashboard-view' as any, title: db.name, config: db }];
      }
      return prev;
    });
    setActiveTab(id);
  };

  const handleApplyAction = (action: AppAction) => {
    if (action.type === 'change_theme') {
      const newTheme = action.payload?.theme;
      if (newTheme && ['light', 'dark', 'vincent'].includes(newTheme)) {
        const newSettings = { ...settings, theme: newTheme };
        setSettings(newSettings);
        setSettingsForm(prev => ({ ...prev, theme: newTheme }));
        localStorage.setItem('kx_settings', JSON.stringify(newSettings));
        document.documentElement.setAttribute('data-theme', newTheme);
      }
    } else if (action.type === 'change_font_size') {
      const fontSize = Number(action.payload?.fontSize);
      if (fontSize >= 10 && fontSize <= 32) {
        const newSettings = { ...settings, fontSize };
        setSettings(newSettings);
        setSettingsForm(prev => ({ ...prev, fontSize }));
        localStorage.setItem('kx_settings', JSON.stringify(newSettings));
      }
    } else if (action.type === 'change_language') {
      const language = action.payload?.language;
      if (language === 'es' || language === 'en') {
        const newSettings = { ...settings, language };
        setSettings(newSettings);
        setSettingsForm(prev => ({ ...prev, language }));
        localStorage.setItem('kx_settings', JSON.stringify(newSettings));
      }
    } else if (action.type === 'create_agent') {
      const { name, systemPrompt } = action.payload || {};
      if (name && systemPrompt) {
        const newAgent: AiAgent = {
          id: `agent_${Date.now()}`,
          name,
          systemPrompt
        };
        const newAgents = [...(settings.aiAgents || []), newAgent];
        const newSettings = {
          ...settings,
          aiAgents: newAgents,
          activeAiAgentId: newAgent.id
        };
        setSettings(newSettings);
        setSettingsForm(prev => ({
          ...prev,
          aiAgents: newAgents,
          activeAiAgentId: newAgent.id
        }));
        localStorage.setItem('kx_settings', JSON.stringify(newSettings));
      }
    } else if (action.type === 'save_engram') {
      saveMemory({
        title: action.payload?.title || 'Memoria guardada',
        content: action.payload?.content || '',
        type: action.payload?.type || 'convention',
        topicKey: action.payload?.topicKey
      });
    }
  };

  const addLocal = () => {
    const id = `tab-${Date.now()}`
    setTabs([...tabs, { id, type: 'local', title: `Local ${tabs.length + 1}` }])
    setActiveTab(id)
  }

  const openSavedSession = (session: SavedSession) => {
    const id = `tab-${Date.now()}`
    setTabs([...tabs, { id, type: session.type || 'ssh', title: session.name, config: session.config }])
    setActiveTab(id)
  }

  const handleSshSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sshForm.type === 'ssh' && !sshForm.usePrivateKey && !sshForm.password) {
      alert("Password is required if not using a private key.");
      return;
    }
    const newSession: SavedSession = {
      id: editingSessionId || `session-${Date.now()}`,
      name: sshForm.name || (sshForm.type === 'gcp' ? sshForm.gcpInstance : sshForm.host) || 'Session',
      type: sshForm.type,
      folderId: sshForm.folderId || null,
      config: {
        host: sshForm.host,
        port: sshForm.port,
        username: sshForm.username,
        password: sshForm.usePrivateKey ? undefined : sshForm.password,
        privateKeyPath: sshForm.usePrivateKey ? sshForm.privateKeyPath : undefined,
        gcpProject: sshForm.type === 'gcp' ? sshForm.gcpProject : undefined,
        gcpZone: sshForm.type === 'gcp' ? sshForm.gcpZone : undefined,
        gcpInstance: sshForm.type === 'gcp' ? sshForm.gcpInstance : undefined
      }
    }
    if (editingSessionId) {
      setSavedSessions(savedSessions.map(s => s.id === editingSessionId ? newSession : s));
    } else {
      setSavedSessions([...savedSessions, newSession]);
    }
    setShowSessionModal(false)
    setEditingSessionId(null);
    setSshForm({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: '', usePrivateKey: false, type: 'ssh', gcpProject: '', gcpZone: '', gcpInstance: '' })
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

  const testAiProfile = async (profile: AiProfile, autoSelectModel = false) => {
    if (!profile) return;
    
    if (profile.provider === 'ollama') {
      setProfileTestStatus(prev => ({...prev, [profile.id]: 'testing'}));
      try {
        const res = await (window as any).electronAPI.runOllamaList();
        if (res.success) {
          const lines = res.data.split('\n').filter((l: string) => l.trim() !== '');
          const models = lines.slice(1).map((l: string) => l.split(/\s+/)[0]).filter(Boolean);
          if (models.length > 0) {
            setProfileModels(prev => ({...prev, [profile.id]: models}));
            if (autoSelectModel) {
              setSettingsForm(prev => {
                const currentIdx = prev.aiProfiles?.findIndex(p => p.id === profile.id) ?? -1;
                if (currentIdx === -1) return prev;
                const currentProfile = prev.aiProfiles![currentIdx];
                if (!currentProfile.model || !models.includes(currentProfile.model)) {
                  const updated = [...(prev.aiProfiles || [])];
                  updated[currentIdx] = { ...currentProfile, model: models[0] };
                  return { ...prev, aiProfiles: updated };
                }
                return prev;
              });
            }
          }
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'success'}));
        } else {
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
        }
      } catch (e) {
        setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
      }
    } else {
      if (!profile.apiKey && profile.provider !== 'custom') {
        setProfileTestStatus(prev => ({...prev, [profile.id]: 'idle'}));
        return;
      }
      if (!profile.baseUrl || profile.baseUrl.trim() === '') {
        setProfileTestStatus(prev => ({...prev, [profile.id]: 'idle'}));
        return;
      }
      setProfileTestStatus(prev => ({...prev, [profile.id]: 'testing'}));
      try {
        const headers: any = {};
        if (profile.apiKey) headers['Authorization'] = `Bearer ${profile.apiKey}`;
        
        let url = profile.baseUrl.endsWith('/') ? profile.baseUrl.slice(0, -1) : profile.baseUrl;
        if (url.endsWith('/chat/completions')) url = url.replace('/chat/completions', '');
        
        const res = await (window as any).electronAPI.systemFetch(`${url}/models`, { headers });
        if (res.success) {
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
            const finalModels = chatModels.length > 0 ? chatModels : models;
            if (finalModels.length > 0) {
              setProfileModels(prev => ({...prev, [profile.id]: finalModels}));
              if (autoSelectModel) {
                setSettingsForm(prev => {
                  const currentIdx = prev.aiProfiles?.findIndex(p => p.id === profile.id) ?? -1;
                  if (currentIdx === -1) return prev;
                  const currentProfile = prev.aiProfiles![currentIdx];
                  if (!currentProfile.model || !finalModels.includes(currentProfile.model)) {
                    const updated = [...(prev.aiProfiles || [])];
                    updated[currentIdx] = { ...currentProfile, model: finalModels[0] };
                    return { ...prev, aiProfiles: updated };
                  }
                  return prev;
                });
              }
            }
          }
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'success'}));
        } else {
          setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
        }
      } catch (e) {
        setProfileTestStatus(prev => ({...prev, [profile.id]: 'error'}));
      }
    }
  };

  // Automatically test connection and fetch available models when editing a profile or changing its config
  useEffect(() => {
    if (!editingProfileId) return;
    const profile = settingsForm.aiProfiles?.find(p => p.id === editingProfileId);
    if (!profile) return;
    
    if (profile.provider === 'ollama') {
      testAiProfile(profile, true);
      return;
    }

    if (!profile.baseUrl || (!profile.apiKey && profile.provider !== 'custom')) {
      return;
    }

    const timer = setTimeout(() => {
      testAiProfile(profile, true);
    }, 600);

    return () => clearTimeout(timer);
  }, [
    editingProfileId,
    settingsForm.aiProfiles?.find(p => p.id === editingProfileId)?.provider,
    settingsForm.aiProfiles?.find(p => p.id === editingProfileId)?.baseUrl,
    settingsForm.aiProfiles?.find(p => p.id === editingProfileId)?.apiKey
  ]);

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
          const promptText = cleanReasoningOutput(generatedPrompt).cleanContent.trim();
          const newAgent: AiAgent = {
            id: `agent_${Date.now()}`,
            name: t('newAgentGenerated', settingsForm.language),
            systemPrompt: promptText
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
        host: session.config.host || '',
        port: session.config.port || 22,
        username: session.config.username || '',
        password: session.config.password || '',
        privateKeyPath: session.config.privateKeyPath || '',
        folderId: session.folderId || '',
        usePrivateKey: !!session.config.privateKeyPath,
        type: session.type || 'ssh',
        gcpProject: session.config.gcpProject || '',
        gcpZone: session.config.gcpZone || '',
        gcpInstance: session.config.gcpInstance || ''
      });
      setEditingSessionId(session.id);
      setTestStatus('idle');
      setTestMessage('');
      setShowSessionModal(true);
    }
    setContextMenu(null);
  }

  const handleTestConnection = async () => {
    if (sshForm.type === 'ssh' && (!sshForm.host || !sshForm.username)) {
      setTestStatus('error');
      setTestMessage(t('hostRequired', settings.language));
      return;
    }
    if (sshForm.type === 'gcp' && (!sshForm.gcpProject || !sshForm.gcpZone || !sshForm.gcpInstance)) {
      setTestStatus('error');
      setTestMessage('Project, Zone, and Instance are required to test GCP connection.');
      return;
    }
    setTestStatus('testing');
    setTestMessage(t('testing', settings.language));
    const result = await window.electronAPI.testSSHConnection({
      type: sshForm.type,
      host: sshForm.host,
      port: sshForm.port,
      username: sshForm.username,
      password: sshForm.usePrivateKey ? undefined : sshForm.password,
      privateKeyPath: sshForm.usePrivateKey ? sshForm.privateKeyPath : undefined,
      gcpProject: sshForm.type === 'gcp' ? sshForm.gcpProject : undefined,
      gcpZone: sshForm.type === 'gcp' ? sshForm.gcpZone : undefined,
      gcpInstance: sshForm.type === 'gcp' ? sshForm.gcpInstance : undefined
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

  const isSessionActive = (session: SavedSession) => {
    return tabs.some(t => {
      if (session.type === 'gcp') {
        return t.config?.gcpInstance === session.config?.gcpInstance && t.config?.gcpProject === session.config?.gcpProject;
      }
      return (t.config?.host && t.config.host === session.config?.host && t.config?.username === session.config?.username) || (t.title && t.title.includes(session.name));
    });
  };

  const renderSessionItem = (session: SavedSession, showFolderPath: boolean = false) => {
    const isActiveConnected = isSessionActive(session);
    const isHovered = hoveredSessionId === session.id;
    const parentFolder = showFolderPath && session.folderId ? folders.find(f => f.id === session.folderId) : null;

    const port = session.config?.port || 22;
    const isCustomPort = session.type === 'ssh' && port !== 22;
    const subtitle = session.type === 'gcp'
      ? `${session.config?.gcpInstance || 'gcp'} (${session.config?.gcpZone || 'zone'})`
      : `${session.config?.username || 'user'}@${session.config?.host || 'host'}${isCustomPort ? `:${port}` : ''}`;

    return (
      <div 
        key={session.id} 
        draggable
        onDragStart={(e) => onDragStart(e, 'session', session.id)}
        onContextMenu={(e) => handleSessionContextMenu(e, session)}
        onClick={() => openSavedSession(session)}
        onMouseEnter={() => setHoveredSessionId(session.id)}
        onMouseLeave={() => setHoveredSessionId(null)}
        style={{ 
          display: 'flex', 
          alignItems: 'center',
          justifyContent: 'space-between', 
          padding: '6px 8px', 
          margin: '2px 0',
          cursor: 'pointer', 
          borderRadius: '6px', 
          backgroundColor: isHovered ? 'var(--bg-hover)' : 'transparent',
          border: isActiveConnected ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid transparent',
          transition: 'all 0.15s ease',
          gap: '8px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <div style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            backgroundColor: session.type === 'gcp' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(168, 85, 247, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {session.type === 'gcp' ? (
              <FaCloud size={12} color="#38bdf8" />
            ) : (
              <VscServer size={14} color="#c084fc" />
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                color: 'var(--text-main)', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis', 
                whiteSpace: 'nowrap' 
              }}>
                {session.name}
              </span>
              {isActiveConnected && (
                <span 
                  title="Sesión conectada en una pestaña"
                  style={{ 
                    width: '6px', 
                    height: '6px', 
                    borderRadius: '50%', 
                    backgroundColor: '#22c55e', 
                    boxShadow: '0 0 6px #22c55e',
                    flexShrink: 0 
                  }} 
                />
              )}
            </div>
            <span style={{ 
              fontSize: '0.72rem', 
              color: 'var(--text-muted)', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              whiteSpace: 'nowrap' 
            }}>
              {parentFolder ? `${parentFolder.name} • ${subtitle}` : subtitle}
            </span>
          </div>
        </div>

        {/* Quick action buttons on hover */}
        {isHovered ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => openSavedSession(session)}
              title="Conectar sesión"
              style={{
                background: 'none',
                border: 'none',
                color: '#22c55e',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <VscPlay size={12} />
            </button>
            <button
              type="button"
              onClick={() => editSession(session.id)}
              title="Editar configuración"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <VscEdit size={12} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm(t('confirmDeleteSession', settings.language) || `¿Eliminar la sesión "${session.name}"?`)) {
                  deleteSession(session.id);
                }
              }}
              title="Eliminar sesión"
              style={{
                background: 'none',
                border: 'none',
                color: '#ef4444',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <VscTrash size={12} />
            </button>
          </div>
        ) : (
          isCustomPort ? (
            <span style={{ 
              fontSize: '0.68rem', 
              color: 'var(--text-muted)', 
              backgroundColor: 'rgba(255,255,255,0.06)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              flexShrink: 0
            }}>
              :{port}
            </span>
          ) : session.type === 'gcp' ? (
            <span style={{ 
              fontSize: '0.65rem', 
              color: '#38bdf8', 
              backgroundColor: 'rgba(56,189,248,0.1)',
              padding: '1px 5px',
              borderRadius: '4px',
              fontWeight: 600,
              flexShrink: 0
            }}>
              GCP
            </span>
          ) : null
        )}
      </div>
    );
  };

  // Recursive Tree Rendering
  const renderTree = (parentId: string | null, depth: number = 0) => {
    const childFolders = folders.filter(f => f.parentId === parentId);
    const childSessions = savedSessions.filter(s => s.folderId === parentId);

    return (
      <div style={{ marginLeft: depth > 0 ? '12px' : '0' }}>
        {childFolders.map(folder => {
          const sessionsInFolder = savedSessions.filter(s => s.folderId === folder.id);
          return (
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
                  alignItems: 'center',
                  justifyContent: 'space-between', 
                  padding: '6px 8px', 
                  backgroundColor: dragOverId === folder.id ? 'var(--accent)' : 'var(--bg-editor)', 
                  borderRadius: '6px', 
                  cursor: 'pointer', 
                  userSelect: 'none',
                  border: '1px solid transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                    {folder.isOpen ? <VscChevronDown size={14} /> : <VscChevronRight size={14} />}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', color: '#38bdf8' }}>
                    {folder.isOpen ? <VscFolderOpened size={16} /> : <VscFolder size={16} />}
                  </span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {folder.name}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ 
                    fontSize: '0.7rem', 
                    padding: '1px 6px', 
                    backgroundColor: 'rgba(255,255,255,0.08)', 
                    borderRadius: '10px', 
                    color: 'var(--text-muted)' 
                  }}>
                    {sessionsInFolder.length}
                  </span>
                  <button
                    type="button"
                    title="Nueva sesión en esta carpeta"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSessionId(null);
                      setSshForm({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: folder.id, usePrivateKey: false, type: 'ssh', gcpProject: '', gcpZone: '', gcpInstance: '' });
                      setTestStatus('idle');
                      setTestMessage('');
                      setShowSessionModal(true);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <VscAdd size={12} />
                  </button>
                </div>
              </div>
              
              {folder.isOpen && (
                <div style={{ marginTop: '2px', paddingLeft: '4px', borderLeft: '1px solid var(--border-color)' }}>
                  {renderTree(folder.id, depth + 1)}
                  {folders.filter(f => f.parentId === folder.id).length === 0 && sessionsInFolder.length === 0 && (
                    <div style={{ padding: '6px 12px', marginLeft: '12px', color: 'var(--text-muted)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                      Carpeta vacía
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {childSessions.map(session => renderSessionItem(session, false))}
      </div>
    );
  }

  
  return (
    <>
      {vaultStatus !== 'unlocked' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
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
                <button 
                  onClick={() => { 
                    setVaultStatus('unlocked');
                    setCurrentVaultId(null);
                    setMasterPassword('');
                  }}
                  style={{ marginTop: '5px', padding: '10px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  {t('localSessionsOnly', settings.language)}
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
        </div>
      )}
      <div style={{ display: 'flex', height: '100vh', width: '100vw', backgroundColor: 'var(--bg-app)', color: 'var(--text-main)', overflow: 'hidden' }}>
      
      {/* Sidebar */}
      <div style={{ width: '280px', backgroundColor: 'var(--bg-panel)', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* Sidebar Header & Window Drag Area (Only top row for Mac traffic lights) */}
        <div className="app-drag-region" style={{ 
          height: '46px',
          paddingTop: '8px', 
          paddingRight: '14px', 
          paddingBottom: '4px', 
          paddingLeft: typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') ? '78px' : '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0
        }}>
          <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <img src="/vinterm.png" alt="VinTerm Logo" style={{ width: '24px', height: '24px', objectFit: 'contain' }} />
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', letterSpacing: '0.3px' }}>VinTerm</h2>
          </div>
          <span style={{ 
            fontSize: '10px', 
            fontWeight: 800, 
            backgroundColor: 'rgba(34, 197, 94, 0.12)', 
            color: '#22c55e', 
            border: '1px solid rgba(34, 197, 94, 0.25)',
            padding: '2px 7px', 
            borderRadius: '10px' 
          }}>
            {savedSessions.length} {savedSessions.length === 1 ? 'HOST' : 'HOSTS'}
          </span>
        </div>
        
        {/* Sidebar Actions & Search Bar (Full Width, Aligned with Tree) */}
        <div style={{ padding: '4px 12px 10px 12px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
          {/* Main Action: Local Terminal */}
          <button 
            className="app-no-drag"
            onClick={addLocal}
            title={settings.language === 'en' ? 'Open local terminal tab' : 'Abrir terminal local'}
            style={{ 
              width: '100%', 
              padding: '8px 12px', 
              cursor: 'pointer', 
              backgroundColor: 'var(--accent)', 
              color: 'var(--button-text)', 
              border: 'none', 
              borderRadius: '6px', 
              fontWeight: 700,
              fontSize: '0.84rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              transition: 'transform 0.1s, opacity 0.15s'
            }}
          >
            <VscTerminal size={15} />
            {t('localTerminal', settings.language)}
          </button>
          
          {/* Secondary Actions: New Server & Folder */}
          <div className="app-no-drag" style={{ display: 'flex', gap: '6px' }}>
            <button 
              onClick={() => {
                setEditingSessionId(null);
                setSshForm({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: '', usePrivateKey: false, type: 'ssh', gcpProject: '', gcpZone: '', gcpInstance: '' });
                setTestStatus('idle');
                setTestMessage('');
                setShowSessionModal(true);
              }} 
              title={settings.language === 'en' ? 'Add new SSH or GCP session' : 'Nueva sesión SSH o GCP'}
              style={{ 
                flex: 1, 
                padding: '7px 8px', 
                backgroundColor: 'var(--bg-editor)', 
                color: 'var(--text-main)', 
                border: '1px solid var(--border-light)', 
                borderRadius: '6px', 
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}
            >
              <VscServer size={13} color="#c084fc" />
              <span>+ {settings.language === 'en' ? 'Session' : 'Sesión'}</span>
            </button>
            <button 
              onClick={() => setShowFolderModal(true)}
              title={settings.language === 'en' ? 'Create new organizing folder' : 'Nueva carpeta'}
              style={{ 
                flex: 1, 
                padding: '7px 8px', 
                cursor: 'pointer', 
                backgroundColor: 'var(--bg-editor)', 
                color: 'var(--text-main)', 
                border: '1px solid var(--border-light)', 
                borderRadius: '6px', 
                fontSize: '0.78rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}
            >
              <VscFolder size={13} color="#38bdf8" />
              <span>+ {settings.language === 'en' ? 'Folder' : 'Carpeta'}</span>
            </button>
          </div>

          {/* Quick Filter / Search Bar */}
          <div className="app-no-drag" style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>
              <VscSearch size={13} />
            </span>
            <input
              type="text"
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder={settings.language === 'en' ? 'Search sessions, host, IP...' : 'Buscar servidor, IP, usuario...'}
              style={{
                width: '100%',
                padding: '6px 26px 6px 28px',
                fontSize: '0.78rem',
                backgroundColor: 'var(--bg-input)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {sessionSearch && (
              <button
                type="button"
                onClick={() => setSessionSearch('')}
                title="Limpiar búsqueda"
                style={{
                  position: 'absolute',
                  right: '6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <VscClose size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Sessions Tree / Filtered Results */}
        <div 
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            padding: '2px 12px 12px 12px', 
            backgroundColor: dragOverId === null ? 'transparent' : 'var(--bg-hover-light)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
          onDragOver={(e) => onDragOver(e, null)}
          onDragLeave={onDragLeave}
          onDrop={(e) => onDrop(e, null)}
        >
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.72rem', 
            color: 'var(--text-muted)', 
            margin: '2px 0 6px 2px', 
            fontWeight: 700, 
            letterSpacing: '0.6px',
            textTransform: 'uppercase' 
          }}>
            <span>{sessionSearch.trim() ? (settings.language === 'en' ? 'Search Results' : 'Resultados') : t('sessions', settings.language)}</span>
            <span style={{ fontSize: '0.68rem', opacity: 0.6 }}>
              {savedSessions.length} {savedSessions.length === 1 ? 'host' : 'hosts'}
            </span>
          </div>

          {sessionSearch.trim() ? (
            (() => {
              const query = sessionSearch.trim().toLowerCase();
              const matching = savedSessions.filter(s => {
                const nameMatch = (s.name || '').toLowerCase().includes(query);
                const hostMatch = (s.config?.host || '').toLowerCase().includes(query);
                const userMatch = (s.config?.username || '').toLowerCase().includes(query);
                const gcpMatch = (s.config?.gcpInstance || '').toLowerCase().includes(query) || (s.config?.gcpProject || '').toLowerCase().includes(query);
                return nameMatch || hostMatch || userMatch || gcpMatch;
              });

              if (matching.length === 0) {
                return (
                  <div style={{ padding: '24px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <VscSearch size={22} style={{ opacity: 0.5 }} />
                    <span>No se encontraron servidores con "{sessionSearch}"</span>
                  </div>
                );
              }

              return matching.map(session => renderSessionItem(session, true));
            })()
          ) : (
            <>
              {savedSessions.length === 0 && folders.length === 0 ? (
                <div style={{ 
                  padding: '24px 12px', 
                  textAlign: 'center', 
                  color: 'var(--text-muted)', 
                  fontSize: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <VscServer size={24} style={{ opacity: 0.4 }} />
                  <span>No hay servidores guardados. Haz clic en <strong>+ {t('newSession', settings.language)}</strong> para agregar uno.</span>
                </div>
              ) : (
                renderTree(null)
              )}
            </>
          )}
        </div>
        
        {/* Compact Native Bottom Toolbar */}
        <div style={{ 
          padding: '8px 12px', 
          borderTop: '1px solid var(--border-color)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          backgroundColor: 'rgba(0,0,0,0.18)'
        }}>
          {/* Monitoring Button */}
          <button 
            type="button"
            onClick={openDashboardManager}
            title={settings.language === 'en' ? 'Monitoring & Dashboards' : 'Monitoreo y Paneles'}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '32px', 
              height: '32px', 
              borderRadius: '6px', 
              background: 'none', 
              border: 'none', 
              color: '#4ade80', 
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <VscGraph size={17} />
          </button>

          {/* Switch Vault Button */}
          <button 
            type="button"
            onClick={() => {
              setVaultStatus('selecting');
              setFolders([]);
              setSavedSessions([]);
            }}
            title={t('switchVault', settings.language) || 'Cambiar Bóveda'}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '32px', 
              height: '32px', 
              borderRadius: '6px', 
              background: 'none', 
              border: 'none', 
              color: '#eab308', 
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <VscLock size={16} />
          </button>

          {/* Settings Button */}
          <button 
            type="button"
            onClick={openSettings}
            title={t('settingsTitle', settings.language)}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '32px', 
              height: '32px', 
              borderRadius: '6px', 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-main)', 
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <VscGear size={17} />
          </button>

          {/* Support Kofi Button */}
          <button 
            type="button"
            onClick={() => {
              if (typeof (window as any).electronAPI.openExternal === 'function') {
                (window as any).electronAPI.openExternal('https://ko-fi.com/kapssco');
              } else {
                window.open('https://ko-fi.com/kapssco', '_blank');
              }
            }}
            title="Apoyar VinTerm (Ko-fi)"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              width: '32px', 
              height: '32px', 
              borderRadius: '6px', 
              background: 'none', 
              border: 'none', 
              color: '#ff5e5b', 
              cursor: 'pointer',
              transition: 'background-color 0.15s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <FaCoffee size={15} />
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        
        {/* Tabs Bar */}
        <div className="app-drag-region" style={{ height: '40px', backgroundColor: 'var(--bg-editor)', display: 'flex', borderBottom: '1px solid var(--border-color)', overflowX: 'auto', alignItems: 'center' }}>
          {tabs.map(tab => (
            <div 
              key={tab.id}
              className="app-no-drag"
              onClick={() => setActiveTab(tab.id)}
              style={{ 
                padding: '0 14px', 
                height: '40px', 
                display: 'flex', 
                alignItems: 'center', 
                cursor: 'pointer',
                backgroundColor: activeTab === tab.id ? settings.background : 'transparent',
                borderTop: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                borderRight: '1px solid var(--border-color)',
                fontSize: '0.85rem',
                minWidth: '130px',
                maxWidth: '220px',
                justifyContent: 'space-between',
                transition: 'background-color 0.15s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden', marginRight: '8px' }}>
                {tab.type === 'local' ? (
                  <VscTerminal size={14} style={{ color: '#22c55e', marginRight: '7px', flexShrink: 0 }} />
                ) : tab.type === 'gcp' ? (
                  <FaCloud size={13} style={{ color: '#38bdf8', marginRight: '7px', flexShrink: 0 }} />
                ) : tab.type === 'dashboard' || tab.type === 'dashboard-view' ? (
                  <VscGraph size={14} style={{ color: '#4ade80', marginRight: '7px', flexShrink: 0 }} />
                ) : (
                  <VscServer size={14} style={{ color: '#c084fc', marginRight: '7px', flexShrink: 0 }} />
                )}
                <span style={{ 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap', 
                  color: activeTab === tab.id ? settings.foreground : 'var(--text-muted)',
                  fontWeight: activeTab === tab.id ? 600 : 400
                }}>
                  {tab.title ? tab.title.replace(/^[🖥️🔒📊☕🔐📁]\s*/, '') : 'Terminal'}
                </span>
              </div>
              <button 
                onClick={(e) => closeTab(e, tab.id)} 
                title="Cerrar pestaña"
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-muted)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '3px', 
                  borderRadius: '3px', 
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'all 0.15s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.color = '#ef4444'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                <VscClose size={13} />
              </button>
            </div>
          ))}
          <button 
            className="app-no-drag"
            onClick={addLocal}
            title="Nueva terminal local"
            style={{ 
              background: 'none', 
              border: 'none', 
              color: 'var(--text-muted)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '28px', 
              width: '28px', 
              marginLeft: '6px', 
              borderRadius: '4px', 
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--foreground)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <VscAdd size={15} />
          </button>
        </div>

        {/* Terminal View */}
        <div style={{ flex: 1, position: 'relative', padding: '10px', backgroundColor: settings.background, display: 'flex', flexDirection: 'column' }}>
          {tabs.map(tab => (
            <div key={tab.id} style={{ display: activeTab === tab.id ? 'flex' : 'none', flex: 1, width: '100%', overflow: 'hidden' }}>
              {tab.type === 'dashboard' ? (
                <DashboardManager 
                  dashboards={(settings.dashboards || []).filter(d => !d.vaultId || d.vaultId === currentVaultId)} 
                  sessions={savedSessions} 
                  settings={settings}
                  onSaveDashboard={handleSaveDashboard} 
                  onDeleteDashboard={handleDeleteDashboard} 
                  onOpenDashboard={handleOpenDashboard} 
                />
              ) : tab.type === 'dashboard-view' ? (
                <Dashboard 
                  config={settings.dashboards?.find(d => d.id === (tab.dashboardId || tab.config?.id)) || tab.config} 
                  sessions={savedSessions} 
                  settings={settings} 
                  onSaveDashboard={handleSaveDashboard} 
                />
              ) : (
                <TerminalComponent 
                  id={tab.id} 
                  type={tab.type as any} 
                  config={tab.config} 
                  isActive={activeTab === tab.id}
                  settings={settings}
                  onApplyAction={handleApplyAction}
                />
              )}
            </div>
          ))}
          {tabs.length === 0 && (
            <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#666', flexDirection: 'column' }}>
              <VscTerminal size={52} color="var(--border-color)" style={{ marginBottom: '16px', opacity: 0.6 }} />
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
              style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px', transition: 'all 0.15s' }}
              title={t('cancel', settings.language)}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <VscClose size={20} />
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
                              name: 'Google Gemini',
                              provider: 'google',
                              baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                              apiKey: '',
                              model: 'gemini-2.5-flash'
                            };
                            setSettingsForm({...settingsForm, aiProfiles: [...(settingsForm.aiProfiles || []), newProfile]});
                            setEditingProfileId(newProfile.id);
                          }}
                          style={{ padding: '10px', backgroundColor: 'transparent', color: 'var(--accent)', border: '1px dashed var(--accent)', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          + {t('addProfile', settings.language)}
                        </button>

                        {/* Gentle-AI Stack Card (Gentleman, Engram, Context7) */}
                        <div style={{ marginTop: '20px', padding: '16px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <FaBrain style={{ color: '#a855f7', fontSize: '1.2rem' }} />
                              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>Gentle-AI Stack (Gentleman • Engram • Context7)</h3>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowEngramModal(true)}
                              style={{ padding: '4px 10px', fontSize: '0.8rem', backgroundColor: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                            >
                              🧠 Ver Memorias Engram
                            </button>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.83rem' }}>
                              <input
                                type="checkbox"
                                checked={settingsForm.gentleAi?.enableGentleman !== false}
                                onChange={e => setSettingsForm({
                                  ...settingsForm,
                                  gentleAi: { ...(settingsForm.gentleAi || {}), enableGentleman: e.target.checked }
                                })}
                              />
                              <span><strong>Modo Gentleman:</strong> Estilo senior pragmático, clean code y respuestas concisas orientadas a la acción sin obviedades.</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.83rem' }}>
                              <input
                                type="checkbox"
                                checked={settingsForm.gentleAi?.enableEngram !== false}
                                onChange={e => setSettingsForm({
                                  ...settingsForm,
                                  gentleAi: { ...(settingsForm.gentleAi || {}), enableEngram: e.target.checked }
                                })}
                              />
                              <span><strong>Memoria Persistente (Engram):</strong> Almacena y recuerda decisiones técnicas, convenciones y soluciones entre sesiones.</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.83rem' }}>
                              <input
                                type="checkbox"
                                checked={settingsForm.gentleAi?.enableContext7 !== false}
                                onChange={e => setSettingsForm({
                                  ...settingsForm,
                                  gentleAi: { ...(settingsForm.gentleAi || {}), enableContext7: e.target.checked }
                                })}
                              />
                              <span><strong>Context7 (Docs al Día):</strong> Inyecta documentación oficial y flags modernos de Docker, K8s, Next.js, Bun, FFmpeg, etc.</span>
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.83rem' }}>
                              <input
                                type="checkbox"
                                checked={settingsForm.gentleAi?.enableGuardrails !== false}
                                onChange={e => setSettingsForm({
                                  ...settingsForm,
                                  gentleAi: { ...(settingsForm.gentleAi || {}), enableGuardrails: e.target.checked }
                                })}
                              />
                              <span><strong>Gentleman Guardrails:</strong> Intercepta comandos destructivos (rm -rf /, formateos) y oculta secretos (.env, claves SSH).</span>
                            </label>

                            <div style={{ marginTop: '4px' }}>
                              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                Context7 API Key (Opcional - usa caché y base de conocimiento local por defecto):
                              </label>
                              <input
                                type="password"
                                placeholder="ctx7_..."
                                value={settingsForm.gentleAi?.context7ApiKey || ''}
                                onChange={e => setSettingsForm({
                                  ...settingsForm,
                                  gentleAi: { ...(settingsForm.gentleAi || {}), context7ApiKey: e.target.value }
                                })}
                                style={{ width: '100%', padding: '6px 8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px', fontSize: '0.85rem' }}
                              />
                            </div>
                          </div>
                        </div>
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
                          const hasLoadedModels = profileModels[profile.id] && profileModels[profile.id].length > 0;
                          const isTesting = profileTestStatus[profile.id] === 'testing';
                          
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

                              <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('aiProvider', settings.language)}</label>
                                <select 
                                  value={profile.provider} 
                                  onChange={e => {
                                    const provider = e.target.value as 'openai' | 'google' | 'opencode' | 'ollama' | 'deepseek' | 'custom';
                                    const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                    updatedProfiles[index].provider = provider;
                                    if (provider === 'google') {
                                      updatedProfiles[index].baseUrl = 'https://generativelanguage.googleapis.com/v1beta/openai';
                                      updatedProfiles[index].model = 'gemini-2.5-flash';
                                      if (!profile.name || profile.name.startsWith('Default') || profile.name.includes('OpenAI') || profile.name.includes('Profile')) updatedProfiles[index].name = 'Google Gemini';
                                    } else if (provider === 'opencode') {
                                      updatedProfiles[index].baseUrl = 'https://opencode.ai/zen/go/v1';
                                      updatedProfiles[index].model = 'deepseek-chat';
                                      if (!profile.name || profile.name.startsWith('Default') || profile.name.includes('Profile')) updatedProfiles[index].name = 'OpenCode Go';
                                    } else if (provider === 'openai') {
                                      updatedProfiles[index].baseUrl = 'https://api.openai.com/v1';
                                      updatedProfiles[index].model = 'gpt-4o-mini';
                                      if (!profile.name || profile.name.startsWith('Default') || profile.name.includes('Profile')) updatedProfiles[index].name = 'OpenAI';
                                    } else if (provider === 'deepseek') {
                                      updatedProfiles[index].baseUrl = 'https://api.deepseek.com/v1';
                                      updatedProfiles[index].model = 'deepseek-chat';
                                      if (!profile.name || profile.name.startsWith('Default') || profile.name.includes('Profile')) updatedProfiles[index].name = 'DeepSeek';
                                    } else if (provider === 'ollama') {
                                      updatedProfiles[index].baseUrl = 'http://localhost:11434/v1';
                                      updatedProfiles[index].model = 'llama3';
                                      if (!profile.name || profile.name.startsWith('Default') || profile.name.includes('Profile')) updatedProfiles[index].name = 'Ollama Local';
                                    } else if (provider === 'custom') {
                                      updatedProfiles[index].baseUrl = updatedProfiles[index].baseUrl || 'http://localhost:1234/v1';
                                    }
                                    setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                  }} 
                                  style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                >
                                  <option value="google">Google (Gemini)</option>
                                  <option value="opencode">OpenCode (OpenCode Go)</option>
                                  <option value="openai">OpenAI (ChatGPT)</option>
                                  <option value="deepseek">DeepSeek</option>
                                  <option value="ollama">Ollama (Local)</option>
                                  <option value="custom">Custom (LMStudio, Groq, etc.)</option>
                                </select>
                              </div>

                              {profile.provider !== 'ollama' && (
                                <div style={{ marginBottom: '15px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>API Key</label>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{t('apiKeyHint', settings.language)}</span>
                                  </div>
                                  <input 
                                    type="password" 
                                    value={profile.apiKey} 
                                    placeholder={profile.provider === 'google' ? 'AIzaSy...' : profile.provider === 'opencode' ? 'sk-...' : 'sk-...'}
                                    onChange={e => {
                                      const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                      updatedProfiles[index].apiKey = e.target.value;
                                      setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                    }} 
                                    style={{ width: '100%', padding: '8px', marginTop: '4px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                  />
                                </div>
                              )}

                              <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{t('labelModel', settings.language)}</label>
                                {isTesting && !hasLoadedModels ? (
                                  <select 
                                    disabled 
                                    style={{ width: '100%', padding: '8px', marginTop: '4px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', opacity: 0.7 }}
                                  >
                                    <option>⏳ {t('modelsLoading', settings.language)}</option>
                                  </select>
                                ) : hasLoadedModels ? (
                                  <select 
                                    value={profile.model} 
                                    onChange={e => {
                                      const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                      updatedProfiles[index].model = e.target.value;
                                      setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                    }} 
                                    style={{ width: '100%', padding: '8px', marginTop: '4px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--accent)', color: 'var(--text-main)', borderRadius: '4px', fontWeight: '500' }}
                                  >
                                    {profileModels[profile.id].map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                ) : (
                                  <div>
                                    <input 
                                      type="text" 
                                      value={profile.model} 
                                      placeholder="ej. gemini-2.5-flash"
                                      onChange={e => {
                                        const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                        updatedProfiles[index].model = e.target.value;
                                        setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                      }} 
                                      style={{ width: '100%', padding: '8px', marginTop: '4px', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '4px' }}
                                    />
                                    {profile.provider !== 'ollama' && !profile.apiKey && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        💡 {t('apiKeyRequiredForModels', settings.language)}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div style={{ marginBottom: '15px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Base URL</label>
                                  {['openai', 'google', 'opencode', 'deepseek', 'ollama'].includes(profile.provider) && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                      <VscLock size={12} /> Auto-configurado
                                    </span>
                                  )}
                                </div>
                                <input 
                                  type="text" 
                                  value={profile.baseUrl} 
                                  onChange={e => {
                                    const updatedProfiles = [...(settingsForm.aiProfiles || [])];
                                    updatedProfiles[index].baseUrl = e.target.value;
                                    setSettingsForm({...settingsForm, aiProfiles: updatedProfiles});
                                  }} 
                                  readOnly={['openai', 'google', 'opencode', 'deepseek'].includes(profile.provider)}
                                  style={{ width: '100%', padding: '8px', marginTop: '4px', backgroundColor: ['openai', 'google', 'opencode', 'deepseek'].includes(profile.provider) ? 'rgba(0,0,0,0.2)' : 'var(--bg-panel)', border: '1px solid var(--border-color)', color: ['openai', 'google', 'opencode', 'deepseek'].includes(profile.provider) ? 'var(--text-muted)' : 'var(--text-main)', borderRadius: '4px' }}
                                />
                              </div>

                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                                <div>
                                  {profileTestStatus[profile.id] === 'testing' && <span style={{ color: 'var(--text-muted)' }}>⏳ {t('testing', settings.language)}</span>}
                                  {profileTestStatus[profile.id] === 'success' && <span style={{ color: 'var(--neon-green, #00ff00)', fontWeight: 'bold' }}>✅ {t('testSuccess', settings.language)} ({profileModels[profile.id]?.length || 0} modelos)</span>}
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

              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '15px' }}>
                <div 
                  onClick={() => setSshForm({...sshForm, type: 'ssh'})} 
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px', 
                    cursor: 'pointer', 
                    borderBottom: sshForm.type === 'ssh' ? '2px solid var(--accent)' : '2px solid transparent',
                    color: sshForm.type === 'ssh' ? 'var(--text-main)' : 'var(--text-dim)',
                    fontWeight: sshForm.type === 'ssh' ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                  }}
                >
                  <VscServer size={14} color={sshForm.type === 'ssh' ? '#c084fc' : undefined} />
                  {t('standardSsh', settings.language)}
                </div>
                <div 
                  onClick={() => setSshForm({...sshForm, type: 'gcp'})} 
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 16px', 
                    cursor: 'pointer', 
                    borderBottom: sshForm.type === 'gcp' ? '2px solid var(--accent)' : '2px solid transparent',
                    color: sshForm.type === 'gcp' ? 'var(--text-main)' : 'var(--text-dim)',
                    fontWeight: sshForm.type === 'gcp' ? 'bold' : 'normal',
                    transition: 'all 0.2s'
                  }}
                >
                  <FaCloud size={14} color={sshForm.type === 'gcp' ? '#38bdf8' : undefined} />
                  {t('googleCloud', settings.language)}
                </div>
              </div>

              {sshForm.type === 'ssh' ? (
                <>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 3 }}>
                      <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('host', settings.language)}:</label>
                      <input required type="text" placeholder="192.168.1.10" value={sshForm.host} onChange={e => setSshForm({...sshForm, host: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('port', settings.language)}:</label>
                      <input required type="number" value={sshForm.port} onChange={e => setSshForm({...sshForm, port: parseInt(e.target.value) || 22})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('username', settings.language)}:</label>
                      <input required type="text" value={sshForm.username} onChange={e => setSshForm({...sshForm, username: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px', marginBottom: '5px' }}>
                    <input type="checkbox" id="usePrivateKey" checked={sshForm.usePrivateKey} onChange={e => setSshForm({...sshForm, usePrivateKey: e.target.checked})} style={{ cursor: 'pointer' }} />
                    <label htmlFor="usePrivateKey" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>Use Private Key for Authentication</label>
                  </div>

                  {!sshForm.usePrivateKey ? (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('password', settings.language)}:</label>
                      <input type="password" value={sshForm.password} onChange={e => setSshForm({...sshForm, password: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('privateKeyPath', settings.language)}:</label>
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
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('gcpProject', settings.language)}:</label>
                    <input required type="text" placeholder="my-project-123" value={sshForm.gcpProject} onChange={e => setSshForm({...sshForm, gcpProject: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('gcpZone', settings.language)}:</label>
                    <input required type="text" placeholder="us-central1-a" value={sshForm.gcpZone} onChange={e => setSshForm({...sshForm, gcpZone: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('gcpInstance', settings.language)}:</label>
                    <input required type="text" placeholder="instance-1" value={sshForm.gcpInstance} onChange={e => setSshForm({...sshForm, gcpInstance: e.target.value})} style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px' }} />
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
                <div>
                  <button type="button" onClick={handleTestConnection} disabled={testStatus === 'testing'} style={{ padding: '8px 15px', backgroundColor: 'var(--border-light)', color: 'var(--text-main)', border: 'none', borderRadius: '4px', cursor: testStatus === 'testing' ? 'not-allowed' : 'pointer' }}>
                    {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
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
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => editSession(contextMenu.targetId)}
              >
                <VscEdit size={14} color="#38bdf8" />
                <span>Edit Session</span>
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.85rem', color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => deleteSession(contextMenu.targetId)}
              >
                <VscTrash size={14} color="#ff6b6b" />
                <span>{t('delete', settings.language)} Session</span>
              </div>
            </>
          )}
          {contextMenu.type === 'folder' && (
            <>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => {
                  setFolderForm({ name: '', parentId: contextMenu.targetId });
                  setShowFolderModal(true);
                  setContextMenu(null);
                }}
              >
                <VscFolder size={14} color="#f59e0b" />
                <span>{t('newFolder', settings.language)}</span>
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => {
                  setEditingSessionId(null);
                  setSshForm({ name: '', host: '', port: 22, username: '', password: '', privateKeyPath: '', folderId: contextMenu.targetId, usePrivateKey: false, type: 'ssh', gcpProject: '', gcpZone: '', gcpInstance: '' });
                  setTestStatus('idle');
                  setTestMessage('');
                  setShowSessionModal(true);
                  setContextMenu(null);
                }}
              >
                <VscServer size={14} color="#c084fc" />
                <span>{t('newSession', settings.language)}</span>
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}
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
                <VscEdit size={14} color="#38bdf8" />
                <span>{t('rename', settings.language) || 'Rename'}</span>
              </div>
              <div 
                style={{ padding: '8px 15px', cursor: 'pointer', fontSize: '0.85rem', color: '#ff6b6b', display: 'flex', alignItems: 'center', gap: '8px' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                onClick={() => deleteFolder(contextMenu.targetId)}
              >
                <VscTrash size={14} color="#ff6b6b" />
                <span>{t('delete', settings.language) || 'Delete'}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Engram Memory Manager Modal */}
      <EngramModal isOpen={showEngramModal} onClose={() => setShowEngramModal(false)} />

    </div>
    </>
  )
}

export default App
