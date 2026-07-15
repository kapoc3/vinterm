# Architecture Overview

VinTerm is built on a modern web stack to provide a fast, secure, and beautiful SSH client experience across all desktop platforms.

## Core Technologies

- **Electron:** Cross-platform desktop application framework.
  - *Main Process (`electron/main.ts`):* Handles OS-level interactions, secure cryptography (`crypto`), SSH/SFTP connections (`ssh2`), and file system operations.
  - *Renderer Process (`src/App.tsx`):* Renders the React frontend.
- **Vite:** Next-generation frontend tooling for lightning-fast HMR and optimized production builds.
- **React 18:** Component-based UI library.
- **TypeScript:** Strict syntactical superset of JavaScript ensuring type safety across the IPC boundary.
- **xterm.js:** Full terminal emulator component written in TypeScript, allowing native-like terminal rendering via WebGL/Canvas.

## Security Architecture (Vault)

VinTerm employs a **Zero-Trust Local Storage Model** for sensitive session data.
- **Encryption:** `aes-256-gcm` (Galois/Counter Mode) authenticated encryption.
- **Key Derivation:** `scryptSync` with random 16-byte salts to derive 256-bit keys from the user's Master Password.
- **IPC Isolation:** All cryptographic operations happen exclusively in the Node.js context (Main Process). Passwords are sent via IPC, but the encryption keys and decrypted payloads never persist in the filesystem.

## Styling & i18n

- **CSS Variables:** Theming (Light/Dark mode) is driven entirely by native CSS Custom Properties applied to the `:root` element. `xterm.js` reads these computed values in real-time.
- **i18n:** A lightweight, localized dictionary (`src/i18n.ts`) injects translations into the React component tree synchronously, allowing instant language switching without app reloads.
