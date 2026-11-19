import * as THREE from 'three';
import { ARENA_RADIUS } from './constants';

const MAX_RIPPLES = 4;

export class ArenaVisuals {
  public readonly group = new THREE.Group();
  private floorMat: THREE.ShaderMaterial;
  private outerRingA: THREE.Mesh;
  private outerRingB: THREE.Mesh;
  private monoliths: THREE.InstancedMesh;
  private monolithMeta: Array<{ angle: number; dist: number; baseH: number; phase: number; radius: number }> = [];
  private starField: THREE.Points;
  private bgRings: THREE.Mesh[] = [];
  private ripplePos: THREE.Vector2[] = [];
  private rippleTime: number[] = [];
  private rippleCursor = 0;
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  constructor() {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      this.ripplePos.push(new THREE.Vector2(0, 0));
      this.rippleTime.push(99.0);
    }

    // 1. Custom GLSL Luminous Cyber-Grid Floor with live impact ripples
    const floorGeo = new THREE.CircleGeometry(ARENA_RADIUS + 0.5, 96);
    floorGeo.rotateX(-Math.PI / 2);

    this.floorMat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uFever: { value: 0 },
        uCombo: { value: 0 },
        uRadius: { value: ARENA_RADIUS },
        uRipplePos: { value: this.ripplePos },
        uRippleTime: { value: this.rippleTime },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uBeat;
        uniform float uFever;
        uniform float uCombo;
        uniform float uRadius;
        uniform vec2 uRipplePos[${MAX_RIPPLES}];
        uniform float uRippleTime[${MAX_RIPPLES}];

        varying vec3 vWorldPos;
        varying vec2 vUv;

        vec3 hueShift(float t) {
          return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
        }

        void main() {
          vec2 p = vWorldPos.xz;
          float dist = length(p);
          if (dist > uRadius + 0.4) discard;

          // Subtle hex-like & square dual cyber grid
          vec2 g = abs(fract(p * 0.45 - 0.5) - 0.5) / fwidth(p * 0.45);
          float line = 1.0 - min(min(g.x, g.y), 1.0);

          vec2 gBig = abs(fract(p * 0.1125 - 0.5) - 0.5) / fwidth(p * 0.1125);
          float bigLine = 1.0 - min(min(gBig.x, gBig.y), 1.0);

          // Concentric radar pulses
          float pulse = smoothstep(0.92, 1.0, sin(dist * 0.65 - uTime * 3.0));
          float edgeGlow = smoothstep(uRadius - 2.6, uRadius, dist);

          // Interactive impact ripples
          float rippleGlow = 0.0;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            float rt = uRippleTime[i];
            if (rt < 1.2) {
              float d = length(p - uRipplePos[i]);
              float waveRadius = rt * 22.0;
              float ring = exp(-pow((d - waveRadius) * 0.75, 2.0)) * (1.0 - rt / 1.2);
              rippleGlow += ring;
            }
          }

          // Base dark glossy deck
          vec3 baseCol = vec3(0.025, 0.035, 0.075);
          vec3 gridCol = mix(vec3(0.04, 0.68, 1.0), vec3(0.95, 0.25, 0.85), clamp(uCombo / 45.0, 0.0, 1.0));
          if (uFever > 0.01) {
            vec3 rainbow = hueShift(uTime * 0.6 + dist * 0.04);
            gridCol = mix(gridCol, rainbow * 1.35, uFever);
          }

          vec3 col = baseCol;
          col += gridCol * line * (0.24 + uBeat * 0.16);
          col += gridCol * bigLine * (0.45 + uBeat * 0.25);
          col += gridCol * pulse * 0.16;
          col += mix(gridCol, vec3(1.0, 0.9, 0.4), 0.5) * rippleGlow * 1.45;
          col += mix(gridCol, vec3(1.0, 0.2, 0.55), 0.45) * edgeGlow * (0.95 + uBeat * 0.45);

          // Center emblem ring
          float centerRing = exp(-pow((dist - 3.6) * 2.5, 2.0));
          col += gridCol * centerRing * (0.45 + uBeat * 0.35);

          float alpha = smoothstep(uRadius + 0.4, uRadius - 0.15, dist) * 0.94;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const floorMesh = new THREE.Mesh(floorGeo, this.floorMat);
    floorMesh.position.y = -0.02;
    this.group.add(floorMesh);

    // 2. Arena Boundary Containment Rings
    const ringGeoA = new THREE.TorusGeometry(ARENA_RADIUS + 0.25, 0.22, 12, 96);
    ringGeoA.rotateX(Math.PI / 2);
    const ringMatA = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00d8ff,
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.outerRingA = new THREE.Mesh(ringGeoA, ringMatA);
    this.outerRingA.position.y = 0.08;
    this.group.add(this.outerRingA);

    const ringGeoB = new THREE.TorusGeometry(ARENA_RADIUS + 1.35, 0.1, 8, 64);
    ringGeoB.rotateX(Math.PI / 2);
    const ringMatB = new THREE.MeshStandardMaterial({
      color: 0xff2a85,
      emissive: 0xff2a85,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.8,
    });
    this.outerRingB = new THREE.Mesh(ringGeoB, ringMatB);
    this.outerRingB.position.y = -0.45;
    this.group.add(this.outerRingB);

