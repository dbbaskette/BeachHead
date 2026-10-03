import { assetUrl } from '../asset-url';
export const FINALE_DURATION = 16;
export const DETONATION_TIME = 2.6;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};
const rand = (i: number) => {
  const n = Math.sin(i * 127.1 + 71.7) * 43758.5453;
  return n - Math.floor(n);
};
const BX = 0.626,
  BY = 0.3,
  GROUND = 0.468;

export function finaleFrame(time: number, reducedMotion = false) {
  const blast = Math.max(0, time - DETONATION_TIME);
  return {
    blast,
    destroyed: smooth((blast - 0.3) / 1.6),
    peak: smooth(blast / 0.22) * (1 - smooth((blast - 0.45) / 1.3)),
    shake: reducedMotion
      ? 0
      : Math.exp(-blast * 3.5) * (time >= DETONATION_TIME ? 1 : 0),
    zoom: reducedMotion ? 1 : 1 + Math.min(time, 13) * 0.0025,
    complete: time >= FINALE_DURATION,
  };
}

/** Absolute-time ballistics keep replay, seeking and dropped frames identical. */
export function debrisFrame(index: number, blast: number) {
  const age = blast - rand(index) * 0.28;
  const vx = (rand(index + 70) - 0.5) * 0.15;
  const vy = -(0.045 + rand(index + 100) * 0.14);
  const gravity = 0.115;
  const impactTime =
    (-vy + Math.sqrt(vy * vy + 2 * gravity * (GROUND - BY))) / gravity;
  const flight = Math.max(0, Math.min(age, impactTime));
  return {
    age,
    impactAge: age - impactTime,
    x: BX + vx * flight,
    y: BY + vy * flight + 0.5 * gravity * flight * flight,
    size: 0.0005 + Math.pow(rand(index + 28), 3) * 0.003,
    rotation: flight * (rand(index + 3) - 0.5) * 8,
  };
}

