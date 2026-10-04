/**
 * Lazy entry point for the game (Phaser and all level code live in this chunk). The title screen calls
 * startGame() after the player picks 1 PLAYER; nothing here is downloaded before that, except an idle
 * prefetch the title may start.
 */
import Phaser from 'phaser';
import { isMuted, play, setMuted } from '../audio/sfx.ts';
import { CANVAS_H, CANVAS_W } from './config.ts';
import { Hud } from './hud.ts';
import { RULES } from './config.ts';
import { WORLD5, WORLD5_ORDER, levelById } from './levels/index.ts';
import type { LevelData, Point } from './levels/loader.ts';
import { freshRun, loadProgress, recordClear, saveProgress, type RunState } from './systems/progress.ts';
import { music } from '../audio/music.ts';
import { LevelScene, type GameEvent, type LevelInit } from './scenes/LevelScene.ts';
import { BotInput, GamepadInput, KeyboardInput, TouchInput, type InputSource } from './systems/input.ts';
import './game.css';

export interface GameOptions {
  /** Leave the game and return to the title (the title owns history/navigation). */
  onQuit(): void;
  bot?: boolean;
  /** Bot/test mode without damage, to prove every level's geometry is completable. */
  god?: boolean;
  debug?: boolean;
  /** Start straight into this level (tests, deep links), e.g. "5-3". */
  level?: string;
}

export interface GameController {
  destroy(): void;
}

const INTRO_MS = 1600;
const pad6 = (n: number) => String(n).padStart(6, '0');

