import {
  META_UPGRADES,
  MISSIONS,
  RARITY_CONFIG,
  SKINS,
  computeRank,
  getMetaCost,
} from './constants';
import { saveSave } from './storage';
import type { GamePhase, HudSnapshot, RunSummary, SaveData, UpgradeChoice } from './types';

export interface UiHandlers {
  onStart: () => void;
  onSelectUpgrade: (index: number) => void;
  onTogglePause: () => void;
  onGoTitle: () => void;
  onToggleSound: () => boolean;
  onSkinChanged: () => void;
  onPlayClickSfx: () => void;
}

export class GameUI {
  private save: SaveData;
  private handlers: UiHandlers;
  private returnPhaseAfterLab: 'title' | 'gameover' = 'title';
  private gameoverAt = 0;

  // Cached elements
  private hud = document.getElementById('hud')!;
  private titleOverlay = document.getElementById('title-overlay')!;
  private upgradeOverlay = document.getElementById('upgrade-overlay')!;
  private gameoverOverlay = document.getElementById('gameover-overlay')!;
  private labOverlay = document.getElementById('lab-overlay')!;
  private pauseOverlay = document.getElementById('pause-overlay')!;
  private toastContainer = document.getElementById('toast-container')!;

  private hudScore = document.getElementById('hud-score')!;
  private hudBest = document.getElementById('hud-best')!;
  private hudWave = document.getElementById('hud-wave')!;
  private hudShards = document.getElementById('hud-shards')!;
  private comboBox = document.getElementById('combo-box')!;
  private hudCombo = document.getElementById('hud-combo')!;
  private hudMult = document.getElementById('hud-mult')!;
  private comboTimerBar = document.getElementById('combo-timer-bar')!;
  private feverBanner = document.getElementById('fever-banner')!;
  private bossBarWrap = document.getElementById('boss-bar-wrap')!;
  private bossHpFill = document.getElementById('boss-hp-fill')!;

  private hudHpText = document.getElementById('hud-hp-text')!;
  private hpPips = document.getElementById('hp-pips')!;
  private hudDashStatus = document.getElementById('hud-dash-status')!;
  private dashBar = document.getElementById('dash-bar')!;
  private hudFeverText = document.getElementById('hud-fever-text')!;
  private feverBar = document.getElementById('fever-bar')!;
  private hudLevel = document.getElementById('hud-level')!;
  private xpBar = document.getElementById('xp-bar')!;
  private activeUpgrades = document.getElementById('active-upgrades')!;
  private btnSound = document.getElementById('btn-sound')!;

  private lastComboVal = 0;
  private lastPhase: GamePhase = 'title';

  constructor(save: SaveData, handlers: UiHandlers) {
    this.save = save;
    this.handlers = handlers;
    this.bindButtons();
    this.refreshTitleStats();
    this.updateSoundButton();
  }

