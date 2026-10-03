import * as T from 'three';

/** Historical set dressing for the occupied bunker, built as hanging cloth. */
export function addBunkerBanners(scene: T.Scene, metal: T.Material) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 896;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#892e29';
  c.fillRect(0, 0, 512, 896);
  c.fillStyle = '#d9d1b9';
  c.beginPath();
  c.arc(256, 355, 169, 0, Math.PI * 2);
  c.fill();
  c.save();
  c.translate(256, 355);
  c.rotate(Math.PI / 4);
  c.strokeStyle = '#24231f';
  c.lineWidth = 43;
  c.lineCap = 'butt';
  c.lineJoin = 'miter';
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(0, -96);
    c.lineTo(96, -96);
    c.stroke();
    c.rotate(Math.PI / 2);
  }
  c.restore();
  // Woven fibres and faded edges, without baking directional light into the cloth.
  for (let i = 0; i < 896; i += 3) {
    c.fillStyle = i % 2 ? 'rgba(230,218,190,.055)' : 'rgba(35,25,18,.07)';
    c.fillRect(0, i, 512, 1);
  }
  for (let x = 0; x < 512; x += 3) {
    c.fillStyle = 'rgba(235,220,190,.035)';
    c.fillRect(x, 0, 1, 896);
  }
  c.strokeStyle = 'rgba(203,161,134,.48)';
  c.lineWidth = 1;
  c.setLineDash([3, 4]);
  c.strokeRect(8, 12, 496, 872);
  const color = new T.CanvasTexture(canvas);
  color.colorSpace = T.SRGBColorSpace;
  color.anisotropy = 4;
  // Independent micro-relief keeps the printed emblem flush with the fabric.
  const weave = document.createElement('canvas');
  weave.width = weave.height = 128;
  const w = weave.getContext('2d')!;
  w.fillStyle = '#808080';
  w.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    w.fillStyle = i % 4 ? '#929292' : '#727272';
    w.fillRect(i, 0, 1, 128);
    w.fillRect(0, i, 128, 1);
  }
  const bump = new T.CanvasTexture(weave);
  bump.wrapS = bump.wrapT = T.RepeatWrapping;
  bump.repeat.set(5, 9);
  const material = new T.MeshStandardMaterial({
    map: color,
    bumpMap: bump,
    bumpScale: 0.002,
    roughness: 0.96,
    side: T.DoubleSide,
  });
  const width = 1.25,
    height = 2.15;
  for (const [x, top, z, yaw, phase] of [
    [-4.35, 3.48, 2.41, 0, 0],
    [0, 3.42, -55.59, 0, 1.3],
    [19, 3.38, -12.41, Math.PI, 2.1],
  ]) {
    const group = new T.Group();
    group.name = 'Hanging historical bunker banner';
    group.position.set(x, top, z);
    group.rotation.y = yaw;
    const geometry = new T.PlaneGeometry(width, height, 32, 48);
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const u = positions.getX(i),
        v = positions.getY(i);
      const t = (height / 2 - v) / height;
      const fold =
        Math.sin(u * 19 + phase) * 0.024 + Math.sin(u * 8 - phase) * 0.013;
      const drape = Math.sin(Math.PI * (u / width + 0.5)) * 0.035;
      const hem = t > 0.97 ? Math.sin(u * 54 + phase) * 0.008 : 0;
      positions.setXYZ(
        i,
        u + Math.sin(t * 3 + phase) * 0.008 * t,
        -t * height - drape * Math.sin((t * Math.PI) / 2) + hem,
        0.05 + fold * (0.35 + t * 0.65) + t * t * 0.018,
      );
    }
    geometry.computeVertexNormals();
    const cloth = new T.Mesh(geometry, material);
    cloth.castShadow = cloth.receiveShadow = true;
    group.add(cloth);
    const rod = new T.Mesh(
      new T.CylinderGeometry(0.019, 0.019, width + 0.16, 16),
      metal,
    );
    rod.rotation.z = Math.PI / 2;
    rod.position.set(0, 0.025, 0.06);
    rod.castShadow = true;
    group.add(rod);
    for (const side of [-1, 1]) {
      const cap = new T.Mesh(new T.SphereGeometry(0.029, 12, 8), metal);
      cap.position.set(side * (width / 2 + 0.08), 0.025, 0.06);
      group.add(cap);
      const bracket = new T.Mesh(
        new T.CylinderGeometry(0.031, 0.031, 0.12, 12),
        metal,
      );
      bracket.rotation.x = Math.PI / 2;
      bracket.position.set(side * (width / 2 - 0.04), 0.025, 0);
      group.add(bracket);
    }
    scene.add(group);
  }
}
