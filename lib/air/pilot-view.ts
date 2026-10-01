import * as THREE from 'three';
import { hardpoint } from './flight';
import type { Aircraft } from './types';

export const PILOT_EYE = { x: 0, y: 4.4, z: 4 };
const downwardLook = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-Math.atan(179.4 / 744), 0, 0),
);
const attitude = new THREE.Euler();
/** The pilot and cockpit share an attitude, so the enclosure stays around the viewer during banking. */
export function placePilotCamera(
  camera: THREE.PerspectiveCamera,
  f: Aircraft,
  reduced: boolean,
) {
  const view = {
    ...f,
    pitch: reduced ? 0 : f.pitch,
    bank: reduced ? 0 : f.bank,
  };
  camera.position.copy(hardpoint(view, PILOT_EYE));
  attitude.set(view.pitch, -view.heading, view.bank, 'YXZ');
  camera.quaternion.setFromEuler(attitude).multiply(downwardLook);
}
