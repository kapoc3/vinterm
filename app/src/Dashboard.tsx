import React, { useEffect, useState, useMemo, useRef } from 'react';
import GridLayout from 'react-grid-layout';
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { FaPalette, FaCheck, FaLinux, FaSyncAlt } from 'react-icons/fa';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { DashboardConfig, SavedSession } from './App';
import { t } from './i18n';

interface Props {
  config: DashboardConfig;
  sessions: SavedSession[];
  settings?: { language?: string };
  onSaveDashboard: (dashboard: DashboardConfig) => void;
}

interface ServerStats {
  cpu: number;
  memUsed: number;
  memTotal: number;
  diskUsed: number;
  diskTotal: number;
  status: 'connecting' | 'online' | 'offline';
  osName?: string;
}

interface ServerState {
  current: ServerStats;
  history: { time: string; cpu: number; ram: number }[];
}

export const Dashboard: React.FC<Props> = ({ config, sessions, settings, onSaveDashboard }) => {
  const lang = settings?.language || 'en';
  const [stats, setStats] = useState<Record<string, ServerState>>({});
  const [editingColor, setEditingColor] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const statsRef = useRef(stats);
  const [width, setWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Keep ref in sync
  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);
  
  if (!config) return <div className="p-6 h-full flex items-center justify-center italic text-muted">{t('dashboardLoading', lang)}</div>;
  
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Check initially in case it's already visible
    if (containerRef.current.offsetWidth > 0) {
      setWidth(containerRef.current.offsetWidth);
    }
    
    const observer = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) {
        setWidth(w);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  
  // Connect to servers on mount
  useEffect(() => {
    let active = true;

    const connectServers = async () => {
      for (const widget of config.widgets) {
        const session = sessions.find(s => s.id === widget.sessionId);
        if (!session) {
          if (active) {
            setStats(prev => ({
              ...prev,
              [widget.sessionId]: { 
                current: { cpu: 0, memTotal: 0, memUsed: 0, diskTotal: 0, diskUsed: 0, status: 'offline', osName: '' },
                history: []
              }
            }));
          }
          continue;
        }

        setStats(prev => ({
          ...prev,
          [widget.sessionId]: { 
            current: { cpu: 0, memTotal: 0, memUsed: 0, diskTotal: 0, diskUsed: 0, status: 'connecting', osName: '' },
            history: []
          }
        }));

        try {
          const res = await (window as any).electronAPI.dashboardConnect(session.id, session.config, session.type || 'ssh');
          if (active) {
            setStats(prev => {
              const old = prev[widget.sessionId] || { history: [] };
              return {
                ...prev,
                [widget.sessionId]: { ...old, current: { ...old.current, status: res.success ? 'online' : 'offline' } }
              };
            });
          }
        } catch (e) {
          if (active) {
            setStats(prev => {
              const old = prev[widget.sessionId] || { history: [] };
              return {
                ...prev,
                [widget.sessionId]: { ...old, current: { ...old.current, status: 'offline' } }
              };
            });
          }
        }
      }
    };
    
    connectServers();

    return () => {
      active = false;
      config.widgets.forEach(w => {
        (window as any).electronAPI.dashboardDisconnect(w.sessionId);
      });
    };
  }, [config.id, sessions]);

  // Poll stats
  const pollRef = useRef<() => Promise<void>>();
  useEffect(() => {
    const poll = async () => {
      for (const widget of config.widgets) {
        const currentStat = statsRef.current[widget.sessionId]?.current;
        if (!currentStat || currentStat.status !== 'online') continue;
        
        try {
          const res = await (window as any).electronAPI.getSshStats(widget.sessionId);
          if (res.success && res.data) {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
            
            setStats(prev => {
              const old = prev[widget.sessionId];
              if (!old) return prev;
              
              const ramPerc = res.data.memTotal ? Number(((res.data.memUsed / res.data.memTotal) * 100).toFixed(1)) : 0;
              const cpuPerc = Number(res.data.cpu.toFixed(1));
              
              const newPoint = { time: timeStr, cpu: cpuPerc, ram: ramPerc };
              let newHistory = [...old.history, newPoint];
              
              // Duplicate first point so Recharts renders a line instantly instead of a blank screen
              if (newHistory.length === 1) {
                newHistory.unshift({ ...newPoint, time: 'prev' });
              }
              
              return {
                ...prev,
                [widget.sessionId]: { 
                  current: { ...old.current, ...res.data },
                  history: newHistory.slice(-20)
                }
              };
            });
          }
        } catch (e) {
          console.error("Error fetching stats for", widget.sessionId, e);
        }
      }
    };

    pollRef.current = poll;
    poll(); // Poll immediately
    const interval = setInterval(poll, 5000);

    return () => clearInterval(interval);
  }, [config.widgets]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (pollRef.current) await pollRef.current();
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleLayoutChange = (layout: any[]) => {
    const newWidgets = config.widgets.map(w => {
      const match = layout.find(l => l.i === w.sessionId);
      if (match) {
        return { ...w, x: match.x, y: match.y, w: match.w, h: match.h };
      }
      return w;
    });
    
    onSaveDashboard({ ...config, widgets: newWidgets });
  };

  const handleColorChange = (sessionId: string, color: string) => {
    const newWidgets = config.widgets.map(w => w.sessionId === sessionId ? { ...w, color } : w);
    onSaveDashboard({ ...config, widgets: newWidgets });
    setEditingColor(null);
  };

  const PRESET_COLORS = ['var(--bg-panel)', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

  const renderWidget = (widget: any) => {
    const session = sessions.find(s => s.id === widget.sessionId);
    const s = stats[widget.sessionId]?.current || { cpu: 0, memTotal: 0, memUsed: 0, diskTotal: 0, diskUsed: 0, status: 'connecting' };
    const history = stats[widget.sessionId]?.history || [];
    
    const ramPct = ((s.memTotal ? (s.memUsed / s.memTotal) : 0) * 100 || 0).toFixed(0);
    const diskPct = ((s.diskTotal ? (s.diskUsed / s.diskTotal) : 0) * 100 || 0).toFixed(0);
    const isOnline = s.status === 'online';
    const statusColor = isOnline ? '#22c55e' : s.status === 'connecting' ? '#eab308' : '#ef4444';

    return (
      <div 
        key={widget.sessionId} 
        className="rounded-xl flex flex-col overflow-hidden h-full shadow-lg hover:shadow-xl transition-shadow cursor-grab active:cursor-grabbing" 
        style={{ 
          backgroundColor: 'var(--bg-panel)',
          border: `2px solid ${statusColor}`,
        }}
      >
        {/* Linux watermark */}
        <div className="pointer-events-none z-0" style={{ position: 'absolute', bottom: '2px', right: '4px', opacity: 0.15 }}>
          <FaLinux size={30} style={{ color: 'var(--text-main)' }} />
        </div>
        {/* Header */}
        <div className="flex items-center justify-center gap-2 px-3 py-1.5" style={{ backgroundColor: `${statusColor}20`, borderBottom: `1px solid ${statusColor}40` }}>
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0`} style={{ backgroundColor: statusColor, boxShadow: isOnline ? `0 0 8px ${statusColor}` : 'none' }} />
          <div className="flex flex-col items-start truncate">
            <h3 className="font-bold truncate text-sm leading-none w-full" title={session?.name} style={{ color: 'var(--text-main)' }}>{session?.name || t('dashboardUnknown', lang)}</h3>
            {s.osName && <span className="text-[9px] leading-none mt-0.5 truncate w-full" style={{ color: 'var(--text-muted)' }}>{s.osName}</span>}
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center justify-center px-3 py-1 gap-0">
          {isOnline ? (
            <div className="flex flex-col w-full text-[11px]">
              <div className="flex justify-between items-center py-1">
                <span style={{ color: 'var(--text-muted)' }}>{t('dashboardCpu', lang)}</span>
                <strong style={{ color: 'var(--text-main)' }}>{(s.cpu || 0).toFixed(0)}%</strong>
              </div>
              <div className="w-full" style={{ borderTop: '1px solid var(--border-color)' }} />
              <div className="flex justify-between items-center py-1">
                <span style={{ color: 'var(--text-muted)' }}>{t('dashboardRam', lang)}</span>
                <strong style={{ color: 'var(--text-main)' }}>{ramPct}%</strong>
              </div>
              <div className="w-full" style={{ borderTop: '1px solid var(--border-color)' }} />
              <div className="flex justify-between items-center py-1">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t('dashboardDisk', lang)}</span>
                <strong style={{ color: 'var(--text-main)' }}>{diskPct}%</strong>
              </div>
            </div>
          ) : (
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: statusColor }}>{s.status}</span>
          )}
        </div>
      </div>
    );
  };

  const layout = useMemo(() => config.widgets.map((w, idx) => ({
    i: w.sessionId,
    x: (idx % 4) * 3,
    y: Math.floor(idx / 4) * 2,
    w: 3,
    h: 2,
    minW: 2,
    minH: 2
  })), [config.widgets]);

  return (
    <div ref={containerRef} className="p-6 overflow-y-auto overflow-x-hidden" style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, backgroundColor: 'var(--bg-app)', color: 'var(--text-main)' }}>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>📊 {config.name}</h2>
        <button 
          onClick={handleRefresh}
          className="p-1.5 rounded-lg transition-all hover:scale-110"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }}
          title={t('dashboardRefresh', lang)}
        >
          <FaSyncAlt size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>
      
      {width > 0 && (
        <GridLayout
          className="layout"
          layout={layout}
          cols={12}
          rowHeight={12}
          width={width}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".font-bold" // only drag by title
          compactType={null} // allows widgets to float freely anywhere
          preventCollision={false}
        >
          {config.widgets.map(w => renderWidget(w))}
        </GridLayout>
      )}
    </div>
  );
};
