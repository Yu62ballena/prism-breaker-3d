import * as THREE from 'three';

interface VoxelParticle {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
  life: number;
  maxLife: number;
  color: THREE.Color;
  gravity: number;
  bounce: boolean;
}

interface ShockwaveRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  maxScale: number;
}

interface LightningBolt {
  line: THREE.Line;
  life: number;
  maxLife: number;
}

interface GhostTrail {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

const MAX_VOXELS = 900;

export class ParticleSystem {
  public readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private particles: VoxelParticle[] = [];
  private cursor = 0;
  private dummy = new THREE.Object3D();

  private shockwaves: ShockwaveRing[] = [];
  private lightningBolts: LightningBolt[] = [];
  private ghosts: GhostTrail[] = [];

  private ringGeo = new THREE.RingGeometry(0.78, 1.0, 48);
  private ghostGeo = new THREE.OctahedronGeometry(0.85, 0);

  constructor() {
    this.ringGeo.rotateX(-Math.PI / 2);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_VOXELS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    for (let i = 0; i < MAX_VOXELS; i++) {
      this.particles.push({
        active: false,
        pos: new THREE.Vector3(0, -999, 0),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: 0,
        life: 0,
        maxLife: 1,
        color: new THREE.Color(1, 1, 1),
        gravity: 24,
        bounce: true,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    }
    this.group.add(this.mesh);
  }

  public burstVoxels(
    x: number,
    y: number,
    z: number,
    colorHex: number,
    count: number,
    speed = 12,
    size = 0.34,
    brightBoost = 1.6
  ): void {
    const baseCol = new THREE.Color(colorHex);
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.cursor];
      this.cursor = (this.cursor + 1) % MAX_VOXELS;

      const theta = Math.random() * Math.PI * 2;
      const spd = speed * (0.35 + Math.random() * 0.95);
      p.active = true;
      p.pos.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.6);
      p.vel.set(Math.cos(theta) * spd, 4.5 + Math.random() * speed * 0.72, Math.sin(theta) * spd);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.rotVel.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
      p.scale = size * (0.65 + Math.random() * 0.85);
      p.maxLife = 0.45 + Math.random() * 0.5;
      p.life = p.maxLife;
      p.gravity = 26;
      p.bounce = true;
      p.color.copy(baseCol).multiplyScalar(brightBoost * (0.8 + Math.random() * 0.4));
    }
  }

  public spawnSpark(x: number, y: number, z: number, colorHex: number, vx = 0, vz = 0): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_VOXELS;
    p.active = true;
    p.pos.set(x, y, z);
    p.vel.set(vx + (Math.random() - 0.5) * 3, 1 + Math.random() * 2.5, vz + (Math.random() - 0.5) * 3);
    p.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    p.rotVel.set(6, 6, 6);
    p.scale = 0.18 + Math.random() * 0.14;
    p.maxLife = 0.24 + Math.random() * 0.18;
    p.life = p.maxLife;
    p.gravity = 4;
    p.bounce = false;
    p.color.setHex(colorHex).multiplyScalar(1.8);
  }

  public spawnShockwave(x: number, z: number, colorHex: number, maxScale = 6.5, maxLife = 0.42): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex).multiplyScalar(1.7),
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.set(x, 0.14, z);
    mesh.scale.setScalar(0.3);
    this.group.add(mesh);
    this.shockwaves.push({ mesh, life: maxLife, maxLife, maxScale });
  }

  public spawnLightning(from: THREE.Vector3, to: THREE.Vector3, colorHex = 0x38bdf8): void {
    const segments = 7;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const p = new THREE.Vector3().lerpVectors(from, to, t);
      if (i > 0 && i < segments) {
        p.x += (Math.random() - 0.5) * 1.1;
        p.y += 0.35 + Math.random() * 0.8;
        p.z += (Math.random() - 0.5) * 1.1;
      } else {
        p.y = 0.9;
      }
      pts.push(p);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex).multiplyScalar(2.2),
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const line = new THREE.Line(geo, mat);
    this.group.add(line);
    this.lightningBolts.push({ line, life: 0.22, maxLife: 0.22 });
  }

  public spawnDashGhost(pos: THREE.Vector3, rotY: number, colorHex: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.55,
      wireframe: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.ghostGeo, mat);
    mesh.position.copy(pos);
    mesh.rotation.y = rotY;
    mesh.scale.set(1.0, 0.75, 1.45);
    this.group.add(mesh);
    this.ghosts.push({ mesh, life: 0.26, maxLife: 0.26 });
  }

  public update(dt: number): void {
    // Update Instanced Voxel Particles
    for (let i = 0; i < MAX_VOXELS; i++) {
      const p = this.particles[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }

      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);

      if (p.bounce && p.pos.y < p.scale * 0.5) {
        p.pos.y = p.scale * 0.5;
        p.vel.y = Math.abs(p.vel.y) * 0.48;
        p.vel.x *= 0.78;
        p.vel.z *= 0.78;
      }

      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;

      const t = p.life / p.maxLife;
      const s = p.scale * (t < 0.3 ? t / 0.3 : 1);

      this.dummy.position.copy(p.pos);
      this.dummy.rotation.copy(p.rot);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, p.color);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

    // Update Shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      if (sw.life <= 0) {
        this.group.remove(sw.mesh);
        (sw.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
        continue;
      }
      const p = 1 - sw.life / sw.maxLife;
      const eased = 1 - Math.pow(1 - p, 3);
      sw.mesh.scale.setScalar(0.3 + eased * sw.maxScale);
      (sw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.9;
    }

    // Update Lightning Bolts
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const b = this.lightningBolts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.group.remove(b.line);
        b.line.geometry.dispose();
        (b.line.material as THREE.Material).dispose();
        this.lightningBolts.splice(i, 1);
        continue;
      }
      (b.line.material as THREE.LineBasicMaterial).opacity = b.life / b.maxLife;
    }

    // Update Dash Ghosts
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.life -= dt;
      if (g.life <= 0) {
        this.group.remove(g.mesh);
        (g.mesh.material as THREE.Material).dispose();
        this.ghosts.splice(i, 1);
        continue;
      }
      const t = g.life / g.maxLife;
      (g.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.55;
      g.mesh.scale.set(1.0 * t + 0.2, 0.75 * t + 0.1, 1.45 * t + 0.2);
    }
  }

  public clear(): void {
    for (let i = 0; i < MAX_VOXELS; i++) {
      this.particles[i].active = false;
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (const sw of this.shockwaves) {
      this.group.remove(sw.mesh);
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.shockwaves = [];

    for (const b of this.lightningBolts) {
      this.group.remove(b.line);
      b.line.geometry.dispose();
      (b.line.material as THREE.Material).dispose();
    }
    this.lightningBolts = [];

    for (const g of this.ghosts) {
      this.group.remove(g.mesh);
      (g.mesh.material as THREE.Material).dispose();
    }
    this.ghosts = [];
  }
}
