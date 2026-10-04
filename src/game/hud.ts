/**
 * DOM HUD, touch controls and overlays. The HUD lives outside the canvas, so it is crisp at any size and
 * never rotates with the cabin (spec: "HUD text never tilts").
 */
import type { BossHud, HudState } from './scenes/LevelScene.ts';

const HEART = (full: boolean) =>
  `<svg viewBox="0 0 7 6" class="ghud-heart${full ? '' : ' empty'}" aria-hidden="true"><path d="M1 0h2v1h1V0h2v1h1v2H6v1H5v1H4v1H3V5H2V4H1V3H0V1h1z"/></svg>`;
const NUT = `<svg viewBox="0 0 8 8" class="ghud-nut" aria-hidden="true"><path d="M2 0h4l2 4-2 4H2L0 4z"/><rect x="3" y="3" width="2" height="2" class="hole"/></svg>`;
const PLANE = `<svg viewBox="0 0 16 8" class="ghud-plane" aria-hidden="true"><path d="M0 3h3l1-3h2l2 3h5l3 1-3 1H8L6 8H4L3 5H0z"/></svg>`;

export interface OverlayAction {
  label: string;
  run(button: HTMLButtonElement): void;
  disabled?: boolean;
  /** Gets the initial focus (default: the first enabled button). */
  focus?: boolean;
}

export class Hud {
  readonly root: HTMLElement;
  readonly touch: HTMLElement;
  private hearts: HTMLElement;
  private score: HTMLElement;
  private nuts: HTMLElement;
  private bankValue: HTMLElement;
  private bankBox: HTMLElement;
  private bankBars: HTMLElement;
  private label: HTMLElement;
  private alt: HTMLElement;
  private warn: HTMLElement;
  private overlay: HTMLElement;
  private boss: HTMLElement;
  private prompt: HTMLElement;
  private last = '';
  private lastBoss = '';

  constructor(host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'game-ui';
    this.root.innerHTML = `
      <header class="ghud" data-testid="hud">
        <div class="ghud-logo"><span>SUPER</span><span>YANIV</span></div>
        <div class="ghud-hearts" data-testid="hearts"></div>
        <div class="ghud-score" data-testid="hud-score">000000</div>
        <div class="ghud-nuts">${NUT}<span class="x">×</span><span data-testid="nuts">000</span></div>
        <div class="ghud-bank">${PLANE}<div><div class="ghud-bank-label">BANK <b>0°</b></div><div class="ghud-bars"></div></div></div>
        <div class="ghud-right"><div class="ghud-label"></div><div class="ghud-alt" data-testid="alt"></div></div>
      </header>
      <div class="ghud-boss" hidden data-testid="boss-hud"></div>
      <div class="ghud-prompt" hidden data-testid="boss-prompt"></div>
      <div class="ghud-warn" hidden aria-hidden="true">!</div>
      <div class="touch" aria-hidden="true">
        <div class="touch-pad">
          <button data-btn="left" tabindex="-1">◀</button><button data-btn="down" tabindex="-1">▼</button><button data-btn="right" tabindex="-1">▶</button>
        </div>
        <div class="touch-actions">
          <button data-btn="grab" tabindex="-1">GRAB</button><button data-btn="jump" tabindex="-1">JUMP</button>
        </div>
        <button class="touch-pause" data-btn="pause" tabindex="-1">II</button>
      </div>
      <div class="game-overlay" hidden role="dialog" aria-modal="true"></div>`;
    host.appendChild(this.root);
    const q = <T extends HTMLElement>(s: string) => this.root.querySelector<T>(s)!;
    this.hearts = q('.ghud-hearts');
    this.score = q('.ghud-score');
    this.nuts = q('[data-testid="nuts"]');
    this.bankValue = q('.ghud-bank-label b');
    this.bankBox = q('.ghud-bank');
    this.bankBars = q('.ghud-bars');
    this.label = q('.ghud-label');
    this.alt = q('.ghud-alt');
    this.warn = q('.ghud-warn');
    this.overlay = q('.game-overlay');
    this.boss = q('.ghud-boss');
    this.prompt = q('.ghud-prompt');
    this.touch = q('.touch');
    this.bankBars.innerHTML = '<i></i>'.repeat(10);
  }

  update(s: HudState): void {
    const key = JSON.stringify(s);
    if (key === this.last) return;
    this.last = key;
    this.hearts.innerHTML = Array.from({ length: s.maxHearts }, (_, i) => HEART(i < s.hearts)).join('');
    this.hearts.setAttribute('aria-label', `${s.hearts} of ${s.maxHearts} hearts`);
    this.nuts.textContent = String(s.nuts).padStart(3, '0');
    this.score.textContent = String(s.score).padStart(6, '0');
    this.bankValue.textContent = `${s.bank}°`;
    this.bankBox.classList.toggle('warning', s.bankWarning);
    // 10 segments = 30°; blue while gentle, amber past 10°.
    const lit = Math.min(10, Math.round(Math.abs(s.bank) / 3));
    [...this.bankBars.children].forEach((el, i) => (el.className = i < lit ? (i >= 3 ? 'hot' : 'on') : ''));
    this.label.textContent = s.label;
    this.alt.textContent = s.altLabel ?? `ALT ${s.alt}`;
    this.updateBoss(s.boss);
  }

