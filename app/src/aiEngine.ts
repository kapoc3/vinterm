/**
 * VinTerm AI Engine
 * Provides Model-Aware Prompt Optimization, Token Minimization,
 * Terminal Context Sanitization, and App-Action Parsing.
 */

import { buildEngramPromptSection, searchMemories, saveMemory, type EngramMemory } from './engram';
import { buildContext7PromptSection, detectLibraryKeywords, fetchContext7Docs } from './context7';
import { GENTLEMAN_SYSTEM_PROMPT, inspectCommandSecurity, redactSensitiveData, type SecurityInspectionResult } from './gentleman';

export {
  type EngramMemory,
  type SecurityInspectionResult,
  saveMemory,
  searchMemories,
  buildEngramPromptSection,
  detectLibraryKeywords,
  fetchContext7Docs,
  inspectCommandSecurity,
  redactSensitiveData
};

export interface GentleAiConfig {
  enableGentleman?: boolean;
  enableEngram?: boolean;
  enableContext7?: boolean;
  enableGuardrails?: boolean;
  context7ApiKey?: string;
  query?: string;
  cwd?: string;
}

export type ModelCategory = 'compact-local' | 'reasoning' | 'cloud-standard';

export interface EnvContext {
  platform: 'darwin' | 'linux' | 'win32' | string;
  connectionType: 'local' | 'ssh' | 'gcp';
  shell?: string;
  username?: string;
  hostname?: string;
  currentSelection?: string;
}

export interface AiAgent {
  id: string;
  name: string;
  systemPrompt: string;
}

export const FIXED_AGENTS: AiAgent[] = [
  {
    id: 'agent_devops',
    name: 'Vincent AI (DevOps & Setup)',
    systemPrompt: `Eres Vincent AI, un ingeniero DevOps y SysAdmin Senior de élite experto en servidores Linux, redes, administración de sistemas y entornos de consola.
Tienes plena autonomía y competencia para:
1. Navegación fluida y exploración de carpetas (cd, ls -la, pwd, find, tree).
2. Instalación limpia de dependencias y paquetes reales (NUNCA inventes paquetes; en proyectos Node usa 'npm install', en Python 'pip install -r requirements.txt').
3. Diagnóstico de errores, despliegue y automatización paso a paso con rigor arquitectónico.`
  },
  {
    id: 'agent_installer',
    name: 'Setup & Instalador de Paquetes',
    systemPrompt: `Eres un Agente Especialista en Entornos, Navegación de Proyectos e Instalaciones de Software.
Tu especialidad es navegar entre carpetas, inspeccionar proyectos y ejecutar instalaciones limpias:
- NUNCA inventes paquetes ni agregues nombres ficticios.
- Si hay package.json ejecuta 'npm install' a secas. Si hay requirements.txt ejecuta 'pip install -r requirements.txt'.
- NUNCA instales el nombre del proyecto local como si fuera un paquete externo de npm/brew/pip.
- Ejecutar instalaciones siempre de forma no interactiva (-y, --yes, --noconfirm) para evitar bloqueos.
- Manejar permisos (sudo si es necesario) y verificar que la instalación haya concluido con éxito.`
  },
  {
    id: 'agent_meta',
    name: 'Creador de Agentes (Meta)',
    systemPrompt: 'Eres un experto Creador de Agentes de IA. El usuario te dará una descripción en lenguaje natural de la personalidad, rol o tarea que necesita automatizar. Tu trabajo es responder ÚNICAMENTE con el "System Prompt" ideal, detallado y altamente efectivo que el usuario debe configurar para ese nuevo agente. No incluyas saludos ni explicaciones, solo devuelve el texto del System Prompt listo para copiar y pegar.'
  }
];

export interface AppAction {
  id: string;
  type: 'change_theme' | 'change_font_size' | 'create_agent' | 'change_language' | 'run_quick_command' | 'save_engram';
  payload: any;
  title: string;
  description: string;
}

/**
 * Detects the category of the active AI model to adapt prompts and parameters.
 */
export function detectModelCategory(provider: string, modelName: string): ModelCategory {
  const m = (modelName || '').toLowerCase();
  const p = (provider || '').toLowerCase();

  // Reasoning models
  if (
    m.includes('reasoner') ||
    m.includes('r1') ||
    m.includes('o1') ||
    m.includes('o3') ||
    m.includes('qwq') ||
    m.includes('deepseek-r1')
  ) {
    return 'reasoning';
  }

  // Local / compact models
  if (
    p === 'ollama' ||
    m.includes('llama') ||
    m.includes('mistral') ||
    m.includes('gemma') ||
    m.includes('qwen') ||
    m.includes('phi') ||
    m.includes('coder') ||
    m.includes('tiny') ||
    m.includes('mini')
  ) {
    return 'compact-local';
  }

  return 'cloud-standard';
}

