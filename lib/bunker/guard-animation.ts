import * as T from 'three';
import type { GuardMotion } from './guard-motion';
import { guardReaction } from './reactions';
import { canStand, solids, type Box, type Guard } from './simulation';
import { GuardRagdoll, GuardHitSpring } from './ragdoll';
export type GuardActor = {
  root: T.Group;
  body: T.Group;
  model: T.Object3D;
  mixer: T.AnimationMixer;
  idle: T.AnimationAction;
  walk: T.AnimationAction;
  helmet?: T.Object3D;
  head?: T.Object3D;
  flash: T.Mesh;
  arms: (T.Object3D | undefined)[];
  rifle: T.Group;
  joints: { bone: T.Object3D; rest: T.Quaternion; name: string }[];
  ragdoll?: GuardRagdoll;
  motion?: GuardMotion;
  hitSpring?: GuardHitSpring;
  hitSeen?: number;
  walkWeight: number;
  dropped?: {
    velocity: T.Vector3;
    spin: T.Vector3;
    age: number;
    settled: boolean;
    settling: number;
    restRotation?: T.Quaternion;
  };
  contactEmitted?: boolean;
};
function poseArms(a: GuardActor, g: Guard) {
  const ready = g.readiness;
  a.root.updateMatrixWorld(true);
  for (let index = 0; index < a.arms.length; index++) {
    const bone = a.arms[index];
    if (!bone?.parent) continue;
    const side = index < 2 ? -1 : 1,
      forearm = index % 2 === 1;
    const held = new T.Vector3(
      side * (forearm ? 0.09 : 0.28),
      forearm ? 1.02 + ready * 0.23 : 0.94 + ready * 0.16,
      forearm ? -0.28 - ready * 0.12 : -0.08 - ready * 0.04,
    );
    const kick = a.hitSpring?.angle;
    if (kick) {
      held.x += kick.y * (forearm ? 0.65 : 0.25);
      held.y -= Math.abs(kick.x) * (forearm ? 0.3 : 0.12);
      held.z += kick.x * (forearm ? 0.55 : 0.2);
    }
    const target = a.body.localToWorld(held);
    const direction = target
      .sub(bone.getWorldPosition(new T.Vector3()))
      .normalize();
    const desired = new T.Quaternion().setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      direction,
    );
    const parent = bone.parent.getWorldQuaternion(new T.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(desired));
    bone.updateMatrixWorld(true);
  }
}

