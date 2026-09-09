import * as THREE from 'three';
type Kind = 'smoke' | 'flame' | 'spray' | 'flash' | 'ring';
type Particle = {
  sprite: THREE.Sprite | THREE.Mesh;
  kind: Kind;
  age: number;
  life: number;
  size: number;
  velocity: THREE.Vector3;
  spin: number;
  growth: number;
};
function spriteTexture(kind: Kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d')!;
  if (kind === 'smoke') {
    for (let i = 0; i < 25; i++) {
      const x = 40 + Math.sin(i * 7.23) * 25,
        y = 40 + Math.cos(i * 4.83) * 25,
        r = 24 + (i % 5) * 5;
      const g = c.createRadialGradient(x + 24, y + 24, 0, x + 24, y + 24, r);
      g.addColorStop(0, 'rgba(235,235,235,.09)');
      g.addColorStop(0.5, 'rgba(225,225,225,.05)');
      g.addColorStop(1, 'rgba(225,225,225,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 128);
    }
  } else {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(kind === 'flash' ? 0.12 : 0.25, 'rgba(255,255,255,.9)');
    g.addColorStop(0.55, 'rgba(255,255,255,.24)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export class NavalEffects {
  private particles: Particle[] = [];
  private textures = {
    smoke: spriteTexture('smoke'),
    flame: spriteTexture('flame'),
    spray: spriteTexture('spray'),
    flash: spriteTexture('flash'),
  };
  private ringGeo = new THREE.RingGeometry(0.8, 1, 64);
  constructor(private scene: THREE.Scene) {}
  private add(
    kind: Kind,
    p: THREE.Vector3,
    v: THREE.Vector3,
    size: number,
    life: number,
    color: string,
    growth: number,
  ) {
    if (this.particles.length >= 240) return;
    let sprite: THREE.Sprite | THREE.Mesh;
    if (kind === 'ring') {
      sprite = new THREE.Mesh(
        this.ringGeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      sprite.rotation.x = -Math.PI / 2;
    } else
      sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.textures[kind],
          color,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          blending:
            kind === 'flame' || kind === 'flash'
              ? THREE.AdditiveBlending
              : THREE.NormalBlending,
          rotation: Math.random() * Math.PI,
        }),
      );
    sprite.position.copy(p);
    sprite.scale.setScalar(size);
    this.scene.add(sprite);
    this.particles.push({
      sprite,
      kind,
      age: 0,
      life,
      size,
      velocity: v,
      growth,
      spin: (Math.random() - 0.5) * 0.4,
    });
  }
  muzzle(p: THREE.Vector3, direction: THREE.Vector3) {
    this.add('flash', p.clone(), new THREE.Vector3(), 5, 0.11, '#ffefb2', 28);
    for (let i = 0; i < 6; i++)
      this.add(
        'flame',
        p.clone().addScaledVector(direction, i * 0.7),
        direction.clone().multiplyScalar(15 + i * 3),
        2.7,
        0.18 + Math.random() * 0.12,
        '#ffa64a',
        9,
      );
    for (let i = 0; i < 8; i++)
      this.add(
        'smoke',
        p.clone(),
        direction
          .clone()
          .multiplyScalar(5 + Math.random() * 8)
          .add(new THREE.Vector3(Math.random() * 2, 3, 0)),
        3,
        2.5,
        '#b8b6a9',
        5,
      );
  }
  smoke(p: THREE.Vector3, damaged = false) {
    this.add(
      'smoke',
      p,
      new THREE.Vector3(2, damaged ? 8 : 3, 1.5),
      damaged ? 7 : 2.4,
      damaged ? 5 : 3,
      damaged ? '#30332f' : '#727e7b',
      damaged ? 3 : 0.8,
    );
  }
  explosion(p: THREE.Vector3, large = false) {
    this.add(
      'flash',
      p.clone(),
      new THREE.Vector3(),
      large ? 25 : 12,
      0.2,
      '#ffe9ab',
      80,
    );
    for (let i = 0; i < (large ? 22 : 10); i++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.random() * (large ? 18 : 8),
        q = p
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(a) * r,
              Math.random() * 9,
              Math.sin(a) * r,
            ),
          );
      this.add(
        'flame',
        q,
        new THREE.Vector3(
          Math.cos(a) * 5,
          5 + Math.random() * 9,
          Math.sin(a) * 5,
        ),
        large ? 16 : 9,
        0.5 + Math.random() * 0.8,
        '#ff7b24',
        8,
      );
      this.add(
        'smoke',
        q.clone(),
        new THREE.Vector3(
          Math.cos(a) * 4,
          5 + Math.random() * 12,
          Math.sin(a) * 4,
        ),
        large ? 14 : 9,
        4 + Math.random() * 4,
        '#34332f',
        5,
      );
    }
  }
  splash(x: number, z: number) {
    const p = new THREE.Vector3(x, 0.3, z);
    // Spray marks the impact without a large, artificial expanding ring.
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.random() * 5;
      const v = new THREE.Vector3(
        Math.cos(a) * r,
        14 + Math.random() * 23,
        Math.sin(a) * r,
      );
      this.add(
        'spray',
        p.clone(),
        v,
        1.4 + Math.random() * 1.6,
        1.2 + Math.random() * 0.5,
        '#c9e3e1',
        1.2,
      );
    }
    for (let i = 0; i < 6; i++)
      this.add(
        'smoke',
        p.clone(),
        new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          3,
          (Math.random() - 0.5) * 6,
        ),
        6,
        3,
        '#d1e6e2',
        5,
      );
  }
  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene.remove(p.sprite);
        (p.sprite.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.sprite.position.addScaledVector(p.velocity, dt);
      if (p.kind === 'spray') p.velocity.y -= dt * 19;
      if (p.kind === 'spray' && p.sprite.position.y < 0) {
        p.age = p.life;
        continue;
      }
      const progress = p.age / p.life;
      let opacity = (1 - progress) * (p.kind === 'smoke' ? 0.35 : 0.75);
      if (p.kind === 'smoke') opacity *= Math.min(1, progress * 7);
      (p.sprite.material as THREE.SpriteMaterial).opacity = opacity;
      const size = p.size + p.age * p.growth;
      p.sprite.scale.set(size, p.kind === 'spray' ? size * 2.3 : size, size);
      if (p.sprite instanceof THREE.Sprite)
        (p.sprite.material as THREE.SpriteMaterial).rotation += p.spin * dt;
    }
  }
  reset() {
    for (const p of this.particles) {
      this.scene.remove(p.sprite);
      (p.sprite.material as THREE.Material).dispose();
    }
    this.particles = [];
  }
  dispose() {
    this.reset();
    Object.values(this.textures).forEach((t) => t.dispose());
    this.ringGeo.dispose();
  }
}