  private bindButtons(): void {
    document.getElementById('btn-play')!.addEventListener('click', () => this.handlers.onStart());
    document.getElementById('btn-retry')!.addEventListener('click', () => this.handlers.onStart());
    document.getElementById('btn-resume')!.addEventListener('click', () => this.handlers.onTogglePause());
    document.getElementById('btn-pause')!.addEventListener('click', () => this.handlers.onTogglePause());
    document.getElementById('btn-pause-retry')!.addEventListener('click', () => this.handlers.onStart());
    document.getElementById('btn-pause-title')!.addEventListener('click', () => this.handlers.onGoTitle());

    this.btnSound.addEventListener('click', () => {
      const muted = this.handlers.onToggleSound();
      this.save.muted = muted;
      saveSave(this.save);
      this.updateSoundButton();
    });

    document.getElementById('btn-lab-title')!.addEventListener('click', () => {
      this.handlers.onPlayClickSfx();
      this.openLab('title');
    });
    document.getElementById('btn-lab-result')!.addEventListener('click', () => {
      this.handlers.onPlayClickSfx();
      this.openLab('gameover');
    });
    document.getElementById('btn-lab-close')!.addEventListener('click', () => {
      this.handlers.onPlayClickSfx();
      this.closeLab();
    });

    // Lab tabs
    const tabs = document.querySelectorAll<HTMLButtonElement>('.lab-tab');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.handlers.onPlayClickSfx();
        tabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.dataset.tab!;
        document.getElementById('lab-content-upgrades')!.classList.toggle('hidden', target !== 'upgrades');
        document.getElementById('lab-content-skins')!.classList.toggle('hidden', target !== 'skins');
        document.getElementById('lab-content-missions')!.classList.toggle('hidden', target !== 'missions');
      });
    });

    // Global quick-start / instant-restart shortcuts
    window.addEventListener('keydown', (e) => {
      if (!this.labOverlay.classList.contains('hidden')) {
        if (e.code === 'Escape') this.closeLab();
        return;
      }
      if (this.lastPhase === 'title' && (e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        this.handlers.onStart();
      } else if (
        this.lastPhase === 'gameover' &&
        (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR')
      ) {
        if (performance.now() - this.gameoverAt > 360) {
          e.preventDefault();
          this.handlers.onStart();
        }
      }
    });
  }

  private updateSoundButton(): void {
    this.btnSound.textContent = this.save.muted ? '🔇' : '🔊';
  }

  public setPhase(phase: GamePhase): void {
    this.lastPhase = phase;
    this.titleOverlay.classList.toggle('hidden', phase !== 'title');
    this.upgradeOverlay.classList.toggle('hidden', phase !== 'levelup');
    this.gameoverOverlay.classList.toggle('hidden', phase !== 'gameover');
    this.pauseOverlay.classList.toggle('hidden', phase !== 'paused');
    this.hud.classList.toggle('hidden', phase === 'title');

    if (phase === 'title') {
      this.refreshTitleStats();
    }
    if (phase === 'gameover') {
      this.gameoverAt = performance.now();
    }
  }

  public refreshTitleStats(): void {
    document.getElementById('title-best')!.textContent = this.save.highScore.toLocaleString();
    document.getElementById('title-shards')!.textContent = `◆ ${this.save.shards.toLocaleString()}`;
    const rankEl = document.getElementById('title-rank')!;
    rankEl.textContent = this.save.bestRank;
    rankEl.style.color = computeRank(this.save.highScore).color;
  }

  public updateHud(s: HudSnapshot): void {
    this.hudScore.textContent = s.score.toLocaleString();
    this.hudBest.textContent = s.highScore.toLocaleString();
    this.hudWave.textContent = `${s.wave}`;
    this.hudShards.textContent = s.shards.toLocaleString();

    if (s.combo > 1) {
      this.comboBox.classList.remove('hidden');
      this.hudCombo.textContent = `${s.combo}`;
      this.hudMult.textContent = s.multiplier.toFixed(1);
      this.comboTimerBar.style.width = `${Math.round(s.comboTimerRatio * 100)}%`;
      if (s.combo > this.lastComboVal) {
        this.comboBox.classList.remove('pop');
        void this.comboBox.offsetWidth;
        this.comboBox.classList.add('pop');
      }
    } else {
      this.comboBox.classList.add('hidden');
    }
    this.lastComboVal = s.combo;

    this.feverBanner.classList.toggle('hidden', !s.feverActive);

    // Boss Bar
    this.bossBarWrap.classList.toggle('hidden', !s.bossActive);
    if (s.bossActive) {
      this.bossHpFill.style.width = `${Math.round(s.bossHpRatio * 100)}%`;
    }

    // Shield pips
    this.hudHpText.textContent = `${s.hp} / ${s.maxHp}`;
    if (this.hpPips.childElementCount !== s.maxHp) {
      this.hpPips.innerHTML = '';
      for (let i = 0; i < s.maxHp; i++) {
        const pip = document.createElement('div');
        pip.className = 'hp-pip';
        this.hpPips.appendChild(pip);
      }
    }
    for (let i = 0; i < s.maxHp; i++) {
      this.hpPips.children[i].classList.toggle('filled', i < s.hp);
    }

    // Dash bar
    this.dashBar.style.width = `${Math.round(s.dashCooldownRatio * 100)}%`;
    this.dashBar.classList.toggle('ready', s.dashReady);
    this.hudDashStatus.textContent = s.dashReady ? 'READY!' : 'CHARGING';
    this.hudDashStatus.classList.toggle('ready-text', s.dashReady);

    // Fever / Overdrive bar
    const feverPct = Math.round((s.feverActive ? s.feverTimeRatio : s.feverRatio) * 100);
    this.feverBar.style.width = `${feverPct}%`;
    this.feverBar.classList.toggle('fever-live', s.feverActive);
    this.feverBar.classList.toggle('nova-ready', !s.feverActive && s.feverRatio >= 0.5);
    this.hudFeverText.textContent = s.feverActive
      ? 'OVERDRIVE!!'
      : s.feverRatio >= 0.5
      ? `${feverPct}% (NOVA可!)`
      : `${feverPct}%`;

    // XP
    this.hudLevel.textContent = `${s.level}`;
    this.xpBar.style.width = `${Math.round(s.xpRatio * 100)}%`;

    // Active Upgrades strip
    const key = s.upgrades.map((u) => `${u.id}:${u.level}`).join(',');
    if (this.activeUpgrades.dataset.key !== key) {
      this.activeUpgrades.dataset.key = key;
      this.activeUpgrades.innerHTML = s.upgrades
        .map(
          (u) =>
            `<span class="upg-chip" style="border-color:${u.color}88">${u.icon} <b>Lv.${u.level}</b></span>`
        )
        .join('');
    }
  }

  public showUpgradeChoices(choices: UpgradeChoice[]): void {
    const container = document.getElementById('upgrade-cards')!;
    container.innerHTML = '';

    choices.forEach((c, idx) => {
      const rCfg = RARITY_CONFIG[c.rarity];
      const card = document.createElement('button');
      card.className = `upgrade-card rarity-${c.rarity}`;
      card.style.setProperty('--rarity-color', rCfg.color);
      const powerPct = Math.round(c.bonusMult * 100);
      card.innerHTML = `
        <div class="card-key">${idx + 1}</div>
        <div class="card-rarity" style="color:${rCfg.color}">${c.rarityLabel}</div>
        <div class="card-icon">${c.def.icon}</div>
        <div class="card-name">${c.def.name}</div>
        <div class="card-lv">Lv.${c.currentLevel} → <b>Lv.${c.currentLevel + 1}</b></div>
        <p class="card-desc">${c.def.desc}</p>
        <div class="card-power" style="color:${rCfg.color}">効果出力 ${powerPct}%</div>
      `;
      card.addEventListener('click', () => this.handlers.onSelectUpgrade(idx));
      container.appendChild(card);
    });
  }

  public showGameOver(summary: RunSummary): void {
    const rankInfo = computeRank(summary.score);
    const headline = document.getElementById('result-headline')!;
    headline.textContent = summary.isNewRecord ? '🎉 NEW RECORD!!' : 'RUN COMPLETE!';

    const badge = document.getElementById('result-rank-badge')!;
    badge.textContent = rankInfo.grade;
    badge.style.color = rankInfo.color;
    badge.style.borderColor = rankInfo.color;
    badge.style.boxShadow = `0 0 28px ${rankInfo.color}66`;

    document.getElementById('res-score')!.textContent = summary.score.toLocaleString();
    document.getElementById('res-combo')!.textContent = `${summary.maxCombo} CHAIN`;
    const mins = Math.floor(summary.timeSec / 60);
    const secs = `${summary.timeSec % 60}`.padStart(2, '0');
    document.getElementById('res-wave')!.textContent = `W${summary.wave} / ${mins}:${secs}`;
    document.getElementById('res-shards')!.textContent = `+${summary.shardsEarned} ◆`;

    // Near-Miss Teaser (Psychological Hook)
    const nmBox = document.getElementById('nearmiss-box')!;
    if (summary.isNewRecord && summary.prevHighScore > 0) {
      const diff = summary.score - summary.prevHighScore;
      nmBox.innerHTML = `🚀 ハイスコアを <b>+${diff.toLocaleString()}点</b> 更新！この勢いで <b>${rankInfo.next ? `ランク${rankInfo.next.grade}` : 'さらなる伝説'}</b> を狙おう！`;
      nmBox.className = 'nearmiss-box record';
    } else if (summary.prevHighScore > 0 && summary.score >= summary.prevHighScore * 0.72) {
      const need = summary.prevHighScore - summary.score;
      nmBox.innerHTML = `🔥 惜しい！！自己ベスト更新まであと <b>${need.toLocaleString()}点</b>！もう1回で超えられる！`;
      nmBox.className = 'nearmiss-box hot';
    } else if (rankInfo.next) {
      const need = rankInfo.next.score - summary.score;
      nmBox.innerHTML = `⚡ 次のランク <b>【${rankInfo.next.grade}】</b> まであと <b>${need.toLocaleString()}点</b>！ダッシュ連鎖で一気に狙える！`;
      nmBox.className = 'nearmiss-box';
    } else {
      nmBox.innerHTML = `👑 最高峰ランク SSS 達成！CORE LAB で限界突破しよう！`;
      nmBox.className = 'nearmiss-box record';
    }

    // Next affordable upgrade progress bar (Zeigarnik Effect)
    const nextGoal = this.findCheapestNextUnlock();
    const labelEl = document.getElementById('unlock-label')!;
    const pctEl = document.getElementById('unlock-pct')!;
    const barEl = document.getElementById('unlock-bar')!;
    const labHint = document.getElementById('lab-badge-hint')!;

    if (nextGoal) {
      const pct = Math.min(100, Math.round((this.save.shards / nextGoal.cost) * 100));
      if (this.save.shards >= nextGoal.cost) {
        labelEl.innerHTML = `✨ <b>${nextGoal.name}</b> が今すぐ強化可能！（所持 ◆${this.save.shards}）`;
        pctEl.textContent = 'READY!';
        barEl.style.width = '100%';
        barEl.classList.add('ready');
        labHint.textContent = '✨ 強化可能あり！';
      } else {
        const rem = nextGoal.cost - this.save.shards;
        labelEl.innerHTML = `次の強化「<b>${nextGoal.name}</b>」まで あと <b>${rem} ◆</b>`;
        pctEl.textContent = `${pct}%`;
        barEl.style.width = `${pct}%`;
        barEl.classList.remove('ready');
        labHint.textContent = `所持 ◆${this.save.shards}`;
      }
    } else {
      labelEl.textContent = '🏆 すべての恒久強化をコンプリート！';
      pctEl.textContent = 'MAX';
      barEl.style.width = '100%';
      labHint.textContent = `所持 ◆${this.save.shards}`;
    }
  }

  private findCheapestNextUnlock(): { name: string; cost: number } | null {
    let best: { name: string; cost: number } | null = null;
    for (const def of META_UPGRADES) {
      const lv = this.save.meta[def.id];
      if (lv < def.maxLevel) {
        const cost = getMetaCost(def, lv);
        if (!best || cost < best.cost) {
          best = { name: `${def.icon} ${def.name} Lv.${lv + 1}`, cost };
        }
      }
    }
    return best;
  }

  private openLab(from: 'title' | 'gameover'): void {
    this.returnPhaseAfterLab = from;
    this.titleOverlay.classList.add('hidden');
    this.gameoverOverlay.classList.add('hidden');
    this.labOverlay.classList.remove('hidden');
    this.renderLab();
  }

  private closeLab(): void {
    this.labOverlay.classList.add('hidden');
    if (this.returnPhaseAfterLab === 'title') {
      this.refreshTitleStats();
      this.titleOverlay.classList.remove('hidden');
    } else {
      this.gameoverOverlay.classList.remove('hidden');
    }
  }

  private renderLab(): void {
    document.getElementById('lab-shards-val')!.textContent = `◆ ${this.save.shards.toLocaleString()}`;

    // 1. Meta Upgrades
    const upgWrap = document.getElementById('lab-content-upgrades')!;
    upgWrap.innerHTML = '';
    for (const def of META_UPGRADES) {
      const lv = this.save.meta[def.id];
      const isMax = lv >= def.maxLevel;
      const cost = getMetaCost(def, lv);
      const canBuy = !isMax && this.save.shards >= cost;

      const el = document.createElement('div');
      el.className = `lab-card ${canBuy ? 'affordable' : ''}`;
      el.innerHTML = `
        <div class="lab-card-top">
          <span class="lab-icon">${def.icon}</span>
          <div>
            <div class="lab-name">${def.name}</div>
            <div class="lab-lv">Lv.${lv} / ${def.maxLevel} ・ ${def.perLevelLabel}</div>
          </div>
        </div>
        <p class="lab-desc">${def.desc}</p>
        <div class="lab-pips">${Array.from({ length: def.maxLevel }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <button class="lab-buy-btn" ${canBuy ? '' : 'disabled'}>
          ${isMax ? 'MAX LEVEL' : `強化する（◆ ${cost}）`}
        </button>
      `;
      el.querySelector('button')!.addEventListener('click', () => {
        if (this.save.shards < cost || isMax) return;
        this.save.shards -= cost;
        this.save.meta[def.id] += 1;
        saveSave(this.save);
        this.handlers.onPlayClickSfx();
        this.showToast('⚙ 恒久強化完了！', `${def.icon} ${def.name} Lv.${this.save.meta[def.id]}`, '#38bdf8');
        this.renderLab();
      });
      upgWrap.appendChild(el);
    }

    // 2. Skins
    const skinWrap = document.getElementById('lab-content-skins')!;
    skinWrap.innerHTML = '';
    for (const skin of SKINS) {
      const owned = this.save.unlockedSkins.includes(skin.id);
      const equipped = this.save.equippedSkin === skin.id;
      const canBuy = !owned && this.save.shards >= skin.cost;

      const el = document.createElement('div');
      el.className = `lab-card ${equipped ? 'equipped' : canBuy ? 'affordable' : ''}`;
      el.innerHTML = `
        <div class="skin-swatch" style="background:${skin.previewGradient}"></div>
        <div class="lab-name">${skin.name}</div>
        <p class="lab-desc">${skin.desc}</p>
        <button class="lab-buy-btn" ${owned || canBuy ? '' : 'disabled'}>
          ${equipped ? '✓ 装備中' : owned ? '装備する' : `解放する（◆ ${skin.cost}）`}
        </button>
      `;
      el.querySelector('button')!.addEventListener('click', () => {
        if (owned) {
          this.save.equippedSkin = skin.id;
          saveSave(this.save);
          this.handlers.onSkinChanged();
          this.handlers.onPlayClickSfx();
          this.renderLab();
        } else if (this.save.shards >= skin.cost) {
          this.save.shards -= skin.cost;
          this.save.unlockedSkins.push(skin.id);
          this.save.equippedSkin = skin.id;
          saveSave(this.save);
          this.handlers.onSkinChanged();
          this.handlers.onPlayClickSfx();
          this.showToast('🎨 スキン解放＆装備！', skin.name, '#fbbf24');
          this.renderLab();
        }
      });
      skinWrap.appendChild(el);
    }

    // 3. Missions
    const mWrap = document.getElementById('lab-content-missions')!;
    mWrap.innerHTML = '';
    for (const m of MISSIONS) {
      const done = this.save.completedMissions.includes(m.id);
      const el = document.createElement('div');
      el.className = `mission-row ${done ? 'done' : ''}`;
      el.innerHTML = `
        <div class="mission-status">${done ? '✅' : '🎯'}</div>
        <div class="mission-info">
          <div class="mission-title">${m.title}</div>
          <div class="mission-desc">${m.desc}</div>
        </div>
        <div class="mission-reward">${done ? '達成済' : `+${m.reward} ◆`}</div>
      `;
      mWrap.appendChild(el);
    }
  }

  public showToast(title: string, subtitle: string, accent = '#38bdf8'): void {
    const el = document.createElement('div');
    el.className = 'toast-item';
    el.style.borderLeftColor = accent;
    el.innerHTML = `<div class="toast-title" style="color:${accent}">${title}</div><div class="toast-sub">${subtitle}</div>`;
    this.toastContainer.appendChild(el);
    setTimeout(() => el.classList.add('show'), 20);
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 320);
    }, 3400);
  }
}