/**
 * Strips ANSI escape codes, terminal cursor jumps, and control characters.
 */
export function stripAnsi(text: string): string {
  if (!text) return '';
  return text
    // Strip ANSI color / style codes
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    // Strip OSC sequences
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, '')
    // Replace carriage returns with newline or remove them
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

/**
 * Sanitizes terminal buffer text: removes repetitive spinner frames, blank padding,
 * and useless terminal sequences to reduce tokens.
 */
export function cleanTerminalBuffer(bufferText: string): string {
  if (!bufferText) return '';
  const cleaned = stripAnsi(bufferText);
  const lines = cleaned.split('\n');

  const filteredLines: string[] = [];
  let prevLineTrimmed = '';
  let duplicateCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines at the very beginning
    if (filteredLines.length === 0 && !trimmed) continue;

    // Filter repeated lines (e.g. progress meters or spinners)
    if (trimmed === prevLineTrimmed && trimmed.length > 0) {
      duplicateCount++;
      if (duplicateCount > 2) {
        continue;
      }
    } else {
      duplicateCount = 0;
      prevLineTrimmed = trimmed;
    }

    filteredLines.push(line);
  }

  // Remove trailing blank lines
  while (filteredLines.length > 0 && !filteredLines[filteredLines.length - 1].trim()) {
    filteredLines.pop();
  }

  return filteredLines.join('\n');
}

/**
 * Intelligently truncates terminal context: preserves the top (initial command/headers)
 * and bottom (recent output and errors), eliminating middle scrollback noise.
 */
export function smartTruncateTerminalContext(
  bufferText: string,
  maxLines: number = 40
): {
  context: string;
  totalLines: number;
  sentLines: number;
  savedTokensEstimate: number;
} {
  const cleaned = cleanTerminalBuffer(bufferText);
  const lines = cleaned.split('\n');
  const totalLines = lines.length;

  if (totalLines <= maxLines) {
    return {
      context: cleaned,
      totalLines,
      sentLines: totalLines,
      savedTokensEstimate: 0,
    };
  }

  // Keep top 10 lines (original command / context) and bottom 30 lines (latest output/prompt/error)
  const topCount = Math.min(10, Math.floor(maxLines * 0.25));
  const bottomCount = maxLines - topCount;

  const topLines = lines.slice(0, topCount);
  const bottomLines = lines.slice(-bottomCount);
  const omitted = totalLines - (topCount + bottomCount);

  const combined = [
    ...topLines,
    `\n[... ${omitted} líneas omitidas por VinTerm para optimizar tokens ...]\n`,
    ...bottomLines,
  ].join('\n');

  const fullTokens = estimateTokens(cleaned);
  const truncatedTokens = estimateTokens(combined);

  return {
    context: combined,
    totalLines,
    sentLines: maxLines,
    savedTokensEstimate: Math.max(0, fullTokens - truncatedTokens),
  };
}

/**
 * Fast estimation of token count (~4 characters per token average).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 3.8);
}

/**
 * Extracts and separates <think>...</think> reasoning tags so they don't corrupt
 * command detection or terminal injection.
 */
export function cleanReasoningOutput(content: string): { thinking?: string; cleanContent: string } {
  if (!content) return { cleanContent: '' };

  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>/i) ||
                     content.match(/<thought>([\s\S]*?)<\/thought>/i);

  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const cleanContent = content.replace(/<think>[\s\S]*?<\/think>/gi, '')
                               .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                               .trim();
    return { thinking, cleanContent };
  }

  return { cleanContent: content };
}

/**
 * Parses action blocks from the AI response formatted as:
 * ```vinterm-action
 * { "type": "change_theme", "payload": { "theme": "vincent" } }
 * ```
 */
