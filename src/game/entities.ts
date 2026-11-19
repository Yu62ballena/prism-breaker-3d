import * as THREE from 'three';
import type { SkinDef } from './types';

export type EnemyKind = 'swarm' | 'charger' | 'turret' | 'splitter' | 'mini' | 'jackpot' | 'boss';

export interface PlayerRig {
  root: THREE.Group;
  core: THREE.Mesh;
  ring: THREE.Mesh;
  dashCone: THREE.Mesh;
  auraRing: THREE.Mesh;
  primaryMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
}

export function createPlayerRig(skin: SkinDef): PlayerRig {
  const root = new THREE.Group();

  const primaryMat = new THREE.MeshStandardMaterial({
    color: skin.primary,
    emissive: skin.primary,
    emissiveIntensity: 1.5,
    roughness: 0.18,
    metalness: 0.75,
  });

  const secondaryMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    emissive: skin.secondary,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.9,
  });

  const accentMat = new THREE.MeshStandardMaterial({
    color: skin.accent,
    emissive: skin.accent,
    emissiveIntensity: 1.9,
    roughness: 0.2,
    metalness: 0.6,
  });

  // Central crystalline hull
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.68, 0), primaryMat);
  core.scale.set(0.95, 0.75, 1.45);
  core.position.y = 0.85;
  root.add(core);

  // Swept delta wings (left & right)
  const wingGeo = new THREE.BoxGeometry(0.9, 0.14, 0.95);
  const leftWing = new THREE.Mesh(wingGeo, secondaryMat);
  leftWing.position.set(-0.72, 0.75, 0.22);
  leftWing.rotation.set(0, 0.42, -0.22);
  root.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, secondaryMat);
  rightWing.position.set(0.72, 0.75, 0.22);
  rightWing.rotation.set(0, -0.42, 0.22);
  root.add(rightWing);

  // Spinning gyro-ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.075, 10, 32), accentMat);
  ring.position.y = 0.85;
  ring.rotation.x = Math.PI / 2.2;
  root.add(ring);

  // Ground aura halo
  const auraGeo = new THREE.RingGeometry(0.92, 1.15, 32);
  auraGeo.rotateX(-Math.PI / 2);
  const auraMat = new THREE.MeshBasicMaterial({
    color: skin.primary,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const auraRing = new THREE.Mesh(auraGeo, auraMat);
  auraRing.position.y = 0.08;
  root.add(auraRing);

  // Energy spear cone (flares dramatically during Dash-Smash!)
  const coneGeo = new THREE.ConeGeometry(1.1, 2.8, 6, 1, true);
  coneGeo.rotateX(-Math.PI / 2);
  const coneMat = new THREE.MeshBasicMaterial({
    color: skin.primary,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const dashCone = new THREE.Mesh(coneGeo, coneMat);
  dashCone.position.set(0, 0.85, -0.75);
  root.add(dashCone);

  return { root, core, ring, dashCone, auraRing, primaryMat, accentMat };
}

export function applyPlayerSkin(rig: PlayerRig, skin: SkinDef): void {
  rig.primaryMat.color.setHex(skin.primary);
  rig.primaryMat.emissive.setHex(skin.primary);
  rig.accentMat.color.setHex(skin.accent);
  rig.accentMat.emissive.setHex(skin.accent);
  (rig.auraRing.material as THREE.MeshBasicMaterial).color.setHex(skin.primary);
  (rig.dashCone.material as THREE.MeshBasicMaterial).color.setHex(skin.primary);
}

export function createEnemyMesh(kind: EnemyKind): {
  group: THREE.Group;
  color: number;
  radius: number;
  mainMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();

  if (kind === 'swarm') {
    const color = 0xff4d6d;
    const mainMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.35,
      roughness: 0.25,
      metalness: 0.7,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), mainMat);
    body.position.y = 0.85;
    group.add(body);
    const crown = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshBasicMaterial({ color: 0xffc2d1 })
    );
    crown.position.y = 1.55;
    group.add(crown);
    return { group, color, radius: 0.85, mainMat };
  }

  if (kind === 'charger') {
    const color = 0xff00aa;
    const mainMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.65,
      roughness: 0.15,
      metalness: 0.85,
    });
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.75, 2.0, 4), mainMat);
    spear.rotation.x = Math.PI / 2;
    spear.position.y = 0.9;
    group.add(spear);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.08, 8, 16),
      new THREE.MeshBasicMaterial({ color: 0xffb3ec })
    );
    ring.position.y = 0.9;
    group.add(ring);
    return { group, color, radius: 0.95, mainMat };
  }

  if (kind === 'turret') {
    const color = 0xa855f7;
    const mainMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.5,
      roughness: 0.2,
      metalness: 0.8,
    });
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 1.85, 6), mainMat);
    pillar.position.y = 1.05;
    group.add(pillar);

    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ color: 0xf0abfc })
    );
    orb.position.y = 2.35;
    group.add(orb);
    return { group, color, radius: 1.05, mainMat };
  }

  if (kind === 'splitter') {
    const color = 0x38ef7d;
    const mainMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.3,
      roughness: 0.25,
      metalness: 0.65,
    });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.45, 1.45), mainMat);
    cube.position.y = 1.05;
    group.add(cube);

    const cage = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 1.75, 1.75),
      new THREE.MeshBasicMaterial({ color: 0x86efac, wireframe: true })
    );
    cage.position.y = 1.05;
    group.add(cage);
    return { group, color, radius: 1.25, mainMat };
  }

  if (kind === 'mini') {
    const color = 0x4ade80;
    const mainMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.5,
      roughness: 0.25,
      metalness: 0.6,
    });
    const mini = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), mainMat);
    mini.position.y = 0.65;
    group.add(mini);
    return { group, color, radius: 0.62, mainMat };
  }

  if (kind === 'jackpot') {
    const color = 0xffd700;
    const mainMat = new THREE.MeshStandardMaterial({
      color: 0xffe44d,
      emissive: 0xffaa00,
      emissiveIntensity: 2.3,
      roughness: 0.1,
      metalness: 1.0,
    });
    const gem = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), mainMat);
    gem.position.y = 1.55;
    group.add(gem);

    const halo1 = new THREE.Mesh(
      new THREE.TorusGeometry(1.9, 0.1, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xfff3a1, toneMapped: false })
    );
    halo1.position.y = 1.55;
    group.add(halo1);

    const halo2 = new THREE.Mesh(
      new THREE.TorusGeometry(2.25, 0.07, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffae00, toneMapped: false })
    );
    halo2.position.y = 1.55;
    halo2.rotation.x = Math.PI / 2;
    group.add(halo2);

    // Tall vertical beacon beam so the player spots the Jackpot instantly!
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.6, 16, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd700,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    beam.position.y = 8;
    group.add(beam);

    return { group, color, radius: 1.5, mainMat };
  }

  // BOSS: PRISM TITAN
  const color = 0xff2a55;
  const mainMat = new THREE.MeshStandardMaterial({
    color: 0xff1e56,
    emissive: 0xff0044,
    emissiveIntensity: 1.9,
    roughness: 0.15,
    metalness: 0.9,
  });
  const titanCore = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25, 0), mainMat);
  titanCore.position.y = 2.5;
  group.add(titanCore);

  const shieldMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    emissive: 0xff5500,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.9,
  });
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.4, 0.45), shieldMat);
    plate.position.set(Math.cos(angle) * 3.1, 2.5, Math.sin(angle) * 3.1);
    plate.rotation.y = -angle + Math.PI / 2;
    group.add(plate);
  }
  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(3.5, 0.16, 10, 48),
    new THREE.MeshBasicMaterial({ color: 0xffb703, toneMapped: false })
  );
  crown.position.y = 2.5;
  crown.rotation.x = Math.PI / 2;
  group.add(crown);

  return { group, color, radius: 2.8, mainMat };
}

export function createGemMesh(value: 'xp' | 'gold' | 'heal'): THREE.Mesh {
  if (value === 'gold') {
    const geo = new THREE.OctahedronGeometry(0.45, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffd700).multiplyScalar(1.8),
      toneMapped: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.65;
    return m;
  }
  if (value === 'heal') {
    const geo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x38ef7d).multiplyScalar(1.9),
      toneMapped: false,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.7;
    return m;
  }
  const geo = new THREE.OctahedronGeometry(0.32, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0x00f5ff).multiplyScalar(1.5),
    toneMapped: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = 0.55;
  return m;
}
