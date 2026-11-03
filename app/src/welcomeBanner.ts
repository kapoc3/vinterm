import type { Terminal } from 'xterm';

export interface WelcomeBannerOptions {
  type: 'local' | 'ssh' | 'gcp';
  config?: any;
}

const BANNER_LINES = [
  "  ██╗   ██╗██╗███╗   ██╗████████╗███████╗██████╗ ███╗   ███╗",
  "  ██║   ██║██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗████╗ ████║",
  "  ██║   ██║██║██╔██╗ ██║   ██║   █████╗  ██████╔╝██╔████╔██║",
  "  ╚██╗ ██╔╝██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗██║╚██╔╝██║",
  "   ╚████╔╝ ██║██║ ╚████║   ██║   ███████╗██║  ██║██║ ╚═╝ ██║",
  "    ╚═══╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝     ╚═╝"
];

function interpolateColor(
  c1: [number, number, number],
  c2: [number, number, number],
  factor: number
): [number, number, number] {
  const f = Math.max(0, Math.min(1, factor));
  return [
    Math.round(c1[0] + f * (c2[0] - c1[0])),
    Math.round(c1[1] + f * (c2[1] - c1[1])),
    Math.round(c1[2] + f * (c2[2] - c1[2]))
  ];
}

function getGradientRgb(ratio: number): [number, number, number] {
  // Vibrant Cyberpunk / Neon Palette:
  // 0.00: Neon Cyan      (0, 245, 255)
  // 0.33: Royal Indigo   (67, 97, 238)
  // 0.66: Electric Violet(168, 85, 247)
  // 1.00: Neon Pink      (255, 64, 160)
  if (ratio < 0.33) {
    return interpolateColor([0, 245, 255], [67, 97, 238], ratio / 0.33);
  } else if (ratio < 0.66) {
    return interpolateColor([67, 97, 238], [168, 85, 247], (ratio - 0.33) / 0.33);
  } else {
    return interpolateColor([168, 85, 247], [255, 64, 160], (ratio - 0.66) / 0.34);
  }
}

function renderBannerLine(line: string, shimmerCol = -1): string {
  const total = line.length;
  let out = '';
  for (let i = 0; i < total; i++) {
    const ch = line[i];
    if (ch === ' ') {
      out += ' ';
      continue;
    }
    let [r, g, b] = getGradientRgb(i / total);

    // Apply shimmer beam highlight if active
    if (shimmerCol >= 0) {
      const dist = Math.abs(i - shimmerCol);
      if (dist <= 6) {
        const glow = 1 - (dist / 6);
        r = Math.min(255, Math.round(r + glow * (255 - r)));
        g = Math.min(255, Math.round(g + glow * (255 - g)));
        b = Math.min(255, Math.round(b + glow * (255 - b)));
        out += `\x1b[1m\x1b[38;2;${r};${g};${b}m${ch}\x1b[0m`;
        continue;
      }
    }

    out += `\x1b[38;2;${r};${g};${b}m${ch}\x1b[0m`;
  }
  return out;
}

function getSessionBadge(type: 'local' | 'ssh' | 'gcp', config?: any): string {
  if (type === 'ssh') {
    const target = config?.username && config?.host ? `${config.username}@${config.host}` : 'SSH Remote';
    return `\x1b[38;2;96;165;250m● SSH\x1b[0m \x1b[38;2;148;163;184m(${target})\x1b[0m`;
  }
  if (type === 'gcp') {
    const target = config?.gcpInstance || 'Cloud Shell';
    return `\x1b[38;2;251;191;36m● GCP\x1b[0m \x1b[38;2;148;163;184m(${target})\x1b[0m`;
  }
  return `\x1b[38;2;52;211;153m● Local Shell\x1b[0m`;
}

