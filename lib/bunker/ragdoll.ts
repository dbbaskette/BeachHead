import * as T from 'three';
import { fallModel, fallPose, type FallModel } from './fall-motion';
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
  stepStart: T.Vector3;
  predicted: T.Vector3;
  radius: number;
  weight: number;
  orientation: T.Quaternion;
  restPosition: T.Vector3;
  restQuaternion: T.Quaternion;
  child?: Node;
  direction?: T.Vector3;
  frameInverse?: T.Quaternion;
  limbFrameInverse?: T.Quaternion;
  contact: boolean;
  parent?: Node;
};
type Link = { a: Node; b: Node; min: number; max: number; stiffness: number };
const WALL_IMPACT_NAMES = new Set([
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Head',
]);
const FLOOR_IMPACT_NAMES = new Set(['Hips', 'Spine1', 'Spine2', 'Head']);
const offset = new T.Vector3(),
  delta = new T.Vector3(),
  orientation = new T.Quaternion(),
  parentQ = new T.Quaternion(),
  _fUp = new T.Vector3(),
  _fAcross = new T.Vector3(),
  _fFwd = new T.Vector3(),
  _fMat = new T.Matrix4(),
  _impPoint = new T.Vector3(),
  _dlLeanTarget = new T.Vector3(),
  _dlDriveTarget = new T.Vector3(),
  _dlDriveCorr = new T.Vector3(),
  _dlDir = new T.Vector3(),
  _dlFootTarget = new T.Vector3(),
  _jlProx = new T.Vector3(),
  _jlBend = new T.Vector3(),
  _jlDistal = new T.Vector3(),
  _jlDir = new T.Vector3(),
  _jlCorr = new T.Vector3(),
  _jlPole = new T.Vector3(),
  _jlThigh = new T.Vector3(),
  _jlArm = new T.Vector3(),
  _uVel = new T.Vector3(),
  _uCenterVel = new T.Vector3(),
  _uDiff = new T.Vector3(),
  _apProx = new T.Vector3(),
  _apParentPos = new T.Vector3(),
  _apUp = new T.Vector3(),
  _apAcross = new T.Vector3(),
  _apRightArm = new T.Vector3(),
  _apLeftArm = new T.Vector3(),
  _apPole = new T.Vector3(),
  _apWorld = new T.Vector3(),
  _apQuat = new T.Quaternion(),
  _tgPos = new T.Vector3(),
  _tgChild = new T.Vector3(),
  _tgMid = new T.Vector3(),
  _ksVec = new T.Vector3();
/** Small fixed-step position-based ragdoll. Skeleton segments keep their lengths;
 * joint limits and torso bracing constrain the motion, not a whole-body fall curve. */
