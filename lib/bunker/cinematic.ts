import { assetUrl } from '../asset-url';
export const FINALE_DURATION = 14;
export const DETONATION_TIME = 2.6;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function finaleFrame(time: number, reducedMotion = false) {
  const blast = Math.max(0, time - DETONATION_TIME);
  return {
    blast,
    destroyed: clamp((time - DETONATION_TIME - 0.22) / 0.8),
    shake: reducedMotion
      ? 0
      : Math.exp(-blast * 4) * (time >= DETONATION_TIME ? 1 : 0),
    zoom: reducedMotion ? 1 : 1 + Math.min(time, 11) * 0.003,
    complete: time >= FINALE_DURATION,
  };
}
/** Photographic plates with deterministic, layered smoke and ballistic debris. */
export class BunkerFinale {
  private before = new Image();
  private after = new Image();
  private peak = new Image();
  private smoke: HTMLCanvasElement;
  readonly ready: Promise<void>;
  constructor() {
    const load = (image: HTMLImageElement, path: string) =>
      new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve(); // Failed media must never prevent mission completion.
        image.src = assetUrl(path);
      });
    this.ready = Promise.all([
      load(this.before, '/cinematics/bunker-beach-before.jpg'),
      load(this.after, '/cinematics/bunker-beach-after.jpg'),
      load(this.peak, '/cinematics/bunker-beach-blast.jpg'),
    ]).then(() => undefined);
    this.smoke = document.createElement('canvas');
    this.smoke.width = this.smoke.height = 192;
    const c = this.smoke.getContext('2d')!;
    for (let i = 0; i < 70; i++) {
      const angle = i * 2.399,
        radius = 45 * Math.sqrt(this.rand(i));
      const x = 96 + Math.cos(angle) * radius,
        y = 96 + Math.sin(angle) * radius;
      const r = 25 + this.rand(i + 81) * 25;
      const g = c.createRadialGradient(x - r * 0.2, y - r * 0.3, 0, x, y, r);
      const shade = Math.round(77 + this.rand(i + 10) * 46);
      g.addColorStop(0, `rgba(${shade + 13},${shade + 8},${shade},.32)`);
      g.addColorStop(0.55, `rgba(${shade},${shade - 4},${shade - 9},.22)`);
      g.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  private rand(i: number) {
    const n = Math.sin(i * 127.1 + 71.7) * 43758.5453;
    return n - Math.floor(n);
  }
  render(canvas: HTMLCanvasElement, time: number, reducedMotion: boolean) {
    const c = canvas.getContext('2d');
    if (!c) return;
    const { width: w, height: h } = canvas;
    const f = finaleFrame(time, reducedMotion),
      t = f.blast;
    c.globalAlpha = 1;
    c.fillStyle = '#161c20';
    c.fillRect(0, 0, w, h);
    c.save();
    c.translate(
      w / 2 + Math.sin(time * 91) * f.shake * 0.004 * w,
      h / 2 + Math.cos(time * 73) * f.shake * 0.003 * h,
    );
    c.scale(f.zoom, f.zoom);
    c.translate(-w / 2, -h / 2);
    if (this.before.naturalWidth) c.drawImage(this.before, 0, 0, w, h);
    if (f.destroyed && this.after.naturalWidth) {
      c.globalAlpha = f.destroyed;
      c.drawImage(this.after, 0, 0, w, h);
      c.globalAlpha = 1;
    }
    if (this.peak.naturalWidth && t > 0 && t < 3) {
      c.globalAlpha = clamp(t / 0.12) * clamp((3 - t) / 1.8);
      c.drawImage(this.peak, 0, 0, w, h);
      c.globalAlpha = 1;
    }
    const bx = 0.626 * w,
      by = 0.3 * h;
    if (time >= DETONATION_TIME) {
      // A brief vented flame precedes the slower concrete dust and smoke column.
      if (!this.peak.naturalWidth && t < 1.65)
        for (let i = 0; i < 12; i++) {
          const age = t - i * 0.032;
          if (age < 0) continue;
          const x = bx + (this.rand(i) - 0.5) * age * w * 0.06;
          const y = by - age * h * (0.02 + this.rand(i + 4) * 0.035);
          const r = w * (0.009 + age * 0.022);
          const g = c.createRadialGradient(x, y, 0, x, y, r);
          const alpha = clamp((1.65 - age) * 0.7);
          g.addColorStop(0, `rgba(255,230,170,${alpha})`);
          g.addColorStop(0.3, `rgba(239,144,51,${alpha * 0.7})`);
          g.addColorStop(1, 'rgba(119,56,20,0)');
          c.fillStyle = g;
          c.fillRect(x - r, y - r, r * 2, r * 2);
        }
      for (let i = 0; i < 30; i++) {
        const age = t - 0.9 - (i % 12) * 0.09;
        if (age < 0) continue;
        const lateral = this.rand(i + 36) - 0.5;
        const drift = 1 - Math.exp(-age * 0.7);
        const x = bx + lateral * w * (0.035 + drift * 0.21) + age * w * 0.005;
        const y =
          by -
          Math.min(age, 5) * h * (0.012 + this.rand(i + 90) * 0.032) +
          (i % 4 === 0 ? age * h * 0.015 : 0);
        const size =
          w * (0.02 + Math.sqrt(age) * 0.026 + this.rand(i + 50) * 0.018);
        c.globalAlpha = clamp(age * 3) * Math.max(0.02, 0.16 - age * 0.012);
        c.save();
        c.translate(x, y);
        c.rotate(lateral + age * lateral * 0.09);
        c.drawImage(this.smoke, -size, -size * 0.85, size * 2, size * 1.7);
        c.restore();
      }
      c.globalAlpha = 1;
      for (let i = 0; i < 65; i++) {
        const age = t - this.rand(i) * 0.14;
        if (age < 0 || age > 3.6) continue;
        const vx = (this.rand(i + 70) - 0.5) * 0.12 * w;
        const vy = -(0.035 + this.rand(i + 100) * 0.09) * h;
        const x = bx + vx * age,
          y = by + vy * age + 0.04 * h * age * age;
        if (y > h * 0.465) continue;
        const size = w * (0.0008 + this.rand(i + 28) * 0.0028);
        c.globalAlpha = clamp(3.6 - age);
        c.fillStyle = i % 3 ? '#655f53' : '#968d7c';
        c.save();
        c.translate(x, y);
        c.rotate(age * ((i % 9) - 4));
        c.fillRect(-size, -size * 0.6, size * 2, size * 1.2);
        c.restore();
      }
      c.globalAlpha = 1;
      if (!reducedMotion && t < 0.18) {
        c.fillStyle = `rgba(255,216,155,${0.13 * (1 - t / 0.18)})`;
        c.fillRect(0, 0, w, h);
      }
    }
    c.restore();
    c.globalAlpha = 1;
    // Gentle entry/exit fades keep the return to the mission results deliberate.
    const fade = Math.max(1 - time / 0.8, (time - 12.8) / 1.2, 0);
    c.fillStyle = `rgba(0,0,0,${clamp(fade)})`;
    c.fillRect(0, 0, w, h);
  }
}
