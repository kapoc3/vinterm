# Guía de Instalación

🌍 [English](INSTALL.md) | [Español](INSTALL.es.md)

¡Bienvenido a la comunidad de VinTerm! Sigue las instrucciones a continuación para poner a funcionar la aplicación en tu sistema operativo.

---

## 🍎 macOS

### Requisitos Previos
- Node.js (v18 o superior)
- npm (v9 o superior)

### Instalación
1. Clona el repositorio:
   ```bash
   git clone https://github.com/Kappsco/vinterm.git
   cd vinterm/app
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Ejecuta el servidor de desarrollo:
   ```bash
   npm run dev
   ```
4. Compila la aplicación:
   ```bash
   npm run build
   ```

---

## 🐧 Linux

### Requisitos Previos
- Node.js (v18 o superior)
- npm (v9 o superior)
- `libsecret-1-dev` (requerido para el manejo seguro de credenciales por algunos módulos nativos)

### Instalación
1. Instala las dependencias del sistema (Ejemplo en Ubuntu/Debian):
   ```bash
   sudo apt-get update
   sudo apt-get install build-essential libsecret-1-dev
   ```
2. Clona el repositorio:
   ```bash
   git clone https://github.com/Kappsco/vinterm.git
   cd vinterm/app
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```
4. Ejecuta el servidor de desarrollo:
   ```bash
   npm run dev
   ```

---

## 🪟 Windows

### Requisitos Previos
- Node.js (v18 o superior)
- Windows Build Tools (para compilar módulos nativos de Node como `ssh2`)

### Instalación
1. Abre PowerShell como Administrador e instala windows-build-tools:
   ```powershell
   npm install --global windows-build-tools
   ```
2. Clona el repositorio:
   ```cmd
   git clone https://github.com/Kappsco/vinterm.git
   cd vinterm/app
   ```
3. Instala las dependencias:
   ```cmd
   npm install
   ```
4. Ejecuta el servidor de desarrollo:
   ```cmd
   npm run dev
   ```

---

## 🐛 Solución de Problemas

Si encuentras problemas durante la instalación, especialmente con la compilación del módulo `ssh2`, asegúrate de que tu instalación de Python esté activa en tu PATH, y que tengas un compilador C++ instalado (XCode Command Line Tools en macOS, `build-essential` en Linux, Visual Studio en Windows).
