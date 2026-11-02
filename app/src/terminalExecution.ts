import type { Terminal } from 'xterm';

// Helper to strip ANSI escape codes for clean display in React UI components
export function stripAnsiCodes(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b\([a-zA-Z]/g, '');
}

/**
 * Detects whether terminal output indicates a command failure, syntax error,
 * missing permission, or broken dependency.
 */
export function isErrorOutput(output: string): boolean {
  if (!output || !output.trim()) return false;
  const lower = output.toLowerCase();
  return (
    lower.includes('command not found') ||
    lower.includes('no such file or directory') ||
    lower.includes('permission denied') ||
    lower.includes('operation not permitted') ||
    lower.includes('fatal:') ||
    lower.includes('eacces') ||
    lower.includes('enoent') ||
    lower.includes('syntaxerror') ||
    lower.includes('failed with exit code') ||
    lower.includes('exit status 1') ||
    lower.includes('exit status 2') ||
    lower.includes('exit status 127') ||
    lower.includes('could not resolve') ||
    lower.includes('could not find') ||
    lower.includes('connection refused') ||
    lower.includes('cannot open') ||
    /\b(err|error|failed|failure)\b/i.test(lower)
  );
}

/**
 * Writes a high-tech, sleek ANSI execution banner directly to the xterm terminal screen.
 * This notifies the user visually that Vincent AI is running a command, without sending
 * escape sequences to the remote shell's stdin.
 */
export function writeAiExecutionBanner(
  term: Terminal | null,
  command: string,
  agentName: string = 'Vincent AI'
): void {
  if (!term) return;

  const cols = Math.max(term.cols || 80, 40);
  const maxLine = Math.min(cols - 12, 64);
  const borderLine = '─'.repeat(Math.max(10, maxLine));

  const banner = 
    `\r\n\x1b[38;2;168;85;247m╭── ⚡ ${agentName} \x1b[90m(ejecución en vivo)\x1b[38;2;168;85;247m ${borderLine}\x1b[0m\r\n` +
    `\x1b[38;2;168;85;247m│\x1b[0m \x1b[1;32m➜\x1b[0m \x1b[1;37m${command}\x1b[0m\r\n` +
    `\x1b[38;2;168;85;247m╰${borderLine}──\x1b[0m\r\n`;

  try {
    term.write(banner);
  } catch (e) {
    // ignore write error if terminal disposed
  }
}

export interface CommandLogEntry {
  id: string;
  timestamp: string;
  sessionId: string;
  sessionType?: 'local' | 'ssh' | 'gcp';
  command: string;
  trigger: 'autonomous' | 'ai_card' | 'quick_palette' | 'manual';
  agentName?: string;
  status: 'running' | 'completed' | 'interrupted' | 'failed';
  elapsedMs?: number;
  outputSnippet?: string;
}

const HISTORY_STORAGE_KEY = 'kx_command_history';
const MAX_HISTORY_ITEMS = 250;

let inMemoryCommandHistory: CommandLogEntry[] = [];
const historyListeners = new Set<() => void>();

// Load command history from localStorage on initialization
try {
  const saved = typeof window !== 'undefined' ? localStorage.getItem(HISTORY_STORAGE_KEY) : null;
  if (saved) {
    inMemoryCommandHistory = JSON.parse(saved);
  }
} catch (e) {}

function persistCommandHistory() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(inMemoryCommandHistory.slice(-MAX_HISTORY_ITEMS)));
    }
  } catch (e) {}
  historyListeners.forEach(listener => {
    try { listener(); } catch (e) {}
  });
}

export function getCommandHistory(): CommandLogEntry[] {
  return [...inMemoryCommandHistory];
}

export function clearCommandHistory(): void {
  inMemoryCommandHistory = [];
  persistCommandHistory();
  console.log('%c⚡ [VinTerm CommandLog] Historial de comandos vaciado.', 'color: #ef4444; font-weight: bold;');
}

export function subscribeCommandHistory(listener: () => void): () => void {
  historyListeners.add(listener);
  return () => {
    historyListeners.delete(listener);
  };
}

export function logCommandStart(entry: CommandLogEntry): void {
  inMemoryCommandHistory.push(entry);
  if (inMemoryCommandHistory.length > MAX_HISTORY_ITEMS) {
    inMemoryCommandHistory = inMemoryCommandHistory.slice(-MAX_HISTORY_ITEMS);
  }
  persistCommandHistory();

  const timeStr = new Date(entry.timestamp).toLocaleTimeString();
  const triggerLabel = 
    entry.trigger === 'autonomous' ? 'Modo Autónomo' :
    entry.trigger === 'quick_palette' ? 'Paleta Cmd+K' :
    entry.trigger === 'ai_card' ? 'Vincent AI Card' : 'Manual';

  console.groupCollapsed(
    `%c⚡ [VinTerm ExecLog] %c${timeStr}%c ➜ %c${entry.command.length > 55 ? entry.command.slice(0, 52) + '...' : entry.command} %c[${triggerLabel}]`,
    'color: #a855f7; font-weight: bold;',
    'color: #94a3b8; font-size: 11px;',
    'color: #f59e0b; font-weight: bold;',
    'color: #22c55e; font-weight: bold;',
    'color: #38bdf8; font-size: 10px; background: rgba(56,189,248,0.1); border: 1px solid rgba(56,189,248,0.3); border-radius: 3px; padding: 1px 5px;'
  );
  console.log('%cComando:', 'font-weight: bold; color: #22c55e;', entry.command);
  console.log('%cHora:', 'font-weight: bold;', entry.timestamp);
  console.log('%cSesión:', 'font-weight: bold;', `${entry.sessionId} (${entry.sessionType || 'local'})`);
  console.log('%cAgente:', 'font-weight: bold;', entry.agentName || 'Vincent AI');
  console.log('%cOrigen / Trigger:', 'font-weight: bold;', triggerLabel);
  console.log('%cEstado:', 'color: #eab308; font-weight: bold;', '⏳ En ejecución en el terminal...');
  console.groupEnd();
}

