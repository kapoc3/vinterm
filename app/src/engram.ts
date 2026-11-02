/**
 * Engram Native - Persistent Memory System for VinTerm AI
 * Inspired by Gentleman Programming's Engram (Go + SQLite + MCP).
 * 
 * Provides local cross-session memory for project conventions,
 * architectural decisions, bugfixes, and terminal patterns.
 */

export interface EngramMemory {
  id: string;
  title: string;
  content: string;
  type: 'decision' | 'bugfix' | 'convention' | 'pattern' | 'snippet';
  topicKey?: string;
  cwd?: string; // Optional directory where the memory was captured
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'vinterm_engram_memories';

/**
 * Loads all saved Engram memories from local storage.
 */
export function getAllMemories(): EngramMemory[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('[Engram] Failed to read memories from storage:', err);
    return [];
  }
}

/**
 * Saves all memories back to local storage.
 */
function saveAllMemories(memories: EngramMemory[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memories));
  } catch (err) {
    console.error('[Engram] Failed to write memories to storage:', err);
  }
}

/**
 * Saves a new memory or updates an existing one if topicKey matches.
 * Equivalent to Engram's `mem_save` tool.
 */
export function saveMemory(input: {
  title: string;
  content: string;
  type?: EngramMemory['type'];
  topicKey?: string;
  cwd?: string;
  tags?: string[];
}): EngramMemory {
  const memories = getAllMemories();
  const now = Date.now();

  // If a topicKey is provided, check for existing memory to update/upsert
  if (input.topicKey) {
    const existingIndex = memories.findIndex(m => m.topicKey === input.topicKey);
    if (existingIndex >= 0) {
      const updated: EngramMemory = {
        ...memories[existingIndex],
        title: input.title.trim() || memories[existingIndex].title,
        content: input.content.trim(),
        type: input.type || memories[existingIndex].type,
        cwd: input.cwd || memories[existingIndex].cwd,
        tags: input.tags || memories[existingIndex].tags,
        updatedAt: now
      };
      memories[existingIndex] = updated;
      saveAllMemories(memories);
      return updated;
    }
  }

  const newMemory: EngramMemory = {
    id: `engram_${now}_${Math.random().toString(36).substring(2, 7)}`,
    title: input.title.trim() || 'Nota de Ingeniería',
    content: input.content.trim(),
    type: input.type || 'convention',
    topicKey: input.topicKey,
    cwd: input.cwd,
    tags: input.tags || [],
    createdAt: now,
    updatedAt: now
  };

  memories.unshift(newMemory);
  saveAllMemories(memories);
  return newMemory;
}

/**
 * Searches memories matching a natural language or keyword query.
 * Equivalent to Engram's `mem_search` tool.
 */
export function searchMemories(query: string, cwd?: string, limit: number = 4): EngramMemory[] {
  const all = getAllMemories();
  if (!all.length) return [];

  const q = (query || '').toLowerCase().trim();
  const terms = q.split(/\s+/).filter(t => t.length > 1);

  const scored = all.map(mem => {
    let score = 0;
    const titleLower = mem.title.toLowerCase();
    const contentLower = mem.content.toLowerCase();
    const tagsLower = (mem.tags || []).join(' ').toLowerCase();

    // Match cwd context if relevant
    if (cwd && mem.cwd && (cwd.includes(mem.cwd) || mem.cwd.includes(cwd))) {
      score += 15;
    }

    if (!terms.length) {
      return { mem, score };
    }

    terms.forEach(term => {
      if (titleLower.includes(term)) score += 10;
      if (contentLower.includes(term)) score += 5;
      if (tagsLower.includes(term)) score += 8;
      if (mem.topicKey?.toLowerCase().includes(term)) score += 12;
    });

    return { mem, score };
  });

  return scored
    .filter(item => item.score > 0 || !terms.length)
    .sort((a, b) => b.score - a.score || b.mem.updatedAt - a.mem.updatedAt)
    .slice(0, limit)
    .map(item => item.mem);
}

/**
 * Deletes a memory by its ID.
 */
export function deleteMemory(id: string): void {
  const memories = getAllMemories().filter(m => m.id !== id);
  saveAllMemories(memories);
}

/**
 * Formats relevant Engram memories to be injected into the LLM system prompt.
 * Keeps it concise and token-efficient.
 */
export function buildEngramPromptSection(query: string, cwd?: string): string {
  const matches = searchMemories(query, cwd, 3);
  if (!matches.length) return '';

  const formatted = matches.map(m => {
    return `- [${m.type.toUpperCase()}] ${m.title}: ${m.content}`;
  }).join('\n');

  return `\n\n[MEMORIA PERSISTENTE (ENGRAM - CONOCIMIENTO PREVIO DEL PROYECTO)]\n${formatted}\nTen en cuenta estas convenciones y soluciones previamente acordadas.`;
}

