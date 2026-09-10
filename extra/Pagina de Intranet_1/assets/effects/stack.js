// Stack (React Bits) portado a JS vanilla + Pointer Events — pila de
// tarjetas que se pueden arrastrar/clickear para mandar la de arriba hasta
// atrás, con rotación aleatoria y animación tipo resorte. Mismo
// comportamiento que la versión React (drag + sendToBack), sin motion/React:
// se anima con CSS transitions usando un timing-function que imita un
// resorte (cubic-bezier con overshoot).

const SPRING_EASING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/**
 * Monta un Stack dentro de `container`.
 * @param {HTMLElement} container
 * @param {object} options
 *   - cards: HTMLElement[] — elementos ya construidos (uno por tarjeta)
 *   - randomRotation, sensitivity, sendToBackOnClick, autoplay,
 *     autoplayDelay, pauseOnHover: igual que el componente original
 * @returns {() => void} función para desmontar
 */
export function mountStack(container, options = {}) {
    const {
        cards = [],
        randomRotation = false,
        sensitivity = 200,
        sendToBackOnClick = false,
        autoplay = false,
        autoplayDelay = 3000,
        pauseOnHover = false,
    } = options;

    container.classList.add('stack-container');

    const items = cards.map((content, index) => {
        const rotate = document.createElement('div');
        rotate.className = 'card-rotate';
        const card = document.createElement('div');
        card.className = 'card';
        card.appendChild(content);
        rotate.appendChild(card);
        container.appendChild(rotate);
        return {
            id: index,
            rotate,
            card,
            randomRotate: randomRotation ? Math.random() * 10 - 5 : 0,
        };
    });

    let stack = items.slice();
    let isPaused = false;
    let autoplayTimer = null;
    let destroyed = false;

    function applyLayout() {
        const n = stack.length;
        stack.forEach((item, index) => {
            const z = n - index - 1; // 0 = tarjeta de arriba
            // El z-index debe ir en .card-rotate (el elemento que en
            // realidad recibe pointerdown/click), no solo en .card — si
            // solo .card lo tiene, todos los .card-rotate quedan al mismo
            // nivel de stacking y el navegador siempre entrega el evento
            // al primero del DOM sin importar cuál se ve "al frente".
            item.rotate.style.zIndex = String(index);
            item.card.style.zIndex = String(index);
            item.card.style.transition = `transform 0.4s ${SPRING_EASING}`;
            // Offset hacia la esquina superior-derecha: la tarjeta de
            // atrás debe mostrar buena parte de su silueta (no solo un
            // filo de borde), sin llegar al abanico completo. En % del
            // tamaño real del contenedor (no px fijos) — con un valor fijo,
            // una tarjeta más chica (móvil) se desborda del wrapper porque
            // el mismo desplazamiento absoluto pesa proporcionalmente más
            // cuanto menor es el ancho disponible.
            const offsetX = z * container.clientWidth * 0.076;
            const offsetY = z * container.clientHeight * -0.054;
            item.card.style.transform =
                `translate(${offsetX}px, ${offsetY}px) rotateZ(${z * 8 + item.randomRotate}deg) scale(${1 - z * 0.045})`;
            item.card.style.transformOrigin = '90% 90%';
            // Resetea SIEMPRE el transform de .card-rotate (usado durante
            // el drag) — si quedara un translate() residual de un drag
            // anterior sin limpiar, se mezclaría con este layout de reposo
            // y se vería como un salto/bug al mandar la tarjeta atrás.
            item.rotate.style.transition = `transform 0.4s ${SPRING_EASING}`;
            item.rotate.style.transform = 'translate(0px, 0px)';
        });
    }

    function sendToBack(id) {
        const index = stack.findIndex((item) => item.id === id);
        if (index === -1) return;
        const [item] = stack.splice(index, 1);
        stack.unshift(item);
        applyLayout();
    }

    // --- Drag (pointer events) ---
    function setupDrag(item) {
        let startX = 0;
        let startY = 0;
        let dragging = false;

        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            // Solo la tarjeta de ARRIBA (mayor z-index real, no solo la
            // más nueva en el DOM) debe poder arrastrarse — si no, con la
            // pila superpuesta un click/drag que cae sobre el área donde
            // asoma la de atrás movería la de atrás en vez de la de
            // adelante, dando la sensación de "contenido mezclado".
            const topId = stack[stack.length - 1].id;
            if (item.id !== topId) return;
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
            item.card.style.transition = 'none';
            item.rotate.style.transition = 'none';
            // pointermove/pointerup se escuchan en document (no en el
            // propio elemento): si el drag mueve la tarjeta lo bastante
            // rápido, el puntero puede quedar sobre OTRO elemento de la
            // pila a mitad de camino, y un listener solo-en-el-elemento
            // dejaría de recibir eventos ahí — se veía como que la tarjeta
            // "se quedaba pegada" o el envío atrás no completaba.
            document.addEventListener('pointermove', onPointerMove);
            document.addEventListener('pointerup', onPointerUp);
            document.addEventListener('pointercancel', onPointerUp);
        };

        const onPointerMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const rotateY = Math.max(-60, Math.min(60, (dx / 100) * 60));
            const rotateX = Math.max(-60, Math.min(60, (-dy / 100) * 60));
            item.rotate.style.transform = `translate(${dx}px, ${dy}px)`;
            item.card.style.transform =
                `rotateX(${rotateX}deg) rotateY(${rotateY}deg) ` +
                `rotateZ(${(stack.length - stack.findIndex((s) => s.id === item.id) - 1) * 4 + item.randomRotate}deg)`;
        };

        const onPointerUp = (e) => {
            if (!dragging) return;
            dragging = false;
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            item.rotate.style.transition = `transform 0.4s ${SPRING_EASING}`;
            item.rotate.style.transform = 'translate(0px, 0px)';
            if (Math.abs(dx) > sensitivity || Math.abs(dy) > sensitivity) {
                sendToBack(item.id);
            } else {
                applyLayout();
            }
            setTimeout(() => {
                if (!destroyed) item.rotate.style.transition = '';
            }, 400);
        };

        item.rotate.addEventListener('pointerdown', onPointerDown);

        item._cleanupDrag = () => {
            item.rotate.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerUp);
        };
    }

    items.forEach((item) => {
        setupDrag(item);
        if (sendToBackOnClick) {
            item._onClick = () => sendToBack(item.id);
            item.card.addEventListener('click', item._onClick);
        }
    });

    applyLayout();

    if (pauseOnHover) {
        container.addEventListener('mouseenter', () => { isPaused = true; });
        container.addEventListener('mouseleave', () => { isPaused = false; });
    }

    if (autoplay && stack.length > 1) {
        autoplayTimer = setInterval(() => {
            if (isPaused || destroyed) return;
            sendToBack(stack[stack.length - 1].id);
        }, autoplayDelay);
    }

    return function unmount() {
        destroyed = true;
        if (autoplayTimer) clearInterval(autoplayTimer);
        items.forEach((item) => {
            item._cleanupDrag?.();
            if (item._onClick) item.card.removeEventListener('click', item._onClick);
        });
        container.innerHTML = '';
        container.classList.remove('stack-container');
    };
}
