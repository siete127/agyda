// Ciclo de burbujas para "Soluciones que conectan tu negocio": muestra 3
// de N soluciones a la vez (una "protagonista" grande al centro con todo el
// detalle, y dos de apoyo chicas a los lados con solo ícono+título), y va
// rotando automáticamente cuál es la protagonista, de forma cíclica.
//
// Se generan las N burbujas una sola vez en el DOM (para que el <h3>/<p> de
// cada una participe del i18n del sitio como cualquier otro nodo con
// data-i18n), y en cada tick solo se reordenan/reclasifican vía CSS
// (transform + clases), nunca se recrea el DOM — así las transiciones son
// suaves y no hay parpadeo de textos a medio traducir.

const IMG_BASE = 'assets/soluciones/';
const IMAGES = {
    tarificador: IMG_BASE + 'Tarificador.png',
    soporte: IMG_BASE + 'Soporte tecnico.png',
    pbx: IMG_BASE + 'PBX Cloud.png',
    marcador: IMG_BASE + 'Marcador Call Center.png',
    kiosko: IMG_BASE + 'Kiosko Call Center.png',
    ivr: IMG_BASE + 'IVR´s.png',
    intranet: IMG_BASE + 'Intranet.png',
    api: IMG_BASE + 'Integración de APIs.png',
    erp: IMG_BASE + 'ERP.png',
    whatsapp: IMG_BASE + 'Whatsapp y SMS.png',
    web: IMG_BASE + 'Desarrollo web.png',
    asterisk: IMG_BASE + 'Asterisk.png',
};

const PDF_BASE = 'assets/fichas/';
const PDFS = {
    tarificador: PDF_BASE + 'Tarificador.pdf',
    soporte: PDF_BASE + 'Soporte técnico.pdf',
    pbx: PDF_BASE + 'PBX Cloud.pdf',
    marcador: PDF_BASE + 'Marcador.pdf',
    kiosko: PDF_BASE + 'Kiosko.pdf',
    ivr: PDF_BASE + 'IVR.pdf',
    intranet: PDF_BASE + 'Intranet.pdf',
    api: PDF_BASE + 'Integraciones con APIs.pdf',
    erp: PDF_BASE + 'ERP.pdf',
    whatsapp: PDF_BASE + 'Whatsapp y SMS.pdf',
    web: PDF_BASE + 'Desarrollo web.pdf',
    asterisk: PDF_BASE + 'Asterisk.pdf',
};

