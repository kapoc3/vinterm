# Resumen de Arquitectura

🌍 [English](ARCHITECTURE.md) | [Español](ARCHITECTURE.es.md)

VinTerm está construido sobre un stack web moderno para ofrecer una experiencia de cliente SSH rápida, segura y hermosa en todas las plataformas de escritorio.

## Tecnologías Principales

- **Electron:** Framework para aplicaciones de escritorio multiplataforma.
  - *Proceso Principal (`electron/main.ts`):* Maneja las interacciones a nivel del sistema operativo, criptografía segura (`crypto`), conexiones SSH/SFTP (`ssh2`) y operaciones del sistema de archivos.
  - *Proceso de Renderizado (`src/App.tsx`):* Renderiza el frontend en React.
- **Vite:** Herramienta de frontend de nueva generación para un HMR ultrarrápido y builds optimizados para producción.
- **React 18:** Biblioteca de UI basada en componentes.
- **TypeScript:** Superset sintáctico estricto de JavaScript que garantiza la seguridad de tipos a través del límite IPC.
- **xterm.js:** Componente de emulador de terminal completo escrito en TypeScript, permitiendo el renderizado nativo del terminal mediante WebGL/Canvas.

## Arquitectura de Seguridad (Bóveda)

VinTerm emplea un **Modelo de Almacenamiento Local de Confianza Cero (Zero-Trust)** para los datos sensibles de sesión.
- **Cifrado:** Cifrado autenticado `aes-256-gcm` (Modo Galois/Counter).
- **Derivación de Claves:** `scryptSync` con sales aleatorias de 16 bytes para derivar claves de 256 bits a partir de la Contraseña Maestra del usuario.
- **Aislamiento IPC:** Todas las operaciones criptográficas ocurren exclusivamente en el contexto de Node.js (Proceso Principal). Las contraseñas se envían mediante IPC, pero las claves de cifrado y las cargas útiles descifradas nunca persisten en el sistema de archivos.

## Estilos e i18n

- **Variables CSS:** La personalización de temas (Modo Claro/Oscuro) se basa completamente en Propiedades Personalizadas CSS nativas aplicadas al elemento `:root`. `xterm.js` lee estos valores calculados en tiempo real.
- **i18n:** Un diccionario ligero y localizado (`src/i18n.ts`) inyecta traducciones en el árbol de componentes de React sincrónicamente, permitiendo el cambio de idioma instantáneo sin recargar la aplicación.
