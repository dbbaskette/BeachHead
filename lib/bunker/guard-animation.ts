import * as T from 'three';
import { guardReaction } from './reactions';
import { canStand, type Guard } from './simulation';
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
  deathPose?: T.Quaternion[];
  walkWeight: number;
  floorPoints: { bone: T.Object3D; radius: number }[];
  dropped?: {
    velocity: T.Vector3;
    spin: T.Vector3;
    age: number;
    settled: boolean;
    settling: number;
    restRotation?: T.Quaternion;
  };
  floorLift: number;
};
function poseArms(
  a: GuardActor,
  ready: number,
  dying: boolean,
  release: number,
) {
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
    if (dying)
      held.lerp(
        new T.Vector3(
          side * (forearm ? 0.42 : 0.36),
          forearm ? 0.55 : 0.94,
          forearm ? 0.06 : -0.015,
        ),
        release,
      );
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
) {
  const reaction = guardReaction(g);
  a.root.rotation.order = 'YXZ';
  a.root.position.set(g.x, reaction.height, g.z);
  a.root.rotation.set(reaction.pitch, g.yaw, reaction.roll, 'YXZ');
  if (g.health > 0) {
    a.deathPose = undefined;
    // Reset every authored joint before mixer/IK to prevent accumulated twists.
    for (const joint of a.joints) joint.bone.quaternion.copy(joint.rest);
    a.walkWeight +=
      ((g.moving ? 1 : 0) - a.walkWeight) * (1 - Math.exp(-frame * 10));
    a.idle.setEffectiveWeight(1 - a.walkWeight);
    a.walk.setEffectiveWeight(a.walkWeight);
    a.mixer.update(frame);
    for (const joint of a.joints) {
      if (joint.name === 'Spine') joint.bone.rotateX(reaction.fold);
      if (joint.name === 'Head') {
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
    poseArms(a, ready, false, 0);
  } else {
    if (!a.deathPose)
      a.deathPose = a.joints.map((j) => j.bone.quaternion.clone());
    const release = Math.min(1, reaction.fall * 1.8);
    a.joints.forEach((joint, index) => {
      joint.bone.quaternion
        .copy(a.deathPose![index])
        .slerp(joint.rest, release);
      if (joint.name === 'LeftUpLeg') joint.bone.rotateX(reaction.leftHip);
      if (joint.name === 'RightUpLeg') joint.bone.rotateX(reaction.rightHip);
      if (joint.name === 'LeftLeg') joint.bone.rotateX(reaction.leftKnee);
      if (joint.name === 'RightLeg') joint.bone.rotateX(reaction.rightKnee);
      if (joint.name === 'Spine') joint.bone.rotateX(reaction.fold);
      if (joint.name === 'Head') {
        joint.bone.rotateZ(reaction.headTilt);
        joint.bone.rotateY(reaction.fall * (g.id % 2 ? 0.2 : -0.2));
      }
    });
    poseArms(a, g.readiness, true, release);
    // Bound the collapsed pose against the floor using actual skeleton contacts.
    a.root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const contact of a.floorPoints)
      lowest = Math.min(
        lowest,
        contact.bone.getWorldPosition(new T.Vector3()).y - contact.radius,
      );
    a.floorLift = Number.isFinite(lowest) ? Math.max(0, 0.015 - lowest) : 0;
    a.root.position.y += a.floorLift;
    a.root.updateMatrixWorld(true);
    if (g.down > 0.12 && !a.dropped) {
      scene.attach(a.rifle);
      a.dropped = {
        velocity: new T.Vector3(
          g.hitDirection.x * 0.2 + Math.cos(g.yaw) * (g.id % 2 ? 0.6 : -0.6),
          0.05,
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
      if (!canStand(a.rifle.position.x, a.rifle.position.z, 0.18)) {
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
  a.deathPose = undefined;
  a.joints.forEach((j) => j.bone.quaternion.copy(j.rest));
  a.body.add(a.rifle);
  a.dropped = undefined;
  a.floorLift = 0;
  a.walkWeight = 0;
  a.rifle.position.set(0, 1.25, -0.35);
  a.rifle.rotation.set(0, 0, 0);
  a.flash.visible = false;
  a.idle.setEffectiveWeight(1);
  a.walk.setEffectiveWeight(0);
  a.mixer.setTime(0);
}
