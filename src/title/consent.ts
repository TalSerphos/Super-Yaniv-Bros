/**
 * Cookie consent for Google Analytics, only where the law asks for opt-in (EEA, UK, Switzerland). The inline
 * script in index.html decides who that is (by time zone), sets Google's consent defaults and loads the library
 * when allowed; this module shows the banner, stores the choice and offers a COOKIES button to change it later.
 */

export const CONSENT_KEY = 'syb.consent.v1';
export type Choice = 'granted' | 'denied';

interface Analytics {
  regulated: boolean;
  choice: string | null;
  load(): void;
}

declare global {
  interface Window {
    sybAnalytics?: Analytics;
    gtag?: (...args: unknown[]) => void;
  }
}

function store(choice: Choice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Private mode: the choice lasts for this visit only.
  }
}

/** Builds the banner (and the COOKIES button) inside the stage. Returns the banner element, if any. */
export function setupConsent(stage: HTMLElement, analytics = window.sybAnalytics): HTMLElement | undefined {
  if (!analytics?.regulated) return undefined;
  const banner = document.createElement('section');
  banner.className = 'consent';
  banner.setAttribute('aria-label', 'Cookie consent');
  banner.dataset.testid = 'consent';
  banner.innerHTML = `
    <p>We'd like to count visits with Google Analytics cookies. No ads, no tracking across sites.</p>
    <div class="consent-buttons">
      <button type="button" data-choice="granted">OK</button>
      <button type="button" data-choice="denied">NO THANKS</button>
    </div>`;
  const reopen = document.createElement('button');
  reopen.type = 'button';
  reopen.className = 'consent-reopen';
  reopen.textContent = 'COOKIES';
  const show = (on: boolean) => {
    banner.hidden = !on;
    reopen.hidden = on;
  };
  banner.addEventListener('click', (e) => {
    const choice = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]')?.dataset.choice as Choice | undefined;
    if (!choice) return;
    e.stopPropagation();
    store(choice);
    analytics.choice = choice;
    window.gtag?.('consent', 'update', { analytics_storage: choice });
    if (choice === 'granted') analytics.load();
    show(false);
  });
  reopen.addEventListener('click', (e) => {
    e.stopPropagation();
    show(true);
    banner.querySelector('button')?.focus({ preventScroll: true });
  });
  stage.append(banner, reopen);
  show(analytics.choice !== 'granted' && analytics.choice !== 'denied');
  return banner;
}
