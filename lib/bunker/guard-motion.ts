import * as T from 'three';
import { assetUrl } from '../asset-url';
import { PELVIS_HEIGHT } from './reactions';
import { angleDifference, type Box, type Guard } from './simulation';
import type { GuardActor } from './guard-animation';
import { GuardHitSpring } from './ragdoll';

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
      const chest = a.model.getObjectByName('Spine2');
      chest?.rotateX(this.kick.angle.x * 0.3 - g.flash * 0.12);
      chest?.rotateZ(this.kick.angle.z * 0.3);
      const head = a.model.getObjectByName('Head');
      head?.rotateY(g.headYaw);
    }
    a.root.updateMatrixWorld(true);
    const hip = a.model.getObjectByName('Hips')!;
    // Retargeted body proportions differ from Mixamo's mannequin. Correct only
    // the pelvis height rather than stretching any leg or foot to the floor.
    let support = 0;
    for (const name of [
      'LeftFoot',
      'RightFoot',
      'LeftToeBase',
      'RightToeBase',
      'Head',
      'Spine2',
    ]) {
      const bone = a.model.getObjectByName(name);
      if (bone)
        support = Math.max(
          support,
          (name === 'Head' ? 0.13 : name === 'Spine2' ? 0.13 : 0.075) -
            bone.getWorldPosition(new T.Vector3()).y,
        );
    }
    if (support > 0) {
      const p = hip.getWorldPosition(new T.Vector3());
      p.y += support;
      hip.position.copy(hip.parent!.worldToLocal(p));
      hip.updateMatrixWorld(true);
    }
    if (!this.dead) this.holdRifle(g);
    else {
      // Keep authored root motion clear of solid walls and closed doors.
      for (const name of ['Hips', 'Spine2', 'Head']) {
        const p = a.model
          .getObjectByName(name)!
          .getWorldPosition(new T.Vector3());
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
          }
        }
      }
      const chest = a.model
        .getObjectByName('Spine2')!
        .getWorldPosition(new T.Vector3());
      this.floorImpact ||= chest.y < 0.28;
    }
    g.bodyTargets = this.targets();
    this.previous = { x: g.x, z: g.z, yaw: g.yaw };
  }
  private holdRifle(g: Guard) {
    const a = this.actor;
    const right = a.model
      .getObjectByName('RightHand')!
      .getWorldPosition(new T.Vector3());
    const left = a.model
      .getObjectByName('LeftHand')!
      .getWorldPosition(new T.Vector3());
    const direction = left.clone().sub(right).normalize();
    a.rifle.position.copy(
      a.body.worldToLocal(
        right.clone().addScaledVector(direction, 0.08 - g.flash * 0.06),
      ),
    );
    const q = new T.Quaternion().setFromRotationMatrix(
      new T.Matrix4().lookAt(
        new T.Vector3(),
        direction,
        new T.Vector3(0, 1, 0),
      ),
    );
    a.rifle.quaternion.copy(
      a.body.getWorldQuaternion(new T.Quaternion()).invert().multiply(q),
    );
  }
  private targets(): NonNullable<Guard['bodyTargets']> {
    const result: NonNullable<Guard['bodyTargets']> = [];
    for (const name of [
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
    ]) {
      const bone = this.actor.model.getObjectByName(name)!;
      const p = bone.getWorldPosition(new T.Vector3());
      const region =
        name === 'Head' ? 'head' : /Leg|Foot/.test(name) ? 'leg' : 'torso';
      result.push({
        x: p.x,
        y: p.y,
        z: p.z,
        r:
          name === 'Head'
            ? 0.14
            : name.includes('Arm')
              ? 0.09
              : /Leg|Foot/.test(name)
                ? 0.105
                : 0.17,
        region,
      });
      const child = bone.children.find((child) => child instanceof T.Bone);
      if (child) {
        const end = child.getWorldPosition(new T.Vector3());
        if (end.distanceTo(p) > 0.18) {
          const mid = p.clone().lerp(end, 0.5);
          result.push({ x: mid.x, y: mid.y, z: mid.z, r: 0.13, region });
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
