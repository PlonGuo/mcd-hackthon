/**
 * Adapted from PlonGuo's morphing-particles Canvas 2D engine (MIT, 2026).
 * See ./LICENSE and ./NOTICE.md. Glyph sampling replaces image loading, and room
 * state replaces hover so the animation always represents the actual turn.
 */
export type ParticleMode = 'idle' | 'active' | 'winner' | 'offline';

// This function is serialized into the existing /watch.js response. Keep it
// self-contained: no runtime imports, module-scope helpers or captured variables.
export function mountMorphingParticles(container: HTMLElement, letter: 'A' | 'B') {
  // Object methods retain their names without bundler-injected helper calls.
  const math = {
    lerp(a: number, b: number, t: number) { return a + (b - a) * t; },
    clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); },
  };
  const {lerp, clamp} = math;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const context = ctx;
  container.appendChild(canvas);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let pixelRatio = 0;
  const ink = letter === 'A' ? '#b82428' : '#a2750c';
  const sample = document.createElement('canvas');
  sample.width = sample.height = 120;
  const sampler = sample.getContext('2d', {willReadFrequently: true})!;
  sampler.font = '900 100px Arial, sans-serif';
  sampler.textAlign = 'center';
  sampler.textBaseline = 'middle';
  sampler.fillText(letter, 60, 66);
  const pixels = sampler.getImageData(0, 0, 120, 120).data;
  const targets: [number, number][] = [];
  // Scatter within the glyph rather than on rows. Minimum spacing keeps the
  // particles distinct; the glyph mask preserves the crossbar and counters.
  for (let attempt = 0; attempt < 7000; attempt++) {
    const x = Math.random() * 120, y = Math.random() * 120;
    if (pixels[(Math.floor(y) * 120 + Math.floor(x)) * 4 + 3]! <= 192) continue;
    const target: [number, number] = [(x - 60) / 60, (y - 60) / 60];
    if (targets.some(([tx, ty]) => (tx - target[0]) ** 2 + (ty - target[1]) ** 2 < .04 ** 2)) continue;
    targets.push(target);
  }
  let disposed = false, visible = false, mode: ParticleMode = 'idle';
  let width = 0, height = 0, frame: number | null = null, previous = 0, elapsed = 0, progress = 0, pulse = 0;
  let particles: {target: [number, number]; feature: boolean;
    x: number; y: number; phase: number; speed: number; radius: number; opacity: number}[] = [];

  const runtime = {
    build() {
      const featureCount = targets.length, count = featureCount + 42;
      particles = Array.from({length: count}, (_, index) => {
        return {target: targets[index % featureCount]!,
          feature: index < featureCount, x: width / 2, y: height / 2, phase: Math.random() * Math.PI * 2,
          speed: .5 + Math.random(), radius: .5 + Math.random() * .5, opacity: .65 + Math.random() * .35};
      });
    },
    draw(delta: number) {
      context.clearRect(0, 0, width, height);
      const active = mode === 'active';
      const staticFrame = motion.matches || mode === 'offline';
      progress += ((active ? 1 : 0) - progress) * (delta === 0 || motion.matches ? 1 : 1 - Math.exp(-delta * 5));
      pulse = motion.matches ? 0 : pulse * Math.exp(-delta * 3);
      if (pulse < .012) pulse = 0;
      elapsed += delta;
      const scale = Math.min(width * .46, height * .55);
      // Most movement is shared by the silhouette, with small individual drift.
      const floatY = staticFrame ? 0 : Math.sin(elapsed * 1.3) * (2.8 + progress * 1.4);
      const breathe = staticFrame ? 1 : 1 + Math.sin(elapsed * 1.8) * (.025 + progress * .015);
      for (const particle of particles) {
        const drift = staticFrame ? 0 : Math.sin(elapsed * particle.speed + particle.phase) * (.35 + progress * .25);
        const angle = particle.phase + (staticFrame ? 0 : elapsed * (.22 + particle.speed * .12));
        const scatter = 4 + particle.speed * 5;
        let x = width / 2 + particle.target[0] * scale * breathe
          + (particle.feature ? drift : Math.cos(angle) * scatter);
        let y = height / 2 + particle.target[1] * scale * breathe + floatY
          + (particle.feature ? drift * .6 : Math.sin(angle) * scatter);
        x += (x - width / 2) * pulse * .15;
        y += (y - height / 2) * pulse * .15;
        const settle = delta === 0 || staticFrame ? 1 : 1 - Math.exp(-delta * 7);
        particle.x = lerp(particle.x, x, settle);
        particle.y = lerp(particle.y, y, settle);
        context.fillStyle = ink;
        context.globalAlpha = particle.opacity * (particle.feature ? 1 : .35 + progress * .2);
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius * (particle.feature ? scale / 66 : .85), 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    },
    animate(timestamp: number) {
      frame = null;
      if (disposed || !visible || document.hidden) return;
      // Cap drawing at 30 fps; mobile does not need a full-frame-rate decoration.
      if (!previous || timestamp - previous >= 1000 / 30) {
        const delta = previous ? Math.min((timestamp - previous) / 1000, .08) : 1 / 30;
        previous = timestamp;
        draw(delta);
      }
      schedule();
    },
    schedule() {
      if (disposed || !visible || document.hidden || !width || !height) return;
      if (motion.matches || mode === 'offline') { draw(0); return; }
      if (frame === null) frame = requestAnimationFrame(animate);
    },
    stop() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null; previous = 0;
    },
    resize() {
      if (disposed) return;
      const nextWidth = container.clientWidth, nextHeight = container.clientHeight;
      const nextPixelRatio = clamp(devicePixelRatio || 1, 1, 3);
      if (!nextWidth || !nextHeight) { width = height = 0; stop(); return; }
      if (nextWidth === width && nextHeight === height && nextPixelRatio === pixelRatio) return;
      width = nextWidth; height = nextHeight; pixelRatio = nextPixelRatio;
      canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      build(); draw(0); schedule();
    },
    setMode(next: ParticleMode, celebrate = true) {
      if (disposed || mode === next) return;
      mode = next;
      pulse = next === 'winner' && celebrate && !motion.matches && visible && !document.hidden ? 1 : 0;
      stop(); draw(0); schedule();
    },
    visibility() { stop(); if (document.hidden) pulse = 0; else schedule(); },
    reducedMotion() { stop(); pulse = 0; draw(0); schedule(); },
    dispose() {
      if (disposed) return;
      disposed = true; stop();
      intersection.disconnect(); dimensions.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('resize', resize);
      motion.removeEventListener('change', reducedMotion);
      canvas.remove(); particles = [];
      container.parentElement?.classList.remove('has-particles');
    },
  };
  const {build, draw, animate, schedule, stop, resize, setMode, visibility, reducedMotion, dispose} = runtime;
  const intersection = new IntersectionObserver(entries => {
    visible = entries[0]!.isIntersecting;
    if (visible) schedule(); else { pulse = 0; stop(); }
  });
  const dimensions = new ResizeObserver(resize);
  resize();
  intersection.observe(container); dimensions.observe(container);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('resize', resize);
  motion.addEventListener('change', reducedMotion);
  container.parentElement?.classList.add('has-particles');
  return {ready: Promise.resolve(), setMode, dispose};
}

export const particlesScript = `'use strict';\nconst mountMorphingParticles = ${mountMorphingParticles.toString()};`;
