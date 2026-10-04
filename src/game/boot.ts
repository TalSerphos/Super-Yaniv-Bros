/**
 * Lazy entry point for the game (Phaser and all level code live in this chunk). The title screen calls
 * startGame() after the player picks 1 PLAYER; nothing here is downloaded before that, except an idle
 * prefetch the title may start.
 */
import Phaser from 'phaser';
import { play } from '../audio/sfx.ts';
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
           <p class="sub">${e.reason === 'altitude' ? 'Pull up faster next time!' : 'Even plumbers need a second try.'}</p>`,
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
    hud.showOverlay('<h2>PAUSED</h2><p class="sub">Please remain seated.</p>', [
      { label: 'RESUME', run: resume },
      { label: 'QUIT TO TITLE', run: opts.onQuit },
    ]);
  }

  function resume(): void {
    hud.hideOverlay();
    game.scene.resume('level');
  }

  // Esc / P while the pause card is open resumes (the scene is paused, so it can't see the key).
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && hud.overlayOpen && game.scene.isPaused('level')) {
      e.preventDefault();
      resume();
    }
  };
  window.addEventListener('keydown', onKey);
  game.events.once(Phaser.Core.Events.READY, begin);

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(introTimer);
      window.removeEventListener('keydown', onKey);
      inputs.forEach((i) => i.destroy?.());
      game.destroy(true);
      hud.destroy();
      canvasHost.remove();
      delete (window as unknown as { __syb?: unknown }).__syb;
    },
  };
}
