// Carousel (React Bits) portado a JS vanilla + Pointer Events — carrusel
// horizontal con drag/swipe, "rotación 3D" leve al pasar entre tarjetas,
// autoplay, loop infinito e indicadores. Mismo comportamiento que la
// versión React (motion/react), sin esa dependencia: se anima con CSS
// transitions usando cubic-bezier tipo resorte en vez de useMotionValue.

const GAP = 24;
const SPRING_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DRAG_BUFFER = 0;
const VELOCITY_THRESHOLD = 500;

/**
 * Monta un Carousel dentro de `container`.
 * @param {HTMLElement} container
 * @param {object} options
 *   - items: [{ id, render(): HTMLElement }] — uno por tarjeta
 *   - baseWidth, autoplay, autoplayDelay, pauseOnHover, loop: igual que el original
 * @returns {() => void} función para desmontar
 */
export function mountCarousel(container, options = {}) {
    const {
        items = [],
        baseWidth = 300,
        autoplay = false,
        autoplayDelay = 3000,
        pauseOnHover = false,
        loop = false,
    } = options;

    if (!items.length) return () => {};

    const containerPadding = 16;
    const itemWidth = baseWidth - containerPadding * 2;
    const trackItemOffset = itemWidth + GAP;

    const itemsForRender = loop
        ? [items[items.length - 1], ...items, items[0]]
        : items.slice();

    container.classList.add('carousel-container');
    container.style.width = `${baseWidth}px`;

    const viewport = document.createElement('div');
    viewport.className = 'carousel-viewport';
    container.appendChild(viewport);

    const track = document.createElement('div');
    track.className = 'carousel-track';
    track.style.gap = `${GAP}px`;
    track.style.width = `${itemWidth}px`;
    track.style.perspective = '1000px';
    viewport.appendChild(track);

    const itemEls = itemsForRender.map((item) => {
        const el = document.createElement('div');
        el.className = 'carousel-item';
        el.style.width = `${itemWidth}px`;
        el.appendChild(item.render());
        track.appendChild(el);
        return el;
    });

    const indicatorsWrap = document.createElement('div');
    indicatorsWrap.className = 'carousel-indicators-container';
    const indicators = document.createElement('div');
    indicators.className = 'carousel-indicators';
    indicatorsWrap.appendChild(indicators);
    container.appendChild(indicatorsWrap);

    const indicatorEls = items.map((_, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'carousel-indicator';
        btn.setAttribute('aria-label', `Ir a la diapositiva ${index + 1}`);
        btn.addEventListener('click', () => goTo(loop ? index + 1 : index));
        indicators.appendChild(btn);
        return btn;
    });

    let position = loop ? 1 : 0;
    let isHovered = false;
    let isJumping = false;
    let isAnimating = false;
    let autoplayTimer = null;
    let destroyed = false;

    function applyTransform(withTransition) {
        track.style.transition = withTransition ? `transform 0.5s ${SPRING_EASING}` : 'none';
        track.style.transform = `translateX(${-(position * trackItemOffset)}px)`;
        track.style.perspectiveOrigin = `${position * trackItemOffset + itemWidth / 2}px 50%`;
    }

    function updateIndicators() {
        const activeIndex = items.length === 0
            ? 0
            : loop
                ? (position - 1 + items.length) % items.length
                : Math.min(position, items.length - 1);
        indicatorEls.forEach((el, i) => {
            el.classList.toggle('active', i === activeIndex);
            el.classList.toggle('inactive', i !== activeIndex);
        });
    }

    function updateRotation() {
        itemEls.forEach((el, index) => {
            const delta = index - position;
            // Rotación 3D leve: la tarjeta activa queda plana (0deg), las
            // vecinas se inclinan como si giraran en el eje Y.
            const rotateY = Math.max(-90, Math.min(90, delta * -90));
            el.style.transform = `rotateY(${rotateY}deg)`;
        });
    }

    function onTransitionEnd() {
        if (!isAnimating) return;
        if (!loop || itemsForRender.length <= 1) {
            isAnimating = false;
            return;
        }
        const lastCloneIndex = itemsForRender.length - 1;
        if (position === lastCloneIndex) {
            isJumping = true;
            position = 1;
            applyTransform(false);
            updateRotation();
            requestAnimationFrame(() => {
                isJumping = false;
                isAnimating = false;
            });
            return;
        }
        if (position === 0) {
            isJumping = true;
            position = items.length;
            applyTransform(false);
            updateRotation();
            requestAnimationFrame(() => {
                isJumping = false;
                isAnimating = false;
            });
            return;
        }
        isAnimating = false;
    }

    track.addEventListener('transitionend', onTransitionEnd);

    function goTo(next) {
        const max = itemsForRender.length - 1;
        position = Math.max(0, Math.min(next, max));
        isAnimating = true;
        applyTransform(true);
        updateRotation();
        updateIndicators();
    }

    // --- Drag (pointer events) ---
    let dragging = false;
    let startX = 0;
    let dragOffset = 0;
    let lastMoveTime = 0;
    let lastMoveX = 0;
    let velocity = 0;

    const onPointerDown = (e) => {
        if (isAnimating) return;
        dragging = true;
        startX = e.clientX;
        lastMoveX = e.clientX;
        lastMoveTime = performance.now();
        velocity = 0;
        track.style.transition = 'none';
        track.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e) => {
        if (!dragging) return;
        dragOffset = e.clientX - startX;
        const now = performance.now();
        const dt = now - lastMoveTime;
        if (dt > 0) velocity = ((e.clientX - lastMoveX) / dt) * 1000;
        lastMoveX = e.clientX;
        lastMoveTime = now;
        track.style.transform = `translateX(${-(position * trackItemOffset) + dragOffset}px)`;
    };

    const onPointerUp = () => {
        if (!dragging) return;
        dragging = false;
        const direction =
            dragOffset < -DRAG_BUFFER || velocity < -VELOCITY_THRESHOLD
                ? 1
                : dragOffset > DRAG_BUFFER || velocity > VELOCITY_THRESHOLD
                    ? -1
                    : 0;
        dragOffset = 0;
        if (direction !== 0) {
            goTo(position + direction);
        } else {
            isAnimating = true;
            applyTransform(true);
        }
    };

    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);

    if (pauseOnHover) {
        container.addEventListener('mouseenter', () => { isHovered = true; });
        container.addEventListener('mouseleave', () => { isHovered = false; });
    }

    if (autoplay && itemsForRender.length > 1) {
        autoplayTimer = setInterval(() => {
            if (destroyed || (pauseOnHover && isHovered) || isAnimating) return;
            const max = itemsForRender.length - 1;
            goTo(Math.min(position + 1, max));
        }, autoplayDelay);
    }

    applyTransform(false);
    updateRotation();
    updateIndicators();

    function next() {
        if (isAnimating) return;
        const max = itemsForRender.length - 1;
        goTo(loop ? position + 1 : Math.min(position + 1, max));
    }

    function prev() {
        if (isAnimating) return;
        goTo(position - 1);
    }

    function unmount() {
        destroyed = true;
        if (autoplayTimer) clearInterval(autoplayTimer);
        track.removeEventListener('transitionend', onTransitionEnd);
        track.removeEventListener('pointerdown', onPointerDown);
        track.removeEventListener('pointermove', onPointerMove);
        track.removeEventListener('pointerup', onPointerUp);
        track.removeEventListener('pointercancel', onPointerUp);
        container.innerHTML = '';
        container.classList.remove('carousel-container');
    }

    return { next, prev, unmount };
}
