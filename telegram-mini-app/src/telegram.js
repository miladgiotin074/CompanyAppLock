import {
  closingBehavior,
  emitEvent,
  init,
  isTMA,
  miniApp,
  mockTelegramEnv,
  retrieveLaunchParams,
  retrieveRawInitData,
  swipeBehavior,
  viewport,
} from '@tma.js/sdk-react';

/** Raw signed initData string — sent to the backend so it can verify the admin. */
export function getInitDataRaw() {
  try {
    return retrieveRawInitData() || '';
  } catch {
    return '';
  }
}

/**
 * The panel is meant to run ONLY inside Telegram (that is where a signed,
 * verifiable initData comes from). This returns true when we are NOT inside a
 * Telegram client and the dev override is off — main.jsx then shows a blocking
 * error instead of mounting the app (and never installs the dev mock). Set
 * VITE_ALLOW_OUTSIDE_TELEGRAM=true for local browser/UI work only.
 */
export function outsideTelegramBlocked() {
  if (import.meta.env.VITE_ALLOW_OUTSIDE_TELEGRAM === 'true') return false;
  try {
    return !isTMA();
  } catch {
    return true;
  }
}

/** Device id passed by a t.me startapp link, such as the install-log button. */
export function launchDeviceId() {
  try {
    const raw = retrieveLaunchParams().tgWebAppStartParam || '';
    return /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : '';
  } catch {
    return '';
  }
}

/** The current admin's Telegram user id (null outside a known launch). */
export function getAdminId() {
  try {
    return retrieveLaunchParams().tgWebAppData?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Page background. Matches the sticky headers on the users and settings screens. */
export const HEADER_PAGE = '#f6f8fc';
/** White bars. Device app bar and the bottom navigation. */
export const HEADER_BAR = '#ffffff';
/** Brand primary. Same blue as the panel theme-color and brand-600. */
export const HEADER_COLOR = '#1A73E8';

const themeParams = {
  accent_text_color: '#1a73e8',
  bg_color: HEADER_PAGE,
  button_color: '#1a73e8',
  button_text_color: '#ffffff',
  destructive_text_color: '#d93025',
  header_bg_color: HEADER_COLOR,
  hint_color: '#5f6368',
  link_color: '#1a73e8',
  secondary_bg_color: HEADER_BAR,
  section_bg_color: HEADER_BAR,
  section_header_text_color: '#1a73e8',
  subtitle_text_color: '#5f6368',
  text_color: '#1f1f1f',
};

const noInsets = { top: 0, bottom: 0, left: 0, right: 0 };

function mockOutsideTelegram() {
  mockTelegramEnv({
    launchParams: {
      tgWebAppThemeParams: themeParams,
      tgWebAppData: new URLSearchParams([
        ['user', JSON.stringify({ id: 1, first_name: 'Dev', language_code: 'fa' })],
        ['hash', '0'.repeat(64)],
        ['signature', '0'.repeat(64)],
        ['auth_date', Math.floor(Date.now() / 1000).toString()],
      ]).toString(),
      tgWebAppVersion: '8.0',
      tgWebAppPlatform: 'tdesktop',
    },
    onEvent({ name }, next) {
      if (name === 'web_app_request_theme') {
        return emitEvent('theme_changed', { theme_params: themeParams });
      }
      if (name === 'web_app_request_viewport') {
        return emitEvent('viewport_changed', {
          height: window.innerHeight,
          width: window.innerWidth,
          is_expanded: true,
          is_state_stable: true,
        });
      }
      if (name === 'web_app_request_safe_area') {
        return emitEvent('safe_area_changed', noInsets);
      }
      if (name === 'web_app_request_content_safe_area') {
        return emitEvent('content_safe_area_changed', noInsets);
      }
      next();
    },
  });
}

/** Paint the Telegram header with the panel primary, and keep the bottom bar white. */
export function applyHeaderColor() {
  if (miniApp.mount.isAvailable() && !miniApp.isMounted()) miniApp.mount();
  miniApp.setBgColor.ifAvailable(HEADER_PAGE);
  if (miniApp.setHeaderColor.isAvailable()) {
    miniApp.setHeaderColor(miniApp.setHeaderColor.supports('rgb') ? HEADER_COLOR : 'bg_color');
  }
  miniApp.setBottomBarColor.ifAvailable(HEADER_BAR);
}

/** Full height as soon as the client will accept it. Does not wait for viewport.mount. */
export function expandImmediately() {
  viewport.expand.ifAvailable();
}

/**
 * Minimizing the sheet and opening it again leaves a stale height, and the
 * webview often scrolls. A too-tall shell is clipped by overflow, so the
 * bottom menu disappears. Follow the area that is actually on screen.
 */
let viewportBound = false;

function readViewportNumber(read) {
  try {
    const value = Number(read());
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function applyShell() {
  const frame = window.visualViewport;
  const visual = frame ? Math.round(frame.height) : 0;
  const shift = frame ? Math.max(0, Math.round(frame.offsetTop)) : 0;
  const stable = readViewportNumber(() => viewport.stableHeight());
  const live = readViewportNumber(() => viewport.height());
  const telegram = stable >= 240 ? stable : live >= 240 ? live : 0;
  let height = 0;
  if (visual >= 240 && telegram >= 240) height = Math.min(visual, Math.round(telegram));
  else if (visual >= 240) height = visual;
  else if (telegram >= 240) height = Math.round(telegram);

  const root = document.documentElement;
  if (height >= 240) root.style.setProperty('--app-height', `${height}px`);
  else root.style.removeProperty('--app-height');
  if (shift > 0) root.style.setProperty('--app-shift', `${shift}px`);
  else root.style.removeProperty('--app-shift');

  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
}

function holdAppHeight() {
  if (!viewportBound) {
    viewportBound = true;
    try {
      viewport.stableHeight.sub(applyShell);
      viewport.height.sub(applyShell);
    } catch {
      /* Signals are not readable until the client answers. */
    }
    window.visualViewport?.addEventListener('resize', applyShell);
    window.visualViewport?.addEventListener('scroll', applyShell);
    window.addEventListener('resize', applyShell);
    window.addEventListener('focus', applyShell);
    window.addEventListener('pageshow', applyShell);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      expandImmediately();
      applyShell();
    });
  }
  applyShell();
}

/** The X button asks before closing the mini app. */
export function confirmBeforeClose() {
  closingBehavior.mount.ifAvailable();
  closingBehavior.enableConfirmation.ifAvailable();
}

/** Initialize @tma.js once, before React renders. */
export function startTelegram() {
  if (!isTMA()) mockOutsideTelegram();
  try {
    init();
  } catch (error) {
    // A previous browser preview stored launch params, so isTMA() is true,
    // but this window is not a Telegram client. Mock it and try again.
    if (!error || error.name !== 'UnknownEnvError') throw error;
    mockOutsideTelegram();
    init();
  }

  expandImmediately();
  confirmBeforeClose();
  applyHeaderColor();
  holdAppHeight();
  miniApp.ready.ifAvailable();

  if (swipeBehavior.isSupported()) {
    swipeBehavior.mount();
    swipeBehavior.disableVertical();
  }

  viewport
    .mount({ timeout: 3000 })
    .then(() => {
      expandImmediately();
      confirmBeforeClose();
      applyHeaderColor();
      holdAppHeight();
      if (!viewport.isCssVarsBound()) viewport.bindCssVars();
    })
    .catch(() => {
      /* The panel still renders if the client never answers. */
    });
}
