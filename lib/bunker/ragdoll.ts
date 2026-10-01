import * as T from 'three';
import { solids, type Guard, type HitRegion, type Box } from './simulation';
const STEP = 1 / 120;
const names = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
];
type Node = {
  name: string;
  bone: T.Object3D;
  p: T.Vector3;
  old: T.Vector3;
  radius: number;
  weight: number;
  orientation: T.Quaternion;
  restPosition: T.Vector3;
  restQuaternion: T.Quaternion;
  child?: Node;
  direction?: T.Vector3;
  frameInverse?: T.Quaternion;
  contact: boolean;
};
type Link = { a: Node; b: Node; min: number; max: number; stiffness: number };
const offset = new T.Vector3(),
  delta = new T.Vector3(),
  orientation = new T.Quaternion(),
  parentQ = new T.Quaternion();
/** Small fixed-step position-based ragdoll. Skeleton segments keep their lengths;
 * joint limits and torso bracing constrain the motion, not a whole-body fall curve. */
export class GuardRagdoll {
  readonly nodes: Node[] = [];
  private links: Link[] = [];
  private selfContacts: [Node, Node][] = [];
  private knees: [Node, Node, Node][] = [];
  private accumulator = 0;
  private quiet = 0;
  age = 0;
  sleeping = false;
  floorImpact = false;
  wallImpact?: T.Vector3;
  private lastWallImpact = -1;
  private obstacles: Box[] = solids;
  constructor(model: T.Object3D, g: Guard) {
    model.updateWorldMatrix(true, true);
    for (const name of names) {
      const bone = model.getObjectByName(name);
      if (!bone) continue;
      const p = bone.getWorldPosition(new T.Vector3());
      const radius =
        name === 'Head'
          ? 0.15
          : name === 'Hips'
            ? 0.17
            : name.startsWith('Spine')
              ? 0.17
              : name.includes('Shoulder')
                ? 0.1
                : name.includes('UpLeg')
                  ? 0.12
                  : name.endsWith('Leg')
                    ? 0.1
                    : name.includes('Hand')
                      ? 0.08
                      : name.includes('Toe')
                        ? 0.07
                        : name.includes('Foot')
                          ? 0.09
                          : 0.075;
      const weight =
        name === 'Hips'
          ? 0.45
          : name.startsWith('Spine')
            ? 0.55
            : name === 'Head'
              ? 0.9
              : 1.4;
      this.nodes.push({
        name,
        bone,
        p,
        old: p.clone(),
        radius,
        weight,
        orientation: bone.getWorldQuaternion(new T.Quaternion()),
        restPosition: bone.position.clone(),
        restQuaternion: bone.quaternion.clone(),
        contact: false,
      });
    }
    for (const n of this.nodes) {
      const parent = this.nodes.find((x) => x.bone === n.bone.parent);
      if (parent) this.link(parent, n, 1, 1, 1);
      n.child = this.nodes.find((x) => x.bone.parent === n.bone);
      if (n.child) n.direction = n.child.p.clone().sub(n.p).normalize();
    }
    for (const n of this.nodes)
      if (n.name === 'Hips' || n.name.startsWith('Spine'))
        n.frameInverse = this.bodyFrame(n).invert();
    // A braced ribcage/pelvis preserves volume while the waist and neck can bend.
    for (const [a, b] of [
      ['LeftShoulder', 'RightShoulder'],
      ['LeftArm', 'RightArm'],
      ['LeftUpLeg', 'RightUpLeg'],
      ['Hips', 'Spine1'],
      ['Spine', 'Spine2'],
      ['Spine1', 'Neck'],
      ['Spine2', 'LeftArm'],
      ['Spine2', 'RightArm'],
      ['Spine', 'LeftShoulder'],
      ['Spine', 'RightShoulder'],
      ['LeftUpLeg', 'Spine'],
      ['RightUpLeg', 'Spine'],
    ])
      this.namedLink(a, b, 0.92, 1.03, 0.85);
    this.namedLink('Hips', 'Spine2', 0.65, 1, 0.55);
    this.namedLink('Spine2', 'Head', 0.72, 1, 0.75);
    for (const side of ['Left', 'Right']) {
      // Chord limits disallow fully reversed elbows/knees, but allow a folded limb.
      this.hinge(side + 'Arm', side + 'ForeArm', side + 'Hand', false);
      this.hinge(side + 'UpLeg', side + 'Leg', side + 'Foot', true);
      this.namedLink(side + 'Leg', side + 'ToeBase', 0.82, 1.03, 0.85);
      this.namedLink('Hips', side + 'Leg', 0.88, 1.16, 0.55);
    }
    for (const limb of this.nodes.filter(
      (n) => n.name.includes('ForeArm') || n.name.includes('Hand'),
    ))
      for (const body of this.nodes.filter((n) =>
        ['Hips', 'Spine', 'Spine2', 'Head'].includes(n.name),
      ))
        this.selfContacts.push([limb, body]);
    for (const part of ['Leg', 'Foot'])
      this.selfContacts.push([
        this.nodes.find((n) => n.name === 'Left' + part)!,
        this.nodes.find((n) => n.name === 'Right' + part)!,
      ]);
    const direction = new T.Vector3(g.hitDirection.x, 0, g.hitDirection.z);
    const right = new T.Vector3(Math.cos(g.yaw), 0, -Math.sin(g.yaw));
    // Momentum is localized: pelvis gives way, chest reacts, hands/head lag behind.
    for (const n of this.nodes) {
      const upper = n.p.y > 1.05;
      const speed = upper ? 0.65 : 0.12;
      const v = direction.clone().multiplyScalar(speed);
      if (g.deathAction === 'spin' && upper) {
        const hips = this.nodes[0].p;
        const sign = g.hitSide < 0 ? -1 : 1;
        v.x += (n.p.z - hips.z) * 2.2 * sign;
        v.z -= (n.p.x - hips.x) * 2.2 * sign;
      }
      if (n.name === 'Hips')
        v.y =
          g.deathAction === 'kneel'
            ? -1
            : g.deathAction === 'fold'
              ? -0.8
              : -0.45;
      if (n.name.endsWith('Hand')) {
        v.y = g.deathAction === 'reel' ? 0.9 : 0.15;
        v.addScaledVector(
          right,
          (n.name.startsWith('Left') ? 0.5 : -0.35) *
            (g.deathAction === 'sprawl' ? 2 : 1),
        );
      }
      if (n.name.endsWith('Leg')) v.addScaledVector(direction, -0.25);
      n.old.addScaledVector(v, -STEP);
    }
    this.impulse(g);
  }
  private hinge(a: string, b: string, c: string, knee: boolean) {
    const first = this.nodes.find((n) => n.name === a)!,
      joint = this.nodes.find((n) => n.name === b)!,
      last = this.nodes.find((n) => n.name === c)!;
    const length = first.p.distanceTo(joint.p) + joint.p.distanceTo(last.p);
    this.links.push({
      a: first,
      b: last,
      min: length * 0.18,
      max: length * 1.001,
      stiffness: 0.9,
    });
    if (knee) this.knees.push([first, joint, last]);
  }
  private bodyFrame(n: Node) {
    const upper = n.name !== 'Hips';
    const left = this.nodes.find(
      (p) => p.name === (upper ? 'LeftArm' : 'LeftUpLeg'),
    )!;
    const right = this.nodes.find(
      (p) => p.name === (upper ? 'RightArm' : 'RightUpLeg'),
    )!;
    const up = n.child!.p.clone().sub(n.p).normalize();
    const across = left.p.clone().sub(right.p);
    across.addScaledVector(up, -across.dot(up)).normalize();
    const forward = new T.Vector3().crossVectors(across, up).normalize();
    return new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().makeBasis(across, up, forward),
    );
  }
  private link(a: Node, b: Node, min: number, max: number, stiffness: number) {
    const length = a.p.distanceTo(b.p);
    if (length > 0.001)
      this.links.push({
        a,
        b,
        min: length * min,
        max: length * max,
        stiffness,
      });
  }
  private namedLink(
    a: string,
    b: string,
    min: number,
    max: number,
    stiffness: number,
  ) {
    const x = this.nodes.find((n) => n.name === a),
      y = this.nodes.find((n) => n.name === b);
    if (x && y) this.link(x, y, min, max, stiffness);
  }
  impulse(g: Guard) {
    this.sleeping = false;
    this.quiet = 0;
    const point = new T.Vector3(g.hitPoint.x, g.hitPoint.y, g.hitPoint.z);
    let nearest = this.nodes[0];
    for (const n of this.nodes)
      if (n.p.distanceToSquared(point) < nearest.p.distanceToSquared(point))
        nearest = n;
    for (const n of this.nodes) {
      const proximity = Math.exp(-n.p.distanceToSquared(nearest.p) * 12);
      const power = g.hitPower ?? 1;
      const impulse =
        proximity * (n === nearest ? 1.25 : 0.48) +
        Math.max(0, power - 1) * (n.p.y > 0.65 ? 1 : 0.55);
      n.old.x -= g.hitDirection.x * impulse * STEP;
      n.old.z -= g.hitDirection.z * impulse * STEP;
      n.old.y -= (Math.min(0.12, impulse * 0.08) + (g.hitLift ?? 0)) * STEP;
    }
  }
  private collide(n: Node) {
    n.contact = false;
    const floor = n.radius + 0.012;
    if (n.p.y < floor) {
      n.p.y = floor;
      n.contact = true;
    }
    for (const s of this.obstacles) {
      const hx = s.w / 2,
        hy = s.h / 2,
        hz = s.d / 2;
      const x = n.p.x,
        y = n.p.y,
        z = n.p.z;
      offset.set(
        x - Math.max(s.x - hx, Math.min(s.x + hx, x)),
        y - Math.max(s.y - hy, Math.min(s.y + hy, y)),
        z - Math.max(s.z - hz, Math.min(s.z + hz, z)),
      );
      const square = offset.lengthSq();
      if (square >= n.radius * n.radius) continue;
      if (square > 0.00000001) {
        const distance = Math.sqrt(square);
        n.p.addScaledVector(offset, (n.radius - distance) / distance);
      } else {
        const gx = hx + n.radius - Math.abs(x - s.x),
          gy = hy + n.radius - Math.abs(y - s.y),
          gz = hz + n.radius - Math.abs(z - s.z);
        if (gx <= gy && gx <= gz)
          n.p.x = s.x + (x >= s.x ? 1 : -1) * (hx + n.radius);
        else if (gy <= gz) n.p.y = s.y + (y >= s.y ? 1 : -1) * (hy + n.radius);
        else n.p.z = s.z + (z >= s.z ? 1 : -1) * (hz + n.radius);
      }
      if (
        ['Hips', 'Spine', 'Spine1', 'Spine2', 'Head'].includes(n.name) &&
        n.p.distanceTo(n.old) / STEP > 0.6 &&
        this.age - this.lastWallImpact > 0.3
      ) {
        this.wallImpact = n.p.clone();
        this.lastWallImpact = this.age;
      }
      n.contact = true;
    }
  }
  update(dt: number, obstacles: Box[] = solids) {
    this.obstacles = obstacles;
    if (dt <= 0 || this.sleeping) return;
    this.accumulator += Math.min(0.05, dt);
    while (this.accumulator + 1e-9 >= STEP) {
      this.accumulator -= STEP;
      this.age += STEP;
      for (const n of this.nodes) {
        delta.subVectors(n.p, n.old).multiplyScalar(0.993);
        n.old.copy(n.p);
        n.p.add(delta);
        n.p.y -= 9.81 * STEP * STEP;
      }
      for (let iteration = 0; iteration < 10; iteration++) {
        for (const c of this.links) {
          delta.subVectors(c.b.p, c.a.p);
          const distance = delta.length();
          if (distance < 0.00001) continue;
          const target = Math.max(c.min, Math.min(c.max, distance));
          const correction =
            (((distance - target) / distance) * c.stiffness) /
            (c.a.weight + c.b.weight);
          c.a.p.addScaledVector(delta, correction * c.a.weight);
          c.b.p.addScaledVector(delta, -correction * c.b.weight);
        }
        const front = new T.Vector3(0, 0, 1).applyQuaternion(
          this.bodyFrame(this.nodes[0]),
        );
        for (const [hip, knee, ankle] of this.knees) {
          const axis = ankle.p.clone().sub(hip.p).normalize();
          const bend = front
            .clone()
            .addScaledVector(axis, -front.dot(axis))
            .normalize();
          const signed = knee.p.clone().sub(hip.p).dot(bend);
          if (signed < -0.015)
            knee.p.addScaledVector(bend, (-0.015 - signed) * 0.7);
        }
        for (const [a, b] of this.selfContacts) {
          delta.subVectors(b.p, a.p);
          const distance = delta.length(),
            minimum = (a.radius + b.radius) * 0.85;
          if (distance > 0.0001 && distance < minimum) {
            const force =
              (minimum - distance) / distance / (a.weight + b.weight);
            a.p.addScaledVector(delta, -force * a.weight);
            b.p.addScaledVector(delta, force * b.weight);
          }
        }
        for (const n of this.nodes) this.collide(n);
      }
      let speed = 0;
      for (const n of this.nodes) {
        if (n.contact) {
          n.old.x += (n.p.x - n.old.x) * 0.45;
          n.old.z += (n.p.z - n.old.z) * 0.45;
          if (n.p.y <= n.radius + 0.013) {
            if (n.name === 'Spine2' && this.age > 0.12) this.floorImpact = true;
            n.old.y = n.p.y;
          }
        }
        speed = Math.max(speed, n.p.distanceTo(n.old) / STEP);
      }
      this.quiet = speed < 0.055 ? this.quiet + STEP : 0;
      if (this.quiet > 0.45 && this.age > 0.8) {
        this.sleeping = true;
        break;
      }
    }
  }
  applyPose() {
    for (const n of this.nodes) {
      if (!n.bone.parent) continue;
      // Set translations too: physical segment endpoints stay together even through
      // branching shoulders/hips. Length constraints keep skin from stretching.
      n.bone.position.copy(n.bone.parent.worldToLocal(n.p.clone()));
      if (n.child && n.direction) {
        delta.subVectors(n.child.p, n.p).normalize();
        if (n.frameInverse)
          orientation
            .copy(this.bodyFrame(n))
            .multiply(n.frameInverse)
            .multiply(n.orientation);
        else
          orientation
            .setFromUnitVectors(n.direction, delta)
            .multiply(n.orientation);
        parentQ.copy(n.bone.parent.getWorldQuaternion(parentQ)).invert();
        n.bone.quaternion.copy(parentQ.multiply(orientation));
      } else {
        n.bone.quaternion.copy(n.restQuaternion);
      }
      n.bone.updateMatrixWorld(true);
    }
  }
  targets() {
    const targets: {
      x: number;
      y: number;
      z: number;
      r: number;
      region: HitRegion;
    }[] = [];
    for (const n of this.nodes) {
      if (n.name.includes('Toe')) continue;
      const region: HitRegion =
        n.name === 'Head'
          ? 'head'
          : n.name.includes('Leg') || n.name.includes('Foot')
            ? 'leg'
            : 'torso';
      targets.push({ x: n.p.x, y: n.p.y, z: n.p.z, r: n.radius, region });
      if (n.child && n.p.distanceTo(n.child.p) > 0.18) {
        const mid = n.p.clone().lerp(n.child.p, 0.5);
        targets.push({
          x: mid.x,
          y: mid.y,
          z: mid.z,
          r: Math.min(n.radius, n.child.radius),
          region,
        });
      }
    }
    return targets;
  }
  restore() {
    for (const n of this.nodes) {
      n.bone.position.copy(n.restPosition);
      n.bone.quaternion.copy(n.restQuaternion);
    }
  }
}

/** A damped angular kick accumulates rapid hits instead of resetting a canned flinch. */
export class GuardHitSpring {
  angle = new T.Vector3();
  velocity = new T.Vector3();
  kick(g: Guard) {
    const localZ =
      Math.sin(g.yaw) * g.hitDirection.x + Math.cos(g.yaw) * g.hitDirection.z;
    const side =
      Math.abs(g.hitSide) > 0.1 ? g.hitSide : g.hits % 2 ? 0.45 : -0.45;
    this.velocity.add(
      new T.Vector3(
        localZ * (g.hitRegion === 'torso' ? 2.8 : 1.4),
        side * 2,
        -side * 2.2,
      ),
    );
    this.velocity.clampLength(0, 7);
  }
  update(dt: number) {
    let left = Math.min(0.05, dt);
    while (left > 0) {
      const step = Math.min(STEP, left);
      left -= step;
      this.velocity
        .addScaledVector(this.angle, -90 * step)
        .multiplyScalar(Math.exp(-12 * step));
      this.angle.addScaledVector(this.velocity, step).clampLength(0, 0.55);
    }
  }
}
