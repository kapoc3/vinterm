/**
 * Context7 Integration for VinTerm AI
 * Inspired by Upstash Context7 (Live Framework & Library Documentation via MCP/REST).
 * 
 * Provides up-to-date syntax, flags, and patterns for CLIs and libraries,
 * eliminating outdated hallucinations for modern developer tools.
 */

export interface Context7CacheEntry {
  library: string;
  docs: string;
  timestamp: number;
}

// In-memory cache to prevent repeated network requests
const docsCache = new Map<string, Context7CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 minutes

/**
 * Curated reference for common developer CLIs and modern frameworks
 * used as an instant, zero-latency local fallback.
 */
const OFFLINE_CLI_DOCS: Record<string, string> = {
  docker: `Docker CLI (v24+ / Compose V2):
- Usa 'docker compose' (sin guión) en lugar de 'docker-compose'.
- 'docker compose up -d --build': Inicia y reconstruye contenedores en segundo plano.
- 'docker system prune -af --volumes': Limpia imágenes, contenedores y volúmenes huérfanos.
- 'docker stats --no-stream': Inspección rápida de CPU/Memoria sin bloquear terminal.`,

  git: `Git CLI moderno:
- 'git switch -c <branch>': Crear y cambiar de rama (reemplaza git checkout -b).
- 'git restore <file>': Descartar cambios locales (reemplaza git checkout -- file).
- 'git log --oneline --graph --decorate -n 15': Historial visual compacto.
- 'git stash push -m "mensaje"': Guardar trabajo en stash con descripción.`,

  ffmpeg: `FFmpeg v6+:
- Conversión rápida sin re-encodeo: 'ffmpeg -i input.mp4 -c copy output.mkv'
- Extracción de audio mp3: 'ffmpeg -i input.mp4 -vn -c:a libmp3lame -q:a 2 output.mp3'
- Recorte rápido: 'ffmpeg -ss 00:01:00 -to 00:02:30 -i input.mp4 -c copy output.mp4'`,

  gcloud: `Google Cloud SDK (gcloud CLI):
- 'gcloud compute instances list --format="table(name,zone,status,networkInterfaces[0].accessConfigs[0].natIP)"'
- 'gcloud compute ssh <instance> --zone=<zone> --tunnel-through-iap'
- 'gcloud config set project <project-id>'`,

  kubectl: `Kubernetes CLI (kubectl v1.28+):
- 'kubectl get pods -A -o wide'
- 'kubectl logs -f deployment/<dep> --tail=50'
- 'kubectl exec -it <pod> -- /bin/sh'
- 'kubectl rollout restart deployment/<dep>'`,

  bun: `Bun Runtime & Package Manager:
- 'bun run <script>', 'bun add <pkg>', 'bunx <cli>'
- 'bun test': Ejecuta tests con soporte nativo de TypeScript.`,

  pnpm: `pnpm CLI:
- 'pnpm add <pkg>', 'pnpm add -D <pkg>'
- 'pnpm exec <cmd>', 'pnpm dlx <pkg>'
- 'pnpm run build'`,

  systemctl: `Systemd CLI (systemctl & journalctl):
- 'sudo systemctl status <service>'
- 'sudo systemctl restart <service>'
- 'journalctl -u <service> -n 50 --no-pager' (sin paginador para evitar bloqueo)`,

  rsync: `Rsync CLI:
- Copia con progreso y permisos: 'rsync -avzP source/ dest/'
- Sincronización remota: 'rsync -avzP -e "ssh -p 22" local/ user@remote:/path/'`,

  nextjs: `Next.js (App Router v14/v15):
- 'npx create-next-app@latest'
- Servidor dev: 'npm run dev' o 'pnpm dev' (Turbopack: 'next dev --turbo')
- Parámetros dinámicos en Server Components: params y searchParams son asíncronos en Next 15.`
};

/**
 * Detects if a prompt is querying a known library, framework, or CLI.
 */
export function detectLibraryKeywords(promptText: string): string[] {
  const text = (promptText || '').toLowerCase();
  const found: string[] = [];

  const libraryKeys = [
    'docker', 'git', 'ffmpeg', 'gcloud', 'kubectl', 'k8s',
    'bun', 'pnpm', 'systemctl', 'rsync', 'nextjs', 'next.js',
    'nginx', 'postgres', 'redis', 'tmux', 'curl', 'tar', 'vite', 'tailwind'
  ];

  for (const key of libraryKeys) {
    const pattern = new RegExp(`\\b${key.replace('.', '\\.')}\\b`, 'i');
    if (pattern.test(text)) {
      const normalized = (key === 'k8s' || key === 'kubectl') ? 'kubectl'
        : (key === 'next.js' || key === 'nextjs') ? 'nextjs'
        : key;
      if (!found.includes(normalized)) found.push(normalized);
    }
  }

  return found;
}

/**
 * Fetches documentation for a library either from the remote Context7 API (if key provided)
 * or from the curated live offline reference.
 */
export async function fetchContext7Docs(
  library: string,
  query: string,
  apiKey?: string
): Promise<string | null> {
  const cacheKey = `${library}:${query.toLowerCase().slice(0, 30)}`;
  const cached = docsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.docs;
  }

  // If Context7 API key is provided, attempt to query the official Context7 API
  if (apiKey && apiKey.trim().length > 5) {
    try {
      const response = await fetch(`https://context7.com/api/v2/context?library=${encodeURIComponent(library)}&query=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Accept': 'application/json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.content) {
          const docs = String(data.content).slice(0, 800); // Token safety limit
          docsCache.set(cacheKey, { library, docs, timestamp: Date.now() });
          return docs;
        }
      }
    } catch (e) {
      console.warn('[Context7] Remote fetch failed, falling back to local reference:', e);
    }
  }

  // Fallback to local curated modern documentation
  if (OFFLINE_CLI_DOCS[library]) {
    const docs = OFFLINE_CLI_DOCS[library];
    docsCache.set(cacheKey, { library, docs, timestamp: Date.now() });
    return docs;
  }

  return null;
}

/**
 * Builds a prompt section with Context7 documentation for the detected tools.
 */
export async function buildContext7PromptSection(
  query: string,
  apiKey?: string
): Promise<string> {
  const libs = detectLibraryKeywords(query);
  if (!libs.length) return '';

  const results: string[] = [];
  for (const lib of libs.slice(0, 2)) {
    const doc = await fetchContext7Docs(lib, query, apiKey);
    if (doc) {
      results.push(`[CONTEXT7 DOCS • ${lib.toUpperCase()}]\n${doc}`);
    }
  }

  if (!results.length) return '';
  return `\n\n${results.join('\n\n')}\n(Utiliza únicamente la sintaxis moderna especificada en esta documentación)`;
}