    // 3. Beat-Reactive Floating Monolith Pillars around the abyss
    const pillarCount = 40;
    const pillarGeo = new THREE.BoxGeometry(1, 1, 1);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.45,
      roughness: 0.2,
      metalness: 0.7,
    });
    this.monoliths = new THREE.InstancedMesh(pillarGeo, pillarMat, pillarCount);
    const initCol = new THREE.Color(0x0ea5e9);
    for (let i = 0; i < pillarCount; i++) {
      const angle = (i / pillarCount) * Math.PI * 2;
      const dist = ARENA_RADIUS + 4.5 + (i % 3) * 3.8;
      const baseH = 4 + (i % 5) * 2.6;
      const radius = 1.2 + (i % 3) * 0.55;
      this.monolithMeta.push({ angle, dist, baseH, phase: i * 0.55, radius });
      this.monoliths.setColorAt(i, initCol);
    }
    this.group.add(this.monoliths);

    // 4. Giant rotating background geometric halos for 3D depth
    for (let i = 0; i < 3; i++) {
      const r = ARENA_RADIUS + 14 + i * 9;
      const haloGeo = new THREE.TorusGeometry(r, 0.14, 8, 64);
      const haloMat = new THREE.MeshBasicMaterial({
        color: i === 0 ? 0x0ea5e9 : i === 1 ? 0xa855f7 : 0xf43f5e,
        transparent: true,
        opacity: 0.28,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = -6 - i * 4;
      halo.rotation.x = Math.PI / 2 + (i - 1) * 0.22;
      this.bgRings.push(halo);
      this.group.add(halo);
    }

    // 5. Deep 3D Starfield
    const starCount = 700;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const c = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 34 + Math.random() * 80;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = -35 + Math.random() * 55;
      positions[i * 3 + 2] = Math.sin(theta) * r;

      c.setHSL(0.52 + Math.random() * 0.35, 0.85, 0.65);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.starField = new THREE.Points(starGeo, starMat);
    this.group.add(this.starField);
  }

  public triggerRipple(x: number, z: number): void {
    this.ripplePos[this.rippleCursor].set(x, z);
    this.rippleTime[this.rippleCursor] = 0.0;
    this.rippleCursor = (this.rippleCursor + 1) % MAX_RIPPLES;
  }

  public update(dt: number, elapsed: number, beat: number, combo: number, fever: boolean): void {
    this.floorMat.uniforms.uTime.value = elapsed;
    this.floorMat.uniforms.uBeat.value = beat;
    this.floorMat.uniforms.uCombo.value = combo;
    const targetFever = fever ? 1.0 : 0.0;
    this.floorMat.uniforms.uFever.value += (targetFever - this.floorMat.uniforms.uFever.value) * Math.min(1, dt * 6);

    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (this.rippleTime[i] < 1.5) {
        this.rippleTime[i] += dt;
      }
    }

    // Ring glow & rotation
    const ringMatA = this.outerRingA.material as THREE.MeshStandardMaterial;
    if (fever) {
      this.tmpColor.setHSL((elapsed * 0.65) % 1, 1.0, 0.58);
      ringMatA.emissive.copy(this.tmpColor);
      ringMatA.emissiveIntensity = 2.6 + beat * 1.4;
    } else {
      ringMatA.emissive.setHex(combo >= 20 ? 0xff2a85 : 0x00d8ff);
      ringMatA.emissiveIntensity = 1.8 + beat * 0.9;
    }
    this.outerRingB.rotation.z = elapsed * (fever ? 1.1 : 0.35);

    // Beat-reactive monoliths
    const comboBoost = Math.min(1.6, 1.0 + combo * 0.015);
    for (let i = 0; i < this.monolithMeta.length; i++) {
      const m = this.monolithMeta[i];
      const wave = Math.sin(elapsed * (fever ? 5.2 : 2.1) + m.phase) * 0.5 + 0.5;
      const h = (m.baseH + wave * 3.8 + beat * 4.2) * comboBoost;
      const x = Math.cos(m.angle) * m.dist;
      const z = Math.sin(m.angle) * m.dist;

      this.dummy.position.set(x, -7.5 + h * 0.48, z);
      this.dummy.rotation.set(0, -m.angle, 0);
      this.dummy.scale.set(m.radius, h, m.radius);
      this.dummy.updateMatrix();
      this.monoliths.setMatrixAt(i, this.dummy.matrix);

      if (fever) {
        this.tmpColor.setHSL(((elapsed * 0.55) + i * 0.03) % 1, 0.95, 0.55);
      } else {
        const hue = 0.56 + (i % 5) * 0.05 + Math.min(0.28, combo * 0.005);
        this.tmpColor.setHSL(hue % 1, 0.85, 0.42 + beat * 0.18);
      }
      this.monoliths.setColorAt(i, this.tmpColor);
    }
    this.monoliths.instanceMatrix.needsUpdate = true;
    if (this.monoliths.instanceColor) this.monoliths.instanceColor.needsUpdate = true;

    // Background halos & starfield drift
    this.bgRings.forEach((h, idx) => {
      h.rotation.z += dt * (idx % 2 === 0 ? 0.18 : -0.14) * (fever ? 2.5 : 1);
      h.rotation.y += dt * 0.08 * (idx + 1);
    });
    this.starField.rotation.y += dt * (fever ? 0.09 : 0.025);
  }
}
