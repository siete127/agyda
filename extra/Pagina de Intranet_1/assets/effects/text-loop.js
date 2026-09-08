// TextLoop (React Bits) portado a JS vanilla + GSAP — texto que recorre en
// bucle un path SVG (onda, círculo, infinito, arco o línea recta). Misma
// lógica que la versión React: dos copias del texto en el mismo <textPath>
// (head/tail) para que el loop se vea continuo sin "salto" al reiniciar.

const VIEW_W = 1200;
const VIEW_H = 520;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const EDGE_PAD = 6;

function buildPath(shape, curviness, ribbonWidth) {
    const c = Math.max(0, curviness);
    const room = Math.max(20, CY - Math.max(0, ribbonWidth) / 2 - EDGE_PAD);

    switch (shape) {
        case 'circle': {
            const r = Math.min(90 + c * 0.95, room);
            return `M ${CX - r} ${CY} A ${r} ${r} 0 1 1 ${CX + r} ${CY} A ${r} ${r} 0 1 1 ${CX - r} ${CY} Z`;
        }
        case 'infinity': {
            const r = 150 + c * 1.4;
            const h = Math.min(60 + c * 0.95, room);
            return [
                `M ${CX} ${CY}`,
                `C ${CX + r * 0.55} ${CY - h} ${CX + r} ${CY - h} ${CX + r} ${CY}`,
                `C ${CX + r} ${CY + h} ${CX + r * 0.55} ${CY + h} ${CX} ${CY}`,
                `C ${CX - r * 0.55} ${CY - h} ${CX - r} ${CY - h} ${CX - r} ${CY}`,
                `C ${CX - r} ${CY + h} ${CX - r * 0.55} ${CY + h} ${CX} ${CY}`,
                'Z',
            ].join(' ');
        }
        case 'arch': {
            const rise = Math.min(120 + c * 1.1, room * 2);
            return `M 120 ${CY + rise / 2} Q ${CX} ${CY - rise * 1.5} ${VIEW_W - 120} ${CY + rise / 2}`;
        }
        case 'line':
            return `M -320 ${CY} L ${VIEW_W + 320} ${CY}`;
        case 'wave':
        default: {
            const a = Math.min(c * 2.2, room * 2);
            // Onda continua (varias crestas y valles seguidos, como una
            // sinusoide real) — no un arco de una sola joroba. Fase
            // calculada para que una CRESTA (no un cruce por CY) caiga
            // justo en x=600, el centro del viewBox donde vive la burbuja
            // protagonista del carrusel: los cruces por CY quedan en
            // -200, 120, 440, 760, 1080, 1400 y las crestas/valles a medio
            // camino entre ellos (-40 arriba, 280 abajo, 600 arriba, 920
            // abajo...), así 600 cae exactamente en una cresta hacia arriba.
            return `M -200 ${CY} Q -40 ${CY - a} 120 ${CY} T 440 ${CY} T 760 ${CY} T 1080 ${CY} T ${VIEW_W + 200} ${CY}`;
        }
    }
}

let uid = 0;

/**
 * Monta un TextLoop dentro de `container`.
 * @param {HTMLElement} container
 * @param {object} options - ver README del componente original (React Bits)
 * @returns {() => void} función para desmontar
 */
export function mountTextLoop(container, options = {}) {
    const {
        text = 'React ✦ Bits',
        shape = 'wave',
        path,
        speed = 90,
        direction = 'forward',
        separator = '✦',
        curviness = 90,
        fontSize = 46,
        fontWeight = 800,
        letterSpacing = 2,
        uppercase = true,
        color = '#ffffff',
        ribbon = true,
        ribbonColor = '#5227FF',
        ribbonWidth = 86,
        pauseOnHover = true,
    } = options;

    if (!window.gsap) {
        console.warn('mountTextLoop: gsap no está cargado, se omite el efecto.');
        return () => {};
    }

    const pathId = `text-loop-${uid++}`;
    const d = path || buildPath(shape, curviness, ribbonWidth);
    const base = uppercase ? String(text).toUpperCase() : String(text);
    const gap = separator ? ` ${separator} ` : '   ';
    const unit = `${base}${gap}`;

    container.classList.add('text-loop');

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'text-loop-svg');
    svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', text);

    const pathEl = document.createElementNS(svgNS, 'path');
    pathEl.setAttribute('id', pathId);
    pathEl.setAttribute('d', d);
    pathEl.setAttribute('fill', 'none');
    pathEl.setAttribute('stroke', ribbon ? ribbonColor : 'none');
    pathEl.setAttribute('stroke-width', ribbon ? String(ribbonWidth) : '0');
    pathEl.setAttribute('stroke-linecap', 'round');
    pathEl.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(pathEl);

    const textStyle = `font-size:${fontSize}px;font-weight:${fontWeight};letter-spacing:${letterSpacing}px;`;

    const measureText = document.createElementNS(svgNS, 'text');
    measureText.setAttribute('class', 'text-loop-measure');
    measureText.setAttribute('style', textStyle);
    measureText.setAttribute('aria-hidden', 'true');
    measureText.textContent = unit;
    svg.appendChild(measureText);

    function makeTextPathNode() {
        const textNode = document.createElementNS(svgNS, 'text');
        textNode.setAttribute('class', 'text-loop-text');
        textNode.setAttribute('style', textStyle);
        textNode.setAttribute('fill', color);
        textNode.setAttribute('dominant-baseline', 'central');
        textNode.setAttribute('aria-hidden', 'true');
        const tp = document.createElementNS(svgNS, 'textPath');
        tp.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${pathId}`);
        tp.setAttribute('href', `#${pathId}`);
        tp.setAttribute('startOffset', '0');
        tp.setAttribute('lengthAdjust', 'spacing');
        textNode.appendChild(tp);
        svg.appendChild(textNode);
        return tp;
    }

    const headTp = makeTextPathNode();
    const tailTp = makeTextPathNode();

    container.appendChild(svg);

    let length = 0;
    let reps = 1;

    function measure() {
        try {
            length = pathEl.getTotalLength();
            const unitWidth = measureText.getComputedTextLength();
            reps = unitWidth > 0 ? Math.max(1, Math.round(length / unitWidth)) : 1;
        } catch (e) {
            return;
        }
        const loopText = unit.repeat(reps);
        headTp.textContent = loopText;
        tailTp.textContent = loopText;
        if (length) {
            headTp.setAttribute('textLength', String(length));
            tailTp.setAttribute('textLength', String(length));
        }
    }

    measure();
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(measure).catch(() => {});
    }

    function apply(offset) {
        const partner = offset >= 0 ? offset - length : offset + length;
        headTp.setAttribute('startOffset', String(offset));
        tailTp.setAttribute('startOffset', String(partner));
    }
    apply(0);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let tween = null;

    if (!reduceMotion && speed > 0 && length) {
        const state = { offset: 0 };
        tween = gsap.to(state, {
            offset: direction === 'reverse' ? -length : length,
            duration: length / speed,
            ease: 'none',
            repeat: -1,
            onUpdate: () => apply(state.offset),
        });
    }

    const pause = () => tween && tween.pause();
    const resume = () => tween && tween.resume();
    if (pauseOnHover && tween) {
        container.addEventListener('pointerenter', pause);
        container.addEventListener('pointerleave', resume);
    }

    return function unmount() {
        if (tween) tween.kill();
        if (pauseOnHover) {
            container.removeEventListener('pointerenter', pause);
            container.removeEventListener('pointerleave', resume);
        }
        container.innerHTML = '';
    };
}