export function parseActions(content: string): { text: string; actions: AppAction[] } {
  const actionRegex = /```(?:vinterm-action|json:action)\n([\s\S]*?)```/g;
  const actions: AppAction[] = [];
  let text = content;
  let match: RegExpExecArray | null;

  while ((match = actionRegex.exec(content)) !== null) {
    try {
      const raw = JSON.parse(match[1].trim());
      if (raw && raw.type) {
        let title = 'Acción de VinTerm';
        let description = '';

        if (raw.type === 'change_theme') {
          title = '🎨 Cambiar Tema';
          description = `Cambiar tema de la aplicación a "${raw.payload?.theme || 'oscuro'}"`;
        } else if (raw.type === 'change_font_size') {
          title = '🔤 Ajustar Fuente';
          description = `Modificar tamaño de fuente de la terminal a ${raw.payload?.fontSize || 14}px`;
        } else if (raw.type === 'create_agent') {
          title = '🤖 Crear Nuevo Agente';
          description = `Guardar agente "${raw.payload?.name || 'Nuevo Agente'}"`;
        } else if (raw.type === 'change_language') {
          title = '🌐 Cambiar Idioma';
          description = `Cambiar idioma a ${raw.payload?.language === 'es' ? 'Español' : 'English'}`;
        } else if (raw.type === 'save_engram') {
          title = '🧠 Guardar en Memoria Engram';
          description = `Recordar: "${raw.payload?.title || 'Nota técnica'}" (${raw.payload?.type || 'convención'})`;
        }

        actions.push({
          id: `action_${Date.now()}_${actions.length}`,
          type: raw.type,
          payload: raw.payload || {},
          title,
          description,
        });
      }
    } catch {
      // Ignore JSON parse error in malformed action block
    }
  }

  // Remove the action block from user-visible narrative text
  text = text.replace(actionRegex, '').trim();

  return { text, actions };
}

/**
 * Builds an optimized System Prompt adapted to the model category and environment,
 * with optional Gentle-AI stack enhancements (Gentleman, Engram, Context7).
 */
