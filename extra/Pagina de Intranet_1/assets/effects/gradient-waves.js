// GradientWaves (React Bits) portado a JS vanilla + WebGL2 (ogl) — fondo de
// olas animadas tipo "plasma raymarch". Mismo shader que la versión React,
// sin JSX ni hooks: se monta sobre un <div> contenedor y se limpia con la
// función que retorna mountGradientWaves.

import { Renderer, Program, Mesh, Triangle } from 'https://esm.sh/ogl@1.0.11';

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [1, 1, 1];
    return [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255];
};

const detailToSteps = (detail) => {
    if (detail === 'low') return 40.0;
    if (detail === 'high') return 110.0;
    return 70.0;
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform float uGrainIntensity;
uniform vec2 uMouse;
uniform float uParallax;
uniform bool uEnableMouse;
uniform vec3 uHorizonColor;
uniform vec3 uWaveColor;
uniform vec3 uCrestColor;
out vec4 fragColor;

const float MAX_DIST = 20000.0;

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float plasma(vec3 r, vec2 freq, vec4 tc) {
  float mx = r.x + tc.x;
  mx += uSwell * sin((r.y + mx) / 20.0 + tc.y);
  float my = r.y - tc.z;
  my += uTurbulence * cos(r.x / 23.0 + tc.w);
  return r.z - (sin(mx * freq.x) * uAmplitude + sin(my * freq.y) * uAmplitude + uHeight);
}

float raymarch(vec3 pos, vec3 dir, vec2 freq, vec4 tc) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float dscene = plasma(pos + dist * dir, freq, tc);
    if (abs(dscene) < 0.1) break;
    dist += 0.9 * dscene;
    if (!(abs(dist) < MAX_DIST)) return MAX_DIST;
  }
  return dist;
}

vec3 surfaceNormal(vec3 p, vec2 freq, vec4 tc) {
  vec2 e = vec2(0.6, 0.0);
  float dx = plasma(p + e.xyy, freq, tc) - plasma(p - e.xyy, freq, tc);
  float dy = plasma(p + e.yxy, freq, tc) - plasma(p - e.yxy, freq, tc);
  float dz = plasma(p + e.yyx, freq, tc) - plasma(p - e.yyx, freq, tc);
  return normalize(vec3(dx, dy, dz));
}

