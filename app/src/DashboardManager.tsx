import React, { useState } from 'react';
import { FaPlus, FaEdit, FaTrash, FaChartLine, FaCheck, FaTimes } from 'react-icons/fa';
import type { DashboardConfig, DashboardWidget, SavedSession } from './App';
import { t } from './i18n';

interface Props {
  dashboards: DashboardConfig[];
  sessions: SavedSession[];
  settings?: { language?: string };
  onSaveDashboard: (dashboard: DashboardConfig) => void;
  onDeleteDashboard: (id: string) => void;
  onOpenDashboard: (dashboard: DashboardConfig) => void;
}

export const DashboardManager: React.FC<Props> = ({ dashboards, sessions, settings, onSaveDashboard, onDeleteDashboard, onOpenDashboard }) => {
  const lang = settings?.language || 'en';
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [selectedSessions, setSelectedSessions] = useState<Set<string>>(new Set());
  const [dashboardToDelete, setDashboardToDelete] = useState<string | null>(null);

  const startEdit = (db?: DashboardConfig) => {
    if (db) {
      setEditingId(db.id);
      setEditName(db.name);
      setSelectedSessions(new Set(db.widgets.map(w => w.sessionId)));
    } else {
      setEditingId('new');
      setEditName(t('dmNewDashboardName', lang));
      setSelectedSessions(new Set());
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setSelectedSessions(new Set());
  };

  const saveEdit = () => {
    if (!editName.trim()) return;

    const newWidgets: DashboardWidget[] = [];
    let currentY = 0;

    const existingDb = dashboards.find(d => d.id === editingId);
    
    Array.from(selectedSessions).forEach((sessionId) => {
      const existingWidget = existingDb?.widgets.find(w => w.sessionId === sessionId);
      if (existingWidget) {
        newWidgets.push(existingWidget);
      } else {
        newWidgets.push({
          i: sessionId,
          x: (newWidgets.length % 4) * 3,
          y: currentY + Math.floor(newWidgets.length / 4) * 2,
          w: 3,
          h: 2,
          sessionId
        });
      }
    });

    const newDb: DashboardConfig = {
      id: editingId === 'new' ? `db_${Date.now()}` : editingId!,
      name: editName.trim(),
      widgets: newWidgets
    };

    onSaveDashboard(newDb);
    setEditingId(null);
  };

  const toggleSession = (sessionId: string) => {
    const next = new Set(selectedSessions);
    if (next.has(sessionId)) next.delete(sessionId);
    else next.add(sessionId);
    setSelectedSessions(next);
  };

  // ─── Edit / Create Form ───
  if (editingId) {
    return (
      <div style={{ padding: '20px 30px', height: '100%', overflowY: 'auto', color: 'var(--text-main)' }}>
        <h2 style={{ marginTop: 0, marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
          {editingId === 'new' ? t('dmCreateDashboard', lang) : t('dmEditDashboard', lang)}
        </h2>

        {/* Dashboard Name */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '5px' }}>{t('dmDashboardName', lang)}:</label>
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder={t('dmNamePlaceholder', lang)}
            style={{ width: '100%', padding: '8px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)', color: 'var(--text-main)', borderRadius: '4px', boxSizing: 'border-box' }}
          />
        </div>

        {/* Server Selection */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '8px' }}>{t('dmSelectServers', lang)}:</label>
          
          {sessions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.9rem' }}>{t('dmNoSessions', lang)}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {sessions.map(s => (
                <div 
                  key={s.id} 
                  onClick={() => toggleSession(s.id)}
                  style={{ 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s',
                    backgroundColor: selectedSessions.has(s.id) ? 'var(--accent)' : 'var(--bg-input)',
                    color: selectedSessions.has(s.id) ? 'var(--button-text)' : 'var(--text-main)',
                    border: `1px solid ${selectedSessions.has(s.id) ? 'var(--accent)' : 'var(--border-light)'}`,
                    fontWeight: selectedSessions.has(s.id) ? 'bold' : 'normal'
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>{s.name}</span>
                  {selectedSessions.has(s.id) && <FaCheck size={12} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '15px' }}>
          <button 
            onClick={saveEdit} 
            style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FaCheck size={12} /> {t('dmSave', lang)}
          </button>
          <button 
            onClick={cancelEdit} 
            style={{ padding: '8px 20px', backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FaTimes size={12} /> {t('dmCancel', lang)}
          </button>
        </div>
      </div>
    );
  }

  // ─── Dashboard List ───
  return (
    <div style={{ padding: '20px 30px', height: '100%', overflowY: 'auto', color: 'var(--text-main)' }}>
      <div style={{ marginBottom: '15px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
        <h2 style={{ margin: 0 }}>{t('dmTitle', lang)}</h2>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
        <button 
          onClick={() => startEdit()}
          style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}
        >
          <FaPlus size={12} /> {t('dmNewDashboard', lang)}
        </button>
      </div>

      {dashboards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <FaChartLine style={{ fontSize: '2.5rem', opacity: 0.4, marginBottom: '12px' }} />
          <p style={{ marginBottom: '16px' }}>{t('dmNoDashboards', lang)}</p>
          <button 
            onClick={() => startEdit()}
            style={{ padding: '8px 16px', backgroundColor: 'var(--accent)', color: 'var(--button-text)', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <FaPlus size={12} /> {t('dmCreateFirst', lang)}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {dashboards.map(db => (
            <div 
              key={db.id} 
              style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s',
                backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-light)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-light)'; e.currentTarget.style.backgroundColor = 'var(--bg-input)'; }}
              onClick={() => onOpenDashboard(db)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <FaChartLine style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{db.name}</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{db.widgets.length} {t('dmServersConfigured', lang)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); startEdit(db); }}
                  style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: '4px', transition: 'color 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  title={t('dmEdit', lang)}
                >
                  <FaEdit size={14} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setDashboardToDelete(db.id); }}
                  style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: '4px', transition: 'color 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  title={t('dmDelete', lang)}
                >
                  <FaTrash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Custom Delete Confirmation Modal */}
      {dashboardToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
        }}>
          <div style={{
            backgroundColor: 'var(--bg-panel)', padding: '24px', borderRadius: '8px',
            border: '1px solid var(--border-light)', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            maxWidth: '400px', width: '100%', color: 'var(--text-main)'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FaTrash style={{ color: '#ef4444' }} />
              {t('dmConfirmDelete', lang)}
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '0.95rem' }}>
              {t('dmCannotUndo', lang)}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setDashboardToDelete(null)}
                style={{ padding: '8px 16px', backgroundColor: 'transparent', color: 'var(--text-main)', border: '1px solid var(--border-light)', borderRadius: '4px', cursor: 'pointer' }}
              >
                {t('dmCancel', lang)}
              </button>
              <button 
                onClick={() => {
                  onDeleteDashboard(dashboardToDelete);
                  setDashboardToDelete(null);
                }}
                style={{ padding: '8px 16px', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {t('dmDelete', lang)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
