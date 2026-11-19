export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';

export type GamePhase = 'title' | 'playing' | 'levelup' | 'paused' | 'gameover';

export type RankGrade = 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';

export type UpgradeId =
  | 'chain_lightning'
  | 'nova_wake'
  | 'twin_orbitals'
  | 'ricochet_prism'
  | 'critical_overclock'
  | 'singularity_pull'
  | 'rapid_blaster'
  | 'dash_overcharge'
  | 'magnet_vortex'
  | 'greed_reactor';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  baseRarity: Rarity;
  color: string;
}

export interface UpgradeChoice {
  def: UpgradeDef;
  rarity: Rarity;
  currentLevel: number;
  bonusMult: number; // Higher rarity boosts effect strength
  rarityLabel: string;
}

export type MetaUpgradeId =
  | 'power'
  | 'thruster'
  | 'shield'
  | 'magnet'
  | 'fever'
  | 'luck';

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  costStep: number;
  perLevelLabel: string;
}

export interface SkinDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  primary: number;
  secondary: number;
  accent: number;
  previewGradient: string;
}

export interface MissionDef {
  id: string;
  title: string;
  desc: string;
  reward: number;
  check: (run: RunSummary, save: SaveData) => boolean;
}

export interface SaveData {
  version: number;
  highScore: number;
  bestRank: RankGrade;
  bestCombo: number;
  bestWave: number;
  totalRuns: number;
  totalKills: number;
  shards: number;
  meta: Record<MetaUpgradeId, number>;
  unlockedSkins: string[];
  equippedSkin: string;
  completedMissions: string[];
  muted: boolean;
}

export interface RunSummary {
  score: number;
  prevHighScore: number;
  isNewRecord: boolean;
  maxCombo: number;
  wave: number;
  timeSec: number;
  kills: number;
  dashKills: number;
  grazes: number;
  fevers: number;
  jackpots: number;
  bossKills: number;
  shardsEarned: number;
  rank: RankGrade;
}

export interface HudSnapshot {
  score: number;
  highScore: number;
  wave: number;
  shards: number;
  combo: number;
  multiplier: number;
  comboTimerRatio: number;
  hp: number;
  maxHp: number;
  dashCooldownRatio: number; // 1 = ready
  dashReady: boolean;
  feverRatio: number; // 0..1
  feverActive: boolean;
  feverTimeRatio: number;
  level: number;
  xpRatio: number;
  bossActive: boolean;
  bossHpRatio: number;
  upgrades: Array<{ id: UpgradeId; icon: string; name: string; level: number; color: string }>;
}
