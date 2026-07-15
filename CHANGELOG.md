# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Security Vault**: Implemented `aes-256-gcm` master-password protected vault for all SSH sessions. Sessions are no longer saved in plaintext.
- **Dynamic Password Strength Indicator**: Visual feedback during vault creation.
- **i18n Support**: Core architecture refactored to support multiple languages (English and Spanish out of the box).
- **Themes**: Light and Dark mode skins utilizing global CSS variables.
- **Server Telemetry**: Real-time polling for CPU, Memory, and Root Disk usage directly in the terminal status bar.
- **SFTP Drawer**: Quick-access local code editor for remote files.

### Changed
- Refactored `xterm.js` rendering to dynamically support CSS variables for the terminal foreground and background colors.
- Project rebranded to **VinTerm**.

### Security
- Passwords and private keys are fully encrypted in `localStorage` using Node `crypto` backend IPC channels.