  /** The boss panel: phase tracker, name + HP, and the phase's own gauges (matches the cockpit concept art). */
  private updateBoss(b: BossHud | undefined): void {
    const key = JSON.stringify(b ?? null);
    if (key === this.lastBoss) return;
    this.lastBoss = key;
    this.boss.hidden = !b;
    this.prompt.hidden = !b?.prompt;
    if (!b) return;
    this.prompt.textContent = b.prompt ?? '';
    const steps = [
      ['A', 'CONTAIN'],
      ['B', 'LEVEL'],
      ['C', 'HANDOFF'],
    ]
      .map(([p, name]) => `<li class="${p < b.phase ? 'done' : p === b.phase ? 'now' : ''}">${name}</li>`)
      .join('');
    let gauges = '';
    if (b.phase !== 'C') {
      const pips = Array.from({ length: b.maxHp }, (_, i) => `<i class="${i < b.hp ? 'on' : ''}"></i>`).join('');
      gauges += `<div class="ghud-bossname">${b.name}<span class="ghud-hp" data-testid="boss-hp" aria-label="${b.hp} of ${b.maxHp}">${pips}</span></div>`;
    }
    if (b.phase === 'B' && b.pitch !== undefined) {
      // Attitude: −60° .. +10° across the bar, a green HOLD STEADY band around 0°.
      const pos = (deg: number) => `${Math.max(0, Math.min(100, ((deg + 60) / 70) * 100)).toFixed(1)}%`;
      const band = b.band ?? 3;
      const steady = b.steady ? ` · HOLD ${Math.max(0, 5 - b.steady).toFixed(1)}s` : '';
      gauges += `<div class="ghud-control">CONTROL RESTORED <b data-testid="control">${Math.round((b.control ?? 0) * 100)}%</b>
        <span class="ghud-bar"><span style="width:${((b.control ?? 0) * 100).toFixed(0)}%"></span></span></div>
        <div class="ghud-attitude-label" data-testid="pitch">PITCH ${Math.round(b.pitch)}°${steady}</div>
        <div class="ghud-attitude">
          <span class="band" style="left:${pos(-band)};width:calc(${pos(band)} - ${pos(-band)})"></span>
          <span class="mark" style="left:${pos(b.pitch)}"></span>
        </div>`;
    }
    if (b.phase === 'C' && b.knots) {
      gauges += `<div class="ghud-knots">${b.knots
        .map(
          (k) =>
            `<div class="knot${k.target ? ' target' : ''}"><span>${k.name}</span><span class="ghud-bar"><span style="width:${Math.max(0, (k.value / k.max) * 100).toFixed(0)}%"></span></span></div>`,
        )
        .join('')}</div>
        <div class="ghud-captain">CAPTAIN <span class="ghud-bar heart"><span style="width:${(b.captain ?? 0).toFixed(0)}%"></span></span></div>`;
    }
    this.boss.innerHTML = `<ol class="ghud-phases">${steps}</ol>${gauges}`;
  }

  flashWarning(): void {
    this.warn.hidden = false;
    this.warn.classList.remove('blink');
    void this.warn.offsetWidth; // restart the animation
    this.warn.classList.add('blink');
    window.setTimeout(() => (this.warn.hidden = true), 1300);
  }

  /** Shows a modal card. Actions become buttons; the first is focused. Returns a closer. */
  showOverlay(html: string, actions: OverlayAction[] = [], className = ''): () => void {
    this.overlay.className = `game-overlay ${className}`;
    this.overlay.innerHTML = `<div class="card">${html}<div class="card-actions"></div></div>`;
    const row = this.overlay.querySelector('.card-actions')!;
    let focus: HTMLButtonElement | null = null;
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.textContent = a.label;
      btn.disabled = !!a.disabled;
      btn.addEventListener('click', () => a.run(btn));
      row.appendChild(btn);
      if (a.focus) focus = btn;
    }
    this.overlay.hidden = false;
    (focus ?? row.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
    return () => this.hideOverlay();
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
  }

  get overlayOpen(): boolean {
    return !this.overlay.hidden;
  }

  /** Keyboard/gamepad navigation for cards: move focus between buttons and activate the focused one. */
  overlayNavigate(action: 'prev' | 'next' | 'confirm'): void {
    const buttons = [...this.overlay.querySelectorAll<HTMLButtonElement>('.card-actions button:not(:disabled)')];
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (action === 'confirm') return (buttons[i] ?? buttons[0]).click();
    const next = buttons[(Math.max(i, 0) + (action === 'next' ? 1 : buttons.length - 1)) % buttons.length];
    next.focus({ preventScroll: true });
  }

  destroy(): void {
    this.root.remove();
  }
}
