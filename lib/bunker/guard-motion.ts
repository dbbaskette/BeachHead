import * as T from 'three';
import { assetUrl } from '../asset-url';
import { PELVIS_HEIGHT } from './reactions';
import { angleDifference, type Box, type Guard } from './simulation';
import type { GuardActor } from './guard-animation';
import { GuardHitSpring } from './ragdoll';

const _gmVecA = new T.Vector3();
const _gmVecB = new T.Vector3();
const _gmVecC = new T.Vector3();
const _gmOrigin = new T.Vector3();
const _gmUp = new T.Vector3(0, 1, 0);
const _gmMat = new T.Matrix4();
const _gmQuatA = new T.Quaternion();
const _gmQuatB = new T.Quaternion();

const SUPPORT_CLEARANCES: ReadonlyArray<readonly [string, number]> = [
  ['LeftFoot', 0.075],
  ['RightFoot', 0.075],
  ['LeftToeBase', 0.075],
  ['RightToeBase', 0.075],
  ['Head', 0.13],
  ['Spine2', 0.13],
];

const TARGET_NAMES = [
  'Head',
  'Spine',
  'Spine2',
  'Hips',
  'LeftArm',
  'RightArm',
  'LeftForeArm',
  'RightForeArm',
  'LeftUpLeg',
  'RightUpLeg',
  'LeftLeg',
  'RightLeg',
  'LeftFoot',
  'RightFoot',
] as const;

export async function loadGuardMotions() {
  const response = await fetch(assetUrl('/models/bunker/guard-motions.json'));
  if (!response.ok)
    throw new Error(`Guard animation load failed (${response.status})`);
  const data = (await response.json()) as {
    clips: Parameters<typeof T.AnimationClip.parse>[0][];
  };
  return data.clips.map((c) => T.AnimationClip.parse(c));
}