export async function buildSystemPrompt(
  agentPrompt: string,
  category: ModelCategory,
  env: EnvContext,
  autoMode: boolean,
  allowActions: boolean = true,
  gentleOptions?: GentleAiConfig
): Promise<string> {
  const osName = env.platform === 'darwin' ? 'macOS' : env.platform === 'win32' ? 'Windows' : 'Linux';
  const connDesc = env.connectionType === 'ssh' ? 'remota por SSH' : env.connectionType === 'gcp' ? 'remota en Google Cloud (GCP)' : 'local en tu máquina';

  // Base environment signature
  let envHeader = `[ENTORNO VINTERM]\n- SO: ${osName} (${env.platform})\n- Conexión: ${connDesc}\n- Shell: ${env.shell || (env.platform === 'darwin' ? 'zsh' : 'bash')}`;
  if (env.username) envHeader += `\n- Usuario: ${env.username}`;
  if (env.hostname) envHeader += `\n- Host: ${env.hostname}`;

  let gentleAdditions = '';

  // Gentleman Persona & Guardrails
  if (gentleOptions?.enableGentleman) {
    gentleAdditions += `\n${GENTLEMAN_SYSTEM_PROMPT}\n`;
  }

  // Engram Persistent Memory Injection
  if (gentleOptions?.enableEngram && gentleOptions.query) {
    const engramSection = buildEngramPromptSection(gentleOptions.query, gentleOptions.cwd);
    if (engramSection) {
      gentleAdditions += `${engramSection}\n`;
    }
  }

  // Context7 Real-Time Documentation Injection
  if (gentleOptions?.enableContext7 && gentleOptions.query) {
    try {
      const c7Docs = await buildContext7PromptSection(gentleOptions.query, gentleOptions.context7ApiKey);
      if (c7Docs) {
        gentleAdditions += `${c7Docs}\n`;
      }
    } catch (e) {
      console.warn('[VinTerm] Context7 injection skipped:', e);
    }
  }

  if (category === 'compact-local') {
    // Ultra-compact prompt for local/small models (< 150 tokens) to ensure fast response & no hallucinations
    let prompt = `${agentPrompt}\n\n${envHeader}${gentleAdditions}\n\nREGLAS OBLIGATORIAS:
1. Responde conciso. Si das comandos, usa ÚNICAMENTE bloques:
\`\`\`bash
comando
\`\`\`
2. NAVEGACIÓN Y CERO ALUCINACIÓN: Tienes autonomía para moverte (\`cd ruta && comando\`, \`pwd\`, \`ls -la\`).
3. PROHIBIDO INVENTAR PAQUETES: En proyectos Node usa 'npm install' a secas; en Python 'pip install -r requirements.txt'. NUNCA agregues nombres ficticios.
4. INSTALACIONES NO INTERACTIVAS: Toda instalación DEBE ser no interactiva (usa -y en apt/dnf, --noconfirm en pacman, brew en macOS, npm/pip).
5. Adapta los comandos a ${osName}. NUNCA uses editores interactivos (nano, vim, vi, less, top sin -b).`;

    if (autoMode) {
      prompt += `\n6. MODO AUTÓNOMO Y AUTO-AJUSTE: Da 1 comando por turno. Si la salida tiene un error (permiso, ruta, comando inexistente), corrígelo en el siguiente comando. Al terminar con éxito escribe [DONE].`;
    }
    return prompt;
  }

  if (category === 'reasoning') {
    // Reasoning models need clear goals without step-by-step handholding
    let prompt = `${agentPrompt}\n\n${envHeader}${gentleAdditions}

OBJETIVO TÉCNICO:
Analizar la situación del sistema, navegar entre carpetas, realizar instalaciones de software y devolver soluciones directas.
- Comandos ejecutables deben ir siempre en bloques \`\`\`bash ... \`\`\`.
- NAVEGACIÓN: Tienes plena capacidad para moverte entre carpetas (\`cd ruta && comando\`, \`pwd\`, \`ls -la\`, \`mkdir -p\`).
- PROHIBIDO INVENTAR PAQUETES: Para dependencias de proyectos, usa el comando del manifiesto ('npm install' a secas, 'pip install -r requirements.txt'). NUNCA intentes instalar el nombre de la carpeta o proyecto local como si fuera un paquete externo.
- INSTALACIONES: Todas las instalaciones deben ser no interactivas (-y, --noconfirm, -q) para evitar bloqueos en la terminal.
- Prohibidos comandos que bloqueen la terminal sin interacción (nano, vim, less).
- Si sugieres comandos para ${osName}, usa las herramientas nativas del SO.`;

    if (autoMode) {
      prompt += `\nMODO AUTÓNOMO Y AUTO-CORRECCIÓN: Ejecuta paso a paso leyendo la salida de la terminal. Si un comando falla, analiza el error y proporciona el comando corregido de inmediato. Cuando la meta esté lograda concluye con [DONE].`;
    }
    return prompt;
  }

  // Cloud standard models (GPT-4o, Claude, Gemini) with full capability
  let prompt = `${agentPrompt}\n\n${envHeader}${gentleAdditions}\n
REGLAS DE RESPUESTA EN VINTERM:
1. Responde de forma precisa, orientada a la acción y con formato Markdown.
2. Si sugieres comandos bash a ejecutar en la terminal, escríbelos dentro de bloques:
\`\`\`bash
comando_a_ejecutar
\`\`\`
3. NAVEGACIÓN INTELIGENTE DE CARPETAS (Folder Traversal):
   - Tienes plena autorización y capacidad para navegar entre carpetas (\`cd <directorio>\`, \`pwd\`, \`ls -la\`, \`tree -L 2\`, \`find\`).
   - Cuando una tarea requiera operar en un subdirectorio, concatena la navegación y la acción (ej: \`cd /ruta/carpeta && comando\`) o realiza el cambio de carpeta de forma explícita.
   - Si una carpeta no existe y se requiere, créala con \`mkdir -p <carpeta> && cd <carpeta>\`.
4. INSTALACIONES DE SOFTWARE Y DEPENDENCIAS (Regla Estricta Anti-Alucinación):
   - PROHIBIDO inventar o adivinar nombres de paquetes. NUNCA inventes librerías o dependencias.
   - Si estás en un proyecto existente (Node, Python, Rust, Go), instala las dependencias declaradas en su manifiesto:
     * Node.js: \`npm install\` (SIN argumentos inventados).
     * Python: \`pip install -r requirements.txt\` (si existe requirements.txt).
   - NUNCA intentes instalar el nombre del proyecto o directorio local como un paquete externo público (ej: jamás \`npm install vinterm\`, \`brew install vinterm\`, \`pip install vinterm\`).
   - Para paquetes de sistema operativo, usa ÚNICAMENTE herramientas oficiales conocidas (\`git\`, \`curl\`, \`htop\`, \`jq\`, \`ripgrep\`, \`docker\`, \`ffmpeg\`) con flags no interactivos (\`-y\`, \`--noconfirm\`). Si no estás 100% seguro de que un paquete existe en el registro del SO, búscalo primero (\`brew search <pkg>\`, \`apt-cache search <pkg>\`) o pregunta.
   - REGLA CRÍTICA NO INTERACTIVA: Toda instalación DEBE incluir flags para evitar preguntas interactivas [Y/n] que bloqueen el proceso:
     * Debian/Ubuntu: \`sudo apt update && sudo apt install -y <paquete>\`
     * macOS: \`brew install <paquete>\`
     * Fedora/RHEL: \`sudo dnf install -y <paquete>\`
     * Arch Linux: \`sudo pacman -S --noconfirm <paquete>\`
     * Python: \`pip install -q <paquete>\` o \`pip install -r requirements.txt\`
     * Node.js: \`npm install\` o \`npm install -g <paquete>\`
   - Antepón \`sudo\` cuando los paquetes requieran privilegios de administrador.
5. Adapta comandos estrictamente a ${osName} y la shell indicada.
6. PROHIBIDO sugerir comandos bloqueantes o interactivos (nano, vi, less, top interactivo). Usa alternativas directas (cat, echo, sed, awk, grep).`;

  if (allowActions) {
    prompt += `\n7. CAPACIDAD DE CONFIGURACIÓN DIRECTA: Si el usuario te pide cambiar ajustes de VinTerm o guardar notas, puedes incluir un bloque de acción:
- Cambiar tema: \`\`\`vinterm-action\n{"type": "change_theme", "payload": {"theme": "dark" | "light" | "vincent"}}\n\`\`\`
- Cambiar tamaño de letra: \`\`\`vinterm-action\n{"type": "change_font_size", "payload": {"fontSize": 15}}\n\`\`\`
- Crear agente: \`\`\`vinterm-action\n{"type": "create_agent", "payload": {"name": "...", "systemPrompt": "..."}}\n\`\`\`
- Guardar memoria: \`\`\`vinterm-action\n{"type": "save_engram", "payload": {"title": "...", "content": "...", "type": "convention" | "bugfix" | "decision"}}\n\`\`\`
- Cambiar idioma: \`\`\`vinterm-action\n{"type": "change_language", "payload": {"language": "es" | "en"}}\n\`\`\``;
  }

  if (autoMode) {
    prompt += `\n\nATENCIÓN - MODO AUTÓNOMO Y BUCLE DE AUTO-CORRECCIÓN:
Envía un único bloque de comando \`\`\`bash a la vez. El sistema lo ejecutará en vivo en el servidor/consola y te devolverá el output exacto generado.
FLUJO DE AUTO-AJUSTE:
1. Inspecciona minuciosamente la salida de cada comando ejecutado.
2. Si un comando produce un ERROR ('command not found', 'No such file or directory', 'Permission denied', 'exit status 1', etc.):
   - NO te rindas ni repitas el mismo comando fallido sin cambios.
   - Diagnostica la causa: ¿falta sudo? ¿la ruta tenía otra mayúscula/minúscula? ¿falta instalar un paquete o dependencia previa? ¿el flag no es válido?
   - Genera de inmediato el comando ajustado y corregido para resolver el fallo y continuar.
3. Para tareas de navegación e instalación, sigue el flujo:
   a. Entrar o clonar la carpeta requerida (\`cd proyecto && ls -la\`).
   b. Inspeccionar archivos de dependencias (\`package.json\`, \`requirements.txt\`, etc.).
   c. Ejecutar la instalación no interactiva.
   d. Verificar con un comando de prueba (ej: \`node -v\`, \`npm test\`, etc.).
4. Cuando la meta esté completada y verificada con éxito, concluye en la última línea ÚNICAMENTE con [DONE].`;
  }

  return prompt;
}