function buildFooter(type: 'local' | 'ssh' | 'gcp', config?: any): string {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const aiKey = isMac ? '⌘K' : 'Ctrl+K';
  const badge = getSessionBadge(type, config);

  const divider = `\x1b[38;2;51;65;85m  ────────────────────────────────────────────────────────────\x1b[0m\r\n`;
  const infoRow = `  \x1b[1;38;2;0;245;255m⚡ VinTerm\x1b[0m \x1b[38;2;100;116;139mv1.0.5\x1b[0m  \x1b[38;2;71;85;105m│\x1b[0m  ${badge}  \x1b[38;2;71;85;105m│\x1b[0m  \x1b[1;38;2;251;191;36m${aiKey}\x1b[0m \x1b[38;2;203;213;225mCopiloto AI\x1b[0m\r\n`;
  const tipRow = `  \x1b[38;2;148;163;184m💡 Tip: Presiona \x1b[1;38;2;0;245;255m${aiKey}\x1b[0;38;2;148;163;184m para consultar comandos y autocompletar con IA.\x1b[0m\r\n\r\n`;

  return `${divider}${infoRow}${tipRow}`;
}

export function playWelcomeBanner(
  term: Terminal,
  options: WelcomeBannerOptions,
  onComplete: () => void
): { cancel: (skipFlush?: boolean) => void } {
  let isCancelled = false;
  const timerIds: number[] = [];

  const cleanup = () => {
    isCancelled = true;
    timerIds.forEach(id => clearTimeout(id));
    timerIds.length = 0;
  };

  const safeWrite = (data: string) => {
    try {
      term.write(data);
    } catch (e) {
      // Terminal might have been disposed
    }
  };

  const finish = () => {
    if (isCancelled) return;
    cleanup();
    onComplete();
  };

  // Compact fallback if the terminal is very narrow or shallow
  if (term.cols < 64 || term.rows < 12) {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    const aiKey = isMac ? '⌘K' : 'Ctrl+K';
    const badge = getSessionBadge(options.type, options.config);

    safeWrite(`\r\n\x1b[1;38;2;0;245;255m⚡ VinTerm\x1b[0m \x1b[38;2;148;163;184m• ${badge} • \x1b[1;38;2;251;191;36m${aiKey}\x1b[0;38;2;148;163;184m Copiloto AI\x1b[0m\r\n\r\n`);
    onComplete();
    return { cancel: () => cleanup() };
  }

  // Animation Sequence:
  // 1. Initial newline
  safeWrite('\r\n');

  // 2. Drop-in lines one by one (30ms per line)
  BANNER_LINES.forEach((line, index) => {
    const timer = window.setTimeout(() => {
      if (isCancelled) return;
      safeWrite(renderBannerLine(line) + '\r\n');
    }, (index + 1) * 30);
    timerIds.push(timer);
  });

  const baseDelay = (BANNER_LINES.length + 1) * 30; // ~210ms

  // 3. Shimmer beam sweep across the text
  const shimmerCols = [10, 24, 38, 52];
  shimmerCols.forEach((col, idx) => {
    const timer = window.setTimeout(() => {
      if (isCancelled) return;
      // Move cursor up 6 lines to beginning of the banner
      safeWrite('\x1b[6A\r');
      BANNER_LINES.forEach(line => {
        safeWrite(renderBannerLine(line, col) + '\r\n');
      });
    }, baseDelay + (idx * 30));
    timerIds.push(timer);
  });

  // 4. Return to resting gradient
  const restDelay = baseDelay + (shimmerCols.length * 30);
  const restTimer = window.setTimeout(() => {
    if (isCancelled) return;
    safeWrite('\x1b[6A\r');
    BANNER_LINES.forEach(line => {
      safeWrite(renderBannerLine(line, -1) + '\r\n');
    });

    // 5. Append footer (status badge, tips, prompt separator)
    safeWrite(buildFooter(options.type, options.config));
    finish();
  }, restDelay);
  timerIds.push(restTimer);

  return {
    cancel: (skipFlush = false) => {
      if (isCancelled) return;
      cleanup();
      if (!skipFlush) {
        safeWrite('\r\n');
        BANNER_LINES.forEach(line => {
          safeWrite(renderBannerLine(line, -1) + '\r\n');
        });
        safeWrite(buildFooter(options.type, options.config));
      }
      onComplete();
    }
  };
}