/** Photographic scenery with a continuous, deterministic demolition simulation. */
export class BunkerFinale {
  private before = new Image();
  private after = new Image();
  private peak = new Image();
  private clouds: HTMLCanvasElement[];
  private blastPlate: HTMLCanvasElement | null = null;
  readonly ready: Promise<void>;
  constructor() {
    this.clouds = [0, 1, 2, 3].map((seed) => this.makeCloud(seed));
    const load = (image: HTMLImageElement, path: string) =>
      new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve(); // Missing media must never prevent mission completion.
        image.src = assetUrl(path);
      });
    this.ready = Promise.all([
      load(this.before, '/cinematics/bunker-beach-before.jpg'),
      load(this.after, '/cinematics/bunker-beach-after.jpg'),
      load(this.peak, '/cinematics/bunker-beach-blast.jpg'),
    ]).then(() => {
      if (!this.peak.naturalWidth) return;
      // Feather just the explosion region. The beach, tanks and horizon never crossfade.
      const plate = document.createElement('canvas');
      plate.width = 640;
      plate.height = 520;
      const c = plate.getContext('2d')!;
      c.drawImage(
        this.peak,
        this.peak.width * 0.44,
        0,
        this.peak.width * 0.36,
        this.peak.height * 0.49,
        0,
        0,
        640,
        520,
      );
      c.globalCompositeOperation = 'destination-in';
      c.save();
      c.translate(320, 260);
      c.scale(1, 0.81);
      const mask = c.createRadialGradient(0, 0, 120, 0, 0, 320);
      mask.addColorStop(0, '#fff');
      mask.addColorStop(0.7, '#fff');
      mask.addColorStop(1, '#fff0');
      c.fillStyle = mask;
      c.fillRect(-320, -321, 640, 642);
      c.restore();
      this.blastPlate = plate;
      // Carry photographic turbulence into the moving smoke, retaining each
      // sprite's soft silhouette. These are small cached textures, not per-frame reads.
      for (const cloud of this.clouds) {
        const smoke = cloud.getContext('2d')!;
        smoke.globalCompositeOperation = 'source-atop';
        smoke.globalAlpha = 0.65;
        smoke.drawImage(
          this.peak,
          this.peak.width * 0.66,
          this.peak.height * 0.11,
          this.peak.width * 0.065,
          this.peak.height * 0.14,
          0,
          0,
          192,
          192,
        );
        smoke.globalAlpha = 1;
        smoke.globalCompositeOperation = 'source-over';
      }
    });
  }
  private makeCloud(seed: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 192;
    const c = canvas.getContext('2d')!;
    // Overlapping shaded lobes supply volume; fine wisps break the silhouette.
    for (let i = 0; i < 36; i++) {
      const n = i + seed * 179;
      const angle = i * 2.399,
        radius = 43 * Math.sqrt(rand(n));
      const x = 96 + Math.cos(angle) * radius,
        y = 96 + Math.sin(angle) * radius;
      const r = 24 + rand(n + 81) * 27;
      const shade = Math.round(94 + rand(n + 10) * 16);
      const g = c.createRadialGradient(
        x - r * 0.3,
        y - r * 0.4,
        r * 0.08,
        x,
        y,
        r,
      );
      g.addColorStop(0, `rgba(${shade + 27},${shade + 22},${shade + 13},.28)`);
      g.addColorStop(0.48, `rgba(${shade},${shade - 3},${shade - 8},.2)`);
      g.addColorStop(1, `rgba(${shade - 20},${shade - 21},${shade - 23},0)`);
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return canvas;
  }
  private cloud(
    c: CanvasRenderingContext2D,
    i: number,
    x: number,
    y: number,
    size: number,
    alpha: number,
    rotation = 0,
    flatten = 1,
  ) {
    if (alpha <= 0 || size <= 0) return;
    c.save();
    c.globalAlpha = clamp(alpha);
    c.translate(x, y);
    c.rotate(rotation);
    c.drawImage(
      this.clouds[i % 4],
      -size,
      -size * flatten,
      size * 2,
      size * 2 * flatten,
    );
    c.restore();
  }
  private glow(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    alpha: number,
  ) {
    if (alpha <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,240,194,${alpha})`);
    g.addColorStop(0.2, `rgba(255,174,59,${alpha * 0.85})`);
    g.addColorStop(0.6, `rgba(213,75,17,${alpha * 0.4})`);
    g.addColorStop(1, 'rgba(160,45,9,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
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
      // Only reveal the damaged cliff; avoid shifting unrelated foreground details.
      c.save();
      c.beginPath();
      c.ellipse(BX * w, 0.34 * h, 0.115 * w, 0.15 * h, 0, 0, Math.PI * 2);
      c.clip();
      c.globalAlpha = f.destroyed;
      c.drawImage(this.after, 0, 0, w, h);
      c.restore();
    }
    const bx = BX * w,
      by = BY * h;
    if (time >= DETONATION_TIME) {
      // Rapidly vented heat precedes the slower mass of concrete and dust.
      c.save();
      c.globalCompositeOperation = 'screen';
      this.glow(
        c,
        bx,
        by,
        w * (0.02 + Math.min(t, 0.45) * 0.12),
        (reducedMotion ? 0.28 : 0.65) * Math.exp(-t * 4),
      );
      c.restore();
      if (this.blastPlate && f.peak > 0) {
        c.save();
        c.globalAlpha = f.peak;
        // The reveal travels from the gun opening upward instead of displaying a frozen peak.
        c.beginPath();
        c.ellipse(
          bx,
          by,
          w * (0.015 + Math.min(t, 0.8) * 0.32),
          h * (0.025 + Math.min(t, 0.8) * 0.6),
          0,
          0,
          Math.PI * 2,
        );
        c.clip();
        c.drawImage(this.blastPlate, 0.44 * w, 0, 0.36 * w, 0.49 * h);
        c.restore();
      }
      // Fire tongues pulse out of the embrasure, then retreat to a small persistent burn.
      for (let i = 0; i < 14; i++) {
        const age = t - i * 0.036;
        if (age < 0) continue;
        const energy = Math.exp(-age * 2.1);
        const r =
          w *
          (0.0015 + Math.min(age, 0.35) * 0.037) *
          (0.75 + 0.25 * Math.sin(age * 16 + i));
        this.glow(
          c,
          bx + (rand(i + 41) - 0.5) * w * 0.035 * Math.min(age * 4, 1),
          by - Math.min(age, 0.7) * h * (0.018 + rand(i) * 0.04),
          r,
          energy * 0.7,
        );
      }
      // Dust jets lose forward speed while smoke rises and spreads in the sea breeze.
      for (let i = 0; i < 42; i++) {
        const birth = 0.12 + (i % 15) * 0.105 + Math.floor(i / 15) * 0.26;
        const age = t - birth;
        if (age < 0) continue;
        const lateral = rand(i + 36) - 0.5,
          spread = 1 - Math.exp(-age * 0.85);
        const x = bx + lateral * w * (0.012 + spread * 0.15) + age * w * 0.004;
        const y =
          by - h * (spread * (0.03 + rand(i + 90) * 0.22) + age * 0.009);
        const size =
          w * (0.007 + Math.sqrt(age) * 0.017 + rand(i + 50) * 0.008);
        const alpha =
          smooth(age / 0.3) *
          (0.27 + rand(i + 12) * 0.2) *
          (1 - smooth((age - 5) / 9));
        this.cloud(
          c,
          i,
          x,
          y,
          size,
          alpha,
          lateral * 0.3 + age * lateral * 0.035,
        );
      }
      // A gravity-driven curtain falls down the cliff before spreading at its foot.
      for (let i = 0; i < 34; i++) {
        const age = t - 0.35 - (i % 9) * 0.12;
        if (age < 0) continue;
        const fall = Math.min(age * age * 0.035, GROUND - BY);
        const x =
          bx + (rand(i + 510) - 0.5) * w * (0.04 + Math.min(age, 4) * 0.024);
        const size = w * (0.009 + Math.sqrt(age) * 0.013);
        this.cloud(
          c,
          i + 1,
          x,
          by + fall * h,
          size,
          smooth(age / 0.35) * 0.35 * (1 - smooth((age - 3) / 8)),
          0,
          fall < GROUND - BY ? 1.25 : 0.4,
        );
      }
      for (let i = 0; i < 110; i++) {
        const d = debrisFrame(i, t);
        if (d.age < 0) continue;
        if (d.impactAge >= 0) {
          if (i % 3 === 0 && d.impactAge < 1.8)
            this.cloud(
              c,
              i,
              d.x * w,
              GROUND * h,
              w * (0.003 + Math.sqrt(d.impactAge) * 0.012),
              smooth(d.impactAge / 0.12) * 0.45 * (1 - d.impactAge / 1.8),
              0,
              0.36,
            );
          continue;
        }
        // Irregular rotating fragments follow parabolic arcs, with short dust wakes.
        if (i % 4 === 0)
          this.cloud(
            c,
            i,
            d.x * w,
            d.y * h - 0.006 * h,
            d.size * w * 3.5,
            0.3,
            d.rotation,
            1.5,
          );
        c.save();
        c.translate(d.x * w, d.y * h);
        c.rotate(d.rotation);
        const s = d.size * w;
        c.fillStyle = i % 3 ? '#514b42' : '#857a68';
        c.beginPath();
        c.moveTo(-s, -s * 0.4);
        c.lineTo(-s * 0.25, -s * 0.8);
        c.lineTo(s, s * 0.1);
        c.lineTo(s * 0.35, s * 0.7);
        c.lineTo(-s * 0.7, s * 0.5);
        c.closePath();
        c.fill();
        c.restore();
      }
      if (t > 1.5) {
        c.save();
        c.globalCompositeOperation = 'screen';
        this.glow(
          c,
          bx + 0.007 * w,
          by + 0.011 * h,
          w * 0.009,
          (0.23 + 0.09 * Math.sin(t * 9) + 0.06 * Math.sin(t * 17)) *
            smooth((t - 1.5) / 2),
        );
        c.restore();
      }
    }
    c.restore();
    c.globalAlpha = 1;
    const fade = Math.max(
      1 - time / 0.8,
      (time - (FINALE_DURATION - 1.2)) / 1.2,
      0,
    );
    c.fillStyle = `rgba(0,0,0,${clamp(fade)})`;
    c.fillRect(0, 0, w, h);
  }
}
