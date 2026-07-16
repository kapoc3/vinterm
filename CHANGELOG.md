# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-07-16

### Added
- **Ko-Fi Sponsor Integration**: Added native support buttons across the application sidebar, website, and GitHub repository to collect community tips.
- **Change Master Password**: New dedicated 'Security' tab in the application settings allowing users to securely validate and re-encrypt their entire vault with a new master password.
- **Native OS Dialogs**: Replaced generic web alerts during export/import flows with native OS message boxes displaying the VinTerm branding.
- **Multi-Vault Architecture**: Support for creating, managing, and securely switching between multiple independent vaults.
- **Vault Hints**: Optional password hint system during vault setup with security validation (prevents using the actual password).
- **Local Folders Context Menu**: Right-click menus on local folders to quickly rename, delete, or create new sessions.
- **Dynamic Screenshot Gallery**: A fully responsive, interactive carousel implemented on the landing page to showcase the application.
- **Comprehensive i18n Support**: Spanish and English translations extended to all UI error messages, tooltips, and SSH connection validations.
- **Vincent AI**: The 'AI Copilot' feature has been fully integrated and officially rebranded as 'Vincent AI' across the platform.

### Changed
- **Error Visuals**: Redesigned UI error messages to use a high-contrast vivid red (`#ff4444`) font style instead of dark backgrounds.
- **Landing Page Hierarchy**: Reordered landing page features to prioritize Artificial Intelligence and Military-Grade Security over aesthetic features, including new 'Zero Trust' and 'Community' cards.

### Security
- **Zero Trust - Auto-Lock**: Implemented a strict 15-minute inactivity timer that automatically clears memory constraints and locks the active vault to prevent unauthorized access.
- **Zero Trust - Folder Encryption**: Migrated plaintext folder structures into the `aes-256-gcm` encryption engine, ensuring directory trees cannot be read at rest.
- **Zero Trust - Content Security Policy (CSP)**: Injected strict CSP meta tags into the application index to prevent external injection or execution attacks.
- **Legacy Vault Migration**: Automated logic securely converts single-vault instances into the new, isolated Multi-Vault engine without data loss.

## [1.0.0] - 2026-07-14

### Added
- **Vincent Theme**: A stunning neon green aesthetic with glassmorphism, animated background blobs, and a highly polished UI.
- **SFTP Folder Creation**: Ability to create new directories directly from the remote SFTP view via a right-click context menu.
- **Automated Releases**: GitHub Actions CI/CD pipeline integrated for automated deployment of Mac, Windows, and Linux installers.
- **Landing Page**: Public gh-pages site created for promotional distribution.
- **Security Vault**: Implemented `aes-256-gcm` master-password protected vault for all SSH sessions. Sessions are no longer saved in plaintext.
- **Dynamic Password Strength Indicator**: Visual feedback during vault creation.
- **i18n Support**: Core architecture refactored to support multiple languages (English and Spanish out of the box).
- **Themes**: Light, Dark, and Vincent mode skins utilizing global CSS variables.
- **Server Telemetry**: Real-time polling for CPU, Memory, and Root Disk usage directly in the terminal status bar.
- **SFTP Drawer**: Quick-access local code editor for remote files.

### Changed
- Refactored `xterm.js` rendering to dynamically support CSS variables for the terminal foreground and background colors.
- Project rebranded to **VinTerm**.

### Security
- Passwords and private keys are fully encrypted in `localStorage` using Node `crypto` backend IPC channels.
