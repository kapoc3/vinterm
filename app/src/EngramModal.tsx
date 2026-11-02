import React, { useState, useEffect } from 'react';
import { getAllMemories, saveMemory, deleteMemory, searchMemories, type EngramMemory } from './engram';
import { FaTrash, FaPlus, FaSearch, FaBrain, FaTimes } from 'react-icons/fa';

interface EngramModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EngramModal: React.FC<EngramModalProps> = ({ isOpen, onClose }) => {
  const [memories, setMemories] = useState<EngramMemory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState<EngramMemory['type']>('convention');

  const refreshMemories = () => {
    if (searchQuery.trim()) {
      setMemories(searchMemories(searchQuery.trim(), undefined, 50));
    } else {
      setMemories(getAllMemories());
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshMemories();
    }
  }, [isOpen, searchQuery]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    saveMemory({
      title: title.trim(),
      content: content.trim(),
      type
    });

    setTitle('');
    setContent('');
    setShowAddForm(false);
    refreshMemories();
  };

  const handleDelete = (id: string) => {
    deleteMemory(id);
    refreshMemories();
  };

  const getTypeColor = (t: EngramMemory['type']) => {
    switch (t) {
      case 'bugfix': return '#f87171'; // red
      case 'decision': return '#818cf8'; // indigo
      case 'pattern': return '#fbbf24'; // amber
      case 'snippet': return '#38bdf8'; // sky
      default: return '#34d399'; // green
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        backdropFilter: 'blur(8px)'
      }}
      onClick={onClose}
    >
      <div 
        style={{
          width: '90%',
          maxWidth: '680px',
          maxHeight: '85vh',
          backgroundColor: 'var(--bg-panel, #1e1e1e)',
          border: '1px solid var(--border-color, #333)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-color, #333)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaBrain style={{ color: '#a855f7', fontSize: '1.3rem' }} />
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: 'var(--text-main, #fff)' }}>
                Engram • Memoria Persistente Nativa
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #888)' }}>
                Recuerdos y convenciones compartidas con Vincent AI en todas tus sesiones
              </div>
            </div>
          </div>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #888)',
              fontSize: '1.2rem',
              cursor: 'pointer'
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ padding: '14px 20px', display: 'flex', gap: '10px', alignItems: 'center', borderBottom: '1px solid var(--border-color, #333)' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <FaSearch style={{ position: 'absolute', left: '10px', top: '10px', color: '#666', fontSize: '0.85rem' }} />
            <input 
              type="text" 
              placeholder="Buscar en memorias (convenciones, soluciones, arquitecturas)..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                backgroundColor: 'var(--bg-input, #121212)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: '6px',
                color: 'var(--text-main, #fff)',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          <button 
            type="button"
            onClick={() => setShowAddForm(prev => !prev)}
            style={{
              padding: '8px 14px',
              backgroundColor: showAddForm ? '#666' : 'var(--accent, #00e5ff)',
              color: '#000',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.85rem'
            }}
          >
            <FaPlus /> {showAddForm ? 'Cerrar' : 'Nueva Memoria'}
          </button>
        </div>

        {/* Add Memory Form */}
        {showAddForm && (
          <form onSubmit={handleSave} style={{ padding: '16px 20px', backgroundColor: 'rgba(168, 85, 247, 0.04)', borderBottom: '1px solid var(--border-color, #333)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="text" 
                placeholder="Título (ej: Convención de Node y pnpm)"
                value={title}
                onChange={e => setTitle(e.target.value)}
                required
                style={{
                  flex: 2,
                  padding: '8px',
                  backgroundColor: 'var(--bg-input, #121212)',
                  border: '1px solid var(--border-color, #333)',
                  borderRadius: '4px',
                  color: 'var(--text-main, #fff)',
                  fontSize: '0.85rem'
                }}
              />
              <select
                value={type}
                onChange={e => setType(e.target.value as any)}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: 'var(--bg-input, #121212)',
                  border: '1px solid var(--border-color, #333)',
                  borderRadius: '4px',
                  color: 'var(--text-main, #fff)',
                  fontSize: '0.85rem'
                }}
              >
                <option value="convention">Convención</option>
                <option value="bugfix">Solución Bugfix</option>
                <option value="decision">Decisión Arquitectura</option>
                <option value="pattern">Patrón de Diseño</option>
                <option value="snippet">Snippet / Comando</option>
              </select>
            </div>

            <textarea 
              placeholder="Contenido de la memoria que Vincent AI debe recordar para este proyecto o entorno..."
              value={content}
              onChange={e => setContent(e.target.value)}
              required
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: 'var(--bg-input, #121212)',
                border: '1px solid var(--border-color, #333)',
                borderRadius: '4px',
                color: 'var(--text-main, #fff)',
                fontSize: '0.85rem',
                resize: 'vertical'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button 
                type="submit"
                style={{
                  padding: '6px 16px',
                  backgroundColor: '#a855f7',
                  color: '#fff',
                  fontWeight: 'bold',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Guardar en Engram
              </button>
            </div>
          </form>
        )}

        {/* Memories List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {memories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted, #777)' }}>
              <FaBrain style={{ fontSize: '2.5rem', marginBottom: '10px', opacity: 0.4 }} />
              <div>No hay memorias persistentes almacenadas aún.</div>
              <div style={{ fontSize: '0.8rem', marginTop: '6px' }}>
                Las memorias que agregues aquí o las que guardes desde las respuestas de Vincent AI se recordarán automáticamente.
              </div>
            </div>
          ) : (
            memories.map(mem => (
              <div 
                key={mem.id}
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'var(--bg-input, #121212)',
                  border: '1px solid var(--border-color, #2a2a2a)',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'border 0.2s'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span 
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        color: getTypeColor(mem.type),
                        textTransform: 'uppercase'
                      }}
                    >
                      {mem.type}
                    </span>
                    <span style={{ fontWeight: '600', fontSize: '0.92rem', color: 'var(--text-main, #eee)' }}>
                      {mem.title}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #666)', marginLeft: 'auto' }}>
                      {new Date(mem.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.83rem', color: 'var(--text-muted, #aaa)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    {mem.content}
                  </div>
                </div>

                <button 
                  onClick={() => handleDelete(mem.id)}
                  title="Eliminar memoria"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#ff4d4f',
                    cursor: 'pointer',
                    alignSelf: 'flex-start',
                    padding: '4px 6px',
                    opacity: 0.7
                  }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                >
                  <FaTrash />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 20px',
          borderTop: '1px solid var(--border-color, #333)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.78rem',
          color: 'var(--text-muted, #777)',
          backgroundColor: 'rgba(255, 255, 255, 0.01)'
        }}>
          <span>{memories.length} memorias almacenadas en local</span>
          <span style={{ color: '#a855f7' }}>⚡ Ecosistema Gentle-AI</span>
        </div>
      </div>
    </div>
  );
};