export function startGame(host: HTMLElement, opts: GameOptions): GameController {
  const canvasHost = document.createElement('div');
  canvasHost.className = 'game-canvas';
  host.appendChild(canvasHost);
  const hud = new Hud(host);
  const keyboard = new KeyboardInput();
  const inputs: InputSource[] = [keyboard, new GamepadInput(), new TouchInput(hud.touch)];
  const bot = opts.bot ? new BotInput() : undefined;
  let destroyed = false;
  let introTimer = 0;

  let progress = loadProgress(WORLD5_ORDER[0]);
  let current: LevelData = levelById(opts.level ?? '') ?? WORLD5[0];
  let run: RunState = freshRun(RULES.hearts);
  /** Run state at the start of the current level (what RETRY goes back to). */
  let runAtStart: RunState = run;
  let checkpoint: Point | undefined;

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
  const isLast = () => WORLD5_ORDER.indexOf(current.id) === WORLD5_ORDER.length - 1;

  const onEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'warn':
        hud.flashWarning();
        break;
      case 'pause':
        pause();
        break;
      case 'checkpoint':
        checkpoint = e.at;
        break;
      case 'clear':
        run = e.run;
        progress = recordClear(progress, WORLD5_ORDER, current.id, e.run.score);
        saveProgress(progress);
        music.stop();
        if (isLast()) {
          hud.showOverlay(
            `<p class="world">WORLD 5 COMPLETE</p>
             <h2>THE CAPTAIN OPENED THE DOOR!</h2>
             <p class="sub">Wounded but brave, he lets the Bros. onto the flight deck.</p>
             <dl><dt>SCORE</dt><dd data-testid="final-score">${pad6(e.run.score)}</dd><dt>NUTS</dt><dd>${e.run.nuts}</dd></dl>
             <p class="soon">World 6: The Dive is coming soon.</p>`,
            [
              { label: 'WORLD 5 MAP', run: showMap },
              { label: 'TITLE', run: opts.onQuit },
            ],
            'clear',
          );
        } else {
          const next = WORLD5[WORLD5_ORDER.indexOf(current.id) + 1];
          hud.showOverlay(
            `<h2>CABIN CLEARED!</h2>
             <p class="sub">Ding! The seatbelt sign is off.</p>
             <dl><dt>SCORE</dt><dd data-testid="final-score">${pad6(e.run.score)}</dd>
                 <dt>NUTS</dt><dd>${e.run.nuts}</dd><dt>TIME</dt><dd>${e.seconds}s</dd></dl>
             <p class="soon">Next: ${next.id} ${next.name}</p>`,
            [
              { label: 'NEXT LEVEL', run: () => playLevel(next) },
              { label: 'TITLE', run: opts.onQuit },
            ],
            'clear',
          );
        }
        break;
      case 'gameover':
        play('hurt');
        music.stop();
        hud.showOverlay(
          `<h2>${e.reason === 'altitude' ? 'ALTITUDE ZERO' : 'GAME OVER'}</h2>
           <p class="sub">${e.reason === 'altitude' ? 'Pull up faster next time!' : 'Even plumbers need a second try.'}</p>
           <dl><dt>SCORE</dt><dd>${pad6(e.score)}</dd></dl>`,
          [
            { label: checkpoint ? 'RETRY FROM GALLEY' : 'RETRY', run: retry },
            { label: 'TITLE', run: opts.onQuit },
          ],
          'over',
        );
        break;
    }
  };

  /** World 5 map: replay any unlocked level. */
  function showMap(): void {
    music.stop();
    const unlockedIdx = WORLD5_ORDER.indexOf(progress.unlocked);
    hud.showOverlay(
      `<p class="world">WORLD 5</p><h2>THE ATTACK</h2>
       <p class="sub">Pick a cabin. Your best scores are saved on this device.</p>`,
      WORLD5.map((l, i) => ({
        label: i <= unlockedIdx ? `${l.id} ${l.name}${progress.best[l.id] ? ` · ${pad6(progress.best[l.id])}` : ''}` : `${l.id} LOCKED`,
        disabled: i > unlockedIdx,
        run: () => {
          run = freshRun(RULES.hearts);
          playLevel(l);
        },
      })),
      'map',
    );
  }

  function playLevel(level: LevelData, fromCheckpoint = false): void {
    if (level.id !== current.id || !fromCheckpoint) checkpoint = undefined;
    current = level;
    runAtStart = { ...run };
    hud.showOverlay(
      `<p class="world">WORLD ${level.id}</p><h2>${level.name}</h2><p class="sub">ALT ${level.altitude.start.toLocaleString('en-US')} FT · BANK ${level.tilt[0]?.deg ?? 0}°</p>`,
      [],
      'intro',
    );
    window.clearTimeout(introTimer);
    introTimer = window.setTimeout(() => {
      if (destroyed) return;
      hud.hideOverlay();
      const init: LevelInit = {
        level,
        run: { ...run },
        checkpoint,
        inputs,
        bot,
        god: opts.god,
        onHud: (s) => hud.update(s),
        onEvent,
      };
      if (game.scene.getScene('level')) game.scene.start('level', init);
      else game.scene.add('level', LevelScene, true, init);
      music.play(level.mood === 'alarm' ? 'alarm' : 'cabin');
      if (portrait.matches) window.setTimeout(pause, 50);
    }, INTRO_MS);
  }

  function retry(): void {
    hud.hideOverlay();
    game.scene.stop('level');
    // A retry keeps the score but starts small with full hearts.
    run = { ...runAtStart, hearts: RULES.hearts, power: 'small' };
    playLevel(current, true);
  }

  function begin(): void {
    // Returning players with more than 5-1 unlocked pick from the map; first-timers board 5-1 directly.
    if (!opts.level && progress.unlocked !== WORLD5_ORDER[0]) showMap();
    else playLevel(current);
  }

  function pause(): void {
    const s = scene();
    if (!s || hud.overlayOpen) return;
    game.scene.pause('level');
    music.pause();
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
      { label: 'WORLD 5 MAP', run: () => (game.scene.stop('level'), showMap()) },
      { label: 'QUIT TO TITLE', run: opts.onQuit },
    ]);
  }

  function resume(): void {
    hud.hideOverlay();
    inputs.forEach((i) => i.reset?.()); // keys pressed on the card must not fire in play
    game.scene.resume('level');
    music.resume();
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
      music.stop();
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
