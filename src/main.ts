import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './title/title.css';
import { MenuState, keyToAction, watchGamepads, type MenuAction } from './title/menu.ts';
import { isMuted, play, setMuted, unlockAudio } from './title/sfx.ts';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

const title = $<HTMLElement>('#title');
const comingSoon = $<HTMLElement>('#coming-soon');
const backBtn = $<HTMLButtonElement>('#back');
const muteBtn = $<HTMLButtonElement>('#mute');
const items = [...document.querySelectorAll<HTMLButtonElement>('.menu-item')];
const menu = new MenuState(items.length);

type Screen = 'title' | 'coming-soon';
let screen: Screen = 'title';

function render(): void {
  items.forEach((el, i) => el.setAttribute('aria-current', String(i === menu.current)));
}

function showComingSoon(push = true): void {
  if (screen === 'coming-soon') return;
  screen = 'coming-soon';
  title.hidden = true;
  comingSoon.hidden = false;
  backBtn.focus({ preventScroll: true });
  // A history entry lets the Android back button / browser back close the overlay.
  if (push) history.pushState({ screen }, '', '#coming-soon');
}

function showTitle(): void {
  if (screen === 'title') return;
  screen = 'title';
  comingSoon.hidden = true;
  title.hidden = false;
  items[menu.current].focus({ preventScroll: true });
}

function goBack(): void {
  play('back');
  if (history.state?.screen === 'coming-soon') history.back();
  else showTitle();
}

function activate(i: number): void {
  menu.set(i);
  render();
  play('ding');
  // Every menu option leads to Coming Soon in Stage 1; Stage 2 routes "1p" into the game.
  showComingSoon();
}

function handle(action: MenuAction): void {
  unlockAudio();
  if (screen === 'coming-soon') {
    if (action === 'back' || action === 'confirm') goBack();
    return;
  }
  if (action === 'up' || action === 'down') {
    if (menu.move(action === 'up' ? -1 : 1)) play('move');
    render();
    items[menu.current].focus({ preventScroll: true });
  } else if (action === 'confirm') {
    activate(menu.current);
  }
}

document.addEventListener('keydown', (e) => {
  if (e.target === muteBtn && (e.code === 'Enter' || e.code === 'Space')) return;
  const action = keyToAction(e.code);
  if (!action || e.repeat) return;
  e.preventDefault();
  handle(action);
});

items.forEach((el, i) => {
  el.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'mouse' && menu.set(i)) {
      play('move');
      render();
    }
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
comingSoon.addEventListener('click', () => goBack());

muteBtn.addEventListener('click', () => {
  unlockAudio();
  setMuted(!isMuted());
  syncMute();
});
function syncMute(): void {
  muteBtn.setAttribute('aria-pressed', String(isMuted()));
  muteBtn.setAttribute('aria-label', isMuted() ? 'Unmute sound' : 'Mute sound');
}

window.addEventListener('popstate', () => {
  if (history.state?.screen === 'coming-soon') showComingSoon(false);
  else showTitle();
});

watchGamepads(handle);
syncMute();
render();

// Deep link / reload on #coming-soon keeps the overlay.
if (location.hash === '#coming-soon') {
  history.replaceState({ screen: 'coming-soon' }, '', '#coming-soon');
  showComingSoon(false);
}

// Warm the Coming Soon image after the title has fully loaded, so it never competes with the LCP image.
const warm = () => (comingSoon.querySelector('img')!.loading = 'eager');
const warmWhenIdle = () => ('requestIdleCallback' in window ? requestIdleCallback(warm, { timeout: 4000 }) : setTimeout(warm, 2000));
if (document.readyState === 'complete') warmWhenIdle();
else window.addEventListener('load', warmWhenIdle, { once: true });
