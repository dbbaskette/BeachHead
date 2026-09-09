import { beachHeight } from './terrain';
import { assetUrl } from '../asset-url';
import * as THREE from 'three';

const LANES = [-36, -18, 0, 18, 36];

export type SurfaceTextureSet = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
};

export type PillboxSurfaceMaps = {
  sand: SurfaceTextureSet;
  concrete: SurfaceTextureSet;
  dispose(): void;
};

/** Load the local 1K CC0 Poly Haven PBR sets used by the beach and bunker. */
export async function createSurfaceMaps(): Promise<PillboxSurfaceMaps> {
  const loader = new THREE.TextureLoader();
  const paths = [
    assetUrl('/textures/pillbox-sand-diffuse.jpg'),
    assetUrl('/textures/pillbox-sand-normal.jpg'),
    assetUrl('/textures/pillbox-sand-roughness.jpg'),
    assetUrl('/textures/pillbox-concrete-diffuse.jpg'),
    assetUrl('/textures/pillbox-concrete-normal.jpg'),
    assetUrl('/textures/pillbox-concrete-roughness.jpg'),
  ];
  const results = await Promise.allSettled(
    paths.map((path) => loader.loadAsync(path)),
  );
  const textures = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    textures.forEach((texture) => texture.dispose());
    throw failure.reason;
  }
  if (textures.length !== paths.length) {
    textures.forEach((texture) => texture.dispose());
    throw new Error(
      'Pillbox surface texture loading returned an incomplete set.',
    );
  }
  const [
    sandMap,
    sandNormal,
    sandRough,
    concreteMap,
    concreteNormal,
    concreteRough,
  ] = textures;
  sandMap.colorSpace = concreteMap.colorSpace = THREE.SRGBColorSpace;
  for (const texture of textures) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  for (const texture of [sandMap, sandNormal, sandRough])
    texture.repeat.set(12, 32);
  for (const texture of [concreteMap, concreteNormal, concreteRough])
    texture.repeat.set(3, 2);
  return {
    sand: { map: sandMap, normalMap: sandNormal, roughnessMap: sandRough },
    concrete: {
      map: concreteMap,
      normalMap: concreteNormal,
      roughnessMap: concreteRough,
    },
    dispose: () => textures.forEach((texture) => texture.dispose()),
  };
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => (value = (value * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function offLane(x: number, clearance = 5.5) {
  return LANES.every((lane) => Math.abs(x - lane) > clearance);
}

/** Static, deterministic battlefield dressing for the Stage 2 beach. */
export class BeachDetail {
  private root = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene) {
    this.root.name = 'beach-battlefield-detail';
    scene.add(this.root);

    const random = seeded(0x19440606);
    const geometry = <T extends THREE.BufferGeometry>(value: T) => {
      this.geometries.push(value);
      return value;
    };
    const material = (parameters: THREE.MeshStandardMaterialParameters) => {
      const value = new THREE.MeshStandardMaterial(parameters);
      this.materials.push(value);
      return value;
    };
    const sandDark = material({ color: '#574936', roughness: 1 });
    const stone = material({ color: '#625f51', roughness: 0.97 });
    const concrete = material({ color: '#77766a', roughness: 1 });
    const concreteFace = material({ color: '#969184', roughness: 0.96 });
    const rust = material({
      color: '#4b3024',
      roughness: 0.8,
      metalness: 0.45,
    });
    const wood = material({ color: '#51402d', roughness: 1 });
    const grass = material({
      color: '#596044',
      roughness: 1,
      side: THREE.DoubleSide,
    });

    const rockData = Array.from({ length: 62 }, () => {
      let x = 0;
      do x = -65 + random() * 130;
      while (!offLane(x, 4.5));
      return [x, -18 - random() * 116, 0.25 + random() * 0.55] as [
        number,
        number,
        number,
      ];
    });
    this.addInstances(
      geometry(new THREE.DodecahedronGeometry(1, 1)),
      stone,
      rockData,
      ([x, z, size], object) => {
        object.position.set(x, size * 0.34, z);
        object.rotation.set(random() * 2, random() * 2, random() * 2);
        object.scale.set(
          size,
          size * (0.45 + random() * 0.35),
          size * (0.7 + random() * 0.7),
        );
      },
    );

    const rubbleData = Array.from({ length: 34 }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      return [
        side * (20 + random() * 8),
        -5 - random() * 23,
        0.35 + random() * 0.8,
      ] as [number, number, number];
    });
    this.addInstances(
      geometry(new THREE.BoxGeometry(1, 1, 1)),
      concrete,
      rubbleData,
      ([x, z, size], object) => {
        object.position.set(x, size * 0.32, z);
        object.rotation.set(
          random() * 0.7,
          random() * Math.PI,
          random() * 0.45,
        );
        object.scale.set(size * 1.6, size * 0.55, size);
      },
    );
    this.addInstances(
      geometry(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 5)),
      rust,
      rubbleData.filter((_, index) => index % 3 === 0),
      ([x, z], object) => {
        object.position.set(x, 0.55, z);
        object.rotation.set(
          0.55 + random() * 0.4,
          random() * Math.PI,
          random() * 0.5,
        );
      },
    );

    const driftwoodData: Array<[number, number, number]> = [
      [-62, -45, 5.2],
      [62, -67, 4.1],
      [-50, -111, 5.7],
      [51, -101, 3.8],
      [-12, -141, 5.2],
      [26, -136, 4.4],
    ];
    this.addInstances(
      geometry(new THREE.CylinderGeometry(0.14, 0.3, 1, 7)),
      wood,
      driftwoodData,
      ([x, z, length], object) => {
        object.position.set(x, 0.22, z);
        object.rotation.set(Math.PI / 2, random() * Math.PI, Math.PI / 2);
        object.scale.y = length;
      },
    );

    const grassData = Array.from({ length: 76 }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      const x = side * (44 + random() * 25);
      return [x, -16 - random() * 112, 0.55 + random() * 0.8] as [
        number,
        number,
        number,
      ];
    });
    const bladeGeometry = new THREE.BufferGeometry()
      .setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            -0.25, 0, 0, 0.25, 0, 0, -0.13, 0.62, 0.018, 0.13, 0.62, 0.018, 0,
            1.5, 0.07,
          ],
          3,
        ),
      )
      .setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    bladeGeometry.computeVertexNormals();
    const blade = geometry(bladeGeometry);
    for (const quarterTurn of [false, true]) {
      this.addInstances(blade, grass, grassData, ([x, z, scale], object) => {
        object.position.set(x, scale * 0.65, z);
        object.rotation.y = (quarterTurn ? Math.PI / 2 : 0) + random() * 0.35;
        object.scale.set(scale, scale, scale);
      });
    }

    // Flat, dark paired impressions suggest churned boot traffic along each route.
    const trackData: Array<[number, number, number]> = [];
    for (const lane of LANES) {
      for (let z = -126; z < -20; z += 5.8) {
        const stagger = Math.floor((z + 126) / 5.8) % 2 ? 0.45 : -0.45;
        trackData.push([
          lane + stagger,
          z + random() * 1.1,
          random() * 0.18 - 0.09,
        ]);
      }
    }
    this.addInstances(
      geometry(new THREE.CapsuleGeometry(0.16, 0.48, 2, 6)),
      sandDark,
      trackData,
      ([x, z, angle], object) => {
        object.position.set(x, 0.025, z);
        object.rotation.set(Math.PI / 2, angle, 0);
        object.scale.set(1, 1, 0.12);
      },
      false,
    );

    // Weathered repair slabs and warning placards frame the embrasure edges.
    const slabData: Array<[number, number, number]> = [
      [-13.6, 1.3, -1.8],
      [13.6, 1.3, 1.8],
      [-15.6, 0.8, -0.7],
      [15.6, 0.8, 0.7],
    ];
    this.addInstances(
      geometry(new THREE.BoxGeometry(3.8, 2.3, 0.28)),
      concreteFace,
      slabData,
      ([x, y, yaw], object) => {
        object.position.set(x, y, 1.5);
        object.rotation.y = yaw;
      },
    );
    this.addSigns(geometry, concreteFace, rust);
    this.addDust(geometry, random);
  }

  private addInstances<T>(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    data: T[],
    place: (datum: T, object: THREE.Object3D, index: number) => void,
    shadows = true,
  ) {
    const mesh = new THREE.InstancedMesh(geometry, material, data.length);
    const object = new THREE.Object3D();
    data.forEach((datum, index) => {
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.scale.set(1, 1, 1);
      place(datum, object, index);
      object.position.y += beachHeight(object.position.x, object.position.z);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    this.root.add(mesh);
  }

  private addSigns(
    geometry: <T extends THREE.BufferGeometry>(value: T) => T,
    boardMaterial: THREE.Material,
    postMaterial: THREE.Material,
  ) {
    const board = new THREE.Mesh(
      geometry(new THREE.BoxGeometry(3.2, 1.25, 0.14)),
      boardMaterial,
    );
    board.position.set(-20, 1.7, -12);
    board.rotation.set(-0.08, 0.28, -0.09);
    board.castShadow = true;
    const posts = new THREE.InstancedMesh(
      geometry(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 5)),
      postMaterial,
      2,
    );
    const dummy = new THREE.Object3D();
    [-21.1, -18.9].forEach((x, index) => {
      dummy.position.set(x, 0.85, -12);
      dummy.rotation.z = -0.09;
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
    });
    this.root.add(board, posts);
  }

  private addDust(
    geometry: <T extends THREE.BufferGeometry>(value: T) => T,
    random: () => number,
  ) {
    const positions = new Float32Array(90 * 3);
    for (let index = 0; index < 90; index++) {
      positions[index * 3] = -85 + random() * 170;
      positions[index * 3 + 1] = 0.15 + random() * 2.3;
      positions[index * 3 + 2] = -18 - random() * 125;
    }
    const pointsGeometry = geometry(new THREE.BufferGeometry());
    pointsGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    const pointsMaterial = new THREE.PointsMaterial({
      color: '#d0b985',
      size: 0.16,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.materials.push(pointsMaterial);
    this.root.add(new THREE.Points(pointsGeometry, pointsMaterial));
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    new Set(this.geometries).forEach((value) => value.dispose());
    new Set(this.materials).forEach((value) => value.dispose());
    new Set(this.textures).forEach((value) => value.dispose());
    this.root.clear();
  }
}
