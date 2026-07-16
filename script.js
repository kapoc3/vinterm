const i18n = {
    en: {
        navFeatures: "Features",
        navGallery: "Gallery",
        navDocs: "Docs",
        heroTitle: "Terminal Management,<br><span class=\"accent-text\">Reimagined.</span>",
        heroSubtitle: "Experience a next-generation SSH client that integrates Artificial Intelligence as a value multiplier for server administration. Built for speed, security, and aesthetics with AES-256 encrypted vaults, real-time server telemetry, and integrated SFTP.",
        btnDownload: "Download for ", 
        btnExplore: "Explore Features",
        osHint: "Auto-detected ",
        featVaultTitle: "Security Vault",
        featVaultDesc: "Your passwords and private keys are never stored in plain text. VinTerm uses military-grade AES-256-GCM encryption with a Master Password.",
        featTeleTitle: "Server Telemetry",
        featTeleDesc: "Keep an eye on your infrastructure. Real-time CPU, Memory, and Disk usage polling directly integrated into the terminal status bar.",
        featSftpTitle: "Integrated SFTP",
        featSftpDesc: "Manage files seamlessly alongside your terminal sessions. Upload, download, delete, and even edit remote files instantly.",
        featThemesTitle: "Premium Themes",
        featThemesDesc: "Beautiful UI built with CSS variables. Switch between elegant Light and Dark modes with a single click, fully synced with the terminal engine.",
        featAiTitle: "AI Context Isolation",
        featAiDesc: "You no longer have to worry about the AI knowing your credentials. We isolate security from the AI context, allowing commands to be generated and executed without sharing your secrets.",
        featVincentTitle: "Vincent AI Assistant",
        featVincentDesc: "The only terminal that lets you connect your favorite AI models. Optimize your server management by interacting with our built-in intelligent assistant, Vincent.",
        footerVicente: "Proudly named in honor of Vicente.",
        footerCopyright: "&copy; 2026 Kappsco. Open Source under MIT License.",
        downloadDefault: "Download VinTerm",
        osHintDefault: "Available for macOS, Windows, and Linux.",
        galleryTitle: "Gallery",
        gallerySubtitle: "See VinTerm in action",
        galleryPlaceholder: "More screenshots coming soon..."
    },
    es: {
        navFeatures: "Características",
        navGallery: "Galería",
        navDocs: "Documentación",
        heroTitle: "Gestión de Terminales,<br><span class=\"accent-text\">Reimaginada.</span>",
        heroSubtitle: "Experimenta un cliente SSH de nueva generación que integra Inteligencia Artificial como un factor multiplicador de valor en la administración de servidores. Diseñado para velocidad, seguridad y estética con bóvedas cifradas AES-256, telemetría y SFTP integrado.",
        btnDownload: "Descargar para ",
        btnExplore: "Explorar Características",
        osHint: "Auto-detectado ",
        featVaultTitle: "Bóveda de Seguridad",
        featVaultDesc: "Tus contraseñas y llaves privadas nunca se guardan en texto plano. VinTerm usa cifrado AES-256-GCM de grado militar con una Contraseña Maestra.",
        featTeleTitle: "Telemetría de Servidores",
        featTeleDesc: "Mantén un ojo en tu infraestructura. Monitoreo de CPU, Memoria y Disco en tiempo real integrado directamente en la barra de estado.",
        featSftpTitle: "SFTP Integrado",
        featSftpDesc: "Gestiona archivos sin problemas junto a tus sesiones de terminal. Sube, descarga, elimina e incluso edita archivos remotos al instante.",
        featThemesTitle: "Temas Premium",
        featThemesDesc: "Hermosa interfaz construida con variables CSS. Cambia entre el elegante Modo Claro y Oscuro con un solo clic, totalmente sincronizado con el motor del terminal.",
        featAiTitle: "Aislamiento de Contexto IA",
        featAiDesc: "Ya no tienes que preocuparte de que la IA conozca tus credenciales. Aislamos la seguridad del contexto de IA, permitiendo que se generen y se ejecuten comandos sin necesidad de compartir secretos.",
        featVincentTitle: "Asistente IA Vincent",
        featVincentDesc: "La única consola que te permite asociar tus modelos de IA favoritos. Optimiza la administración de tus servidores interactuando con nuestro asistente inteligente integrado, Vincent.",
        footerVicente: "Orgullosamente nombrado en honor a Vicente.",
        footerCopyright: "&copy; 2026 Kappsco. Código abierto bajo licencia MIT.",
        downloadDefault: "Descargar VinTerm",
        osHintDefault: "Disponible para macOS, Windows, y Linux.",
        galleryTitle: "Galería",
        gallerySubtitle: "Mira a VinTerm en acción",
        galleryPlaceholder: "Más pantallazos próximamente..."
    }
};

let currentLang = 'en'; // default english
let osName = "Unknown OS";

function applyTranslations(lang) {
    currentLang = lang;
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (i18n[lang][key]) {
            el.innerHTML = i18n[lang][key];
        }
    });
    updateDynamicText();
}

function updateDynamicText() {
    const downloadBtn = document.getElementById('download-btn');
    const osHint = document.getElementById('os-hint');
    
    if (osName !== "Unknown OS") {
        downloadBtn.textContent = i18n[currentLang].btnDownload + osName;
        osHint.textContent = i18n[currentLang].osHint + osName + ". Other versions available on GitHub Releases.";
        if (currentLang === 'es') {
            osHint.textContent = i18n[currentLang].osHint + osName + ". Otras versiones disponibles en GitHub Releases.";
        }
    } else {
        downloadBtn.textContent = i18n[currentLang].downloadDefault;
        osHint.textContent = i18n[currentLang].osHintDefault;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    let isMac = navigator.userAgent.includes("Mac");
    let isWindows = navigator.userAgent.includes("Win");
    let isLinux = navigator.userAgent.includes("Linux");

    if (isMac) osName = "macOS";
    else if (isWindows) osName = "Windows";
    else if (isLinux) osName = "Linux";

    applyTranslations('en');

    const switcher = document.getElementById('lang-switcher');
    if (switcher) {
        switcher.addEventListener('change', (e) => {
            applyTranslations(e.target.value);
        });
    }
});

// Carousel Logic
document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('carousel-track');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');
    
    if (track && prevBtn && nextBtn) {
        let currentIndex = 0;
        
        function updateCarousel() {
            const slides = track.querySelectorAll('.carousel-slide');
            if (slides.length === 0) return;
            // Disable buttons if at ends
            prevBtn.style.opacity = currentIndex === 0 ? '0.5' : '1';
            prevBtn.style.cursor = currentIndex === 0 ? 'not-allowed' : 'pointer';
            
            nextBtn.style.opacity = currentIndex === slides.length - 1 ? '0.5' : '1';
            nextBtn.style.cursor = currentIndex === slides.length - 1 ? 'not-allowed' : 'pointer';
            
            // Move track
            track.style.transform = `translateX(-${currentIndex * 100}%)`;
        }

        prevBtn.addEventListener('click', () => {
            if (currentIndex > 0) {
                currentIndex--;
                updateCarousel();
            }
        });

        nextBtn.addEventListener('click', () => {
            const slides = track.querySelectorAll('.carousel-slide');
            if (currentIndex < slides.length - 1) {
                currentIndex++;
                updateCarousel();
            }
        });
        
        // Initial setup
        updateCarousel();
    }
});
