import './style.css';
import { GameEngine } from './game/gameEngine';
import { loadSave } from './game/storage';
import { GameUI } from './game/ui';

const save = loadSave();

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const floatingLayer = document.getElementById('floating-layer') as HTMLElement;
const screenFx = document.getElementById('screen-fx') as HTMLElement;

let engine!: GameEngine;

const ui = new GameUI(save, {
  onStart: () => engine.startNewRun(),
  onSelectUpgrade: (idx) => engine.selectUpgrade(idx),
  onTogglePause: () => engine.togglePause(),
  onGoTitle: () => engine.setPhaseTitle(),
  onToggleSound: () => {
    engine.sound.init();
    const next = !engine.sound.isMuted();
    engine.sound.setMuted(next);
    if (!next) engine.sound.playUiClick();
    return next;
  },
  onSkinChanged: () => engine.refreshSkin(),
  onPlayClickSfx: () => {
    engine.sound.init();
    engine.sound.playUiClick();
  },
});

engine = new GameEngine(canvas, floatingLayer, screenFx, save, {
  onHudUpdate: (snap) => ui.updateHud(snap),
  onPhaseChange: (phase) => ui.setPhase(phase),
  onLevelUpChoices: (choices) => ui.showUpgradeChoices(choices),
  onGameOver: (summary) => ui.showGameOver(summary),
  onToast: (title, subtitle, accent) => ui.showToast(title, subtitle, accent),
});

// Mobile Virtual Joystick & Action Buttons
const joyZone = document.getElementById('joystick-zone')!;
const joyKnob = document.getElementById('joystick-knob')!;
let joyTouchId: number | null = null;
let joyOrigin = { x: 0, y: 0 };

joyZone.addEventListener(
  'touchstart',
  (e) => {
    if (joyTouchId !== null) return;
    const t = e.changedTouches[0];
    joyTouchId = t.identifier;
    const rect = joyZone.getBoundingClientRect();
    joyOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    updateJoy(t.clientX, t.clientY);
  },
  { passive: true }
);

joyZone.addEventListener(
  'touchmove',
  (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchId) {
        updateJoy(t.clientX, t.clientY);
      }
    }
  },
  { passive: true }
);

const resetJoy = (e: TouchEvent) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joyTouchId) {
      joyTouchId = null;
      joyKnob.style.transform = 'translate(0px, 0px)';
      engine.setMobileMove(0, 0);
    }
  }
};
joyZone.addEventListener('touchend', resetJoy, { passive: true });
joyZone.addEventListener('touchcancel', resetJoy, { passive: true });

function updateJoy(cx: number, cy: number): void {
  const maxR = 42;
  let dx = cx - joyOrigin.x;
  let dy = cy - joyOrigin.y;
  const d = Math.hypot(dx, dy);
  if (d > maxR) {
    dx = (dx / d) * maxR;
    dy = (dy / d) * maxR;
  }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  engine.setMobileMove(dx / maxR, dy / maxR);
}

document.getElementById('mobile-dash')!.addEventListener('touchstart', (e) => {
  e.preventDefault();
  engine.triggerMobileDash();
});
document.getElementById('mobile-nova')!.addEventListener('touchstart', (e) => {
  e.preventDefault();
  engine.triggerMobileNova();
});
