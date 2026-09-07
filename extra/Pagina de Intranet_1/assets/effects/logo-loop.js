// LogoLoop (React Bits) portado a JS vanilla — sin React ni la librería
// 'motion', usando un loop de requestAnimationFrame con easing exponencial
// equivalente al de la versión original. Sin links por logo (a petición).

const ANIMATION_CONFIG = { SMOOTH_TAU: 0.25, MIN_COPIES: 2, COPY_HEADROOM: 2 };

/**
 * Monta un LogoLoop horizontal dentro de `container`.
 * @param {HTMLElement} container
 * @param {{logos: Array<{src:string, alt?:string, srcDark?:string}>, speed?: number, logoHeight?: number, gap?: number, fadeOut?: boolean, pauseOnHover?: boolean}} options
 * @returns {() => void} función para desmontar
 */
export function mountLogoLoop(container, options = {}) {
  const {
    logos,
    speed = 90,
    logoHeight = 32,
    gap = 56,
    fadeOut = true,
    pauseOnHover = true,
  } = options;

  container.classList.add('logoloop');
  container.style.setProperty('--logoloop-gap', gap + 'px');
  container.style.setProperty('--logoloop-logoHeight', logoHeight + 'px');
  if (fadeOut) container.classList.add('logoloop--fade');
  container.setAttribute('role', 'region');
  container.setAttribute('aria-label', 'Logos de aliados');

  const track = document.createElement('div');
  track.className = 'logoloop__track';
  container.appendChild(track);

  function buildList(hidden) {
    const list = document.createElement('ul');
    list.className = 'logoloop__list';
    list.setAttribute('role', 'list');
    if (hidden) list.setAttribute('aria-hidden', 'true');
    logos.forEach((logo) => {
      const li = document.createElement('li');
      li.className = 'logoloop__item';
      const img = document.createElement('img');
      img.src = logo.src;
      img.alt = logo.alt || '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      if (logo.srcDark) img.dataset.srcDark = logo.srcDark;
      if (logo.srcLight) img.dataset.srcLight = logo.srcLight;
      li.appendChild(img);
      list.appendChild(li);
    });
    return list;
  }

  let copyCount = ANIMATION_CONFIG.MIN_COPIES;
  let seqRef = null;

  function rebuildCopies() {
    track.innerHTML = '';
    for (let i = 0; i < copyCount; i++) {
      const list = buildList(i > 0);
      track.appendChild(list);
      if (i === 0) seqRef = list;
    }
  }
  rebuildCopies();

  let seqWidth = 0;
  let offset = 0;
  let velocity = 0;
  let rafId = null;
  let lastTimestamp = null;
  let isHovered = false;

  const hoverSpeed = pauseOnHover ? 0 : undefined;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function updateDimensions() {
    const containerWidth = container.clientWidth || 0;
    const rect = seqRef ? seqRef.getBoundingClientRect() : null;
    const sequenceWidth = rect ? rect.width : 0;
    if (sequenceWidth > 0) {
      seqWidth = Math.ceil(sequenceWidth);
      const copiesNeeded = Math.ceil(containerWidth / sequenceWidth) + ANIMATION_CONFIG.COPY_HEADROOM;
      const needed = Math.max(ANIMATION_CONFIG.MIN_COPIES, copiesNeeded);
      if (needed !== copyCount) {
        copyCount = needed;
        rebuildCopies();
      }
    }
  }

  function animate(timestamp) {
    if (lastTimestamp === null) lastTimestamp = timestamp;
    const deltaTime = Math.max(0, timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;

    const target = isHovered && hoverSpeed !== undefined ? hoverSpeed : speed;
    const easingFactor = 1 - Math.exp(-deltaTime / ANIMATION_CONFIG.SMOOTH_TAU);
    velocity += (target - velocity) * easingFactor;

    if (seqWidth > 0) {
      let nextOffset = offset + velocity * deltaTime;
      nextOffset = ((nextOffset % seqWidth) + seqWidth) % seqWidth;
      offset = nextOffset;
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    }

    rafId = requestAnimationFrame(animate);
  }

  const ro = window.ResizeObserver ? new ResizeObserver(updateDimensions) : null;
  if (ro) {
    ro.observe(container);
    if (seqRef) ro.observe(seqRef);
  } else {
    window.addEventListener('resize', updateDimensions);
  }
  updateDimensions();

  if (pauseOnHover) {
    track.addEventListener('mouseenter', () => { isHovered = true; });
    track.addEventListener('mouseleave', () => { isHovered = false; });
  }

  if (reduceMotion) {
    track.style.transform = 'translate3d(0,0,0)';
  } else {
    rafId = requestAnimationFrame(animate);
  }

  return function unmount() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (ro) ro.disconnect();
    else window.removeEventListener('resize', updateDimensions);
    container.innerHTML = '';
  };
}
