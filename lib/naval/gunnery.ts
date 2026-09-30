export const MIN_RANGE = 250;
export const MAX_RANGE = 1600;
export const PLAYER_MOUNT = { x: 0, y: 6, z: -8 };
export const PLAYER_GUN_PIVOT = { x: 0, y: 3.3, z: -2.5 };
export const PLAYER_BARREL_X = [-2.15, 2.15] as const;
export const PLAYER_MUZZLE_Z = -16.8;

export function rangeToElevation(range: number): number {
  const normalized =
    (Math.min(MAX_RANGE, Math.max(MIN_RANGE, range)) - MIN_RANGE) /
    (MAX_RANGE - MIN_RANGE);
  return 8 + normalized * 30;
}

/** One firing solution shared by the model and the simulation, in world coordinates. */
export function playerGunSolution(heading: number, range: number) {
  const headingRadians = (heading * Math.PI) / 180;
  const target = {
    x: Math.sin(headingRadians) * range,
    z: -Math.cos(headingRadians) * range,
  };
  // The range reticle is measured from the ship's origin; the mount is forward of it.
  const bearing = Math.atan2(
    target.x - PLAYER_MOUNT.x,
    PLAYER_MOUNT.z - target.z,
  );
  const elevation = rangeToElevation(range);
  const pitch = (elevation * Math.PI) / 180;
  const forward = { x: Math.sin(bearing), z: -Math.cos(bearing) };
  const direction = {
    x: forward.x * Math.cos(pitch),
    y: Math.sin(pitch),
    z: forward.z * Math.cos(pitch),
  };
  const origin = {
    x:
      PLAYER_MOUNT.x -
      forward.x * PLAYER_GUN_PIVOT.z -
      direction.x * PLAYER_MUZZLE_Z,
    y: PLAYER_MOUNT.y + PLAYER_GUN_PIVOT.y - direction.y * PLAYER_MUZZLE_Z,
    z:
      PLAYER_MOUNT.z -
      forward.z * PLAYER_GUN_PIVOT.z -
      direction.z * PLAYER_MUZZLE_Z,
  };
  const muzzles = PLAYER_BARREL_X.map((x) => ({
    x: origin.x + Math.cos(bearing) * x,
    y: origin.y,
    z: origin.z + Math.sin(bearing) * x,
  }));
  return { target, origin, muzzles, direction, bearing, pitch, elevation };
}
