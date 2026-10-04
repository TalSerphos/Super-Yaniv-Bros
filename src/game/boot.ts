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
import { ORDER, STAGES, WORLDS, isBoss, levelById, worldOf, type Stage } from './levels/index.ts';
import type { Point } from './levels/loader.ts';
import { freshRun, loadProgress, recordClear, saveProgress, type RunState } from './systems/progress.ts';
import { music } from '../audio/music.ts';
import { BossScene, type BossInit } from './scenes/BossScene.ts';
import { LevelScene, type GameEvent, type HudState, type LevelInit } from './scenes/LevelScene.ts';
import { BOSS_HP } from './systems/boss.ts';
import { BossBot, BotInput, GamepadInput, KeyboardInput, TouchInput, type InputSource } from './systems/input.ts';
import './game.css';

export interface GameOptions {
  /** Leave the game and return to the title (the title owns history/navigation). */
  onQuit(): void;
  bot?: boolean;
  /** Bot/test mode without damage, to prove every level's geometry is completable. */
  god?: boolean;
  debug?: boolean;
  /** Start straight into this level (tests, deep links), e.g. "5-3" or "6-2". */
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
  const bossBot = opts.bot ? new BossBot() : undefined;
  let destroyed = false;
  let introTimer = 0;

  let progress = loadProgress(ORDER[0]);
  let current: Stage = levelById(opts.level ?? '') ?? STAGES[0];
  /** Boss HP to start Phase B with (half after a slipped knot in Phase C). */
  let bossHp: number | undefined;
  /** The Tabuk clock kept across a slip (Phase C → B → C). */
  let tabukClock: number | undefined;
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

