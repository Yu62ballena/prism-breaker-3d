import { RANK_THRESHOLDS } from './constants';
import type { RankGrade, SaveData } from './types';

const STORAGE_KEY = 'prism_breaker_3d_save_v1';

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    highScore: 0,
    bestRank: 'D',
    bestCombo: 0,
    bestWave: 1,
    totalRuns: 0,
    totalKills: 0,
    shards: 0,
    meta: {
      power: 0,
      thruster: 0,
      shield: 0,
      magnet: 0,
      fever: 0,
      luck: 0,
    },
    unlockedSkins: ['prism_cyan'],
    equippedSkin: 'prism_cyan',
    completedMissions: [],
    muted: false,
  };
}

export function loadSave(): SaveData {
  const def = createDefaultSave();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      ...def,
      ...parsed,
      meta: { ...def.meta, ...(parsed.meta ?? {}) },
      unlockedSkins: Array.isArray(parsed.unlockedSkins) && parsed.unlockedSkins.length > 0
        ? parsed.unlockedSkins
        : def.unlockedSkins,
      completedMissions: Array.isArray(parsed.completedMissions) ? parsed.completedMissions : [],
    };
  } catch {
    return def;
  }
}

export function saveSave(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export function isBetterRank(a: RankGrade, b: RankGrade): boolean {
  const idxA = RANK_THRESHOLDS.findIndex((r) => r.grade === a);
  const idxB = RANK_THRESHOLDS.findIndex((r) => r.grade === b);
  return idxA < idxB;
}
