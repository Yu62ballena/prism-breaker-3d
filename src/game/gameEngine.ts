import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ArenaVisuals } from './arena';
import { SoundEngine } from './audio';
import {
  ARENA_RADIUS,
  MISSIONS,
  RARITY_CONFIG,
  UPGRADES,
  computeRank,
  getSkinById,
} from './constants';
import {
  applyPlayerSkin,
  createEnemyMesh,
  createGemMesh,
  createPlayerRig,
  type EnemyKind,
  type PlayerRig,
} from './entities';
import { ParticleSystem } from './particles';
import { isBetterRank, saveSave } from './storage';
import type {
  GamePhase,
  HudSnapshot,
  Rarity,
  RunSummary,
  SaveData,
  UpgradeChoice,
  UpgradeId,
} from './types';

interface Enemy {
  id: number;
  kind: EnemyKind;
  mesh: THREE.Group;
  mainMat: THREE.MeshStandardMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  color: number;
  scoreValue: number;
  xpValue: number;
  flashTimer: number;
  aiTimer: number;
  chargeDir: THREE.Vector3;
  charging: boolean;
  telegraphLine?: THREE.Line;
}

interface Bullet {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  fromPlayer: boolean;
  bouncesLeft: number;
  hitIds: Set<number>;
  grazed: boolean;
  radius: number;
}

interface Gem {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  kind: 'xp' | 'gold' | 'heal';
  value: number;
  life: number;
}

interface Mine {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  fuse: number;
  radius: number;
  damage: number;
}

interface Singularity {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  life: number;
  radius: number;
}

interface FloatingPopup {
  el: HTMLDivElement;
  worldPos: THREE.Vector3;
  life: number;
  maxLife: number;
  riseSpeed: number;
}

export interface EngineCallbacks {
  onHudUpdate: (snap: HudSnapshot) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onLevelUpChoices: (choices: UpgradeChoice[]) => void;
  onGameOver: (summary: RunSummary) => void;
  onToast: (title: string, subtitle: string, accent?: string) => void;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private floatingLayer: HTMLElement;
  private screenFx: HTMLElement;
  private save: SaveData;
  private cb: EngineCallbacks;
  public readonly sound = new SoundEngine();

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloomPass!: UnrealBloomPass;
  private playerLight!: THREE.PointLight;
  private rimLight!: THREE.DirectionalLight;

  private arena!: ArenaVisuals;
  private particles!: ParticleSystem;
  private playerRig!: PlayerRig;

  // Entities
  private entityGroup = new THREE.Group();
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private gems: Gem[] = [];
  private mines: Mine[] = [];
  private singularities: Singularity[] = [];
  private orbitals: THREE.Mesh[] = [];
  private popups: FloatingPopup[] = [];
  private nextEnemyId = 1;

  // Shared Geometries & Materials
  private playerBulletGeo = new THREE.SphereGeometry(0.24, 8, 8);
  private enemyBulletGeo = new THREE.OctahedronGeometry(0.32, 0);
  private mineGeo = new THREE.IcosahedronGeometry(0.42, 0);
  private orbitalGeo = new THREE.OctahedronGeometry(0.48, 0);

  // State
  private phase: GamePhase = 'title';
  private rafId = 0;
  private lastTime = 0;
  private elapsed = 0;
  private beatPulse = 0;

  // Juice
  private hitstopTimer = 0;
  private shakeTrauma = 0;
  private screenFlashTimer = 0;
  private screenFlashColor = '';

  // Player runtime
  private playerPos = new THREE.Vector3();
  private playerVel = new THREE.Vector3();
  private playerFacing = new THREE.Vector3(0, 0, -1);
  private hp = 5;
  private maxHp = 5;
  private invulnTimer = 0;

  // Dash-Smash
  private dashTimer = 0;
  private dashCooldown = 0;
  private dashMaxCooldown = 1.45;
  private dashDir = new THREE.Vector3(0, 0, -1);
  private dashGhostTimer = 0;
  private dashMineTimer = 0;
  private dashHitIds = new Set<number>();

  // Combat & Scoring
  private score = 0;
  private runShards = 0;
  private combo = 0;
  private maxCombo = 0;
  private comboTimer = 0;
  private readonly comboMaxTime = 3.6;

  // Fever / Overdrive
  private feverGauge = 0; // 0..100
  private feverActive = false;
  private feverTimer = 0;
  private feverDuration = 10;

  // Progression within run
  private level = 1;
  private xp = 0;
  private xpToNext = 55;
  private upgradeLevels = new Map<UpgradeId, number>();
  private upgradePower = new Map<UpgradeId, number>();
  private activeChoices: UpgradeChoice[] = [];

  // Wave / Spawn
  private runTime = 0;
  private wave = 1;
  private spawnTimer = 0;
  private jackpotTimer = 18;
  private bossSpawnedForWave = 0;

  // Run stats for missions
  private kills = 0;
  private dashKills = 0;
  private grazes = 0;
  private fevers = 0;
  private jackpots = 0;
  private bossKills = 0;

  // Auto-fire
  private fireTimer = 0;
  private orbitalAngle = 0;

  // Input
  private keys = new Set<string>();
  private mouseNdc = new THREE.Vector2();
  private mouseWorld = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointerActive = false;
  private mobileMove = new THREE.Vector2(0, 0);