export class GuardRagdoll {
  readonly nodes: Node[] = [];
  private links: Link[] = [];
  private selfContacts: [Node, Node][] = [];
  private knees: [Node, Node, Node][] = [];
  private kneeChords: { link: Link; length: number }[] = [];
  private limbs: {
    shoulder: Node;
    elbow: Node;
    hand: Node;
    hip: Node;
    knee: Node;
    foot: Node;
    toe: Node;
    upperArm: number;
    lowerArm: number;
    thigh: number;
    shin: number;
    side: number;
    support: T.Vector3;
  }[] = [];
  readonly model: FallModel;
  private blast: boolean;
  private direction: T.Vector3;
  private leading: number;
  private lean: T.Vector3;
  private trunkLength = 0;
  private accumulator = 0;
  private quiet = 0;
  age = 0;
  sleeping = false;
  floorImpact = false;
  wallImpact?: T.Vector3;
  private lastWallImpact = -1;
  private obstacles: Box[] = solids;
  private nearbyObstacles: Box[] = [];
  private hipsNode!: Node;
  private spine2Node!: Node;
  private leftArmNode!: Node;
  private rightArmNode!: Node;
  private leftUpLegNode!: Node;
  private rightUpLegNode!: Node;
  constructor(model: T.Object3D, g: Guard) {
    this.model = fallModel(g);
    this.blast = g.hitLift > 0.7;
    this.direction = new T.Vector3(
      g.hitDirection.x,
      0,
      g.hitDirection.z,
    ).normalize();
    this.leading = g.hitSide < 0 ? -1 : g.hitSide > 0 ? 1 : g.id % 2 ? 1 : -1;
    const forward = new T.Vector3(-Math.sin(g.yaw), 0, -Math.cos(g.yaw));
    const side = new T.Vector3(
      Math.cos(g.yaw),
      0,
      -Math.sin(g.yaw),
    ).multiplyScalar(this.leading);
    this.lean =
      this.model === 'backward-stumble'
        ? this.direction.clone()
        : this.model === 'knee-buckle'
          ? forward.addScaledVector(side, 0.25).normalize()
          : side.addScaledVector(this.direction, 0.25).normalize();
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
        stepStart: p.clone(),
        predicted: p.clone(),
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
      n.parent = parent;
      if (parent) this.link(parent, n, 1, 1, 1);
      n.child = this.nodes.find((x) => x.bone.parent === n.bone);
      if (n.child) n.direction = n.child.p.clone().sub(n.p).normalize();
    }
    const byName = new Map(this.nodes.map((n) => [n.name, n]));
    this.hipsNode = byName.get('Hips')!;
    this.spine2Node = byName.get('Spine2')!;
    this.leftArmNode = byName.get('LeftArm')!;
    this.rightArmNode = byName.get('RightArm')!;
    this.leftUpLegNode = byName.get('LeftUpLeg')!;
    this.rightUpLegNode = byName.get('RightUpLeg')!;
    for (const n of this.nodes)
      if (n.name === 'Hips' || n.name.startsWith('Spine'))
        n.frameInverse = this.bodyFrame(n).invert();
    for (const n of this.nodes)
      if (n.child && /^(Left|Right)(UpLeg|Leg|Arm|ForeArm)$/.test(n.name))
        n.limbFrameInverse = this.limbFrame(n).invert();
    this.trunkLength = this.spine2Node.p.distanceTo(this.hipsNode.p);
    // Ribcage and pelvis retain their shape. The old loose spinal chain could
    // compress to 65% of its length, producing the "noodle" silhouette.
    for (const cluster of [
      [
        'Spine1',
        'Spine2',
        'Neck',
        'LeftShoulder',
        'RightShoulder',
        'LeftArm',
        'RightArm',
      ],
      ['Hips', 'Spine', 'LeftUpLeg', 'RightUpLeg'],
    ])
      for (let i = 0; i < cluster.length; i++)
        for (let j = i + 1; j < cluster.length; j++)
          this.namedLink(cluster[i], cluster[j], 0.995, 1.005, 1);
    for (const [a, b] of [
      ['Hips', 'Spine2'],
      ['Spine', 'Neck'],
      ['LeftUpLeg', 'RightArm'],
      ['RightUpLeg', 'LeftArm'],
    ])
      this.namedLink(a, b, 0.975, 1.01, 1);
    this.namedLink('Spine2', 'Head', 0.96, 1.01, 1);
    this.namedLink('LeftArm', 'Head', 0.92, 1.06, 0.9);
    this.namedLink('RightArm', 'Head', 0.92, 1.06, 0.9);
    for (const [side, sign] of [
      ['Left', -1],
      ['Right', 1],
    ] as const) {
      this.hinge(side + 'Arm', side + 'ForeArm', side + 'Hand', false);
      this.hinge(side + 'UpLeg', side + 'Leg', side + 'Foot', true);
      this.namedLink(side + 'Leg', side + 'ToeBase', 0.94, 1.01, 1);
      const get = (name: string) =>
        this.nodes.find((n) => n.name === side + name)!;
      const shoulder = get('Arm'),
        elbow = get('ForeArm'),
        hand = get('Hand'),
        hip = get('UpLeg'),
        knee = get('Leg'),
        foot = get('Foot'),
        toe = get('ToeBase');
      this.limbs.push({
        shoulder,
        elbow,
        hand,
        hip,
        knee,
        foot,
        toe,
        side: sign,
        upperArm: shoulder.p.distanceTo(elbow.p),
        lowerArm: elbow.p.distanceTo(hand.p),
        thigh: hip.p.distanceTo(knee.p),
        shin: knee.p.distanceTo(foot.p),
        support: foot.p.clone().setY(foot.radius + 0.012),
      });
    }
    for (const limb of this.nodes.filter(
      (n) => n.name.includes('ForeArm') || n.name.includes('Hand'),
    ))
      for (const body of this.nodes.filter((n) =>
        ['Hips', 'Spine', 'Spine2', 'Head'].includes(n.name),
      ))
        this.selfContacts.push([limb, body]);
    for (const limb of this.nodes.filter(
      (n) => n.name.endsWith('Leg') || n.name.includes('Foot'),
    ))
      for (const body of this.nodes.filter((n) =>
        ['Spine1', 'Spine2', 'Head'].includes(n.name),
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
      const speed = upper ? 0.48 : 0.12;
      const v = direction.clone().multiplyScalar(speed);
      if (this.model === 'side-collapse' && upper) {
        const hips = this.nodes[0].p;
        const sign = g.hitSide < 0 ? -1 : 1;
        v.x += (n.p.z - hips.z) * 0.7 * sign;
        v.z -= (n.p.x - hips.x) * 0.7 * sign;
      }
      if (n.name === 'Hips')
        v.y =
          g.deathAction === 'kneel'
            ? -1
            : g.deathAction === 'fold'
              ? -0.8
              : -0.45;
      if (n.name.endsWith('Hand')) {
        v.y = g.deathAction === 'reel' ? 0.35 : 0.1;
        v.addScaledVector(
          right,
          (n.name.startsWith('Left') ? 0.5 : -0.35) *
            (g.deathAction === 'sprawl' ? 1.2 : 1),
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
      min: length * (knee ? 0.3 : 0.28),
      max: length * 0.998,
      stiffness: 0.9,
    });
    if (knee) {
      this.knees.push([first, joint, last]);
      this.kneeChords.push({ link: this.links[this.links.length - 1], length });
    }
  }
  private bodyFrame(n: Node, out = new T.Quaternion()) {
    const upper = n.name !== 'Hips';
    const left = upper ? this.leftArmNode : this.leftUpLegNode;
    const right = upper ? this.rightArmNode : this.rightUpLegNode;
    _fUp.subVectors(n.child!.p, n.p).normalize();
    _fAcross.subVectors(left.p, right.p);
    _fAcross.addScaledVector(_fUp, -_fAcross.dot(_fUp)).normalize();
    _fFwd.crossVectors(_fAcross, _fUp).normalize();
    return out.setFromRotationMatrix(_fMat.makeBasis(_fAcross, _fUp, _fFwd));
  }
  private limbFrame(n: Node, direction?: T.Vector3, out = new T.Quaternion()) {
    if (direction) _fUp.copy(direction);
    else _fUp.subVectors(n.child!.p, n.p).normalize();
    _fAcross.subVectors(this.rightArmNode.p, this.leftArmNode.p);
    _fAcross.addScaledVector(_fUp, -_fAcross.dot(_fUp)).normalize();
    _fFwd.crossVectors(_fAcross, _fUp).normalize();
    return out.setFromRotationMatrix(_fMat.makeBasis(_fAcross, _fUp, _fFwd));
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
    if (g.hitLift > 0.7) this.blast = true;
    this.sleeping = false;
    this.quiet = 0;
    _impPoint.set(g.hitPoint.x, g.hitPoint.y, g.hitPoint.z);
    let nearest = this.nodes[0];
    for (const n of this.nodes)
      if (
        n.p.distanceToSquared(_impPoint) <
        nearest.p.distanceToSquared(_impPoint)
      )
        nearest = n;
    for (const n of this.nodes) {
      const proximity = Math.exp(-n.p.distanceToSquared(nearest.p) * 12);
      // A bullet creates a local kick. Sustained whole-body launch belongs to a blast.
      const power =
        this.blast || g.hitLift > 0.7
          ? (g.hitPower ?? 1)
          : Math.min(1.35, g.hitPower ?? 1);
      const impulse =
        proximity * (n === nearest ? 1.25 : 0.48) +
        Math.max(0, power - 1) * (n.p.y > 0.65 ? 1 : 0.55);
      n.old.x -= g.hitDirection.x * impulse * STEP;
      n.old.z -= g.hitDirection.z * impulse * STEP;
      n.old.y -=
        (Math.min(0.12, impulse * 0.08) + (g.hitLift > 0.7 ? g.hitLift : 0)) *
        STEP;
    }
  }
  private axes() {
    const left = this.limbs[0],
      right = this.limbs[1];
    _fUp.subVectors(this.spine2Node.p, this.hipsNode.p).normalize();
    _fAcross.subVectors(right.shoulder.p, left.shoulder.p);
    _fAcross.addScaledVector(_fUp, -_fAcross.dot(_fUp)).normalize();
    _fFwd.crossVectors(_fUp, _fAcross).normalize();
  }
  private driveLimbs() {
    this.axes();
    const up = _fUp,
      across = _fAcross,
      forward = _fFwd;
    const drive = (
      node: Node,
      anchor: Node,
      target: T.Vector3,
      strength: number,
    ) => {
      _dlDriveCorr
        .subVectors(target, node.p)
        .multiplyScalar(strength)
        .clampLength(0, 0.018);
      node.p.add(_dlDriveCorr);
      node.old.add(_dlDriveCorr);
      const balance = anchor.weight / node.weight;
      anchor.p.addScaledVector(_dlDriveCorr, -balance);
      anchor.old.addScaledVector(_dlDriveCorr, -balance);
    };
    if (!this.blast && this.age < 0.72) {
      const phase = Math.min(1, this.age / 0.48),
        fade = Math.min(1, (0.72 - this.age) / 0.24);
      const angle =
        phase *
        (this.model === 'side-collapse'
          ? 1.0
          : this.model === 'backward-stumble'
            ? 0.9
            : 0.62);
      _dlLeanTarget
        .set(0, Math.cos(angle), 0)
        .addScaledVector(this.lean, Math.sin(angle));
      const hips = this.hipsNode,
        chest = this.spine2Node;
      _dlDriveTarget
        .copy(hips.p)
        .addScaledVector(_dlLeanTarget, this.trunkLength);
      drive(chest, hips, _dlDriveTarget, 0.1 * fade);
    }
    for (const limb of this.limbs) {
      // Once the trunk is supported, let the unloaded forearm rotate down under
      // its weight. Pure distance projection can otherwise leave it balanced
      // upright on its elbow, especially in a side landing.
      if (this.floorImpact && this.age > 0.9) {
        if (limb.hand.p.y > limb.hand.radius + 0.025) {
          limb.hand.p.y -= 0.0024;
          limb.hand.old.y -= 0.0024;
        }
        if (limb.elbow.p.y > limb.elbow.radius + 0.025) {
          limb.elbow.p.y -= 0.0012;
          limb.elbow.old.y -= 0.0012;
        }
      }
      const pose = fallPose(this.model, this.age, limb.side === this.leading);
      const strength = (this.blast ? 0.012 : 0.055) * pose.brace;
      _dlDir
        .copy(up)
        .multiplyScalar(-Math.cos(pose.shoulder))
        .addScaledVector(forward, Math.sin(pose.shoulder))
        .addScaledVector(across, limb.side * pose.spread)
        .normalize();
      _dlDriveTarget
        .copy(limb.shoulder.p)
        .addScaledVector(_dlDir, limb.upperArm);
      drive(limb.elbow, limb.shoulder, _dlDriveTarget, strength);
      _dlDir
        .copy(up)
        .multiplyScalar(-Math.cos(pose.shoulder + pose.elbow))
        .addScaledVector(forward, Math.sin(pose.shoulder + pose.elbow))
        .addScaledVector(across, limb.side * pose.spread * 0.6)
        .normalize();
      _dlDriveTarget.copy(limb.elbow.p).addScaledVector(_dlDir, limb.lowerArm);
      drive(limb.hand, limb.elbow, _dlDriveTarget, strength * 0.8);
      _dlDir
        .copy(up)
        .multiplyScalar(-Math.cos(pose.hip))
        .addScaledVector(forward, Math.sin(pose.hip))
        .addScaledVector(across, limb.side * 0.12)
        .normalize();
      _dlDriveTarget.copy(limb.hip.p).addScaledVector(_dlDir, limb.thigh);
      drive(limb.knee, limb.hip, _dlDriveTarget, strength * 0.7);
      _dlDir
        .copy(up)
        .multiplyScalar(-Math.cos(pose.hip - pose.knee))
        .addScaledVector(forward, Math.sin(pose.hip - pose.knee))
        .normalize();
      _dlDriveTarget.copy(limb.knee.p).addScaledVector(_dlDir, limb.shin);
      drive(limb.foot, limb.knee, _dlDriveTarget, strength * 0.5);
      if (!this.blast && pose.support > 0) {
        _dlFootTarget
          .copy(limb.support)
          .addScaledVector(
            this.direction,
            pose.step * Math.min(1, this.age / 0.28),
          );
        _dlDriveCorr
          .subVectors(_dlFootTarget, limb.foot.p)
          .multiplyScalar(pose.support * 0.65)
          .clampLength(0, 0.028);
        limb.foot.p.add(_dlDriveCorr);
        limb.foot.old.add(_dlDriveCorr);
      }
    }
  }
  private jointLimits() {
    this.axes();
    const up = _fUp,
      across = _fAcross,
      forward = _fFwd;
    // Limits are measured in the moving anatomical frame, not world Euler angles.
    // Project the distal segment itself: an endpoint-distance constraint alone
    // permits a knee to orbit the hip/ankle and can turn a crouch inside out.
    const project = (
      parent: Node,
      child: Node,
      direction: T.Vector3,
      length: number,
    ) => {
      _jlCorr.copy(parent.p).addScaledVector(direction, length).sub(child.p);
      const childShare = child.weight / (parent.weight + child.weight);
      child.p.addScaledVector(_jlCorr, childShare);
      parent.p.addScaledVector(_jlCorr, -(1 - childShare));
    };
    const hinge = (
      start: Node,
      joint: Node,
      end: Node,
      length: number,
      pole: T.Vector3,
      max: number,
      min = 0.04,
    ) => {
      _jlProx.subVectors(joint.p, start.p).normalize();
      _jlBend.copy(pole).addScaledVector(_jlProx, -pole.dot(_jlProx));
      if (_jlBend.lengthSq() < 0.001) return;
      _jlBend.normalize();
      _jlDistal.subVectors(end.p, joint.p).normalize();
      const angle = T.MathUtils.clamp(
        Math.atan2(_jlDistal.dot(_jlBend), _jlDistal.dot(_jlProx)),
        min,
        max,
      );
      _jlDir
        .copy(_jlProx)
        .multiplyScalar(Math.cos(angle))
        .addScaledVector(_jlBend, Math.sin(angle));
      project(joint, end, _jlDir, length);
    };
    for (const limb of this.limbs) {
      _jlThigh.subVectors(limb.knee.p, limb.hip.p).normalize();
      // Hip extension stops at 25 degrees; flexion at 80. A fallen guard cannot
      // tuck a femur through his ribcage, even when the floor pushes on the foot.
      const flexion = T.MathUtils.clamp(
        Math.atan2(_jlThigh.dot(forward), -_jlThigh.dot(up)),
        -0.43,
        1.4,
      );
      const spread = T.MathUtils.clamp(
        Math.asin(T.MathUtils.clamp(_jlThigh.dot(across), -1, 1)),
        limb.side < 0 ? -0.45 : -0.08,
        limb.side < 0 ? 0.08 : 0.45,
      );
      _jlDir
        .copy(up)
        .multiplyScalar(-Math.cos(flexion) * Math.cos(spread))
        .addScaledVector(forward, Math.sin(flexion) * Math.cos(spread))
        .addScaledVector(across, Math.sin(spread));
      project(limb.hip, limb.knee, _jlDir, limb.thigh);
      const buckle =
        this.model === 'knee-buckle' && !this.blast
          ? fallPose(this.model, this.age, limb.side === this.leading).knee *
            Math.max(0, 1 - Math.max(0, this.age - 0.6) / 0.45)
          : 0.04;
      _jlPole.copy(forward).negate();
      hinge(
        limb.hip,
        limb.knee,
        limb.foot,
        limb.shin,
        _jlPole,
        this.model === 'knee-buckle' && this.age < 0.9 ? 2.0 : 1.65,
        Math.max(0.04, buckle),
      );
      // Shoulders can swing and abduct, but cannot pass through the chest.
      _jlArm.subVectors(limb.elbow.p, limb.shoulder.p).normalize();
      const swing = T.MathUtils.clamp(
        Math.atan2(_jlArm.dot(forward), -_jlArm.dot(up)),
        -0.75,
        2.5,
      );
      const abduction = T.MathUtils.clamp(
        Math.asin(T.MathUtils.clamp(_jlArm.dot(across) * limb.side, -1, 1)),
        0.05,
        1.4,
      );
      _jlDir
        .copy(up)
        .multiplyScalar(-Math.cos(swing) * Math.cos(abduction))
        .addScaledVector(forward, Math.sin(swing) * Math.cos(abduction))
        .addScaledVector(across, limb.side * Math.sin(abduction));
      project(limb.shoulder, limb.elbow, _jlDir, limb.upperArm);
      _jlPole.copy(forward).addScaledVector(across, limb.side * 0.2);
      hinge(limb.shoulder, limb.elbow, limb.hand, limb.lowerArm, _jlPole, 2.25);
    }
  }
  private collide(n: Node) {
    n.contact = false;
    const floor = n.radius + 0.012;
    if (n.p.y < floor) {
      n.p.y = floor;
      n.contact = true;
    }
    for (const s of this.nearbyObstacles) {
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
        WALL_IMPACT_NAMES.has(n.name) &&
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
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const n of this.nodes) {
      if (n.p.x < minX) minX = n.p.x;
      if (n.p.x > maxX) maxX = n.p.x;
      if (n.p.y < minY) minY = n.p.y;
      if (n.p.y > maxY) maxY = n.p.y;
      if (n.p.z < minZ) minZ = n.p.z;
      if (n.p.z > maxZ) maxZ = n.p.z;
    }
    const pad = 1.0;
    this.nearbyObstacles.length = 0;
    for (const s of obstacles) {
      if (
        s.x + s.w / 2 >= minX - pad &&
        s.x - s.w / 2 <= maxX + pad &&
        s.y + s.h / 2 >= minY - pad &&
        s.y - s.h / 2 <= maxY + pad &&
        s.z + s.d / 2 >= minZ - pad &&
        s.z - s.d / 2 <= maxZ + pad
      ) {
        this.nearbyObstacles.push(s);
      }
    }
    this.accumulator += Math.min(0.05, dt);
    while (this.accumulator + 1e-9 >= STEP) {
      this.accumulator -= STEP;
      this.age += STEP;
      for (const n of this.nodes) {
        n.stepStart.copy(n.p);
        delta.subVectors(n.p, n.old).multiplyScalar(0.993);
        n.old.copy(n.p);
        n.p.add(delta);
        n.p.y -= 9.81 * STEP * STEP;
      }
      if (!this.blast)
        for (const chord of this.kneeChords) {
          const release = Math.max(0, Math.min(1, (this.age - 0.38) / 0.55));
          const start = this.model === 'knee-buckle' ? 0.58 : 0.93;
          chord.link.min =
            chord.length * (start * (1 - release) + 0.68 * release);
        }
      this.driveLimbs();
      for (const n of this.nodes) n.predicted.copy(n.p);
      for (let iteration = 0; iteration < 14; iteration++) {
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
        this.jointLimits();
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
      // Constraint projection removes penetration; it must not become a spring
      // that launches the body on the next Verlet step.
      const projDamp = this.floorImpact ? 0.96 : 0.75;
      for (const n of this.nodes) {
        _uDiff.subVectors(n.p, n.predicted);
        n.old.addScaledVector(_uDiff, projDamp);
      }
      // Damp relative joint motion while retaining the body's shared momentum.
      // This removes the long, independent limb oscillation after a landing.
      _uCenterVel.set(0, 0, 0);
      for (const n of this.nodes) {
        _uDiff.subVectors(n.p, n.old);
        _uCenterVel.add(_uDiff);
      }
      _uCenterVel.divideScalar(this.nodes.length);
      const damping = this.floorImpact ? 0.32 : 0.07;
      for (const n of this.nodes) {
        _uVel.subVectors(n.p, n.old).lerp(_uCenterVel, damping);
        n.old.subVectors(n.p, _uVel);
      }
      let speed = 0;
      for (const n of this.nodes) {
        if (n.contact) {
          n.old.x += (n.p.x - n.old.x) * 0.45;
          n.old.z += (n.p.z - n.old.z) * 0.45;
          if (n.p.y <= n.radius + 0.013) {
            if (FLOOR_IMPACT_NAMES.has(n.name) && this.age > 0.12)
              this.floorImpact = true;
            n.old.y = n.p.y;
          }
        }
        speed = Math.max(speed, n.p.distanceTo(n.stepStart) / STEP);
      }
      this.quiet =
        speed < (this.floorImpact && this.age > 1.5 ? 0.12 : 0.055)
          ? this.quiet + STEP
          : 0;
      if (this.quiet > 0.45 && this.age > 0.8) {
        this.sleeping = true;
        break;
      }
    }
  }
  applyPose() {
    for (const n of this.nodes) {
      if (!n.bone.parent) continue;
      // Only the pelvis translates. Changing every joint offset deforms the bind
      // skeleton and shears the skin at the hips/shoulders, even when particle
      // distances pass their checks. Limbs rotate with their authored proportions.
      if (n.name === 'Hips') {
        _apWorld.copy(n.p);
        n.bone.position.copy(n.bone.parent.worldToLocal(_apWorld));
      } else n.bone.position.copy(n.restPosition);
      if (n.child && n.direction) {
        delta.subVectors(n.child.p, n.p).normalize();
        // The physics particles and the fixed-length rendered skeleton can
        // diverge slightly at contact. Enforce the hinge again on the actual
        // visible limb, so skinning can never turn a knee into a ball joint.
        if (/^(Left|Right)(Leg|ForeArm)$/.test(n.name)) {
          const knee = n.name.endsWith('Leg');
          n.bone.getWorldPosition(_apProx);
          n.bone.parent.getWorldPosition(_apParentPos);
          _apProx.sub(_apParentPos).normalize();
          this.spine2Node.bone.getWorldPosition(_apUp);
          this.hipsNode.bone.getWorldPosition(_apParentPos);
          _apUp.sub(_apParentPos).normalize();
          this.rightArmNode.bone.getWorldPosition(_apRightArm);
          this.leftArmNode.bone.getWorldPosition(_apLeftArm);
          _apAcross.subVectors(_apRightArm, _apLeftArm);
          _apAcross.addScaledVector(_apUp, -_apAcross.dot(_apUp)).normalize();
          _apPole.crossVectors(_apUp, _apAcross).normalize();
          if (knee) _apPole.negate();
          else
            _apPole.addScaledVector(
              _apAcross,
              n.name.startsWith('Left') ? -0.2 : 0.2,
            );
          _apPole.addScaledVector(_apProx, -_apPole.dot(_apProx)).normalize();
          const angle = T.MathUtils.clamp(
            Math.atan2(delta.dot(_apPole), delta.dot(_apProx)),
            0.04,
            knee ? 2.0 : 2.25,
          );
          delta
            .copy(_apProx)
            .multiplyScalar(Math.cos(angle))
            .addScaledVector(_apPole, Math.sin(angle));
        }
        if (n.frameInverse)
          this.bodyFrame(n, _apQuat)
            .multiply(n.frameInverse)
            .multiply(n.orientation);
        else if (n.limbFrameInverse)
          this.limbFrame(n, delta, _apQuat)
            .multiply(n.limbFrameInverse)
            .multiply(n.orientation);
        else
          _apQuat
            .setFromUnitVectors(n.direction, delta)
            .multiply(n.orientation);
        orientation.copy(_apQuat);
        parentQ.copy(n.bone.parent.getWorldQuaternion(parentQ)).invert();
        n.bone.quaternion.copy(parentQ.multiply(orientation));
      } else {
        n.bone.quaternion.copy(n.restQuaternion);
      }
      n.bone.updateMatrixWorld(true);
    }
    // Bone lengths now stay exact, so support is corrected at the pelvis instead
    // of stretching a foot or shoulder to reach its collision particle.
    let support = 0;
    for (const n of this.nodes) {
      const rendered = n.bone.getWorldPosition(_apWorld);
      support = Math.max(support, n.radius + 0.012 - rendered.y);
    }
    if (support > 0) {
      const hips = this.hipsNode;
      const world = hips.bone.getWorldPosition(_apWorld);
      world.y += support;
      hips.bone.position.copy(hips.bone.parent!.worldToLocal(world));
      hips.bone.updateMatrixWorld(true);
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
      const rendered = n.bone.getWorldPosition(_tgPos);
      targets.push({
        x: rendered.x,
        y: rendered.y,
        z: rendered.z,
        r: n.radius,
        region,
      });
      if (n.child && n.p.distanceTo(n.child.p) > 0.18) {
        const childPos = n.child.bone.getWorldPosition(_tgChild);
        const mid = _tgMid.copy(rendered).lerp(childPos, 0.5);
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
    _ksVec.set(
      localZ * (g.hitRegion === 'torso' ? 2.8 : 1.4),
      side * 2,
      -side * 2.2,
    );
    this.velocity.add(_ksVec);
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