// `key` es el prefijo de las claves i18n ya existentes en el diccionario
// central (sol.<key>.title / .desc / .f1 / .f2 / .f3, ver index.html) —
// title/desc/bullets de abajo son solo el fallback en español antes de que
// applyTranslations() corra sobre los nodos data-i18n recién creados.
const SOLUCIONES = [
    {
        key: 'tarificador',
        img: IMAGES.tarificador,
        pdf: PDFS.tarificador,
        title: 'Tarificador',
        desc: 'Controla, analiza y gestiona consumos telefónicos en tiempo real de tu PBX o Asterisk, transformándolos en decisiones estratégicas de negocio.',
        bullets: ['Control de costos y presupuestos', 'Monitoreo en tiempo real (CDR)', 'Reportes y gráficos automatizados'],
    },
    {
        key: 'soporte',
        img: IMAGES.soporte,
        pdf: PDFS.soporte,
        title: 'Soporte Técnico',
        desc: 'Asistencia proactiva para mantener tu infraestructura TI operativa, segura y libre de interrupciones imprevistas.',
        bullets: ['Soporte 24/7 remoto/en sitio', 'Mantenimiento preventivo', 'Optimización y escalabilidad'],
    },
    {
        key: 'pbx',
        img: IMAGES.pbx,
        pdf: PDFS.pbx,
        title: 'PBX Cloud',
        desc: 'Telefonía empresarial de última generación en la nube. Conecta a tus colaboradores dondequiera que estén de manera centralizada.',
        bullets: ['Extensiones móviles/remotas', 'Cero costos de hardware físico', 'Administración centralizada'],
    },
    {
        key: 'marcador',
        img: IMAGES.marcador,
        pdf: PDFS.marcador,
        title: 'Marcador de Call Center',
        desc: 'Sistemas de marcación predictiva, progresiva y manual que incrementan sustancialmente la productividad de tus agentes.',
        bullets: ['Marcación predictiva con IA', 'Integración inmediata con CRMs', 'Detección inteligente de contestadoras'],
    },
    {
        key: 'kiosko',
        img: IMAGES.kiosko,
        pdf: PDFS.kiosko,
        title: 'Kiosko de Call Center',
        desc: 'Módulos interactivos personalizados para la gestión de turnos, monitoreo de colas y desempeño de agentes en tiempo real.',
        bullets: ['Pantallas táctiles intuitivas', 'Monitoreo de colas de atención', 'Estadísticas de agentes en vivo'],
    },
    {
        key: 'ivr',
        img: IMAGES.ivr,
        pdf: PDFS.ivr,
        title: "IVR's",
        desc: 'Sistemas de Respuesta de Voz Interactiva multinivel que guían eficientemente al usuario final hacia el área indicada.',
        bullets: ['Reconocimiento de voz avanzado', 'Rutas de atención inteligentes', 'Atención automatizada 24/7'],
    },
    {
        key: 'intranet',
        img: IMAGES.intranet,
        pdf: PDFS.intranet,
        title: 'Intranet',
        desc: 'Plataforma interna privada para centralizar la comunicación, almacenar documentos de forma segura y mejorar la colaboración.',
        bullets: ['Gestión documental centralizada', 'Directorio y noticias internas', 'Trámites y flujos de trabajo internos'],
    },
    {
        key: 'api',
        img: IMAGES.api,
        pdf: PDFS.api,
        title: 'Integraciones de APIs',
        desc: 'Interconectamos tus sistemas de software actuales para asegurar que los datos fluyan de manera rápida, segura y automática.',
        bullets: ['Sincronización en tiempo real', 'Seguridad de datos en tránsito', 'Automatización de procesos entre plataformas'],
    },
    {
        key: 'erp',
        img: IMAGES.erp,
        pdf: PDFS.erp,
        title: 'ERP',
        desc: 'Planificación de recursos empresariales para el control integral de inventarios, finanzas, ventas y administración.',
        bullets: ['Módulos de control a la medida', 'Dashboard de métricas clave', 'Automatización contable y operativa'],
    },
    {
        key: 'envios',
        img: IMAGES.whatsapp,
        pdf: PDFS.whatsapp,
        title: 'WhatsApp y SMS Masivos',
        desc: 'Campañas de mensajería masiva escalables para notificaciones, cobranza o marketing directo a dispositivos móviles.',
        bullets: ['API oficial de WhatsApp Business', 'Tasa de entrega garantizada', 'Automatización con chatbots avanzados'],
    },
    {
        key: 'web',
        img: IMAGES.web,
        pdf: PDFS.web,
        title: 'Desarrollo Web',
        desc: 'Construcción de sitios web optimizados, e-commerce, portales transaccionales y landing pages rápidas y adaptables.',
        bullets: ['Diseño 100% responsivo y rápido', 'Optimización SEO integrada', 'Sistemas interactivos dinámicos'],
    },
    {
        key: 'asterisk',
        img: IMAGES.asterisk,
        pdf: PDFS.asterisk,
        title: 'Asterisk',
        desc: 'Diseño, configuración y puesta en marcha de servidores basados en Asterisk para telefonía IP con código abierto.',
        bullets: ['Personalización absoluta de dialplan', 'Soporte y tuning de seguridad', 'Grabaciones integradas e IVRs avanzados'],
    },
];

const INTERVAL_MS = 4200;

export function mountSolBubbles(container) {
    if (!container) return () => {};

    const n = SOLUCIONES.length;
    const nodes = SOLUCIONES.map((sol, i) => {
        const el = document.createElement('div');
        el.className = 'sol-bubble';
        el.style.setProperty('--i', String(i));
        el.innerHTML = `
            <div class="sol-bubble-inner">
                <div class="sol-bubble-icon"><img src="${sol.img}" alt="${sol.title}" loading="lazy"></div>
                <h3 class="sol-bubble-title" data-i18n="sol.${sol.key}.title">${sol.title}</h3>
                <div class="sol-bubble-detail">
                    <p class="sol-bubble-desc" data-i18n="sol.${sol.key}.desc">${sol.desc}</p>
                    <ul class="sol-bubble-bullets">
                        ${sol.bullets.map((b, i) => `<li data-i18n="sol.${sol.key}.f${i + 1}">${b}</li>`).join('')}
                    </ul>
                    <div class="sol-bubble-actions">
                        <a href="${sol.pdf}" target="_blank" rel="noopener" class="sol-bubble-pdf" data-i18n="common.fichaPdf">Ficha PDF</a>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(el);
        return el;
    });

    let active = 0;

    function render() {
        nodes.forEach((el, i) => {
            // Posición relativa a la protagonista, en el rango [-2, 2] (solo
            // -1/0/1 quedan visibles; el resto se oculta con opacity/scale 0
            // por CSS vía data-pos fuera de ese rango).
            let rel = i - active;
            if (rel > n / 2) rel -= n;
            if (rel < -n / 2) rel += n;
            el.dataset.pos = String(rel);
            el.classList.toggle('is-active', rel === 0);
        });
    }

    render();

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return () => {};
    }

    let timer = setInterval(() => {
        active = (active + 1) % n;
        render();
    }, INTERVAL_MS);

    const pause = () => clearInterval(timer);
    const resume = () => {
        clearInterval(timer);
        timer = setInterval(() => {
            active = (active + 1) % n;
            render();
        }, INTERVAL_MS);
    };
    container.addEventListener('mouseenter', pause);
    container.addEventListener('mouseleave', resume);

    return function unmount() {
        clearInterval(timer);
        container.removeEventListener('mouseenter', pause);
        container.removeEventListener('mouseleave', resume);
        container.innerHTML = '';
    };
}
