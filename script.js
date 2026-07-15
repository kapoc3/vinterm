document.addEventListener('DOMContentLoaded', () => {
    const downloadBtn = document.getElementById('download-btn');
    const osHint = document.getElementById('os-hint');

    let osName = "Unknown OS";
    let isMac = navigator.userAgent.includes("Mac");
    let isWindows = navigator.userAgent.includes("Win");
    let isLinux = navigator.userAgent.includes("Linux");

    if (isMac) {
        osName = "macOS";
        downloadBtn.textContent = "Download for macOS";
    } else if (isWindows) {
        osName = "Windows";
        downloadBtn.textContent = "Download for Windows";
    } else if (isLinux) {
        osName = "Linux";
        downloadBtn.textContent = "Download for Linux";
    }

    if (osName !== "Unknown OS") {
        osHint.textContent = `Auto-detected ${osName}. Other versions available on GitHub Releases.`;
    }
});
