import * as T from 'three';
import { deathArmTarget, guardReaction } from './reactions';
import { canStand, fallVector, type Guard } from './simulation';
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
  contactEmitted?: boolean;
};
function poseArms(a: GuardActor, g: Guard, release: number) {
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
    if (g.health <= 0)
      held.lerp(new T.Vector3(...deathArmTarget(g, index)), release);
    else if (g.hitTime > 0) {
      const flinch = Math.sin(Math.PI * (1 - g.hitTime / 0.42));
      held.x += g.hitSide * flinch * (forearm ? 0.13 : 0.06);
      held.y -= flinch * (g.hitRegion === 'leg' ? 0.18 : 0.08);
      held.z += flinch * (forearm ? 0.12 : 0.06);
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
) {
  const reaction = guardReaction(g);
  a.root.rotation.order = 'YXZ';
  const direction = fallVector(g);
  a.root.position.set(
    g.x + direction.x * reaction.travel,
    reaction.height,
    g.z + direction.z * reaction.travel,
  );
  a.root.rotation.set(
    reaction.pitch,
    g.yaw + reaction.yaw,
    reaction.roll,
    'YXZ',
  );
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
      if (joint.name === 'Spine') {
        joint.bone.rotateX(reaction.fold);
        joint.bone.rotateY(reaction.twist);
      }
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
    poseArms(a, g, 0);
  } else {
    if (!a.deathPose)
      a.deathPose = a.joints.map((j) => j.bone.quaternion.clone());
    const release = reaction.armRelease;
    a.joints.forEach((joint, index) => {
      joint.bone.quaternion
        .copy(a.deathPose![index])
        .slerp(joint.rest, release);
      if (joint.name === 'LeftUpLeg') joint.bone.rotateX(reaction.leftHip);
      if (joint.name === 'RightUpLeg') joint.bone.rotateX(reaction.rightHip);
      if (joint.name === 'LeftUpLeg') joint.bone.rotateZ(reaction.spread);
      if (joint.name === 'RightUpLeg')
        joint.bone.rotateZ(-reaction.spread * 0.75);
      if (joint.name === 'LeftLeg') joint.bone.rotateX(reaction.leftKnee);
      if (joint.name === 'RightLeg') joint.bone.rotateX(reaction.rightKnee);
      if (joint.name === 'Spine') {
        joint.bone.rotateX(reaction.fold);
        joint.bone.rotateY(reaction.twist);
      }
      if (joint.name === 'Head') {
        joint.bone.rotateZ(reaction.headTilt);
        joint.bone.rotateY(reaction.fall * (g.id % 2 ? 0.2 : -0.2));
      }
    });
    poseArms(a, g, release);
    // Keep support grounded as knees buckle, then transfer contact to hips/shoulders.
    // Correct in both directions: only lifting would leave bent legs hovering.
    a.root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const contact of a.floorPoints)
      lowest = Math.min(
        lowest,
        contact.bone.getWorldPosition(new T.Vector3()).y - contact.radius,
      );
    a.floorLift = Number.isFinite(lowest) ? 0.015 - lowest : 0;
    a.root.position.y += a.floorLift;
    a.root.updateMatrixWorld(true);
    if (g.down > (g.deathAction === 'fold' ? 0.19 : 0.06) && !a.dropped) {
      scene.attach(a.rifle);
      a.dropped = {
        velocity: new T.Vector3(
          g.hitDirection.x * 0.2 + Math.cos(g.yaw) * (g.id % 2 ? 0.6 : -0.6),
          g.deathAction === 'reel' ? 1.1 : 0.3,
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
  a.contactEmitted = false;
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
