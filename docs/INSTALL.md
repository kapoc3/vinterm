# Installation Guide

🌍 [English](INSTALL.md) | [Español](INSTALL.es.md)
Welcome to the VinTerm community! Follow the instructions below to get the application running on your operating system.

---

## 🍎 macOS

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Kappsco/vinterm.git
   cd vinterm/app
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Build the application:
   ```bash
   npm run build
   ```

---

## 🐧 Linux

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)
- `libsecret-1-dev` (required for secure credential management by some native modules)

### Installation
1. Install system dependencies (Ubuntu/Debian example):
   ```bash
   sudo apt-get update
   sudo apt-get install build-essential libsecret-1-dev
   ```
2. Clone the repository:
   ```bash
   git clone https://github.com/Kappsco/vinterm.git
   cd vinterm/app
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```

---

## 🪟 Windows

### Prerequisites
- Node.js (v18 or higher)
- Windows Build Tools (for compiling native Node modules like `ssh2`)

### Installation
1. Open PowerShell as Administrator and install the windows-build-tools:
   ```powershell
   npm install --global windows-build-tools
   ```
2. Clone the repository:
   ```cmd
   git clone https://github.com/Kappsco/vinterm.git
   cd vinterm/app
   ```
3. Install dependencies:
   ```cmd
   npm install
   ```
4. Run the development server:
   ```cmd
   npm run dev
   ```

---

## 🐛 Troubleshooting

If you encounter issues during installation, especially regarding the `ssh2` module compilation, ensure your Python installation is active in your PATH, and you have a C++ compiler installed (XCode Command Line Tools on macOS, `build-essential` on Linux, Visual Studio on Windows).
