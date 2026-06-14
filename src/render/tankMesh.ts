import * as THREE from 'three';

/**
 * Procedural low-poly tank built from Three.js primitives (chassis + treads +
 * rotatable turret + barrel). Avoids shipping a binary GLB while still giving a
 * proper 3D model with an independently-rotating turret. World scale: 1 unit ==
 * 1 pixel, so a tank is ~14 units wide.
 */
export interface TankMesh {
  group: THREE.Group;
  turret: THREE.Group;
  body: THREE.Mesh;
  materials: THREE.MeshStandardMaterial[];
  setColor(hex: number): void;
  setHitFlash(amount: number): void;
}

export function createTankMesh(color: number): TankMesh {
  const group = new THREE.Group();
  const materials: THREE.MeshStandardMaterial[] = [];

  const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.6 });
  const treadMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.2, roughness: 0.9 });
  const turretMat = new THREE.MeshStandardMaterial({
    color: shade(color, 1.15),
    metalness: 0.5,
    roughness: 0.5,
  });
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 });
  materials.push(bodyMat, turretMat);

  // Chassis
  const body = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 9), bodyMat);
  body.position.y = 4;
  body.castShadow = true;
  group.add(body);

  // Treads (two long boxes along the X (forward) axis)
  const treadGeo = new THREE.BoxGeometry(13, 4, 2.5);
  const treadL = new THREE.Mesh(treadGeo, treadMat);
  treadL.position.set(0, 2.5, 4.5);
  const treadR = new THREE.Mesh(treadGeo, treadMat);
  treadR.position.set(0, 2.5, -4.5);
  treadL.castShadow = true;
  treadR.castShadow = true;
  group.add(treadL, treadR);

  // Turret group (rotates independently)
  const turret = new THREE.Group();
  turret.position.y = 7;
  const turretBody = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 3.2, 10), turretMat);
  turretBody.castShadow = true;
  turret.add(turretBody);

  // Barrel points along +X (tank forward is +X).
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 11, 8), barrelMat);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(6.5, 0.4, 0);
  barrel.castShadow = true;
  turret.add(barrel);

  group.add(turret);

  let baseColor = color;
  return {
    group,
    turret,
    body,
    materials,
    setColor(hex: number) {
      baseColor = hex;
      bodyMat.color.setHex(hex);
      turretMat.color.setHex(shade(hex, 1.15));
    },
    setHitFlash(amount: number) {
      // amount 0..1: blend toward red for hit feedback.
      const c = new THREE.Color(baseColor);
      const red = new THREE.Color(0xff3030);
      c.lerp(red, Math.min(1, amount));
      bodyMat.color.copy(c);
      bodyMat.emissive.setRGB(amount * 0.6, 0, 0);
    },
  };
}

function shade(hex: number, factor: number): number {
  const c = new THREE.Color(hex);
  c.r = Math.min(1, c.r * factor);
  c.g = Math.min(1, c.g * factor);
  c.b = Math.min(1, c.b * factor);
  return c.getHex();
}
