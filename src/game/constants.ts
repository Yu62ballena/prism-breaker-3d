import type {
  MetaUpgradeDef,
  MissionDef,
  RankGrade,
  Rarity,
  SkinDef,
  UpgradeDef,
} from './types';

export const ARENA_RADIUS = 26;

export const RARITY_CONFIG: Record<
  Rarity,
  { label: string; mult: number; color: string; weight: number }
> = {
  common: { label: 'COMMON', mult: 1.0, color: '#7dd3fc', weight: 52 },
  rare: { label: 'RARE', mult: 1.35, color: '#38ef7d', weight: 30 },
  epic: { label: 'EPIC', mult: 1.75, color: '#c084fc', weight: 14 },
  mythic: { label: 'MYTHIC ★', mult: 2.35, color: '#fbbf24', weight: 4 },
};

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'chain_lightning',
    name: 'チェインライトニング',
    icon: '⚡',
    desc: 'ダッシュ撃破時に周囲の敵へ高圧プラズマ雷撃が連鎖する',
    maxLevel: 5,
    baseRarity: 'rare',
    color: '#38bdf8',
  },
  {
    id: 'twin_orbitals',
    name: 'プリズム・オービタル',
    icon: '🛸',
    desc: '自機の周囲を高速回転する3Dレーザーブレードを展開',
    maxLevel: 5,
    baseRarity: 'rare',
    color: '#a855f7',
  },
  {
    id: 'nova_wake',
    name: 'ノヴァ・ウェイク',
    icon: '💥',
    desc: 'ダッシュの軌跡に起爆プラズマ機雷を残し連鎖爆発を起こす',
    maxLevel: 5,
    baseRarity: 'common',
    color: '#fb7185',
  },
  {
    id: 'ricochet_prism',
    name: 'リコシェ・プリズム',
    icon: '💠',
    desc: 'オートショットが敵に命中するたび別の敵へ跳弾する',
    maxLevel: 5,
    baseRarity: 'common',
    color: '#22d3ee',
  },
  {
    id: 'critical_overclock',
    name: 'メガクリティカル回路',
    icon: '🎯',
    desc: 'クリティカル率と倍率を大幅強化。発動時は黄金の大爆発＆大ヒットストップ',
    maxLevel: 5,
    baseRarity: 'epic',
    color: '#facc15',
  },
  {
    id: 'singularity_pull',
    name: 'シンギュラリティ吸引',
    icon: '🌀',
    desc: '撃破地点に重力井戸が発生し、周囲の敵を一網打尽に引き寄せる',
    maxLevel: 5,
    baseRarity: 'epic',
    color: '#818cf8',
  },
  {
    id: 'rapid_blaster',
    name: 'ハイパー・ラピッド砲',
    icon: '🔫',
    desc: 'オート射撃の連射速度・同時発射数・弾速をブースト',
    maxLevel: 5,
    baseRarity: 'common',
    color: '#34d399',
  },
  {
    id: 'dash_overcharge',
    name: 'オーバーチャージ・ダッシュ',
    icon: '🚀',
    desc: 'ダッシュの衝撃波範囲と威力を拡大＋クールタイム短縮',
    maxLevel: 5,
    baseRarity: 'common',
    color: '#f472b6',
  },
  {
    id: 'magnet_vortex',
    name: 'マグネット・ボルテックス',
    icon: '🧲',
    desc: 'クリスタル吸引範囲が劇的に広がり、回収時に微小衝撃波を放つ',
    maxLevel: 5,
    baseRarity: 'common',
    color: '#2dd4bf',
  },
  {
    id: 'greed_reactor',
    name: 'グリード・リアクター',
    icon: '👑',
    desc: 'スコア倍率とフィーバー上昇速度を劇的に増幅するハイリターン炉',
    maxLevel: 5,
    baseRarity: 'mythic',
    color: '#fbbf24',
  },
];

export const META_UPGRADES: MetaUpgradeDef[] = [
  {
    id: 'power',
    name: 'プリズム出力強化',
    icon: '⚔️',
    desc: '全攻撃力・ダッシュ衝撃波ダメージを恒久アップ',
    maxLevel: 8,
    baseCost: 25,
    costStep: 25,
    perLevelLabel: '+14% 攻撃力',
  },
  {
    id: 'thruster',
    name: 'スラスター最適化',
    icon: '⚡',
    desc: '移動速度とダッシュ回転率を恒久アップ',
    maxLevel: 6,
    baseCost: 30,
    costStep: 30,
    perLevelLabel: '+6% 速度 / -8% CD',
  },
  {
    id: 'shield',
    name: '強化シールドセル',
    icon: '🛡️',
    desc: '初期シールド最大値を恒久増加',
    maxLevel: 4,
    baseCost: 50,
    costStep: 55,
    perLevelLabel: '+1 最大シールド',
  },
  {
    id: 'magnet',
    name: '磁気コア拡張',
    icon: '🧲',
    desc: 'クリスタル＆シャード吸引範囲を恒久アップ',
    maxLevel: 6,
    baseCost: 20,
    costStep: 22,
    perLevelLabel: '+18% 吸引範囲',
  },
  {
    id: 'fever',
    name: 'フィーバー触媒',
    icon: '🔥',
    desc: 'フィーバーゲージの溜まりやすさと持続時間を延長',
    maxLevel: 6,
    baseCost: 35,
    costStep: 35,
    perLevelLabel: '+12% フィーバー効率',
  },
  {
    id: 'luck',
    name: 'ジャックポット幸運炉',
    icon: '🍀',
    desc: 'EPIC/MYTHICカード出現率＆黄金メテオ出現率アップ',
    maxLevel: 6,
    baseCost: 40,
    costStep: 40,
    perLevelLabel: '+15% レア＆幸運率',
  },
];