  private hudSyncTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    floatingLayer: HTMLElement,
    screenFx: HTMLElement,
    save: SaveData,
    callbacks: EngineCallbacks
  ) {
    this.canvas = canvas;
    this.floatingLayer = floatingLayer;
    this.screenFx = screenFx;
    this.save = save;
    this.cb = callbacks;
    this.sound.setMuted(save.muted);

    this.initThree();
    this.bindInputs();
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  private initThree(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040712);
    this.scene.fog = new THREE.FogExp2(0x040712, 0.0115);

    this.camera = new THREE.PerspectiveCamera(54, width / height, 0.5, 220);
    this.camera.position.set(0, 26, 20);
    this.camera.lookAt(0, 0, 0);

    // Post-processing with UnrealBloomPass
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      1.15, // strength
      0.55, // radius
      0.22 // threshold
    );
    this.composer.addPass(this.bloomPass);

    // Lighting
    const hemi = new THREE.HemisphereLight(0x8be9fd, 0x161b33, 0.9);
    this.scene.add(hemi);

    this.rimLight = new THREE.DirectionalLight(0x60a5fa, 1.35);
    this.rimLight.position.set(16, 30, 14);
    this.scene.add(this.rimLight);

    this.playerLight = new THREE.PointLight(0x00f0ff, 5, 18, 1.5);
    this.playerLight.position.set(0, 3, 0);
    this.scene.add(this.playerLight);

    // Arena & Particles
    this.arena = new ArenaVisuals();
    this.scene.add(this.arena.group);

    this.particles = new ParticleSystem();
    this.scene.add(this.particles.group);

    this.scene.add(this.entityGroup);

    // Player Rig
    this.playerRig = createPlayerRig(getSkinById(this.save.equippedSkin));
    this.scene.add(this.playerRig.root);

    window.addEventListener('resize', this.handleResize);
  }

  private handleResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloomPass.setSize(w, h);
  };

  private bindInputs(): void {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
      this.keys.add(code);

      if (this.phase === 'playing') {
        if (code === 'Space') this.tryDash(false);
        if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'KeyE') this.tryNova();
        if (code === 'Escape') this.togglePause();
      } else if (this.phase === 'paused') {
        if (code === 'Escape') this.togglePause();
        if (code === 'KeyR') this.startNewRun();
      } else if (this.phase === 'levelup') {
        if (code === 'Digit1') this.selectUpgrade(0);
        if (code === 'Digit2') this.selectUpgrade(1);
        if (code === 'Digit3') this.selectUpgrade(2);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.pointerActive = true;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.phase !== 'playing') return;
      this.sound.init();
      this.mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
      this.pointerActive = true;
      if (e.button === 0) {
        this.tryDash(true);
      } else if (e.button === 2) {
        this.tryNova();
      }
    });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  public setMobileMove(x: number, y: number): void {
    this.mobileMove.set(x, y);
  }

  public triggerMobileDash(): void {
    if (this.phase === 'playing') {
      this.sound.init();
      this.tryDash(false);
    }
  }

  public triggerMobileNova(): void {
    if (this.phase === 'playing') {
      this.sound.init();
      this.tryNova();
    }
  }

  public refreshSkin(): void {
    const skin = getSkinById(this.save.equippedSkin);
    applyPlayerSkin(this.playerRig, skin);
    this.playerLight.color.setHex(skin.primary);
  }

  public getPhase(): GamePhase {
    return this.phase;
  }

  public setPhaseTitle(): void {
    this.clearEntities();
    this.phase = 'title';
    this.playerPos.set(0, 0, 0);
    this.playerRig.root.position.set(0, 0, 0);
    this.cb.onPhaseChange('title');
  }

  public togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.cb.onPhaseChange('paused');
    } else if (this.phase === 'paused') {
      this.phase = 'playing';
      this.lastTime = performance.now();
      this.cb.onPhaseChange('playing');
    }
  }

  public startNewRun(): void {
    this.sound.init();
    this.sound.playUiClick();
    this.clearEntities();
    this.refreshSkin();

    // Apply Permanent Meta-Upgrades
    const m = this.save.meta;
    this.maxHp = 5 + m.shield;
    this.hp = this.maxHp;
    this.invulnTimer = 1.0;
    this.dashMaxCooldown = Math.max(0.65, 1.45 * Math.pow(0.92, m.thruster));
    this.feverDuration = 9.5 + m.fever * 1.1;

    this.playerPos.set(0, 0, 0);
    this.playerVel.set(0, 0, 0);
    this.playerFacing.set(0, 0, -1);
    this.playerRig.root.position.set(0, 0, 0);

    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.score = 0;
    this.runShards = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.comboTimer = 0;
    this.feverGauge = 0;
    this.feverActive = false;
    this.feverTimer = 0;

    this.level = 1;
    this.xp = 0;
    this.xpToNext = 50;
    this.upgradeLevels.clear();
    this.upgradePower.clear();
    this.activeChoices = [];

    this.runTime = 0;
    this.wave = 1;
    this.spawnTimer = 0.25;
    this.jackpotTimer = 16;
    this.bossSpawnedForWave = 0;

    this.kills = 0;
    this.dashKills = 0;
    this.grazes = 0;
    this.fevers = 0;
    this.jackpots = 0;
    this.bossKills = 0;

    this.hitstopTimer = 0;
    this.shakeTrauma = 0;
    this.fireTimer = 0;

    this.phase = 'playing';
    this.cb.onPhaseChange('playing');

    // Immediate opening pack so action begins in 0.2 seconds!
    this.arena.triggerRipple(0, 0);
    this.particles.spawnShockwave(0, 0, getSkinById(this.save.equippedSkin).primary, 10, 0.45);
    for (let i = 0; i < 6; i++) {
      this.spawnEnemy('swarm');
    }
    this.emitHud();
  }

  private clearEntities(): void {
    for (const e of this.enemies) {
      this.entityGroup.remove(e.mesh);
      if (e.telegraphLine) {
        this.entityGroup.remove(e.telegraphLine);
        e.telegraphLine.geometry.dispose();
      }
    }
    this.enemies = [];

    for (const b of this.bullets) {
      this.entityGroup.remove(b.mesh);
      (b.mesh.material as THREE.Material).dispose();
    }
    this.bullets = [];

    for (const g of this.gems) {
      this.entityGroup.remove(g.mesh);
      (g.mesh.material as THREE.Material).dispose();
    }
    this.gems = [];

    for (const m of this.mines) {
      this.entityGroup.remove(m.mesh);
      (m.mesh.material as THREE.Material).dispose();
    }
    this.mines = [];

    for (const s of this.singularities) {
      this.entityGroup.remove(s.mesh);
      (s.mesh.material as THREE.Material).dispose();
    }
    this.singularities = [];

    for (const o of this.orbitals) {
      this.entityGroup.remove(o);
      (o.material as THREE.Material).dispose();
    }
    this.orbitals = [];

    for (const p of this.popups) {
      p.el.remove();
    }
    this.popups = [];

    this.particles.clear();
  }

  // Upgrade helpers
  private getUpgLevel(id: UpgradeId): number {
    return this.upgradeLevels.get(id) ?? 0;
  }

  private getUpgPower(id: UpgradeId): number {
    return this.upgradePower.get(id) ?? 0;
  }

  private getDamageMult(): number {
    const metaMult = 1 + this.save.meta.power * 0.14;
    const feverMult = this.feverActive ? 1.55 : 1.0;
    return metaMult * feverMult;
  }

  private getComboMultiplier(): number {
    const greedBonus = 1 + this.getUpgPower('greed_reactor') * 0.25;
    const base = 1 + Math.floor(this.combo / 5) * 0.5 + this.combo * 0.04;
    const feverBoost = this.feverActive ? 2.0 : 1.0;
    return Math.round(base * greedBonus * feverBoost * 10) / 10;
  }

  private addScore(basePoints: number, worldPos?: THREE.Vector3, label?: string, color = '#38bdf8'): void {
    const mult = this.getComboMultiplier();
    const gained = Math.round(basePoints * mult);
    this.score += gained;
    if (worldPos) {
      this.spawnPopup(worldPos, label ?? `+${gained.toLocaleString()}`, color);
    }
  }

  private addCombo(amount = 1): void {
    this.combo += amount;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.comboTimer = this.comboMaxTime;

    if (this.combo === 10 || this.combo === 25 || this.combo === 50 || this.combo === 100) {
      this.spawnPopup(
        this.playerPos.clone().add(new THREE.Vector3(0, 2.2, 0)),
        `🔥 ${this.combo} CHAIN!!`,
        '#fbbf24',
        true
      );
      this.addTrauma(0.35);
    }
  }

  private addFever(amount: number): void {
    if (this.feverActive) return;
    const metaBoost = 1 + this.save.meta.fever * 0.12 + this.getUpgPower('greed_reactor') * 0.14;
    this.feverGauge = Math.min(100, this.feverGauge + amount * metaBoost);
    if (this.feverGauge >= 100) {
      this.activateFever();
    }
  }

  private activateFever(): void {
    this.feverActive = true;
    this.feverTimer = this.feverDuration;
    this.feverGauge = 100;
    this.fevers++;
    this.sound.playFeverStart();
    this.addTrauma(0.65);
    this.hitstopTimer = 0.065;
    this.flashScreen('radial-gradient(circle, rgba(255,215,0,0.22), rgba(255,42,133,0.42))', 0.45);
    this.arena.triggerRipple(this.playerPos.x, this.playerPos.z);
    this.particles.spawnShockwave(this.playerPos.x, this.playerPos.z, 0xffd700, 18, 0.55);
    this.particles.burstVoxels(this.playerPos.x, 1.2, this.playerPos.z, 0xffd700, 32, 16, 0.36, 2.1);
    this.spawnPopup(this.playerPos.clone().add(new THREE.Vector3(0, 2.6, 0)), '⚡ FEVER OVERDRIVE! ⚡', '#fde047', true);
    this.clearEnemyBulletsIntoGems();
  }

  private tryDash(aimAtMouse: boolean): void {
    if (this.dashTimer > 0 || this.dashCooldown > 0) return;

    const dir = new THREE.Vector3();
    if (aimAtMouse && this.pointerActive) {
      this.raycaster.setFromCamera(this.mouseNdc, this.camera);
      if (this.raycaster.ray.intersectPlane(this.groundPlane, this.mouseWorld)) {
        dir.subVectors(this.mouseWorld, this.playerPos);
        dir.y = 0;
      }
    }
    if (dir.lengthSq() < 0.04) {
      const moveInput = this.getMoveInput();
      if (moveInput.lengthSq() > 0.01) {
        dir.set(moveInput.x, 0, moveInput.y);
      } else {
        // Smart-aim toward nearest enemy when stationary!
        const nearest = this.findNearestEnemy(this.playerPos, 24);
        if (nearest) {
          dir.subVectors(nearest.pos, this.playerPos);
          dir.y = 0;
        } else {
          dir.copy(this.playerFacing);
        }
      }
    }
    if (dir.lengthSq() < 0.001) dir.set(0, 0, -1);
    dir.normalize();

    this.dashDir.copy(dir);
    this.playerFacing.copy(dir);
    this.dashTimer = 0.23;
    const upgCdMult = Math.pow(0.88, this.getUpgLevel('dash_overcharge'));
    this.dashCooldown = this.dashMaxCooldown * upgCdMult;
    this.dashHitIds.clear();
    this.dashGhostTimer = 0;
    this.dashMineTimer = 0;

    this.sound.playDash();
    this.addTrauma(0.22);
    const skin = getSkinById(this.save.equippedSkin);
    this.particles.spawnShockwave(this.playerPos.x, this.playerPos.z, skin.primary, 4.2, 0.28);
    this.particles.burstVoxels(this.playerPos.x, 0.8, this.playerPos.z, skin.primary, 12, 10, 0.22, 1.8);
  }

  private tryNova(): void {
    if (this.feverGauge < 50 && !this.feverActive) return;

    // Spend 50% gauge (or end 4s of Fever early for emergency mega blast)
    if (this.feverActive) {
      this.feverTimer = Math.max(0.5, this.feverTimer - 3.5);
    } else {
      this.feverGauge = Math.max(0, this.feverGauge - 50);
    }

    this.sound.playNova();
    this.hitstopTimer = 0.075;
    this.addTrauma(0.85);
    this.flashScreen('radial-gradient(circle, rgba(56,189,248,0.35), rgba(168,85,247,0.45))', 0.4);
    this.arena.triggerRipple(this.playerPos.x, this.playerPos.z);
    this.particles.spawnShockwave(this.playerPos.x, this.playerPos.z, 0x00f0ff, 22, 0.6);
    this.particles.spawnShockwave(this.playerPos.x, this.playerPos.z, 0xff2a85, 16, 0.45);
    this.particles.burstVoxels(this.playerPos.x, 1.4, this.playerPos.z, 0x38bdf8, 45, 20, 0.38, 2.2);
    this.spawnPopup(this.playerPos.clone().add(new THREE.Vector3(0, 2.6, 0)), '💥 OVERDRIVE NOVA!!', '#38bdf8', true);

    this.clearEnemyBulletsIntoGems();
    const novaRadius = 15.5;
    const novaDamage = 140 * this.getDamageMult();
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.pos.distanceTo(this.playerPos) <= novaRadius) {
        this.damageEnemy(e, novaDamage, true, true);
      }
    }
  }

  private clearEnemyBulletsIntoGems(): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      if (!b.fromPlayer) {
        this.particles.burstVoxels(b.pos.x, 0.8, b.pos.z, 0xfde047, 5, 7, 0.18, 1.8);
        this.spawnGem(b.pos.x, b.pos.z, 'xp', 6);
        this.entityGroup.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bullets.splice(i, 1);
      }
    }
  }

  private addTrauma(amount: number): void {
    this.shakeTrauma = Math.min(1.0, this.shakeTrauma + amount);
  }

  private flashScreen(bg: string, duration = 0.25): void {
    this.screenFlashColor = bg;
    this.screenFlashTimer = duration;
    this.screenFx.style.background = bg;
    this.screenFx.style.opacity = '1';
  }

  private getMoveInput(): THREE.Vector2 {
    let x = this.mobileMove.x;
    let y = this.mobileMove.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    const v = new THREE.Vector2(x, y);
    if (v.lengthSq() > 1) v.normalize();
    return v;
  }

  private loop = (now: number): void => {
    this.rafId = requestAnimationFrame(this.loop);
    const rawDt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += rawDt;

    // Screen FX decay
    if (this.screenFlashTimer > 0) {
      this.screenFlashTimer -= rawDt;
      this.screenFx.style.opacity = `${Math.max(0, this.screenFlashTimer * 2.5)}`;
    } else if (this.feverActive && this.phase === 'playing') {
      this.screenFx.style.background =
        'radial-gradient(circle, transparent 58%, rgba(255, 215, 0, 0.22) 100%)';
      this.screenFx.style.opacity = `${0.55 + Math.sin(this.elapsed * 12) * 0.25}`;
    } else {
      this.screenFx.style.opacity = '0';
    }

    if (this.phase === 'title' || this.phase === 'gameover') {
      this.updateAttractMode(rawDt);
      this.composer.render();
      return;
    }

    if (this.phase === 'paused' || this.phase === 'levelup') {
      this.arena.update(rawDt * 0.25, this.elapsed, this.beatPulse * 0.3, this.combo, this.feverActive);
      this.updatePopups(rawDt * 0.2);
      this.composer.render();
      return;
    }

    // Hitstop freeze frames for crisp impact weight!
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      this.updateCamera(rawDt);
      this.composer.render();
      return;
    }

    const dt = rawDt;
    const pulse = this.sound.updateBgm(dt, true, this.combo, this.feverActive);
    if (pulse > 0) this.beatPulse = 1.0;
    this.beatPulse = Math.max(0, this.beatPulse - dt * 4.5);

    this.updateGameplay(dt);
    this.arena.update(dt, this.elapsed, this.beatPulse, this.combo, this.feverActive);
    this.particles.update(dt);
    this.updatePopups(dt);
    this.updateCamera(dt);

    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.05) {
      this.hudSyncTimer = 0;
      this.emitHud();
    }

    this.composer.render();
  };

  private updateAttractMode(dt: number): void {
    this.arena.update(dt, this.elapsed, Math.sin(this.elapsed * 3) * 0.25 + 0.25, 14, false);
    this.particles.update(dt);
    this.playerRig.root.position.set(0, Math.sin(this.elapsed * 2.4) * 0.35, 0);
    this.playerRig.root.rotation.y = this.elapsed * 0.9;
    this.playerRig.ring.rotation.z = this.elapsed * 2.5;
    (this.playerRig.dashCone.material as THREE.MeshBasicMaterial).opacity = 0;

    // Periodic ambient 3D prism bursts so the title screen feels alive and kinetic
    if (Math.random() < dt * 1.4) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * 14;
      const bx = Math.cos(a) * r;
      const bz = Math.sin(a) * r;
      const cols = [0x00f0ff, 0xff2a85, 0xfbbf24, 0xa855f7, 0x38ef7d];
      const col = cols[Math.floor(Math.random() * cols.length)];
      this.particles.burstVoxels(bx, 1.2, bz, col, 14, 12, 0.28, 1.9);
      this.particles.spawnShockwave(bx, bz, col, 5.5, 0.45);
      this.arena.triggerRipple(bx, bz);
    }

    const camAngle = this.elapsed * 0.22;
    this.camera.position.set(Math.sin(camAngle) * 24, 17.5, Math.cos(camAngle) * 24);
    this.camera.lookAt(0, 0.8, 0);
    this.camera.fov += (52 - this.camera.fov) * dt * 4;
    this.camera.updateProjectionMatrix();
  }

  private updateGameplay(dt: number): void {
    this.runTime += dt;

    // Wave progression every 20 seconds
    const targetWave = 1 + Math.floor(this.runTime / 20);
    if (targetWave > this.wave) {
      this.wave = targetWave;
      this.spawnPopup(
        this.playerPos.clone().add(new THREE.Vector3(0, 3, 0)),
        `⚡ WAVE ${this.wave} ⚡`,
        '#c084fc',
        true
      );
      this.arena.triggerRipple(0, 0);
      this.addTrauma(0.25);

      // Boss every 4th wave!
      if (this.wave % 4 === 0 && this.bossSpawnedForWave !== this.wave) {
        this.bossSpawnedForWave = this.wave;
        this.spawnBoss();
      }
    }

    // Combo decay
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }

    // Fever countdown
    if (this.feverActive) {
      this.feverTimer -= dt;
      this.feverGauge = Math.max(0, (this.feverTimer / this.feverDuration) * 100);
      if (this.feverTimer <= 0) {
        this.feverActive = false;
        this.feverGauge = 0;
      }
    }

    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);

    this.updatePlayer(dt);
    this.updateSpawners(dt);
    this.updateAutoFire(dt);
    this.updateOrbitals(dt);
    this.updateMines(dt);
    this.updateSingularities(dt);
    this.updateEnemies(dt);
    this.updateBullets(dt);
    this.updateGems(dt);
  }

  private updatePlayer(dt: number): void {
    const move = this.getMoveInput();
    const speedMult = (1 + this.save.meta.thruster * 0.06) * (this.feverActive ? 1.28 : 1.0);
    const maxSpeed = 14.5 * speedMult;

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      const dashSpeed = 48 * speedMult;
      this.playerVel.copy(this.dashDir).multiplyScalar(dashSpeed);
      this.playerPos.addScaledVector(this.playerVel, dt);

      // Ghost trail
      this.dashGhostTimer -= dt;
      if (this.dashGhostTimer <= 0) {
        this.dashGhostTimer = 0.028;
        const skin = getSkinById(this.save.equippedSkin);
        const col = this.feverActive ? 0xffd700 : skin.primary;
        this.particles.spawnDashGhost(
          this.playerPos.clone().add(new THREE.Vector3(0, 0.85, 0)),
          Math.atan2(this.dashDir.x, this.dashDir.z),
          col
        );
      }

      // Nova Wake upgrade: leave explosive plasma mines behind!
      const wakeLv = this.getUpgLevel('nova_wake');
      if (wakeLv > 0) {
        this.dashMineTimer -= dt;
        if (this.dashMineTimer <= 0) {
          this.dashMineTimer = 0.065;
          this.spawnMine(this.playerPos.x, this.playerPos.z, wakeLv);
        }
      }

      // Check Dash-Smash collisions!
      const smashRadius = 2.55 + this.getUpgPower('dash_overcharge') * 0.55;
      const dashDamage = (78 + this.getUpgPower('dash_overcharge') * 28) * this.getDamageMult();
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (this.dashHitIds.has(e.id)) continue;
        if (e.pos.distanceTo(this.playerPos) <= smashRadius + e.radius) {
          this.dashHitIds.add(e.id);
          const killed = this.damageEnemy(e, dashDamage, true, false);
          if (killed) {
            this.dashKills++;
            // SIGNATURE MECHANIC: Instant Dash Cooldown Reset on Dash-Smash Kill!
            if (this.dashCooldown > 0) {
              this.dashCooldown = 0;
              this.spawnPopup(
                this.playerPos.clone().add(new THREE.Vector3(0, 2.0, 0)),
                '⚡ CHAIN RESET!',
                '#00f0ff'
              );
            }
          }
        }
      }

      // Dash cone flare
      (this.playerRig.dashCone.material as THREE.MeshBasicMaterial).opacity = 0.85;
      this.playerRig.dashCone.scale.set(1.15, 1.15, 1.3);
    } else {
      const targetVx = move.x * maxSpeed;
      const targetVz = move.y * maxSpeed;
      const accel = 16;
      this.playerVel.x += (targetVx - this.playerVel.x) * Math.min(1, dt * accel);
      this.playerVel.z += (targetVz - this.playerVel.z) * Math.min(1, dt * accel);
      this.playerPos.addScaledVector(this.playerVel, dt);

      if (move.lengthSq() > 0.02) {
        this.playerFacing.set(move.x, 0, move.y).normalize();
        if (Math.random() < 0.45) {
          const skin = getSkinById(this.save.equippedSkin);
          this.particles.spawnSpark(
            this.playerPos.x - this.playerFacing.x * 0.6,
            0.55,
            this.playerPos.z - this.playerFacing.z * 0.6,
            this.feverActive ? 0xffd700 : skin.secondary,
            -this.playerFacing.x * 3,
            -this.playerFacing.z * 3
          );
        }
      }
      (this.playerRig.dashCone.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // Clamp inside circular arena
    const distFromCenter = Math.hypot(this.playerPos.x, this.playerPos.z);
    const limit = ARENA_RADIUS - 1.1;
    if (distFromCenter > limit) {
      const scale = limit / distFromCenter;
      this.playerPos.x *= scale;
      this.playerPos.z *= scale;
    }

    // Animate Player Rig
    this.playerRig.root.position.copy(this.playerPos);
    const targetYaw = Math.atan2(this.playerFacing.x, this.playerFacing.z) + Math.PI;
    this.playerRig.root.rotation.y = targetYaw;
    this.playerRig.core.position.y = 0.85 + Math.sin(this.elapsed * 6) * 0.12;
    this.playerRig.ring.rotation.z += dt * (this.feverActive ? 9 : 4);
    this.playerRig.auraRing.scale.setScalar(1 + this.beatPulse * 0.18 + (this.dashCooldown <= 0 ? 0.08 : -0.1));

    // Invuln blink
    if (this.invulnTimer > 0) {
      this.playerRig.root.visible = Math.floor(this.elapsed * 24) % 2 === 0;
    } else {
      this.playerRig.root.visible = true;
    }

    this.playerLight.position.set(this.playerPos.x, 3.2, this.playerPos.z);
    if (this.feverActive) {
      this.playerLight.color.setHSL((this.elapsed * 0.8) % 1, 1, 0.6);
      this.playerLight.intensity = 8.5;
    } else {
      this.playerLight.color.setHex(getSkinById(this.save.equippedSkin).primary);
      this.playerLight.intensity = this.dashTimer > 0 ? 9 : 5;
    }
  }

  private updateSpawners(dt: number): void {
    const maxEnemies = Math.min(48, 12 + this.wave * 4);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemies.length < maxEnemies) {
      const interval = Math.max(0.28, 1.18 - this.wave * 0.085);
      this.spawnTimer = interval;

      const packSize = this.wave >= 5 ? 3 : this.wave >= 2 ? 2 : 1;
      for (let i = 0; i < packSize; i++) {
        if (this.enemies.length >= maxEnemies) break;
        const r = Math.random();
        let kind: EnemyKind = 'swarm';
        if (this.wave >= 3 && r < 0.18) kind = 'splitter';
        else if (this.wave >= 2 && r < 0.36) kind = 'turret';
        else if (r < 0.56) kind = 'charger';
        this.spawnEnemy(kind);
      }
    }

    // Golden Jackpot Meteor random variable reward event!
    this.jackpotTimer -= dt;
    if (this.jackpotTimer <= 0) {
      const luckFactor = 1 - this.save.meta.luck * 0.08;
      this.jackpotTimer = (18 + Math.random() * 10) * Math.max(0.55, luckFactor);
      this.spawnEnemy('jackpot');
      this.cb.onToast('★ 黄金ジャックポット・メテオ出現！', 'ダッシュで砕いて大量報酬をゲット！', '#fbbf24');
    }
  }

  private spawnEnemy(kind: EnemyKind, customPos?: THREE.Vector3): Enemy {
    const built = createEnemyMesh(kind);
    const pos = customPos ? customPos.clone() : new THREE.Vector3();
    if (!customPos) {
      // Spawn around outer perimeter away from player
      let tries = 0;
      do {
        const angle = Math.random() * Math.PI * 2;
        const r = kind === 'jackpot' ? 8 + Math.random() * 11 : ARENA_RADIUS - 1.8;
        pos.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
        tries++;
      } while (pos.distanceTo(this.playerPos) < 9 && tries < 10);
    }

    const waveScale = 1 + (this.wave - 1) * 0.22;
    let hp = 32 * waveScale;
    let speed = 5.4 + this.wave * 0.25;
    let scoreValue = 120;
    let xpValue = 10;

    if (kind === 'charger') {
      hp = 46 * waveScale;
      speed = 6.2;
      scoreValue = 220;
      xpValue = 16;
    } else if (kind === 'turret') {
      hp = 62 * waveScale;
      speed = 2.6;
      scoreValue = 260;
      xpValue = 20;
    } else if (kind === 'splitter') {
      hp = 85 * waveScale;
      speed = 4.2;
      scoreValue = 300;
      xpValue = 24;
    } else if (kind === 'mini') {
      hp = 20 * waveScale;
      speed = 8.4;
      scoreValue = 90;
      xpValue = 7;
    } else if (kind === 'jackpot') {
      hp = 70 * waveScale;
      speed = 3.2;
      scoreValue = 1500;
      xpValue = 45;
    } else if (kind === 'boss') {
      hp = 920 * waveScale;
      speed = 3.6;
      scoreValue = 5000;
      xpValue = 120;
    }

    built.group.position.copy(pos);
    this.entityGroup.add(built.group);
    this.particles.spawnShockwave(pos.x, pos.z, built.color, kind === 'boss' ? 9 : 2.6, 0.35);

    const enemy: Enemy = {
      id: this.nextEnemyId++,
      kind,
      mesh: built.group,
      mainMat: built.mainMat,
      pos,
      vel: new THREE.Vector3(),
      hp,
      maxHp: hp,
      radius: built.radius,
      speed,
      color: built.color,
      scoreValue,
      xpValue,
      flashTimer: 0,
      aiTimer: 1.0 + Math.random() * 1.4,
      chargeDir: new THREE.Vector3(0, 0, 1),
      charging: false,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  private spawnBoss(): void {
    const angle = Math.atan2(-this.playerPos.z, -this.playerPos.x);
    const pos = new THREE.Vector3(Math.cos(angle) * 14, 0, Math.sin(angle) * 14);
    this.spawnEnemy('boss', pos);
    this.sound.playNova();
    this.addTrauma(0.6);
    this.arena.triggerRipple(pos.x, pos.z);
    this.cb.onToast('⚠ BOSS 出現: PRISM TITAN', '撃破で大量コアシャード＆超ボーナス！', '#ff2a55');
  }

  private updateAutoFire(dt: number): void {
    const rapidPower = this.getUpgPower('rapid_blaster');
    const fireInterval = Math.max(
      0.085,
      (this.feverActive ? 0.14 : 0.24) / (1 + rapidPower * 0.28)
    );
    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;

    const target = this.findNearestEnemy(this.playerPos, 24);
    if (!target) return;

    this.fireTimer = fireInterval;
    const baseDir = new THREE.Vector3().subVectors(target.pos, this.playerPos);
    baseDir.y = 0;
    if (baseDir.lengthSq() < 0.001) return;
    baseDir.normalize();

    const shotCount = 1 + Math.min(4, Math.floor((this.getUpgLevel('rapid_blaster') + 1) / 2)) + (this.feverActive ? 1 : 0);
    const spreadAngle = 0.14;
    const bulletSpeed = 30 + rapidPower * 3.5;
    const bulletDmg = (18 + rapidPower * 4) * this.getDamageMult();
    const bounces = this.getUpgLevel('ricochet_prism');
    const skin = getSkinById(this.save.equippedSkin);

    for (let i = 0; i < shotCount; i++) {
      const offset = (i - (shotCount - 1) / 2) * spreadAngle;
      const dir = baseDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), offset);

      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.feverActive ? 0xffd700 : skin.primary).multiplyScalar(1.9),
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.playerBulletGeo, mat);
      const start = this.playerPos.clone().add(new THREE.Vector3(0, 0.85, 0)).addScaledVector(dir, 0.9);
      mesh.position.copy(start);
      this.entityGroup.add(mesh);

      this.bullets.push({
        mesh,
        pos: start,
        vel: dir.multiplyScalar(bulletSpeed),
        damage: bulletDmg,
        life: 1.4,
        fromPlayer: true,
        bouncesLeft: bounces,
        hitIds: new Set(),
        grazed: false,
        radius: 0.35,
      });
    }
    this.sound.playShoot();
  }

  private updateOrbitals(dt: number): void {
    const lv = this.getUpgLevel('twin_orbitals');
    const desiredCount = lv > 0 ? lv + 1 : 0;

    while (this.orbitals.length < desiredCount) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xc084fc).multiplyScalar(2.0),
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(this.orbitalGeo, mat);
      this.entityGroup.add(mesh);
      this.orbitals.push(mesh);
    }

    if (this.orbitals.length === 0) return;

    const orbitRadius = 3.4 + this.getUpgPower('twin_orbitals') * 0.22;
    this.orbitalAngle += dt * (4.2 + lv * 0.55);
    const dmgPerHit = (26 + this.getUpgPower('twin_orbitals') * 10) * this.getDamageMult();

    for (let i = 0; i < this.orbitals.length; i++) {
      const a = this.orbitalAngle + (i / this.orbitals.length) * Math.PI * 2;
      const ox = this.playerPos.x + Math.cos(a) * orbitRadius;
      const oz = this.playerPos.z + Math.sin(a) * orbitRadius;
      const orb = this.orbitals[i];
      orb.position.set(ox, 0.95, oz);
      orb.rotation.y += dt * 8;
      orb.rotation.x += dt * 5;

      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        const dx = e.pos.x - ox;
        const dz = e.pos.z - oz;
        if (dx * dx + dz * dz < (e.radius + 0.65) ** 2 && e.flashTimer <= 0.01) {
          this.damageEnemy(e, dmgPerHit, false, false);
        }
      }
    }
  }

  private spawnMine(x: number, z: number, lv: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xfb7185).multiplyScalar(1.9),
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.mineGeo, mat);
    mesh.position.set(x, 0.55, z);
    this.entityGroup.add(mesh);
    this.mines.push({
      mesh,
      pos: new THREE.Vector3(x, 0, z),
      fuse: 0.65,
      radius: 4.0 + lv * 0.6,
      damage: (50 + this.getUpgPower('nova_wake') * 20) * this.getDamageMult(),
    });
  }

  private updateMines(dt: number): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.fuse -= dt;
      m.mesh.rotation.y += dt * 8;
      const pulse = 1 + Math.sin(m.fuse * 28) * 0.25;
      m.mesh.scale.setScalar(pulse);

      if (m.fuse <= 0) {
        this.particles.spawnShockwave(m.pos.x, m.pos.z, 0xfb7185, m.radius * 1.15, 0.35);
        this.particles.burstVoxels(m.pos.x, 0.6, m.pos.z, 0xfb7185, 16, 12, 0.25, 1.9);
        this.arena.triggerRipple(m.pos.x, m.pos.z);
        this.addTrauma(0.18);
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (e.pos.distanceTo(m.pos) <= m.radius + e.radius) {
            this.damageEnemy(e, m.damage, false, true);
          }
        }
        this.entityGroup.remove(m.mesh);
        (m.mesh.material as THREE.Material).dispose();
        this.mines.splice(i, 1);
      }
    }
  }

  private spawnSingularity(pos: THREE.Vector3): void {
    const geo = new THREE.TorusGeometry(1.5, 0.1, 8, 28);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0x818cf8).multiplyScalar(2.0),
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.35, pos.z);
    this.entityGroup.add(mesh);
    this.singularities.push({
      mesh,
      pos: pos.clone(),
      life: 1.5,
      radius: 7.5 + this.getUpgPower('singularity_pull') * 1.4,
    });
  }

  private updateSingularities(dt: number): void {
    for (let i = this.singularities.length - 1; i >= 0; i--) {
      const s = this.singularities[i];
      s.life -= dt;
      s.mesh.rotation.z += dt * 7;
      s.mesh.scale.setScalar(0.7 + Math.sin(s.life * 12) * 0.2);

      for (const e of this.enemies) {
        if (e.kind === 'boss') continue;
        const toCenter = new THREE.Vector3().subVectors(s.pos, e.pos);
        toCenter.y = 0;
        const d = toCenter.length();
        if (d > 0.5 && d < s.radius) {
          toCenter.normalize();
          e.pos.addScaledVector(toCenter, dt * 11.5);
        }
      }

      if (s.life <= 0) {
        this.entityGroup.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.singularities.splice(i, 1);
      }
    }
  }

  private updateEnemies(dt: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const toPlayer = new THREE.Vector3().subVectors(this.playerPos, e.pos);
      toPlayer.y = 0;
      const dist = toPlayer.length() || 0.001;
      const dir = toPlayer.clone().divideScalar(dist);

      if (e.flashTimer > 0) {
        e.flashTimer -= dt;
        e.mainMat.emissive.setHex(e.flashTimer > 0 ? 0xffffff : e.color);
        e.mainMat.emissiveIntensity = e.flashTimer > 0 ? 4.5 : 1.5;
      }

      if (e.kind === 'swarm' || e.kind === 'mini' || e.kind === 'splitter') {
        e.pos.addScaledVector(dir, e.speed * dt);
        e.mesh.rotation.y += dt * (e.kind === 'mini' ? 6 : 2.8);
      } else if (e.kind === 'jackpot') {
        // Orbit playfully around the arena!
        const tangent = new THREE.Vector3(-e.pos.z, 0, e.pos.x).normalize();
        e.pos.addScaledVector(tangent, e.speed * 1.4 * dt);
        e.mesh.rotation.y += dt * 3.5;
        e.mesh.position.y = Math.sin(this.elapsed * 5 + e.id) * 0.35;
      } else if (e.kind === 'charger') {
        e.aiTimer -= dt;
        if (!e.charging) {
          e.pos.addScaledVector(dir, e.speed * 0.45 * dt);
          e.mesh.lookAt(this.playerPos.x, e.mesh.position.y, this.playerPos.z);

          // Show telegraph line 0.6s before lunge
          if (e.aiTimer <= 0.6 && !e.telegraphLine) {
            e.chargeDir.copy(dir);
            const pts = [
              e.pos.clone().setY(0.45),
              e.pos.clone().addScaledVector(e.chargeDir, 15).setY(0.45),
            ];
            const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
            const lineMat = new THREE.LineBasicMaterial({
              color: 0xff00aa,
              transparent: true,
              opacity: 0.75,
            });
            e.telegraphLine = new THREE.Line(lineGeo, lineMat);
            this.entityGroup.add(e.telegraphLine);
          }
          if (e.aiTimer <= 0) {
            e.charging = true;
            e.aiTimer = 0.52;
            if (e.telegraphLine) {
              this.entityGroup.remove(e.telegraphLine);
              e.telegraphLine.geometry.dispose();
              e.telegraphLine = undefined;
            }
          }
        } else {
          e.pos.addScaledVector(e.chargeDir, 25 * dt);
          if (e.aiTimer <= 0) {
            e.charging = false;
            e.aiTimer = 1.9 + Math.random() * 0.8;
          }
        }
      } else if (e.kind === 'turret') {
        // Keep mid-range distance & fire glowing plasma orbs
        if (dist > 13) e.pos.addScaledVector(dir, e.speed * dt);
        else if (dist < 8) e.pos.addScaledVector(dir, -e.speed * 0.7 * dt);
        e.mesh.rotation.y += dt * 2.2;

        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiTimer = Math.max(1.3, 2.5 - this.wave * 0.08);
          this.spawnEnemyBullet(e.pos, dir, 11.5, 0xf0abfc);
        }
      } else if (e.kind === 'boss') {
        e.pos.addScaledVector(dir, e.speed * dt);
        e.mesh.rotation.y += dt * 1.4;
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) {
          e.aiTimer = 1.35;
          const count = 10;
          const baseA = this.elapsed * 1.8;
          for (let k = 0; k < count; k++) {
            const a = baseA + (k / count) * Math.PI * 2;
            this.spawnEnemyBullet(e.pos, new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 10.5, 0xff5500);
          }
        }
      }

      // Soft separation between enemies
      for (let j = i - 1; j >= 0; j--) {
        const other = this.enemies[j];
        const dx = e.pos.x - other.pos.x;
        const dz = e.pos.z - other.pos.z;
        const minD = e.radius + other.radius;
        const dSq = dx * dx + dz * dz;
        if (dSq > 0.0001 && dSq < minD * minD) {
          const d = Math.sqrt(dSq);
          const push = (minD - d) * 0.35;
          const nx = dx / d;
          const nz = dz / d;
          e.pos.x += nx * push;
          e.pos.z += nz * push;
          other.pos.x -= nx * push;
          other.pos.z -= nz * push;
        }
      }

      // Arena clamp
      const ed = Math.hypot(e.pos.x, e.pos.z);
      if (ed > ARENA_RADIUS - 1) {
        const s = (ARENA_RADIUS - 1) / ed;
        e.pos.x *= s;
        e.pos.z *= s;
      }
      e.mesh.position.x = e.pos.x;
      e.mesh.position.z = e.pos.z;

      // Player collision (ignored during Dash invulnerability!)
      if (this.dashTimer <= 0 && this.invulnTimer <= 0) {
        const hitDist = e.radius + 0.72;
        if (dist < hitDist) {
          this.damagePlayer();
        }
      }
    }
  }

  private spawnEnemyBullet(origin: THREE.Vector3, dir: THREE.Vector3, speed: number, colorHex: number): void {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex).multiplyScalar(1.9),
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.enemyBulletGeo, mat);
    const start = origin.clone().setY(0.95);
    mesh.position.copy(start);
    this.entityGroup.add(mesh);

    this.bullets.push({
      mesh,
      pos: start,
      vel: dir.clone().normalize().multiplyScalar(speed),
      damage: 1,
      life: 4.5,
      fromPlayer: false,
      bouncesLeft: 0,
      hitIds: new Set(),
      grazed: false,
      radius: 0.38,
    });
  }

  private updateBullets(dt: number): void {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.pos.addScaledVector(b.vel, dt);
      b.mesh.position.copy(b.pos);
      b.mesh.rotation.y += dt * 10;
      b.mesh.rotation.x += dt * 8;

      let remove = b.life <= 0 || Math.hypot(b.pos.x, b.pos.z) > ARENA_RADIUS + 2;

      if (!remove && b.fromPlayer) {
        for (let j = this.enemies.length - 1; j >= 0; j--) {
          const e = this.enemies[j];
          if (b.hitIds.has(e.id)) continue;
          const dx = b.pos.x - e.pos.x;
          const dz = b.pos.z - e.pos.z;
          if (dx * dx + dz * dz <= (e.radius + b.radius) ** 2) {
            b.hitIds.add(e.id);
            this.damageEnemy(e, b.damage, false, false);

            if (b.bouncesLeft > 0) {
              b.bouncesLeft--;
              const next = this.findNearestEnemy(e.pos, 14, b.hitIds);
              if (next) {
                const nd = new THREE.Vector3().subVectors(next.pos, b.pos);
                nd.y = 0;
                nd.normalize();
                b.vel.copy(nd).multiplyScalar(b.vel.length());
                this.particles.spawnSpark(b.pos.x, 0.9, b.pos.z, 0x22d3ee);
                break;
              }
            }
            remove = true;
            break;
          }
        }
      } else if (!remove && !b.fromPlayer) {
        const dx = b.pos.x - this.playerPos.x;
        const dz = b.pos.z - this.playerPos.z;
        const d = Math.hypot(dx, dz);

        if (this.dashTimer > 0 && d < 2.2) {
          // Dashing through bullets vaporizes them into bonus score!
          this.addScore(100, b.pos, 'SLASH +100', '#00f0ff');
          this.particles.burstVoxels(b.pos.x, 0.8, b.pos.z, 0x00f0ff, 6, 8, 0.18, 1.8);
          remove = true;
        } else if (d < 0.85 && this.invulnTimer <= 0) {
          this.damagePlayer();
          remove = true;
        } else if (!b.grazed && d < 2.35 && d >= 0.85 && this.invulnTimer <= 0) {
          // NEAR-MISS GRAZE MECHANIC!
          b.grazed = true;
          this.grazes++;
          this.sound.playGraze();
          this.addCombo(1);
          this.addScore(150, this.playerPos.clone().add(new THREE.Vector3(0, 1.8, 0)), '✨ GRAZE!', '#fde047');
          this.addFever(8);
          this.dashCooldown = Math.max(0, this.dashCooldown - 0.35);
          this.particles.burstVoxels(this.playerPos.x, 0.9, this.playerPos.z, 0xfde047, 8, 9, 0.16, 2.0);
        }
      }

      if (remove) {
        this.entityGroup.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.bullets.splice(i, 1);
      }
    }
  }

  private damageEnemy(enemy: Enemy, rawDamage: number, isDash: boolean, isAoE: boolean): boolean {
    // Critical Hit calculation (Variable reward dopamine spike!)
    const critChance = 0.08 + this.getUpgPower('critical_overclock') * 0.13 + (isDash ? 0.12 : 0);
    const isCrit = Math.random() < critChance;
    const critMult = isCrit ? 2.4 + this.getUpgPower('critical_overclock') * 0.45 : 1.0;
    const finalDmg = rawDamage * critMult;

    enemy.hp -= finalDmg;
    enemy.flashTimer = 0.1;

    if (isCrit && enemy.hp > 0) {
      this.particles.burstVoxels(enemy.pos.x, 1.1, enemy.pos.z, 0xfacc15, 10, 11, 0.24, 2.2);
      this.spawnPopup(enemy.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), 'CRIT!', '#facc15');
    }

    if (enemy.hp <= 0) {
      this.killEnemy(enemy, isDash, isCrit, isAoE);
      return true;
    }

    // Small knockback on hit
    if (enemy.kind !== 'boss') {
      const push = new THREE.Vector3().subVectors(enemy.pos, this.playerPos);
      push.y = 0;
      if (push.lengthSq() > 0.001) {
        push.normalize();
        enemy.pos.addScaledVector(push, isDash ? 1.8 : 0.35);
      }
    }
    return false;
  }

  private killEnemy(enemy: Enemy, isDash: boolean, isCrit: boolean, isAoE: boolean): void {
    const idx = this.enemies.indexOf(enemy);
    if (idx === -1) return;
    this.enemies.splice(idx, 1);

    this.entityGroup.remove(enemy.mesh);
    if (enemy.telegraphLine) {
      this.entityGroup.remove(enemy.telegraphLine);
      enemy.telegraphLine.geometry.dispose();
    }

    this.kills++;
    this.addCombo(isDash ? 2 : 1);
    const dashBonus = isDash ? 1.5 : 1.0;
    const critBonus = isCrit ? 1.5 : 1.0;
    const pts = Math.round(enemy.scoreValue * dashBonus * critBonus);
    const popupColor = isCrit ? '#facc15' : isDash ? '#00f0ff' : '#f8fafc';
    const popupText =
      enemy.kind === 'jackpot'
        ? '💰 JACKPOT!!'
        : enemy.kind === 'boss'
        ? '👑 TITAN SHATTERED!!'
        : isCrit && isDash
        ? `★ MEGA SMASH +${Math.round(pts * this.getComboMultiplier()).toLocaleString()}`
        : undefined;

    this.addScore(pts, enemy.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), popupText, popupColor);
    this.addFever(isDash ? 7.5 : 3.2);

    // Explosive 3D Juice!
    const burstCount =
      enemy.kind === 'boss' ? 75 : enemy.kind === 'jackpot' ? 42 : isDash || isCrit ? 22 : 12;
    this.particles.burstVoxels(
      enemy.pos.x,
      1.0,
      enemy.pos.z,
      isCrit ? 0xfacc15 : enemy.color,
      burstCount,
      enemy.kind === 'boss' ? 22 : isDash ? 16 : 11,
      enemy.kind === 'boss' ? 0.5 : 0.32,
      isCrit ? 2.2 : 1.7
    );

    if (isDash || isCrit || enemy.kind === 'jackpot' || enemy.kind === 'boss') {
      this.particles.spawnShockwave(
        enemy.pos.x,
        enemy.pos.z,
        isCrit ? 0xfacc15 : enemy.color,
        enemy.kind === 'boss' ? 18 : isDash ? 6.5 : 4.5,
        0.38
      );
      this.arena.triggerRipple(enemy.pos.x, enemy.pos.z);
      this.hitstopTimer = Math.max(
        this.hitstopTimer,
        enemy.kind === 'boss' ? 0.11 : isCrit ? 0.055 : 0.036
      );
      this.addTrauma(enemy.kind === 'boss' ? 0.95 : isCrit ? 0.42 : 0.28);
      this.sound.playSmashKill(this.combo, isCrit || enemy.kind === 'boss');
    } else {
      this.sound.playEnemyKill(this.combo);
      this.addTrauma(0.08);
    }

    // Splitter splits into 3 fast mini-cubes!
    if (enemy.kind === 'splitter') {
      for (let s = 0; s < 3; s++) {
        const a = (s / 3) * Math.PI * 2;
        const p = enemy.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4));
        this.spawnEnemy('mini', p);
      }
    }

    // Jackpot Meteor reward fountain!
    if (enemy.kind === 'jackpot') {
      this.jackpots++;
      this.runShards += 18;
      this.sound.playJackpot();
      this.flashScreen('radial-gradient(circle, rgba(255,215,0,0.35), transparent 75%)', 0.4);
      for (let g = 0; g < 14; g++) {
        this.spawnGem(enemy.pos.x, enemy.pos.z, 'gold', 14);
      }
      this.spawnGem(enemy.pos.x, enemy.pos.z, 'heal', 1);
      this.addFever(38);
    } else if (enemy.kind === 'boss') {
      this.bossKills++;
      this.runShards += 45;
      this.sound.playJackpot();
      this.flashScreen('radial-gradient(circle, rgba(255,60,120,0.4), rgba(255,215,0,0.3))', 0.5);
      for (let g = 0; g < 22; g++) {
        this.spawnGem(enemy.pos.x, enemy.pos.z, 'gold', 18);
      }
      this.spawnGem(enemy.pos.x, enemy.pos.z, 'heal', 1);
    } else {
      const gemKind = this.feverActive && Math.random() < 0.6 ? 'gold' : 'xp';
      this.spawnGem(enemy.pos.x, enemy.pos.z, gemKind, enemy.xpValue);
      if (Math.random() < 0.03 && this.hp < this.maxHp) {
        this.spawnGem(enemy.pos.x, enemy.pos.z, 'heal', 1);
      }
    }

    // Upgrade: Chain Lightning on Dash-Smash (or during Fever!)
    const chainLv = this.getUpgLevel('chain_lightning');
    if ((isDash || this.feverActive) && !isAoE && (chainLv > 0 || this.feverActive)) {
      const targets = Math.max(2, chainLv + 1);
      const chainRange = 10 + this.getUpgPower('chain_lightning') * 1.5;
      const chainDmg = (42 + this.getUpgPower('chain_lightning') * 22) * this.getDamageMult();
      this.triggerChainLightning(enemy.pos, targets, chainRange, chainDmg);
    }

    // Upgrade: Singularity Pull on kill
    const singLv = this.getUpgLevel('singularity_pull');
    if (singLv > 0 && Math.random() < 0.25 + singLv * 0.1) {
      this.spawnSingularity(enemy.pos);
    }
  }

  private triggerChainLightning(origin: THREE.Vector3, maxTargets: number, range: number, damage: number): void {
    const candidates = this.enemies
      .filter((e) => e.pos.distanceTo(origin) <= range)
      .sort((a, b) => a.pos.distanceTo(origin) - b.pos.distanceTo(origin))
      .slice(0, maxTargets);

    if (candidates.length === 0) return;
    this.sound.playChainLightning();
    let prevPos = origin.clone();
    for (const target of candidates) {
      this.particles.spawnLightning(prevPos, target.pos, this.feverActive ? 0xfde047 : 0x38bdf8);
      prevPos = target.pos.clone();
      this.damageEnemy(target, damage, false, true);
    }
  }

  private spawnGem(x: number, z: number, kind: 'xp' | 'gold' | 'heal', value: number): void {
    const mesh = createGemMesh(kind);
    const pos = new THREE.Vector3(x, 0.55, z);
    mesh.position.copy(pos);
    this.entityGroup.add(mesh);
    const angle = Math.random() * Math.PI * 2;
    const spd = 4 + Math.random() * 6;
    this.gems.push({
      mesh,
      pos,
      vel: new THREE.Vector3(Math.cos(angle) * spd, 0, Math.sin(angle) * spd),
      kind,
      value,
      life: 16,
    });
  }

  private updateGems(dt: number): void {
    const magnetRange =
      (6.5 + this.save.meta.magnet * 1.2 + this.getUpgPower('magnet_vortex') * 2.8) *
      (this.feverActive ? 1.9 : 1.0);

    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      g.life -= dt;
      g.vel.multiplyScalar(Math.pow(0.08, dt));
      g.pos.addScaledVector(g.vel, dt);

      const toPlayer = new THREE.Vector3().subVectors(this.playerPos, g.pos);
      toPlayer.y = 0;
      const dist = toPlayer.length();

      if (dist < magnetRange) {
        const pullSpeed = 24 + (1 - dist / magnetRange) * 26;
        toPlayer.normalize();
        g.pos.addScaledVector(toPlayer, pullSpeed * dt);
      }

      g.mesh.position.set(g.pos.x, 0.55 + Math.sin(this.elapsed * 7 + i) * 0.16, g.pos.z);
      g.mesh.rotation.y += dt * 4.5;

      if (dist < 1.25) {
        if (g.kind === 'heal') {
          if (this.hp < this.maxHp) {
            this.hp++;
            this.spawnPopup(this.playerPos.clone().add(new THREE.Vector3(0, 2, 0)), '+1 SHIELD!', '#38ef7d');
          } else {
            this.addScore(500, this.playerPos, 'MAX SHIELD +500', '#38ef7d');
          }
          this.sound.playLevelUp();
        } else {
          this.xp += g.value;
          if (g.kind === 'gold') {
            this.runShards += 2;
            this.addScore(250);
          } else {
            this.addScore(35);
          }
          this.sound.playGemPickup(this.combo);

          // Magnet Vortex shockwave bonus
          const magLv = this.getUpgLevel('magnet_vortex');
          if (magLv > 0 && Math.random() < 0.16) {
            this.particles.spawnShockwave(this.playerPos.x, this.playerPos.z, 0x2dd4bf, 4.2, 0.25);
            for (let j = this.enemies.length - 1; j >= 0; j--) {
              const e = this.enemies[j];
              if (e.pos.distanceTo(this.playerPos) < 4.5) {
                this.damageEnemy(e, 18 * magLv * this.getDamageMult(), false, true);
              }
            }
          }

          if (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level++;
            this.xpToNext = Math.round(this.xpToNext * 1.32 + 24);
            this.triggerLevelUp();
          }
        }

        this.entityGroup.remove(g.mesh);
        (g.mesh.material as THREE.Material).dispose();
        this.gems.splice(i, 1);
      } else if (g.life <= 0) {
        this.entityGroup.remove(g.mesh);
        (g.mesh.material as THREE.Material).dispose();
        this.gems.splice(i, 1);
      }
    }
  }

  private damagePlayer(): void {
    this.hp--;
    this.invulnTimer = 1.25;
    this.combo = Math.floor(this.combo * 0.5); // Keep half combo so it stings without crushing flow
    this.sound.playPlayerHit();
    this.hitstopTimer = 0.08;
    this.addTrauma(0.85);
    this.flashScreen('radial-gradient(circle, transparent 35%, rgba(255, 30, 80, 0.65) 100%)', 0.35);
    this.particles.burstVoxels(this.playerPos.x, 1.0, this.playerPos.z, 0xff2a55, 28, 15, 0.35, 2.0);
    this.particles.spawnShockwave(this.playerPos.x, this.playerPos.z, 0xff2a55, 9, 0.42);
    this.spawnPopup(this.playerPos.clone().add(new THREE.Vector3(0, 2.2, 0)), 'SHIELD HIT!', '#ff4d6d', true);

    // Push nearby enemies away slightly on hit
    for (const e of this.enemies) {
      if (e.kind === 'boss') continue;
      const away = new THREE.Vector3().subVectors(e.pos, this.playerPos);
      away.y = 0;
      const d = away.length();
      if (d > 0.01 && d < 7) {
        e.pos.addScaledVector(away.normalize(), 4.5);
      }
    }

    if (this.hp <= 0) {
      this.endRun();
    }
    this.emitHud();
  }

  private triggerLevelUp(): void {
    this.sound.playLevelUp();
    this.phase = 'levelup';
    this.cb.onPhaseChange('levelup');

    const available = UPGRADES.filter((u) => this.getUpgLevel(u.id) < u.maxLevel);
    const pool = available.length >= 3 ? [...available] : [...UPGRADES];
    const picked: UpgradeChoice[] = [];

    for (let i = 0; i < 3 && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const def = pool.splice(idx, 1)[0];
      const rarity = this.rollRarity();
      const cfg = RARITY_CONFIG[rarity];
      picked.push({
        def,
        rarity,
        currentLevel: this.getUpgLevel(def.id),
        bonusMult: cfg.mult,
        rarityLabel: cfg.label,
      });
    }

    this.activeChoices = picked;
    this.cb.onLevelUpChoices(picked);
  }

  private rollRarity(): Rarity {
    const luck = this.save.meta.luck;
    const wCommon = Math.max(18, RARITY_CONFIG.common.weight - luck * 5);
    const wRare = RARITY_CONFIG.rare.weight + luck * 2;
    const wEpic = RARITY_CONFIG.epic.weight + luck * 2.2;
    const wMythic = RARITY_CONFIG.mythic.weight + luck * 1.4;
    const total = wCommon + wRare + wEpic + wMythic;
    let r = Math.random() * total;
    if ((r -= wMythic) < 0) return 'mythic';
    if ((r -= wEpic) < 0) return 'epic';
    if ((r -= wRare) < 0) return 'rare';
    return 'common';
  }

  public selectUpgrade(index: number): void {
    if (this.phase !== 'levelup') return;
    const choice = this.activeChoices[index];
    if (!choice) return;

    this.sound.playUiClick();
    const curLv = this.getUpgLevel(choice.def.id);
    this.upgradeLevels.set(choice.def.id, curLv + 1);
    const curPow = this.getUpgPower(choice.def.id);
    this.upgradePower.set(choice.def.id, curPow + choice.bonusMult);

    this.particles.spawnShockwave(this.playerPos.x, this.playerPos.z, 0x38ef7d, 10, 0.4);
    this.spawnPopup(
      this.playerPos.clone().add(new THREE.Vector3(0, 2.3, 0)),
      `${choice.def.icon} ${choice.def.name} UP!`,
      RARITY_CONFIG[choice.rarity].color,
      true
    );

    this.invulnTimer = Math.max(this.invulnTimer, 0.75);
    this.phase = 'playing';
    this.lastTime = performance.now();
    this.cb.onPhaseChange('playing');
    this.emitHud();
  }

  private endRun(): void {
    this.sound.playGameOver();
    this.phase = 'gameover';
    this.cb.onPhaseChange('gameover');

    const prevHigh = this.save.highScore;
    const isNewRecord = this.score > prevHigh;
    const rankInfo = computeRank(this.score);

    // Core shards earned: guarantees meaningful forward meta-progression even on short runs!
    const scoreShards = Math.floor(this.score / 550);
    const waveShards = this.wave * 4;
    const totalShardsEarned = Math.max(10, scoreShards + waveShards + this.runShards);

    const summary: RunSummary = {
      score: this.score,
      prevHighScore: prevHigh,
      isNewRecord,
      maxCombo: this.maxCombo,
      wave: this.wave,
      timeSec: Math.floor(this.runTime),
      kills: this.kills,
      dashKills: this.dashKills,
      grazes: this.grazes,
      fevers: this.fevers,
      jackpots: this.jackpots,
      bossKills: this.bossKills,
      shardsEarned: totalShardsEarned,
      rank: rankInfo.grade,
    };

    // Check newly completed missions!
    let missionBonus = 0;
    for (const m of MISSIONS) {
      if (!this.save.completedMissions.includes(m.id) && m.check(summary, this.save)) {
        this.save.completedMissions.push(m.id);
        missionBonus += m.reward;
        this.cb.onToast(`🏆 ミッション達成: ${m.title}`, `報酬 +${m.reward} CORE SHARDS ◆`, '#38ef7d');
      }
    }
    summary.shardsEarned += missionBonus;

    // Persist save
    this.save.shards += summary.shardsEarned;
    this.save.totalRuns += 1;
    this.save.totalKills += this.kills;
    if (this.score > this.save.highScore) this.save.highScore = this.score;
    if (this.maxCombo > this.save.bestCombo) this.save.bestCombo = this.maxCombo;
    if (this.wave > this.save.bestWave) this.save.bestWave = this.wave;
    if (isBetterRank(rankInfo.grade, this.save.bestRank)) {
      this.save.bestRank = rankInfo.grade;
    }
    saveSave(this.save);

    this.cb.onGameOver(summary);
  }

  private findNearestEnemy(origin: THREE.Vector3, maxRange: number, excludeIds?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bestDistSq = maxRange * maxRange;
    for (const e of this.enemies) {
      if (excludeIds?.has(e.id)) continue;
      const dx = e.pos.x - origin.x;
      const dz = e.pos.z - origin.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        best = e;
      }
    }
    return best;
  }

  private updateCamera(dt: number): void {
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.1);
    const shake = this.shakeTrauma * this.shakeTrauma;
    const sx = (Math.random() * 2 - 1) * shake * 1.45;
    const sy = (Math.random() * 2 - 1) * shake * 1.1;
    const sz = (Math.random() * 2 - 1) * shake * 1.45;

    // Lead slightly into velocity for kinetic visibility
    const leadX = this.playerPos.x * 0.58 + this.playerVel.x * 0.08;
    const leadZ = this.playerPos.z * 0.58 + this.playerVel.z * 0.08;

    const desiredPos = new THREE.Vector3(leadX + sx, 25.5 + sy, leadZ + 18.5 + sz);
    this.camera.position.lerp(desiredPos, Math.min(1, dt * 8));
    this.camera.lookAt(leadX * 0.85, 0.4, leadZ * 0.85);

    // Dynamic FOV kick during Dash & Fever!
    const targetFov = this.dashTimer > 0 ? 64 : this.feverActive ? 58 : 53;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 11);
    this.camera.updateProjectionMatrix();

    // Dynamic bloom intensity boost during Fever
    this.bloomPass.strength += ((this.feverActive ? 1.55 : 1.12) - this.bloomPass.strength) * Math.min(1, dt * 5);
  }

  private spawnPopup(worldPos: THREE.Vector3, text: string, color: string, large = false): void {
    if (this.popups.length > 26) {
      const oldest = this.popups.shift();
      oldest?.el.remove();
    }
    const el = document.createElement('div');
    el.className = large ? 'float-popup large' : 'float-popup';
    el.textContent = text;
    el.style.color = color;
    this.floatingLayer.appendChild(el);
    this.popups.push({
      el,
      worldPos: worldPos.clone(),
      life: large ? 1.05 : 0.72,
      maxLife: large ? 1.05 : 0.72,
      riseSpeed: large ? 2.6 : 2.1,
    });
  }

  private updatePopups(dt: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const proj = new THREE.Vector3();

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      p.worldPos.y += p.riseSpeed * dt;
      proj.copy(p.worldPos).project(this.camera);
      const sx = (proj.x * 0.5 + 0.5) * w;
      const sy = (-proj.y * 0.5 + 0.5) * h;
      const alpha = Math.min(1, (p.life / p.maxLife) * 2.2);
      const scale = p.life > p.maxLife * 0.8 ? 1.25 : 1.0;
      p.el.style.transform = `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%) scale(${scale})`;
      p.el.style.opacity = `${alpha}`;
    }
  }

  private emitHud(): void {
    const boss = this.enemies.find((e) => e.kind === 'boss');
    const upgrades: HudSnapshot['upgrades'] = [];
    this.upgradeLevels.forEach((lv, id) => {
      const def = UPGRADES.find((u) => u.id === id);
      if (def) upgrades.push({ id, icon: def.icon, name: def.name, level: lv, color: def.color });
    });

    this.cb.onHudUpdate({
      score: this.score,
      highScore: Math.max(this.save.highScore, this.score),
      wave: this.wave,
      shards: this.save.shards + this.runShards,
      combo: this.combo,
      multiplier: this.getComboMultiplier(),
      comboTimerRatio: this.combo > 0 ? Math.max(0, this.comboTimer / this.comboMaxTime) : 0,
      hp: this.hp,
      maxHp: this.maxHp,
      dashCooldownRatio:
        this.dashCooldown <= 0 ? 1 : Math.max(0, 1 - this.dashCooldown / this.dashMaxCooldown),
      dashReady: this.dashCooldown <= 0,
      feverRatio: this.feverGauge / 100,
      feverActive: this.feverActive,
      feverTimeRatio: this.feverActive ? Math.max(0, this.feverTimer / this.feverDuration) : 0,
      level: this.level,
      xpRatio: Math.min(1, this.xp / this.xpToNext),
      bossActive: Boolean(boss),
      bossHpRatio: boss ? Math.max(0, boss.hp / boss.maxHp) : 0,
      upgrades,
    });
  }
}
