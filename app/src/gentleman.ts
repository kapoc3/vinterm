/**
 * Gentleman Stack for VinTerm
 * Inspired by Gentleman Programming (Gentle-AI: Persona, Clean Code & Security Guardrails).
 * 
 * Provides:
 * 1. Gentleman Persona: Pragmatic, direct, architectural rigor, zero filler.
 * 2. Gentleman Security Guardrails: Blocks destructive commands and redacts exposed secrets.
 * 3. Spec-Driven Plan formatting.
 */

export interface SecurityInspectionResult {
  isSafe: boolean;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  rule?: string;
  warning?: string;
}

/**
 * Destructive or catastrophic terminal command signatures.
 */
const DESTRUCTIVE_PATTERNS: Array<{ regex: RegExp; rule: string; warning: string }> = [
  {
    regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+[\/~]/i,
    rule: 'destructive_root_deletion',
    warning: 'Comando potencialmente letal detectado: eliminación recursiva de raíz o directorio home (rm -rf / o ~).'
  },
  {
    regex: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+\*/i,
    rule: 'destructive_wildcard_deletion',
    warning: 'Eliminación recursiva masiva con comodín (rm -rf *).'
  },
  {
    regex: /\bmkfs(?:\.[a-z0-9]+)?\s+/i,
    rule: 'format_filesystem',
    warning: 'Intento de formateo de sistema de archivos (mkfs).'
  },
  {
    regex: /\bdd\s+if=.*?of=\/dev\/(?:sd|nvme|hd|disk)/i,
    rule: 'raw_disk_write',
    warning: 'Sobreescritura directa de bajo nivel sobre disco físico (dd of=/dev/...).'
  },
  {
    regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    rule: 'fork_bomb',
    warning: 'Fork bomb detectada (agotamiento intencional de procesos).'
  },
  {
    regex: /\bchmod\s+-[a-zA-Z]*R\s+777\s+\//i,
    rule: 'permissive_root_permissions',
    warning: 'Asignación masiva de permisos 777 a nivel de raíz (vulnerabilidad crítica).'
  }
];

/**
 * Secret leak detection patterns in commands (e.g. attempting to print or upload keys).
 */
const SECRET_LEAK_PATTERNS: Array<{ regex: RegExp; rule: string; warning: string }> = [
  {
    regex: /\b(?:cat|head|tail|curl|nc|wget)\b.*?\b(?:id_rsa|id_ed25519|\.env|credentials|\.dockercfg|service-account\.json)\b/i,
    rule: 'secret_file_exposure',
    warning: 'Comando intentando leer o transmitir archivos sensibles (.env, claves SSH o credenciales).'
  }
];

/**
 * Hallucinated or circular package install attempts (e.g. installing local project folder names).
 */
const HALLUCINATED_INSTALL_PATTERNS: Array<{ regex: RegExp; rule: string; warning: string }> = [
  {
    regex: /\b(?:npm\s+(?:i|install)|yarn\s+add|pnpm\s+add|pip\s+install|brew\s+install)\s+.*?\b(?:vinterm|vinola|kappsco|workspace|app|src)\b/i,
    rule: 'hallucinated_self_install',
    warning: 'Alucinación detectada: intento de instalar el nombre del proyecto local como si fuera un paquete público. Para dependencias existentes, ejecuta el comando sin argumentos (ej: "npm install").'
  }
];

/**
 * Inspects a bash command against Gentleman Security Guardrails.
 */
export function inspectCommandSecurity(commandText: string): SecurityInspectionResult {
  if (!commandText || !commandText.trim()) {
    return { isSafe: true, severity: 'none' };
  }

  // Check destructive commands
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.regex.test(commandText)) {
      return {
        isSafe: false,
        severity: 'critical',
        rule: pattern.rule,
        warning: pattern.warning
      };
    }
  }

  // Check secret leakage
  for (const pattern of SECRET_LEAK_PATTERNS) {
    if (pattern.regex.test(commandText)) {
      return {
        isSafe: false,
        severity: 'high',
        rule: pattern.rule,
        warning: pattern.warning
      };
    }
  }

  // Check hallucinated installs
  for (const pattern of HALLUCINATED_INSTALL_PATTERNS) {
    if (pattern.regex.test(commandText)) {
      return {
        isSafe: false,
        severity: 'medium',
        rule: pattern.rule,
        warning: pattern.warning
      };
    }
  }

  return { isSafe: true, severity: 'none' };
}

/**
 * Redacts visible secrets (API tokens, private keys) from terminal output or prompt context.
 */
export function redactSensitiveData(text: string): string {
  if (!text) return '';

  return text
    // Redact OpenAI / Stripe / Github style API tokens
    .replace(/(?:sk|ghp|gho|glpat|xoxb)-[a-zA-Z0-9_-]{20,}/g, '[REDACTED_API_KEY]')
    // Redact Bearer tokens
    .replace(/Bearer\s+[a-zA-Z0-9._-]{30,}/gi, 'Bearer [REDACTED_TOKEN]')
    // Redact SSH private key blocks
    .replace(/-----BEGIN (?:RSA|OPENSSH|DSA|EC) PRIVATE KEY-----[\s\S]*?-----END (?:RSA|OPENSSH|DSA|EC) PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');
}

/**
 * System prompt addition when Gentleman Persona is enabled.
 */
export const GENTLEMAN_SYSTEM_PROMPT = `
[MODO GENTLEMAN ACTIVADO • GENTLE-AI STACK]
1. PERSONALIDAD Y FILOSOFÍA:
- Eres un Ingeniero Principal de Software: pragmático, riguroso, de alto criterio técnico y directo.
- Cero relleno: no agregues cortesías innecesarias, saludos repetitivos ni obviedades ("¡Hola!", "¡Claro que sí!").
- Ve directo a la solución de ingeniería óptima.
- Promueve siempre código limpio, arquitectura desacoplada y comandos idempotentes.
- Si una operación requiere pasos secuenciales delicados, genera un plan técnico conciso (SDD) antes de los comandos.

2. GUARDRAILS DE SEGURIDAD GENTLEMAN:
- NUNCA sugieras comandos que expongan variables de entorno, claves privadas (~/.ssh) o contraseñas.
- Si una operación es potencialmente riesgosa, incluye una advertencia técnica clara antes del bloque de código.

3. REGLA CONTRA ALUCINACIÓN DE PAQUETES (CERO INVENTOS):
- NUNCA inventes o asumas paquetes que no existen.
- Para proyectos existentes (Node/Python/Rust), el comando de instalación es el estándar del manifiesto (ej: 'npm install' a secas o 'pip install -r requirements.txt'). NUNCA agregues nombres inventados al comando.
- NUNCA intentes instalar como paquete externo el nombre de una carpeta o proyecto local.
- Si una herramienta externa no está instalada, verifica su existencia real antes de proponer 'brew install' o 'apt install'. Si no es un paquete estándar oficial del SO, primero búscalo (ej: 'brew search <pkg>') o pregunta al usuario.
`;