  /** The scene playing the current stage: 'level' (platform levels) or 'boss' (World 6). */
  let activeKey: 'level' | 'boss' = 'level';
  const scene = () => game.scene.getScene(activeKey) as LevelScene | BossScene | null;
  const nextStage = (): Stage | undefined => STAGES[ORDER.indexOf(current.id) + 1];

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
      case 'clear': {
        run = e.run;
        // A level's best is the points scored in it, not the run total carried in from earlier levels.
        progress = recordClear(progress, ORDER, current.id, e.run.score - runAtStart.score);
        saveProgress(progress);
        // The 6-3 victory song (clapping, "Od Avinu Chai!") keeps playing under the card.
        if (!(isBoss(current) && current.phase === 'C')) music.stop();
        const next = nextStage();
        const score = `<dl><dt>SCORE</dt><dd data-testid="final-score">${pad6(e.run.score)}</dd><dt>NUTS</dt><dd>${e.run.nuts}</dd>${
          e.seconds ? `<dt>TIME</dt><dd>${e.seconds}s</dd>` : ''
        }</dl>`;
        const goNext = (label: string) => ({
          label,
          run: () => {
            run = { ...run, hearts: Math.max(run.hearts, RULES.hearts) }; // every level starts with at least 3
            bossHp = undefined;
            if (!isBoss(next!) || next.phase !== 'C') tabukClock = undefined;
            playLevel(next!);
          },
        });
        if (next && worldOf(next.id) !== worldOf(current.id)) {
          const done = worldOf(current.id).id;
          const card =
            done === 5
              ? {
                  h: 'THE CAPTAIN OPENED THE DOOR!',
                  sub: 'Wounded but brave, he lets the Bros. onto the flight deck.',
                  soon: 'Next: World 6, the cockpit. Jacuzzam is at the controls.',
                  go: 'INTO THE COCKPIT',
                }
              : {
                  h: 'TABUK!',
                  sub: 'The off-duty pilots touch down. 174 passengers are safe, and Jacuzzam is still tied up.',
                  soon: 'Next: World 7, Washington. The Bros. are invited to the White House!',
                  go: 'TO WASHINGTON',
                };
          hud.showOverlay(
            `<p class="world">WORLD ${done} COMPLETE</p><h2>${card.h}</h2><p class="sub">${card.sub}</p>${score}<p class="soon">${card.soon}</p>`,
            [goNext(card.go), { label: 'MAP', run: () => showMap() }, { label: 'TITLE', run: opts.onQuit }],
            'clear',
          );
        } else if (!next) {
          hud.showOverlay(`<h2>THE END</h2>${score}`, [{ label: 'TITLE', run: opts.onQuit }], 'clear');
        } else if (isBoss(current)) {
          hud.showOverlay(
            `<h2>${current.phase === 'A' ? 'GOT HIM!' : 'LEVEL FLIGHT!'}</h2>
             <p class="sub">${
               current.phase === 'A'
                 ? 'The chokehold holds... for now. The plane is still diving!'
                 : 'Zvika ties him up with headphone cables. 50 minutes to Tabuk.'
             }</p>
             ${score}
             <p class="soon">Next: ${next.id} ${next.name}</p>`,
            [goNext('NEXT PHASE'), { label: 'TITLE', run: opts.onQuit }],
            'clear',
          );
        } else {
          const ground = !isBoss(current) && (current.theme ?? 'cabin') !== 'cabin';
          hud.showOverlay(
            `<h2>${ground ? 'STAGE CLEAR!' : 'CABIN CLEARED!'}</h2>
             <p class="sub">${ground ? 'Washington loves a plumber.' : 'Ding! The seatbelt sign is off.'}</p>
             ${score}
             <p class="soon">Next: ${next.id} ${next.name}</p>`,
            [goNext('NEXT LEVEL'), { label: 'TITLE', run: opts.onQuit }],
            'clear',
          );
        }
        break;
      }
      case 'slip': {
        // Phase C failed: back to Phase B with the boss at half HP.
        music.stop();
        const phaseB = levelById('6-2')!;
        hud.showOverlay(
          `<h2>HE SLIPPED A KNOT!</h2><p class="sub">Jacuzzam is loose and lunging for the yoke. Get him again!</p>`,
          [
            {
              label: 'BACK TO THE YOKE',
              run: () => {
                run = { ...run, hearts: Math.max(run.hearts, RULES.hearts) };
                bossHp = Math.ceil(BOSS_HP / 2);
                tabukClock = e.clock;
                playLevel(phaseB);
              },
            },
            { label: 'TITLE', run: opts.onQuit },
          ],
          'over',
        );
        break;
      }
      case 'finale': {
        run = e.run;
        progress = recordClear(progress, ORDER, current.id, e.run.score - runAtStart.score);
        saveProgress(progress);
        music.play('victory', true);
        const photo = e.photo ? `<img class="photo" src="${e.photo}" alt="The photo: Yaniv, the Bros., the Captain and the President in the Oval Office">` : '';
        hud.showOverlay(
          `<p class="world">THE END</p>
           ${photo}
           <h2>THANK YOU YANIV!</h2>
           <p class="sub">But your next client is waiting in Nes Ziona!</p>
           <dl><dt>SCORE</dt><dd data-testid="final-score">${pad6(e.run.score)}</dd><dt>NUTS</dt><dd>${e.run.nuts}</dd></dl>
           <p class="soon">Flight 1073 · Yaniv, Assaf, Zvika, Shota and the Captain · Super Yaniv Bros.</p>`,
          [
            { label: 'MAP', run: () => showMap() },
            { label: 'TITLE', run: opts.onQuit },
          ],
          'clear finale',
        );
        break;
      }
      case 'gameover':
        play('hurt');
        music.stop();
        hud.showOverlay(
          `<h2>${e.reason === 'altitude' ? 'ALTITUDE ZERO' : e.reason === 'time' ? "TIME'S UP!" : 'GAME OVER'}</h2>
           <p class="sub">${e.reason === 'altitude' ? 'Pull up faster next time!' : e.reason === 'time' ? 'The motorcade waits for no one.' : 'Even plumbers need a second try.'}</p>
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

  /**
   * The flight map: replay any unlocked level of World 5 or World 6. Opened from the pause card, the level
   * stays paused behind it and RESUME (or Esc) goes back to it; TITLE is always a way out.
   */
  function showMap(fromPause = false): void {
    if (!fromPause) music.stop();
    const unlockedIdx = ORDER.indexOf(progress.unlocked);
    // One column per world, its levels top to bottom; RESUME / TITLE on the row underneath.
    const levels = WORLDS.flatMap((w, col) =>
      w.stages.map((l, row) => {
        const open = ORDER.indexOf(l.id) <= unlockedIdx;
        return {
          label: open ? `${l.id} ${l.name}${l.id in progress.best ? ` · ${pad6(progress.best[l.id])}` : ''}` : `${l.id} LOCKED`,
          disabled: !open,
          style: `grid-column:${col + 1};grid-row:${row + 1}`,
          run: () => {
            music.stop();
            game.scene.stop(activeKey);
            run = freshRun(RULES.hearts);
            bossHp = tabukClock = undefined;
            playLevel(l);
          },
        };
      }),
    );
    const below = `grid-row:${Math.max(...WORLDS.map((w) => w.stages.length)) + 1}`;
    hud.showOverlay(
      `<p class="world">FLIGHT 1073</p><h2>THE MAP</h2>
       <p class="sub">${WORLDS.map((w) => `WORLD ${w.id}: ${w.name}`).join(' · ')}</p>`,
      [
        ...levels,
        ...(fromPause ? [{ label: 'RESUME', run: resume, focus: true, style: `grid-column:1;${below}` }] : []),
        { label: 'TITLE', run: opts.onQuit, style: `grid-column:${fromPause ? 2 : 1};${below}` },
      ],
      'map',
    );
  }

  /** What each boss phase asks of you, for its intro card. */
  const BOSS_GOALS = {
    A: 'Plunge his jets or stomp his cap 5 times, then grab him from behind!',
    B: 'Hold ▼ at the yoke to pull up, plunge his goggles, then level her out.',
    C: 'Keep him tied until Tabuk: GRAB the knot he is working loose.',
  };

  function playLevel(level: Stage, fromCheckpoint = false): void {
    if (level.id !== current.id || !fromCheckpoint) checkpoint = undefined;
    current = level;
    runAtStart = { ...run };
    const intro = isBoss(level)
      ? `<p class="world">WORLD ${level.id} · PHASE ${level.phase}</p><h2>${level.name}</h2><p class="sub">${BOSS_GOALS[level.phase]}</p>`
      : (level.theme ?? 'cabin') !== 'cabin'
        ? `<p class="world">WORLD ${level.id}</p><h2>${level.name}</h2><p class="sub">${level.timer ? `TIME ${level.timer} · ` : ''}WASHINGTON, D.C.</p>`
        : `<p class="world">WORLD ${level.id}</p><h2>${level.name}</h2><p class="sub">ALT ${level.altitude.start.toLocaleString('en-US')} FT · BANK ${level.tilt[0]?.deg ?? 0}°</p>`;
    hud.showOverlay(intro, [], 'intro');
    window.clearTimeout(introTimer);
    introTimer = window.setTimeout(() => {
      if (destroyed) return;
      hud.hideOverlay();
      for (const key of ['level', 'boss']) if (game.scene.getScene(key)) game.scene.stop(key);
      const onHud = (s: HudState) => hud.update(s);
      if (isBoss(level)) {
        activeKey = 'boss';
        const clock = level.phase === 'C' ? tabukClock : undefined;
        const init: BossInit = { level, run: { ...run }, inputs, bot: bossBot, god: opts.god, bossHp, clock, onHud, onEvent };
        if (game.scene.getScene('boss')) game.scene.start('boss', init);
        else game.scene.add('boss', BossScene, true, init);
        music.play(level.phase === 'C' ? 'calm' : 'boss');
      } else {
        activeKey = 'level';
        const init: LevelInit = { level, run: { ...run }, checkpoint, inputs, bot, god: opts.god, onHud, onEvent };
        if (game.scene.getScene('level')) game.scene.start('level', init);
        else game.scene.add('level', LevelScene, true, init);
        const theme = level.theme ?? 'cabin';
        music.play(theme === 'oval' ? 'ceremony' : theme !== 'cabin' ? 'march' : level.mood === 'alarm' ? 'alarm' : 'cabin');
      }
      if (portrait.matches) window.setTimeout(pause, 50);
    }, INTRO_MS);
  }

  function retry(): void {
    hud.hideOverlay();
    game.scene.stop(activeKey);
    // A retry keeps the score but starts small with full hearts.
    run = { ...runAtStart, hearts: RULES.hearts, power: 'small' };
    playLevel(current, true);
  }

  function begin(): void {
    // Returning players with more than 5-1 unlocked pick from the map; first-timers board 5-1 directly.
    if (!opts.level && progress.unlocked !== ORDER[0]) showMap();
    else playLevel(current);
  }

  function pause(): void {
    const s = scene();
    if (!s || hud.overlayOpen) return;
    game.scene.pause(activeKey);
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
      { label: 'MAP', run: () => showMap(true) },
      { label: 'QUIT TO TITLE', run: opts.onQuit },
    ]);
  }

  function resume(): void {
    hud.hideOverlay();
    inputs.forEach((i) => i.reset?.()); // keys pressed on the card must not fire in play
    game.scene.resume(activeKey);
    music.resume();
  }

  const paused = () => !!scene() && game.scene.isPaused(activeKey);

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
