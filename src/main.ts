import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './title/title.css';
import { MenuState, keyToAction, watchGamepads, type MenuAction } from './title/menu.ts';
import { isMuted, play, setMuted, unlockAudio } from './audio/sfx.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const title = $<HTMLElement>('#title');
const comingSoon = $<HTMLElement>('#coming-soon');
const gameScreen = $<HTMLElement>('#game');
const backBtn = $<HTMLButtonElement>('#back');
const muteBtn = $<HTMLButtonElement>('#mute');
const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')];
const menu = new MenuState(items.length);

const HASHES = { 'coming-soon': '#coming-soon', game: '#play' } as const;
const params = new URLSearchParams(location.search);
/** Taps on the Coming Soon backdrop are ignored this long after it opens (double-tap guard). */
const BACKDROP_GUARD_MS = 350;

type Screen = 'title' | keyof typeof HASHES;
const screenForHash = (hash: string): Screen =>
  (Object.keys(HASHES) as (keyof typeof HASHES)[]).find((k) => HASHES[k] === hash) ?? 'title';
let screen: Screen = 'title';
let openedAt = 0;
/** True while a history.back() we issued is in flight, so a double BACK can't leave the site. */
let leaving = false;

/** Cursor, roving tabindex and aria-current all follow menu.current. */
function render(): void {
  items.forEach((el, i) => {
    const on = i === menu.current;
    el.setAttribute('aria-current', String(on));
    el.tabIndex = on ? 0 : -1;
  });
}

function focusCurrent(): void {
  if (screen === 'title') items[menu.current].focus({ preventScroll: true });
  else if (screen === 'coming-soon') backBtn.focus({ preventScroll: true });
  else (document.activeElement as HTMLElement | null)?.blur();
}

// ---------- game (lazy chunk) ----------

type GameModule = typeof import('./game/boot.ts');
let gameModule: Promise<GameModule> | undefined;
let game: { destroy(): void } | undefined;
/** Starts downloading the game chunk (Phaser + level) without running it. */
const loadGame = () => (gameModule ??= import('./game/boot.ts'));

function mountGame(): void {
  void loadGame().then((m) => {
    if (screen !== 'game' || game) return; // left before the chunk arrived
    gameScreen.querySelector('.game-loading')?.remove();
    game = m.startGame(gameScreen, { onQuit: goBack, bot: params.has('bot'), debug: params.has('debug') });
  });
}

function unmountGame(): void {
  game?.destroy();
  game = undefined;
  if (!gameScreen.querySelector('.game-loading')) {
    gameScreen.insertAdjacentHTML('afterbegin', '<p class="game-loading">BOARDING…</p>');
  }
}

function showScreen(next: Screen): void {
  if (screen === next) return;
  if (screen === 'game') unmountGame();
  screen = next;
  document.getElementById('stage')!.dataset.screen = next;
  title.hidden = next !== 'title';
  comingSoon.hidden = next !== 'coming-soon';
  gameScreen.hidden = next !== 'game';
  if (next === 'coming-soon') openedAt = performance.now();
  if (next === 'game') mountGame();
  focusCurrent();
}

function openScreen(next: Exclude<Screen, 'title'>): void {
  if (screen === next) return;
  // The entry below is always our title (marked), so BACK can safely use history.back().
  history.pushState({ screen: next, fromTitle: true }, '', HASHES[next]);
  showScreen(next);
}

function goBack(): void {
  if (screen === 'title' || leaving) return;
  play('back');
  if (history.state?.fromTitle) {
    leaving = true;
    history.back(); // popstate shows the title
  } else {
    history.replaceState({ screen: 'title' }, '', location.pathname + location.search);
    showScreen('title');
  }
}

function activate(i: number): void {
  menu.set(i);
  render();
  play('ding');
  // 1 PLAYER boards World 5; co-op ("Sit next to an Israeli") is Stage 9.
  openScreen(items[i].dataset.action === '1p' ? 'game' : 'coming-soon');
}

function handle(action: MenuAction): void {
  unlockAudio();
  if (screen === 'game') return; // the game reads its own input
  if (screen === 'coming-soon') {
    if (action === 'back' || action === 'confirm') goBack();
    return;
  }
  if (action === 'up' || action === 'down') {
    if (menu.move(action === 'up' ? -1 : 1)) play('move');
    render();
    focusCurrent();
  } else if (action === 'confirm') {
    activate(menu.current);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return; // leave browser shortcuts alone
  if (screen === 'game') return unlockAudio();
  if (e.target === muteBtn && (e.code === 'Enter' || e.code === 'Space')) return;
  const action = keyToAction(e.code);
  if (!action || e.repeat) return;
  e.preventDefault();
  handle(action);
});

items.forEach((el, i) => {
  // Keep the cursor wherever focus goes (Tab, screen readers), so Enter activates what is focused.
  el.addEventListener('focus', () => {
    if (menu.set(i)) render();
    if (el.dataset.action === '1p') void loadGame(); // prefetch while the player is about to pick it
  });
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || screen !== 'title') return;
    if (menu.set(i)) play('move');
    render();
    el.focus({ preventScroll: true });
  });
  el.addEventListener('click', (e) => {
    e.preventDefault();
    unlockAudio();
    activate(i);
  });
});

backBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  goBack();
});
comingSoon.addEventListener('click', () => {
  if (performance.now() - openedAt > BACKDROP_GUARD_MS) goBack();
});

muteBtn.addEventListener('click', (e) => {
  unlockAudio();
  setMuted(!isMuted());
  syncMute();
  // After a pointer click, hand focus back so Enter/Space drive the menu again.
  if (e.detail > 0) focusCurrent();
});
function syncMute(): void {
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
}

// Decide from the URL, not history.state: a hash typed by hand fires popstate with null state.
window.addEventListener('popstate', () => {
  leaving = false;
  showScreen(screenForHash(location.hash));
});

watchGamepads(handle);
syncMute();
render();

// Deep link / reload on #coming-soon or #play: put the title underneath so BACK never leaves the site.
const deepLink = screenForHash(location.hash);
if (deepLink !== 'title') {
  history.replaceState({ screen: 'title' }, '', location.pathname + location.search);
  openScreen(deepLink);
}

// Warm the Coming Soon image after the title has fully loaded, so it never competes with the LCP image.
const warm = () => (comingSoon.querySelector('img')!.loading = 'eager');
const warmWhenIdle = () => ('requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2000));
if (document.readyState === 'complete') warmWhenIdle();
else window.addEventListener('load', warmWhenIdle, { once: true });