export function animateGuard(
  a: GuardActor,
  g: Guard,
  frame: number,
  scene: T.Scene,
  playing: boolean,
  obstacles: Box[] = solids,
) {
  if (a.motion && !a.ragdoll && g.health <= 0 && g.hitLift > 0.7) {
    a.motion.suspend();
    a.ragdoll = new GuardRagdoll(a.model, g);
    a.hitSeen = g.hits;
  }
  if (a.motion && !a.ragdoll) {
    a.motion.update(g, frame, obstacles);
  } else if (g.health > 0) {
    const reaction = guardReaction(g);
    a.hitSpring ??= new GuardHitSpring();
    if (g.hits !== (a.hitSeen ?? 0)) a.hitSpring.kick(g);
    a.hitSeen = g.hits;
    a.hitSpring.update(frame);
    const kick = a.hitSpring.angle;
    a.root.rotation.order = 'YXZ';
    a.root.position.set(g.x, reaction.height, g.z);
    a.root.rotation.set(
      reaction.pitch * 0.3,
      g.yaw,
      reaction.roll * 0.3,
      'YXZ',
    );
    // Reset every authored joint before mixer/IK to prevent accumulated twists.
    for (const joint of a.joints) joint.bone.quaternion.copy(joint.rest);
    a.walkWeight +=
      ((g.moving ? 1 : 0) - a.walkWeight) * (1 - Math.exp(-frame * 10));
    a.idle.setEffectiveWeight(1 - a.walkWeight);
    a.walk.setEffectiveWeight(a.walkWeight);
    a.mixer.update(frame);
    for (const joint of a.joints) {
      if (joint.name === 'Spine') {
        joint.bone.rotateX(reaction.fold + kick.x * 0.55);
        joint.bone.rotateY(reaction.twist + kick.y * 0.45);
        joint.bone.rotateZ(kick.z * 0.4);
      }
      if (joint.name === 'Spine2') {
        joint.bone.rotateX(kick.x * 0.55);
        joint.bone.rotateZ(kick.z * 0.55);
      }
      if (joint.name === 'Head') {
        joint.bone.rotateX(-kick.x * 0.65);
        joint.bone.rotateZ(-kick.z * 0.45);
        joint.bone.rotateY(g.headYaw);
        joint.bone.rotateX(
          -g.startle * 0.12 + (g.hitRegion === 'head' ? reaction.pitch : 0),
        );
      }
      if (joint.name.endsWith('Leg'))
        joint.bone.rotateX(
          reaction.knees * (joint.name.includes('Up') ? -1 : 1.5),
        );
    }
    const ready = g.readiness,
      recoil = g.flash / 0.14;
    a.rifle.position.set(
      0.045 * (1 - ready),
      1.02 + ready * 0.23 - reaction.knees * 0.15,
      -0.28 - ready * 0.07 + recoil * 0.035,
    );
    a.rifle.rotation.set(
      -0.42 * (1 - ready) - recoil * 0.035,
      0,
      0.08 * (1 - ready),
    );
    poseArms(a, g);
  } else {
    if (!a.ragdoll) {
      a.ragdoll = new GuardRagdoll(a.model, g);
      a.hitSeen = g.hits;
    } else if (g.hits !== a.hitSeen) {
      a.ragdoll.impulse(g);
      a.hitSeen = g.hits;
    }
    a.ragdoll.update(frame, obstacles);
    a.ragdoll.applyPose();
    g.bodyTargets = a.ragdoll.targets();
  }
  if (g.health <= 0) {
    if (!a.dropped) {
      scene.attach(a.rifle);
      a.dropped = {
        velocity: new T.Vector3(
          g.hitDirection.x * 0.2 + Math.cos(g.yaw) * (g.id % 2 ? 0.6 : -0.6),
          0.12,
          g.hitDirection.z * 0.2 - Math.sin(g.yaw) * (g.id % 2 ? 0.6 : -0.6),
        ),
        spin: new T.Vector3(1.4, g.id % 2 ? 0.8 : -0.8, 1.1),
        age: 0,
        settled: false,
        settling: 0,
      };
    }
  }
  if (a.dropped && frame > 0 && !a.dropped.settled) {
    const drop = a.dropped;
    drop.age += frame;
    if (drop.settling > 0) {
      drop.settling += frame;
      a.rifle.quaternion.slerp(drop.restRotation!, 1 - Math.exp(-frame * 24));
      if (drop.settling > 0.25) {
        a.rifle.quaternion.copy(drop.restRotation!);
        drop.settled = true;
      }
      const rest = new T.Box3().setFromObject(a.rifle);
      a.rifle.position.y += 0.018 - rest.min.y;
    } else {
      drop.velocity.y -= 9.81 * frame;
      const old = a.rifle.position.clone();
      a.rifle.position.addScaledVector(drop.velocity, frame);
      if (!canStand(a.rifle.position.x, a.rifle.position.z, 0.18, obstacles)) {
        a.rifle.position.x = old.x;
        a.rifle.position.z = old.z;
        drop.velocity.x = drop.velocity.z = 0;
      }
      a.rifle.rotation.x += drop.spin.x * frame;
      a.rifle.rotation.y += drop.spin.y * frame;
      a.rifle.rotation.z += drop.spin.z * frame;
      const bounds = new T.Box3().setFromObject(a.rifle);
      if (bounds.min.y < 0.015) {
        a.rifle.position.y += 0.015 - bounds.min.y;
        drop.velocity.set(0, 0, 0);
        drop.settling = 0.001;
        drop.restRotation = new T.Quaternion().setFromEuler(
          new T.Euler(0, a.rifle.rotation.y, Math.PI / 2),
        );
      }
    }
  }
  a.flash.visible = playing && g.health > 0 && g.flash > 0;
}

/** Retry reclaims world-space dropped equipment and restores the original rig. */
export function resetGuardActor(a: GuardActor) {
  a.ragdoll?.restore();
  a.ragdoll = undefined;
  a.hitSpring = undefined;
  a.hitSeen = 0;
  a.contactEmitted = false;
  a.joints.forEach((j) => j.bone.quaternion.copy(j.rest));
  a.body.add(a.rifle);
  a.dropped = undefined;
  a.walkWeight = 0;
  a.rifle.position.set(0, 1.25, -0.35);
  a.rifle.rotation.set(0, 0, 0);
  a.flash.visible = false;
  a.idle.setEffectiveWeight(1);
  a.walk.setEffectiveWeight(0);
  a.mixer.setTime(0);
  a.motion?.reset();
}