void main() {
  float T = iTime * uSpeed;
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(T / 0.130, T / 0.810, T / 0.200, T / 0.710);
  float c, s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, 30.0);
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) - 0.5;
  uv.x *= iResolution.x / iResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot); s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  c = nuv.x; s = nuv.y;
  dir = mat3(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt); s = sin(uTilt);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;

  if (uEnableMouse) {
    float yaw = (uMouse.x - 0.5) * uParallax * 0.4;
    float pitch = (uMouse.y - 0.5) * uParallax * 0.4;
    c = cos(yaw); s = sin(yaw);
    dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
    c = cos(pitch); s = sin(pitch);
    dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  }

  float dist = raymarch(cam, dir, freq, tc);
  vec3 pos = cam + dist * dir;
  vec3 nrm = surfaceNormal(pos, freq, tc);

  const vec3 lightDir = normalize(vec3(0.35, 0.6, 0.7));
  float diffuse = clamp(dot(nrm, lightDir), 0.0, 1.0);
  float rim = pow(1.0 - clamp(dot(nrm, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 2.0);
  // Rango amplio a propósito: sin esto el shading queda casi plano y solo
  // se percibe el degradado de niebla por distancia (se ve "solo gradiente").
  float shade = clamp(diffuse * 1.6 + rim * 1.1 - 0.35, 0.0, 1.0);

  float t = clamp(uFogDepth / max(dist, 0.001), 0.0, 1.0);
  vec3 body = mix(uWaveColor, uCrestColor, shade);
  // La niebla solo aclara hacia el horizonte lejano; el shading de la
  // superficie manda en la mayor parte del frame (antes la niebla dominaba
  // y aplanaba visualmente las crestas).
  vec3 col = mix(body, uHorizonColor, pow(t, 3.0) * 0.5);
  col *= uBrightness;
  col = clamp(col, 0.0, 1.0);

  float alpha = clamp(t, 0.0, 1.0) * uOpacity;
  if (uGrain > 0.5) {
    float g = hash21(gl_FragCoord.xy + mod(iTime, 64.0) * 11.0);
    alpha += (g - 0.5) * uGrainIntensity;
  }
  alpha = clamp(alpha, 0.0, 1.0);
  fragColor = vec4(col * alpha, alpha);
}
`;

/**
 * Monta un GradientWaves dentro de `container`.
 * @param {HTMLElement} container
 * @param {object} options
 * @returns {{ update: (opts: object) => void, unmount: () => void }}
 */
export function mountGradientWaves(container, options = {}) {
    const renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
    });

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
        vertex,
        fragment,
        uniforms: {
            iTime: { value: 0 },
            iResolution: { value: new Float32Array([1, 1]) },
            uSpeed: { value: 0.4 },
            uAmplitude: { value: 2.5 },
            uWaveScale: { value: 0.6 },
            uWaveRatio: { value: 0.9 },
            uSwell: { value: 35 },
            uTurbulence: { value: 20 },
            uTilt: { value: 1.11 },
            uZoom: { value: 1.0 },
            uHeight: { value: 5.5 },
            uFogDepth: { value: 15 },
            uSteps: { value: 70.0 },
            uBrightness: { value: 1.0 },
            uOpacity: { value: 1.0 },
            uGrain: { value: 1.0 },
            uGrainIntensity: { value: 0.05 },
            uMouse: { value: new Float32Array([0.5, 0.5]) },
            uParallax: { value: 0.5 },
            uEnableMouse: { value: true },
            uHorizonColor: { value: new Float32Array([1, 1, 1]) },
            uWaveColor: { value: new Float32Array([1, 1, 1]) },
            uCrestColor: { value: new Float32Array([1, 1, 1]) },
        },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const setSize = () => {
        const rect = container.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width));
        const h = Math.max(1, Math.floor(rect.height));
        renderer.setSize(w, h);
        const res = program.uniforms.iResolution.value;
        res[0] = gl.drawingBufferWidth;
        res[1] = gl.drawingBufferHeight;
        renderer.render({ scene: mesh });
    };

    const ro = new ResizeObserver(setSize);
    ro.observe(container);
    setSize();

    const currentMouse = [0.5, 0.5];
    const targetMouse = [0.5, 0.5];
    let enableMouse = options.mouseInteraction !== false;

    const onPointerMove = (e) => {
        const rect = canvas.getBoundingClientRect();
        targetMouse[0] = (e.clientX - rect.left) / rect.width;
        targetMouse[1] = 1.0 - (e.clientY - rect.top) / rect.height;
    };
    const onPointerLeave = () => {
        targetMouse[0] = 0.5;
        targetMouse[1] = 0.5;
    };
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);

    let raf = 0;
    let isVisible = true;
    let isPageVisible = !document.hidden;
    const t0 = performance.now();

    const loop = (t) => {
        program.uniforms.iTime.value = (t - t0) * 0.001;
        const tx = enableMouse ? targetMouse[0] : 0.5;
        const ty = enableMouse ? targetMouse[1] : 0.5;
        currentMouse[0] += 0.05 * (tx - currentMouse[0]);
        currentMouse[1] += 0.05 * (ty - currentMouse[1]);
        program.uniforms.uMouse.value[0] = currentMouse[0];
        program.uniforms.uMouse.value[1] = currentMouse[1];
        renderer.render({ scene: mesh });
        raf = requestAnimationFrame(loop);
    };

    const tryStart = () => {
        if (isVisible && isPageVisible && raf === 0) raf = requestAnimationFrame(loop);
    };
    const tryStop = () => {
        if (raf !== 0) {
            cancelAnimationFrame(raf);
            raf = 0;
        }
    };

    const io = new IntersectionObserver(
        ([entry]) => {
            isVisible = entry.isIntersecting;
            isVisible ? tryStart() : tryStop();
        },
        { threshold: 0 }
    );
    io.observe(container);

    const onVisibility = () => {
        isPageVisible = !document.hidden;
        isPageVisible ? tryStart() : tryStop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    function update(opts = {}) {
        const u = program.uniforms;
        if (opts.mouseInteraction !== undefined) enableMouse = opts.mouseInteraction;
        if (opts.speed !== undefined) u.uSpeed.value = opts.speed;
        if (opts.amplitude !== undefined) u.uAmplitude.value = opts.amplitude;
        if (opts.waveScale !== undefined) u.uWaveScale.value = opts.waveScale;
        if (opts.waveRatio !== undefined) u.uWaveRatio.value = opts.waveRatio;
        if (opts.swell !== undefined) u.uSwell.value = opts.swell;
        if (opts.turbulence !== undefined) u.uTurbulence.value = opts.turbulence;
        if (opts.tilt !== undefined) u.uTilt.value = opts.tilt;
        if (opts.zoom !== undefined) u.uZoom.value = opts.zoom;
        if (opts.height !== undefined) u.uHeight.value = opts.height;
        if (opts.fogDepth !== undefined) u.uFogDepth.value = opts.fogDepth;
        if (opts.detail !== undefined) u.uSteps.value = detailToSteps(opts.detail);
        if (opts.brightness !== undefined) u.uBrightness.value = opts.brightness;
        if (opts.opacity !== undefined) u.uOpacity.value = opts.opacity;
        if (opts.grain !== undefined) u.uGrain.value = opts.grain ? 1.0 : 0.0;
        if (opts.grainIntensity !== undefined) u.uGrainIntensity.value = opts.grainIntensity;
        if (opts.parallaxStrength !== undefined) u.uParallax.value = opts.parallaxStrength;
        if (opts.horizonColor !== undefined) {
            const [r, g, b] = hexToRgb(opts.horizonColor);
            u.uHorizonColor.value.set([r, g, b]);
        }
        if (opts.waveColor !== undefined) {
            const [r, g, b] = hexToRgb(opts.waveColor);
            u.uWaveColor.value.set([r, g, b]);
        }
        if (opts.crestColor !== undefined) {
            const [r, g, b] = hexToRgb(opts.crestColor);
            u.uCrestColor.value.set([r, g, b]);
        }
    }

    update(options);
    tryStart();

    function unmount() {
        tryStop();
        ro.disconnect();
        io.disconnect();
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('pointermove', onPointerMove);
        canvas.removeEventListener('pointerleave', onPointerLeave);
        try {
            container.removeChild(canvas);
        } catch (e) { /* noop */ }
        gl.getExtension('WEBGL_lose_context')?.loseContext();
    }

    return { update, unmount };
}