export function logCommandEnd(
  logId: string, 
  status: 'completed' | 'interrupted' | 'failed', 
  elapsedMs: number, 
  outputSnippet?: string
): void {
  const item = inMemoryCommandHistory.find(c => c.id === logId);
  if (item) {
    item.status = status;
    item.elapsedMs = elapsedMs;
    if (outputSnippet) {
      item.outputSnippet = outputSnippet.slice(-2500);
    }
    persistCommandHistory();
  }

  const statusColor = status === 'completed' ? '#22c55e' : status === 'interrupted' ? '#f59e0b' : '#ef4444';
  const statusIcon = status === 'completed' ? '✓' : status === 'interrupted' ? '🛑' : '✗';
  const timeStr = new Date().toLocaleTimeString();

  console.log(
    `%c${statusIcon} [VinTerm ExecLog] ${timeStr} %c${status.toUpperCase()} (${elapsedMs}ms)%c ➜ ${item ? item.command : logId}`,
    `color: ${statusColor}; font-weight: bold;`,
    `color: ${statusColor}; font-weight: 600;`,
    'color: var(--text-main, #e2e8f0);'
  );
}

export function updateCommandLogOutput(logId: string, output: string): void {
  const item = inMemoryCommandHistory.find(c => c.id === logId);
  if (item) {
    item.outputSnippet = (item.outputSnippet || '') + output;
    if (item.outputSnippet.length > 3000) {
      item.outputSnippet = item.outputSnippet.slice(-3000);
    }
    persistCommandHistory();
  }
}

// Expose helpful interactive DevTools console API for the user/developer
if (typeof window !== 'undefined') {
  (window as any).vinTermCommandHistory = inMemoryCommandHistory;
  (window as any).getCommandHistory = (limit?: number) => {
    const list = inMemoryCommandHistory.slice(-(limit || 25));
    console.table(list.map(c => ({
      hora: new Date(c.timestamp).toLocaleTimeString(),
      origen: c.trigger,
      estado: c.status,
      duracion: `${c.elapsedMs ?? 0}ms`,
      comando: c.command.length > 55 ? c.command.slice(0, 52) + '...' : c.command
    })));
    return inMemoryCommandHistory;
  };
  (window as any).clearCommandHistory = clearCommandHistory;
  (window as any).exportCommandHistory = () => {
    const json = JSON.stringify(inMemoryCommandHistory, null, 2);
    console.log(json);
    return json;
  };
}

export interface LiveExecutionHandle {
  cancel: () => void;
  isRunning: () => boolean;
  logId: string;
}

export interface LiveExecutionOptions {
  id: string;
  command: string;
  term?: Terminal | null;
  agentName?: string;
  trigger?: 'autonomous' | 'ai_card' | 'quick_palette' | 'manual';
  sessionType?: 'local' | 'ssh' | 'gcp';
  onComplete?: (elapsedMs: number) => void;
  onCancelled?: () => void;
}

/**
 * Executes a command on the terminal session cleanly and reliably:
 * 1. Sanitizes the command string (strips stray prompts like $ or #)
 * 2. Sends the command directly to the terminal PTY stream without corrupting screen geometry
 * 3. Logs the full execution details into console and persistent command history
 */
export function executeLiveCommand(
  options: LiveExecutionOptions
): LiveExecutionHandle {
  const { id, command, agentName, trigger = 'ai_card', sessionType, onComplete, onCancelled } = options;
  const electronAPI = (window as any).electronAPI;
  
  if (!electronAPI || !electronAPI.sendToTerminal) {
    return { cancel: () => {}, isRunning: () => false, logId: '' };
  }

  // Sanitize command: strip leading $ or # prompt markers if included
  let cleanCmd = command.trim().replace(/^[$#]\s+/, '').trim();
  if (!cleanCmd) {
    return { cancel: () => {}, isRunning: () => false, logId: '' };
  }

  const logId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  logCommandStart({
    id: logId,
    timestamp: new Date().toISOString(),
    sessionId: id,
    sessionType,
    command: cleanCmd,
    trigger,
    agentName: agentName || 'Vincent AI',
    status: 'running',
    elapsedMs: 0
  });

  let cancelled = false;
  let running = true;
  const startTime = Date.now();

  // Send the command directly and cleanly to the shell PTY stream with carriage return.
  // We do NOT write fake ANSI lines directly to xterm screen buffer, which desynchronizes
  // row/column tracking and causes bash prompt wrap corruption over SSH.
  try {
    electronAPI.sendToTerminal(id, cleanCmd + '\r');
  } catch (e) {
    console.error('[VinTerm] Error enviando comando al terminal:', e);
  }

  // Mark command dispatch completed
  running = false;
  const elapsed = Date.now() - startTime;
  logCommandEnd(logId, 'completed', elapsed);
  onComplete?.(elapsed);

  const cancel = () => {
    // Only send SIGINT if actually running
    if (cancelled || !running) return;
    cancelled = true;
    running = false;
    const elapsedCancel = Date.now() - startTime;
    logCommandEnd(logId, 'interrupted', elapsedCancel);
    electronAPI.sendToTerminal(id, '\x03');
    onCancelled?.();
  };

  return {
    cancel,
    isRunning: () => running,
    logId
  };
}
