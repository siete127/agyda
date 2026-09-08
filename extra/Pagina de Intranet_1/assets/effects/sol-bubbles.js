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

const ICONS = {
    tarificador: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>',
    soporte: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>',
    pbx: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>',
    marcador: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>',
    kiosko: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
    ivr: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><circle cx="12" cy="5" r="2"></circle><line x1="12" y1="7" x2="12" y2="11"></line><line x1="7" y1="16" x2="7.01" y2="16"></line><line x1="12" y1="16" x2="12.01" y2="16"></line><line x1="17" y1="16" x2="17.01" y2="16"></line></svg>',
    intranet: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"></path><path d="M5 21V7l8-4 8 4v14"></path><path d="M10 21v-6h4v6"></path></svg>',
    api: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.37 5.63a2.12 2.12 0 0 1 3 3l-9.94 9.94-4 1 1-4 9.94-9.94z"></path><path d="M6 18h.01"></path><path d="M2 22l4-1"></path></svg>',
    erp: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
    whatsapp: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>',
    web: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
    asterisk: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="19.07" y2="4.93"></line></svg>',
};

const SOLUCIONES = [
    {
        icon: ICONS.tarificador,
        title: 'Tarificador',
        desc: 'Controla, analiza y gestiona consumos telefónicos en tiempo real de tu PBX o Asterisk, transformándolos en decisiones estratégicas de negocio.',
        bullets: ['Control de costos y presupuestos', 'Monitoreo en tiempo real (CDR)', 'Reportes y gráficos automatizados'],
    },
    {
        icon: ICONS.soporte,
        title: 'Soporte Técnico',
        desc: 'Asistencia proactiva para mantener tu infraestructura TI operativa, segura y libre de interrupciones imprevistas.',
        bullets: ['Soporte 24/7 remoto/en sitio', 'Mantenimiento preventivo', 'Optimización y escalabilidad'],
    },
    {
        icon: ICONS.pbx,
        title: 'PBX Cloud',
        desc: 'Telefonía empresarial de última generación en la nube. Conecta a tus colaboradores dondequiera que estén de manera centralizada.',
        bullets: ['Extensiones móviles/remotas', 'Cero costos de hardware físico', 'Administración centralizada'],
    },
    {
        icon: ICONS.marcador,
        title: 'Marcador de Call Center',
        desc: 'Sistemas de marcación predictiva, progresiva y manual que incrementan sustancialmente la productividad de tus agentes.',
        bullets: ['Marcación predictiva con IA', 'Integración inmediata con CRMs', 'Detección inteligente de contestadoras'],
    },
    {
        icon: ICONS.kiosko,
        title: 'Kiosko de Call Center',
        desc: 'Módulos interactivos personalizados para la gestión de turnos, monitoreo de colas y desempeño de agentes en tiempo real.',
        bullets: ['Pantallas táctiles intuitivas', 'Monitoreo de colas de atención', 'Estadísticas de agentes en vivo'],
    },
    {
        icon: ICONS.ivr,
        title: "IVR's",
        desc: 'Sistemas de Respuesta de Voz Interactiva multinivel que guían eficientemente al usuario final hacia el área indicada.',
        bullets: ['Reconocimiento de voz avanzado', 'Rutas de atención inteligentes', 'Atención automatizada 24/7'],
    },
    {
        icon: ICONS.intranet,
        title: 'Intranet',
        desc: 'Plataforma interna privada para centralizar la comunicación, almacenar documentos de forma segura y mejorar la colaboración.',
        bullets: ['Gestión documental centralizada', 'Directorio y noticias internas', 'Trámites y flujos de trabajo internos'],
    },
    {
        icon: ICONS.api,
        title: 'Integraciones de APIs',
        desc: 'Interconectamos tus sistemas de software actuales para asegurar que los datos fluyan de manera rápida, segura y automática.',
        bullets: ['Sincronización en tiempo real', 'Seguridad de datos en tránsito', 'Automatización de procesos entre plataformas'],
    },
    {
        icon: ICONS.erp,
        title: 'ERP',
        desc: 'Planificación de recursos empresariales para el control integral de inventarios, finanzas, ventas y administración.',
        bullets: ['Módulos de control a la medida', 'Dashboard de métricas clave', 'Automatización contable y operativa'],
    },
    {
        icon: ICONS.whatsapp,
        title: 'WhatsApp y SMS Masivos',
        desc: 'Campañas de mensajería masiva escalables para notificaciones, cobranza o marketing directo a dispositivos móviles.',
        bullets: ['API oficial de WhatsApp Business', 'Tasa de entrega garantizada', 'Automatización con chatbots avanzados'],
    },
    {
        icon: ICONS.web,
        title: 'Desarrollo Web',
        desc: 'Construcción de sitios web optimizados, e-commerce, portales transaccionales y landing pages rápidas y adaptables.',
        bullets: ['Diseño 100% responsivo y rápido', 'Optimización SEO integrada', 'Sistemas interactivos dinámicos'],
    },
    {
        icon: ICONS.asterisk,
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
                <div class="sol-bubble-icon">${sol.icon}</div>
                <h3 class="sol-bubble-title">${sol.title}</h3>
                <div class="sol-bubble-detail">
                    <p class="sol-bubble-desc">${sol.desc}</p>
                    <ul class="sol-bubble-bullets">
                        ${sol.bullets.map((b) => `<li>${b}</li>`).join('')}
                    </ul>
                    <div class="sol-bubble-actions">
                        <a href="#" class="btn-primary btn-primary--hero sol-bubble-link" onclick="return false;">Saber más <span class="arrow">→</span></a>
                        <a href="#" class="sol-bubble-pdf" onclick="return false;">Ficha PDF</a>
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
