/**
 * Lazy entry point for the game (Phaser and all level code live in this chunk). The title screen calls
 * startGame() after the player picks 1 PLAYER; nothing here is downloaded before that, except an idle
 * prefetch the title may start.
 */
import Phaser from 'phaser';
import { isMuted, play, setMuted } from '../audio/sfx.ts';
import { CANVAS_H, CANVAS_W } from './config.ts';
import { Hud } from './hud.ts';
import level52 from './levels/w5/5-2.json';
import type { LevelData } from './levels/loader.ts';
import { LevelScene, type GameEvent, type LevelInit } from './scenes/LevelScene.ts';
import { BotInput, GamepadInput, KeyboardInput, TouchInput, type InputSource } from './systems/input.ts';
import './game.css';

export interface GameOptions {
  /** Leave the game and return to the title (the title owns history/navigation). */
  onQuit(): void;
  bot?: boolean;
  debug?: boolean;
}

export interface GameController {
  destroy(): void;
}

const INTRO_MS = 1600;

export function startGame(host: HTMLElement, opts: GameOptions): GameController {
  const level = level52 as LevelData;
  const canvasHost = document.createElement('div');
  canvasHost.className = 'game-canvas';
  host.appendChild(canvasHost);
  const hud = new Hud(host);
  const keyboard = new KeyboardInput();
  const inputs: InputSource[] = [keyboard, new GamepadInput(), new TouchInput(hud.touch)];
  const bot = opts.bot ? new BotInput() : undefined;
  let destroyed = false;
  let introTimer = 0;

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: canvasHost,
    width: CANVAS_W,
    height: CANVAS_H,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#141022',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: !!opts.debug, fps: 60, fixedStep: true } },
    input: { keyboard: false, gamepad: false }, // all input goes through systems/input.ts
    banner: false,
    audio: { noAudio: true }, // UI/game sounds come from audio/sfx.ts
    scene: [],
  });

  const scene = () => game.scene.getScene('level') as LevelScene | null;

  const onEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'warn':
        hud.flashWarning();
        break;
      case 'pause':
        pause();
        break;
      case 'clear':
        hud.showOverlay(
          `<h2>CABIN CLEARED!</h2>
           <p class="sub">Ding! The seatbelt sign is off.</p>
           <dl><dt>SCORE</dt><dd data-testid="final-score">${String(e.score).padStart(6, '0')}</dd>
               <dt>NUTS</dt><dd>${e.nuts}</dd><dt>TIME</dt><dd>${e.seconds}s</dd></dl>
           <p class="soon">The rest of World 5 is coming soon.</p>`,
          [
            { label: 'PLAY AGAIN', run: restart },
            { label: 'TITLE', run: opts.onQuit },
          ],
          'clear',
        );
        break;
      case 'gameover':
        play('hurt');
        hud.showOverlay(
          `<h2>${e.reason === 'altitude' ? 'ALTITUDE ZERO' : 'GAME OVER'}</h2>
           <p class="sub">${e.reason === 'altitude' ? 'Pull up faster next time!' : 'Even plumbers need a second try.'}</p>
           <dl><dt>SCORE</dt><dd>${String(e.score).padStart(6, '0')}</dd></dl>`,
          [
            { label: 'RETRY', run: restart },
            { label: 'TITLE', run: opts.onQuit },
          ],
          'over',
        );
        break;
      case 'intro':
        break;
    }
  };

  const init: LevelInit = { level, inputs, bot, onHud: (s) => hud.update(s), onEvent };

  function begin(): void {
    hud.showOverlay(
      `<p class="world">WORLD ${level.id}</p><h2>${level.name}</h2><p class="sub">ALT ${level.altitude.start.toLocaleString('en-US')} FT · BANK ${level.tilt[0]?.deg ?? 0}°</p>`,
      [],
      'intro',
    );
    introTimer = window.setTimeout(() => {
      if (destroyed) return;
      hud.hideOverlay();
      if (game.scene.getScene('level')) game.scene.start('level', init);
      else game.scene.add('level', LevelScene, true, init);
      if (portrait.matches) window.setTimeout(pause, 50);
    }, INTRO_MS);
  }

  function restart(): void {
    hud.hideOverlay();
    game.scene.stop('level');
    begin();
  }

  function pause(): void {
    const s = scene();
    if (!s || hud.overlayOpen) return;
    game.scene.pause('level');
    const soundLabel = () => `SOUND: ${isMuted() ? 'OFF' : 'ON'}`;
    hud.showOverlay('<h2>PAUSED</h2><p class="sub">Please remain seated.</p>', [
      { label: 'RESUME', run: resume },
      {
        label: soundLabel(),
        run: (btn) => {
          setMuted(!isMuted());
          btn.textContent = soundLabel();
        },
      },
      { label: 'QUIT TO TITLE', run: opts.onQuit },
    ]);
  }

  function resume(): void {
    hud.hideOverlay();
    inputs.forEach((i) => i.reset?.()); // keys pressed on the card must not fire in play
    game.scene.resume('level');
  }

  const paused = () => !!scene() && game.scene.isPaused('level');

  // Cards are driven by keyboard and gamepad too: Space/Z/Enter/A confirm, arrows/d-pad move,
  // Esc/P/Start resume from pause (the paused scene can't see input).
  const onKey = (e: KeyboardEvent) => {
    if (!hud.overlayOpen || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && paused()) {
      e.preventDefault();
      resume();
      return;
    }
    const nav: Record<string, 'prev' | 'next' | 'confirm'> = {
      ArrowLeft: 'prev',
      ArrowUp: 'prev',
      ArrowRight: 'next',
      ArrowDown: 'next',
      Space: 'confirm',
      KeyZ: 'confirm',
      Enter: 'confirm',
    };
    const action = nav[e.code];
    if (!action || e.repeat) return;
    e.preventDefault();
    hud.overlayNavigate(action);
  };
  window.addEventListener('keydown', onKey);

  let padRaf = 0;
  const padHeld = new Set<string>();
  const pollPads = () => {
    padRaf = requestAnimationFrame(pollPads);
    if (!hud.overlayOpen || !('getGamepads' in navigator)) return padHeld.clear();
    const now = new Set<string>();
    for (const p of navigator.getGamepads()) {
      if (!p) continue;
      const x = p.axes[0] ?? 0;
      if (p.buttons[0]?.pressed) now.add('confirm');
      if (p.buttons[9]?.pressed) now.add('start');
      if (p.buttons[14]?.pressed || x < -0.5) now.add('prev');
      if (p.buttons[15]?.pressed || x > 0.5) now.add('next');
    }
    for (const a of now) {
      if (padHeld.has(a)) continue;
      if (a === 'start' && paused()) resume();
      else hud.overlayNavigate(a === 'start' ? 'confirm' : (a as 'prev' | 'next' | 'confirm'));
    }
    padHeld.clear();
    now.forEach((a) => padHeld.add(a));
  };
  padRaf = requestAnimationFrame(pollPads);

  // A phone turned upright shows the rotate hint: don't let the level run on behind it.
  const portrait = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  const onOrientation = () => portrait.matches && pause();
  portrait.addEventListener('change', onOrientation);

  game.events.once(Phaser.Core.Events.READY, begin);

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(introTimer);
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(padRaf);
      portrait.removeEventListener('change', onOrientation);
      inputs.forEach((i) => i.destroy?.());
      game.destroy(true);
      hud.destroy();
      canvasHost.remove();
      delete (window as unknown as { __syb?: unknown }).__syb;
    },
  };
}