/** Authored locomotion and loss of balance. Bone offsets always remain intact. */
export class GuardMotion {
  private actions = new Map<string, T.AnimationAction>();
  private active?: T.AnimationAction;
  private previous?: { x: number; z: number; yaw: number };
  private hitSeen = 0;
  private kick = new GuardHitSpring();
  private dead = false;
  private hipsBone!: T.Object3D;
  private spine2Bone?: T.Object3D;
  private headBone?: T.Object3D;
  private rightHandBone!: T.Object3D;
  private leftHandBone!: T.Object3D;
  private supportBones: { bone: T.Object3D; clearance: number }[] = [];
  private obstacleBones: T.Object3D[] = [];
  private targetSpecs: {
    bone: T.Object3D;
    childBone?: T.Object3D;
    r: number;
    region: 'head' | 'leg' | 'torso';
  }[] = [];
  private rest: {
    bone: T.Object3D;
    position: T.Vector3;
    quaternion: T.Quaternion;
  }[] = [];
  private pose: {
    bone: T.Object3D;
    position: T.Vector3;
    quaternion: T.Quaternion;
  }[] = [];
  floorImpact = false;
  get settled(): boolean {
    return (
      this.dead &&
      this.active !== undefined &&
      this.active.time >= this.active.getClip().duration - 1e-4 &&
      this.active.getEffectiveWeight() >= 0.999
    );
  }
  constructor(
    private actor: GuardActor,
    clips: T.AnimationClip[],
  ) {
    actor.model.traverse((bone) => {
      if (bone instanceof T.Bone)
        this.rest.push({
          bone,
          position: bone.position.clone(),
          quaternion: bone.quaternion.clone(),
        });
    });
    this.pose = this.rest.map((r) => ({
      bone: r.bone,
      position: r.position.clone(),
      quaternion: r.quaternion.clone(),
    }));
    this.hipsBone = actor.model.getObjectByName('Hips')!;
    this.spine2Bone = actor.model.getObjectByName('Spine2');
    this.headBone = actor.model.getObjectByName('Head');
    this.rightHandBone = actor.model.getObjectByName('RightHand')!;
    this.leftHandBone = actor.model.getObjectByName('LeftHand')!;
    for (const [name, clearance] of SUPPORT_CLEARANCES) {
      const bone = actor.model.getObjectByName(name);
      if (bone) this.supportBones.push({ bone, clearance });
    }
    for (const name of ['Hips', 'Spine2', 'Head']) {
      const bone = actor.model.getObjectByName(name);
      if (bone) this.obstacleBones.push(bone);
    }
    for (const name of TARGET_NAMES) {
      const bone = actor.model.getObjectByName(name)!;
      const region =
        name === 'Head' ? 'head' : /Leg|Foot/.test(name) ? 'leg' : 'torso';
      const r =
        name === 'Head'
          ? 0.14
          : name.includes('Arm')
            ? 0.09
            : /Leg|Foot/.test(name)
              ? 0.105
              : 0.17;
      const childBone = bone.children.find((child) => child instanceof T.Bone);
      this.targetSpecs.push({ bone, childBone, r, region });
    }
    for (const clip of clips)
      this.actions.set(clip.name, actor.mixer.clipAction(clip));
    actor.idle.stop();
    actor.walk.stop();
  }
  private choose(name: string, once = false) {
    const next = this.actions.get(name);
    if (!next || this.active === next) return;
    const old = this.active;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(once ? T.LoopOnce : T.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (old) next.crossFadeFrom(old, once ? 0.12 : 0.18, false);
    this.active = next;
  }
  update(g: Guard, dt: number, obstacles: Box[]) {
    if (this.settled && g.bodyTargets) {
      this.previous = { x: g.x, z: g.z, yaw: g.yaw };
      return;
    }
    const a = this.actor;
    if (!this.dead && g.health <= 0) {
      this.dead = true;
      const name =
        g.hitRegion === 'head' || g.deathAction === 'reel'
          ? 'death from front headshot'
          : g.deathAction === 'spin' || g.deathAction === 'sprawl'
            ? 'death from right'
            : g.deathAction === 'fold'
              ? 'death from the back'
              : 'death from the front';
      this.choose(name, true);
    }
    if (!this.dead) {
      a.root.position.set(g.x, PELVIS_HEIGHT, g.z);
      a.root.rotation.set(0, g.yaw, 0, 'YXZ');
      let name = g.readiness > 0.45 ? 'idle aiming' : 'idle';
      if (g.moving) {
        const dx = this.previous ? g.x - this.previous.x : -Math.sin(g.yaw),
          dz = this.previous ? g.z - this.previous.z : -Math.cos(g.yaw);
        const forward = -Math.sin(g.yaw) * dx - Math.cos(g.yaw) * dz;
        const side = Math.cos(g.yaw) * dx - Math.sin(g.yaw) * dz;
        name =
          Math.abs(side) > Math.abs(forward) * 1.2
            ? side > 0
              ? 'walk right'
              : 'walk left'
            : forward < 0
              ? 'walk backward'
              : 'walk forward';
      } else if (this.previous && dt > 0) {
        const turn = angleDifference(g.yaw, this.previous.yaw) / dt;
        if (Math.abs(turn) > 0.3)
          name = turn > 0 ? 'turn 90 left' : 'turn 90 right';
      }
      this.choose(name);
      if (g.hits !== this.hitSeen) this.kick.kick(g);
      this.kick.update(dt);
      this.hitSeen = g.hits;
    }
    // Restore authored offsets before mixing (including after floor support).
    for (const rest of this.pose) {
      rest.bone.position.copy(rest.position);
      rest.bone.quaternion.copy(rest.quaternion);
    }
    a.mixer.update(dt);
    for (const pose of this.pose) {
      pose.position.copy(pose.bone.position);
      pose.quaternion.copy(pose.bone.quaternion);
    }
    if (!this.dead) {
      this.spine2Bone?.rotateX(this.kick.angle.x * 0.3 - g.flash * 0.12);
      this.spine2Bone?.rotateZ(this.kick.angle.z * 0.3);
      this.headBone?.rotateY(g.headYaw);
    }
    a.root.updateMatrixWorld(true);
    const hip = this.hipsBone;
    // Retargeted body proportions differ from Mixamo's mannequin. Correct only
    // the pelvis height rather than stretching any leg or foot to the floor.
    let support = 0;
    for (const entry of this.supportBones) {
      support = Math.max(
        support,
        entry.clearance - entry.bone.getWorldPosition(_gmVecA).y,
      );
    }
    if (support > 0) {
      const p = hip.getWorldPosition(_gmVecA);
      p.y += support;
      hip.position.copy(hip.parent!.worldToLocal(p));
      hip.updateMatrixWorld(true);
    }
    if (!this.dead) this.holdRifle(g);
    else {
      // Keep authored root motion clear of solid walls and closed doors.
      for (const bone of this.obstacleBones) {
        const p = bone.getWorldPosition(_gmVecA);
        for (const box of obstacles) {
          if (p.y < box.y - box.h / 2 - 0.14 || p.y > box.y + box.h / 2 + 0.14)
            continue;
          const dx = p.x - box.x,
            dz = p.z - box.z;
          const ox = box.w / 2 + 0.17 - Math.abs(dx),
            oz = box.d / 2 + 0.17 - Math.abs(dz);
          if (ox > 0 && oz > 0) {
            if (ox < oz) a.root.position.x += (dx < 0 ? -1 : 1) * ox;
            else a.root.position.z += (dz < 0 ? -1 : 1) * oz;
            a.root.updateMatrixWorld(true);
            bone.getWorldPosition(p);
          }
        }
      }
      if (this.spine2Bone) {
        this.floorImpact ||= this.spine2Bone.getWorldPosition(_gmVecA).y < 0.28;
      }
    }
    g.bodyTargets = this.targets();
    this.previous = { x: g.x, z: g.z, yaw: g.yaw };
  }
  private holdRifle(g: Guard) {
    const a = this.actor;
    const right = this.rightHandBone.getWorldPosition(_gmVecA);
    const left = this.leftHandBone.getWorldPosition(_gmVecB);
    const direction = _gmVecC.subVectors(left, right).normalize();
    a.rifle.position.copy(
      a.body.worldToLocal(
        right.addScaledVector(direction, 0.08 - g.flash * 0.06),
      ),
    );
    _gmQuatA.setFromRotationMatrix(_gmMat.lookAt(_gmOrigin, direction, _gmUp));
    a.body.getWorldQuaternion(_gmQuatB).invert().multiply(_gmQuatA);
    a.rifle.quaternion.copy(_gmQuatB);
  }
  private targets(): NonNullable<Guard['bodyTargets']> {
    const result: NonNullable<Guard['bodyTargets']> = [];
    for (const spec of this.targetSpecs) {
      const p = spec.bone.getWorldPosition(_gmVecA);
      result.push({
        x: p.x,
        y: p.y,
        z: p.z,
        r: spec.r,
        region: spec.region,
      });
      if (spec.childBone) {
        const end = spec.childBone.getWorldPosition(_gmVecB);
        if (end.distanceTo(p) > 0.18) {
          const mid = _gmVecC.copy(p).lerp(end, 0.5);
          result.push({
            x: mid.x,
            y: mid.y,
            z: mid.z,
            r: 0.13,
            region: spec.region,
          });
        }
      }
    }
    return result;
  }
  suspend() {
    for (const action of this.actions.values()) action.paused = true;
  }
  reset() {
    this.actor.mixer.stopAllAction();
    this.pose.forEach((p, i) => {
      p.position.copy(this.rest[i].position);
      p.quaternion.copy(this.rest[i].quaternion);
    });
    this.active = undefined;
    this.previous = undefined;
    this.dead = false;
    this.floorImpact = false;
    this.hitSeen = 0;
    this.kick = new GuardHitSpring();
    for (const r of this.rest) {
      r.bone.position.copy(r.position);
      r.bone.quaternion.copy(r.quaternion);
    }
  }
}