/**
 * Builds a prompt for the Quick Command Palette (Cmd+K).
 * Focused strictly on converting natural language to a clean shell command,
 * powered by Gentle-AI (Context7, Engram, and Gentleman standards).
 */
export async function buildQuickCommandPrompt(
  env: EnvContext,
  gentleOptions?: GentleAiConfig
): Promise<string> {
  const osName = env.platform === 'darwin' ? 'macOS' : env.platform === 'win32' ? 'Windows' : 'Linux';
  const shell = env.shell || (env.platform === 'darwin' ? 'zsh' : 'bash');

  let additions = '';
  if (gentleOptions?.enableGentleman) {
    additions += '\n- Aplica estándares estrictos: comandos directos, sin flags obsoletos, sin explicaciones ni rodeos.';
  }

  if (gentleOptions?.enableEngram && gentleOptions.query) {
    const engram = buildEngramPromptSection(gentleOptions.query, gentleOptions.cwd);
    if (engram) additions += engram;
  }

  if (gentleOptions?.enableContext7 && gentleOptions.query) {
    try {
      const c7 = await buildContext7PromptSection(gentleOptions.query, gentleOptions.context7ApiKey);
      if (c7) additions += c7;
    } catch (e) {}
  }

  return `Eres un generador instantáneo de comandos para ${osName} (${shell}).${additions}
El usuario te dará una petición en lenguaje natural.
Responde ÚNICAMENTE con el bloque del comando bash exacto listo para ejecutar.
NO agregues explicaciones, saludos ni comentarios adicionales fuera del bloque de código.
Ejemplo de formato:
\`\`\`bash
comando aquí
\`\`\``;
}