export const SKINS: SkinDef[] = [
  {
    id: 'prism_cyan',
    name: 'PRISM CYAN',
    desc: '標準の蒼き光学プリズム機。鋭く透き通るサイバー光。',
    cost: 0,
    primary: 0x00f0ff,
    secondary: 0x38bdf8,
    accent: 0xff2a85,
    previewGradient: 'linear-gradient(135deg, #00f0ff, #ff2a85)',
  },
  {
    id: 'crimson_blaze',
    name: 'CRIMSON OVERDRIVE',
    desc: '灼熱の紅蓮コア。燃え上がるプラズマ軌跡を纏う。',
    cost: 80,
    primary: 0xff3b5c,
    secondary: 0xff8a00,
    accent: 0xffe600,
    previewGradient: 'linear-gradient(135deg, #ff3b5c, #ffe600)',
  },
  {
    id: 'cyber_gold',
    name: 'ROYAL JACKPOT',
    desc: '純金プリズム装甲。眩い黄金閃光を放つハイローラー仕様。',
    cost: 160,
    primary: 0xffd700,
    secondary: 0xff9d00,
    accent: 0xffffff,
    previewGradient: 'linear-gradient(135deg, #ffd700, #fff4b8)',
  },
  {
    id: 'void_violet',
    name: 'ASTRAL PHANTOM',
    desc: '深淵の紫紺とエメラルドが交錯する超次元ステルス機。',
    cost: 240,
    primary: 0xc026d3,
    secondary: 0x2dd4bf,
    accent: 0x38bdf8,
    previewGradient: 'linear-gradient(135deg, #c026d3, #2dd4bf)',
  },
];

export const MISSIONS: MissionDef[] = [
  {
    id: 'first_blood',
    title: '最初の連鎖',
    desc: '1プレイで15コンボ以上を達成する',
    reward: 30,
    check: (run) => run.maxCombo >= 15,
  },
  {
    id: 'dash_master',
    title: '体当たり職人',
    desc: '1プレイでダッシュ撃破を15回決める',
    reward: 45,
    check: (run) => run.dashKills >= 15,
  },
  {
    id: 'graze_dancer',
    title: '紙一重の舞踏家',
    desc: '1プレイでカスリ（GRAZE）を8回決める',
    reward: 50,
    check: (run) => run.grazes >= 8,
  },
  {
    id: 'fever_starter',
    title: '脳汁オーバーヒート',
    desc: '1プレイでFEVER OVERDRIVEに突入する',
    reward: 40,
    check: (run) => run.fevers >= 1,
  },
  {
    id: 'jackpot_hunter',
    title: '黄金メテオ破壊者',
    desc: '黄金ジャックポット・メテオを破壊する',
    reward: 55,
    check: (run) => run.jackpots >= 1,
  },
  {
    id: 'chain_god',
    title: '50連鎖の向こう側',
    desc: '1プレイで50コンボ以上を達成する',
    reward: 90,
    check: (run) => run.maxCombo >= 50,
  },
  {
    id: 'titan_slayer',
    title: 'タイタン粉砕',
    desc: 'ボス「PRISM TITAN」を撃破する',
    reward: 120,
    check: (run) => run.bossKills >= 1,
  },
  {
    id: 'score_s',
    title: 'Sランク到達',
    desc: 'スコア 50,000 点以上を達成する',
    reward: 150,
    check: (run) => run.score >= 50000,
  },
];

export const RANK_THRESHOLDS: Array<{ grade: RankGrade; score: number; color: string }> = [
  { grade: 'SSS', score: 250000, color: '#ff3bef' },
  { grade: 'SS', score: 120000, color: '#fbbf24' },
  { grade: 'S', score: 50000, color: '#f97316' },
  { grade: 'A', score: 22000, color: '#38bdf8' },
  { grade: 'B', score: 10000, color: '#34d399' },
  { grade: 'C', score: 3500, color: '#a3e635' },
  { grade: 'D', score: 0, color: '#94a3b8' },
];

export function computeRank(score: number): { grade: RankGrade; color: string; next?: { grade: RankGrade; score: number } } {
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (score >= RANK_THRESHOLDS[i].score) {
      return {
        grade: RANK_THRESHOLDS[i].grade,
        color: RANK_THRESHOLDS[i].color,
        next: i > 0 ? { grade: RANK_THRESHOLDS[i - 1].grade, score: RANK_THRESHOLDS[i - 1].score } : undefined,
      };
    }
  }
  return { grade: 'D', color: '#94a3b8', next: { grade: 'C', score: 3500 } };
}

export function getMetaCost(def: MetaUpgradeDef, level: number): number {
  return def.baseCost + level * def.costStep;
}

export function getSkinById(id: string): SkinDef {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
