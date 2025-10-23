(() => {
  'use strict';

const decodeSegment = (segment) => {
  try {
    return typeof globalThis.atob === 'function' ? globalThis.atob(segment) : segment;
  } catch (error) {
    return segment;
  }
};

const spool = (segments) => segments.map((segment) => decodeSegment(segment)).join('');

const KEYCHAIN = Object.freeze({
  ban: spool(['cmVm', 'bGV4', 'LWRv', 'ZGdl', 'cjpi', 'YW4=']),
  exit: spool(['cmVm', 'bGV4', 'LWRv', 'ZGdl', 'cjps', 'YXN0', 'LWV4', 'aXQ=']),
  best: spool(['cmVm', 'bGV4', 'LWRv', 'ZGdl', 'cjpi', 'ZXN0', 'LXNj', 'b3Jl']),
});

const signalPalette = Object.freeze({
  steady: 'status-ok',
  caution: 'status-warning',
  critical: 'status-alert',
});

const maskEvent = (input) => {
  const text = String(input ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  const normalized = Math.abs(hash).toString(36).padStart(6, '0');
  return `sig-${normalized.slice(-10)}`;
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(timestamp) {
  try {
    const date = new Date(timestamp);
    if (Number.isNaN(date.valueOf())) {
      return escapeHtml(timestamp);
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  } catch (error) {
    return escapeHtml(String(timestamp));
  }
}

class StatusLamp {
  constructor(element) {
    this.element = element;
    this.gameMessage = 'Ready';
    this.hiddenMessage = 'Nominal';
    this.signalTone = 'steady';
    this.render();
  }

  setGame(message) {
    this.gameMessage = message;
    this.render();
  }

  setSignal(message, tone = 'steady') {
    this.hiddenMessage = message;
    this.signalTone = tone;
    this.render();
  }

  render() {
    this.element.textContent = this.gameMessage;
    this.element.classList.remove(...Object.values(signalPalette));
    const toneClass = signalPalette[this.signalTone] ?? signalPalette.steady;
    this.element.classList.add(toneClass);
    this.element.dataset.echo = this.hiddenMessage;
  }
}

class BanManager {
  constructor(rootElement, statusLamp) {
    this.rootElement = rootElement;
    this.statusLamp = statusLamp;
    this.storageKey = KEYCHAIN.ban;
    this.banInfo = this.loadBan();
  }

  loadBan() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to parse ban info', error);
    }
    return null;
  }

  isBanned() {
    return Boolean(this.banInfo);
  }

  issueBan(reason, log = []) {
    if (this.banInfo) {
      return;
    }
    const entry = {
      reason,
      timestamp: new Date().toISOString(),
      log,
    };
    this.banInfo = entry;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(entry));
    } catch (error) {
      console.warn('Unable to persist ban information', error);
    }
    if (this.statusLamp) {
      this.statusLamp.setSignal('Lockout enforced', 'critical');
    }
    this.renderBanScreen();
  }

  renderBanScreen() {
    if (!this.banInfo) {
      return;
    }
    const info = this.banInfo;
    const logEntries = Array.isArray(info.log) ? info.log : [];
    const logMarkup = logEntries
      .map((entry) => {
        const marker = escapeHtml(entry.marker ?? 'sig-unknown');
        const severity = typeof entry.severity === 'number' ? ` (weight ${entry.severity})` : '';
        const detail = entry.detail ? ` — token ${escapeHtml(entry.detail)}` : '';
        const when = entry.timestamp ? `<time datetime="${escapeHtml(entry.timestamp)}">${formatDate(entry.timestamp)}</time>` : 'Unknown time';
        return `<li>${when}: ${marker}${severity}${detail}</li>`;
      })
      .join('');

    this.rootElement.innerHTML = `
      <section class="ban-screen" role="alert" aria-live="assertive">
        <h2>Session Locked</h2>
        <p>This session has been permanently restricted due to irregular activity.</p>
        <div class="ban-details">
          <h3>Lock Details</h3>
          <p><strong>Lock Code:</strong> ${escapeHtml(info.reason ?? 'sig-unknown')}</p>
          <p><strong>Issued:</strong> <time datetime="${escapeHtml(info.timestamp)}">${formatDate(info.timestamp)}</time></p>
          ${logMarkup ? `<h3>Event Log</h3><ul>${logMarkup}</ul>` : ''}
          <p class="ban-note">Refreshing or reopening this page will not lift the lock.</p>
        </div>
      </section>
    `;
  }
}

class Sentinel {
  constructor({ banManager, statusLamp }) {
    this.banManager = banManager;
    this.statusLamp = statusLamp;
    this.suspicionScore = 0;
    this.suspicionLog = [];
    this.threshold = 140;
    this.devToolsStreak = 0;
    this.contextAttempts = 0;
    this.monitoring = false;
    this.decayInterval = null;
    this.tampermonkeyFlagged = false;
    this.dynamicEvalFlagged = false;
    this.scriptObserver = null;
    this.userScriptInterval = null;
  }

  start() {
    if (this.monitoring || this.banManager.isBanned()) {
      return;
    }
    this.monitoring = true;
    this.statusLamp.setSignal('Monitoring channel armed', 'steady');
    this.monitorDevTools();
    this.monitorConsoleInspection();
    this.monitorKeyShortcuts();
    this.monitorRefreshPatterns();
    this.guardMathRandom();
    this.observeUserScripts();
    this.watchScriptInjection();
    this.trapEvaluators();
    this.beginSuspicionDecay();
  }

  beginSuspicionDecay() {
    this.decayInterval = window.setInterval(() => {
      if (this.banManager.isBanned()) {
        window.clearInterval(this.decayInterval);
        return;
      }
      if (this.suspicionScore === 0) {
        return;
      }
      this.suspicionScore = Math.max(0, this.suspicionScore - 4);
      if (this.suspicionScore === 0) {
        this.statusLamp.setSignal('Channel clear', 'steady');
      }
    }, 8000);
  }

  recordSuspicion(reason, severity, metadata = {}) {
    if (this.banManager.isBanned()) {
      return;
    }
    const marker = maskEvent(reason);
    const detail = metadata && Object.keys(metadata).length > 0
      ? maskEvent(JSON.stringify(metadata))
      : null;
    const entry = {
      marker,
      severity,
      detail,
      timestamp: new Date().toISOString(),
    };
    this.suspicionLog.push(entry);
    this.suspicionScore = Math.min(240, this.suspicionScore + severity);

    if (this.statusLamp) {
      const tone = this.suspicionScore >= this.threshold ? 'critical' : 'caution';
      const message = tone === 'critical'
        ? 'Irregular activity locked the session…'
        : 'Anomaly observed';
      this.statusLamp.setSignal(message, tone);
    }

    if (severity >= 120 || this.suspicionScore >= this.threshold) {
      this.banManager.issueBan(marker, this.suspicionLog.slice());
    }
  }

  monitorDevTools() {
    const threshold = 140;
    const checkDevTools = () => {
      const outerWidth = Number.isFinite(window.outerWidth) && window.outerWidth > 0
        ? window.outerWidth
        : window.innerWidth;
      const outerHeight = Number.isFinite(window.outerHeight) && window.outerHeight > 0
        ? window.outerHeight
        : window.innerHeight;
      const widthDiff = Math.abs(outerWidth - window.innerWidth);
      const heightDiff = Math.abs(outerHeight - window.innerHeight);
      const devtoolsOpen = outerWidth > 0 && outerHeight > 0 && (widthDiff > threshold || heightDiff > threshold);
      if (devtoolsOpen) {
        this.devToolsStreak += 1;
        if (this.devToolsStreak >= 3) {
          this.recordSuspicion('Inspection surface opened', 130, {
            widthDiff,
            heightDiff,
          });
          this.devToolsStreak = 0;
        }
      } else {
        this.devToolsStreak = 0;
      }
    };
    this.devToolsInterval = window.setInterval(checkDevTools, 350);
    window.addEventListener('resize', checkDevTools, { passive: true });
  }

  monitorConsoleInspection() {
    const self = this;
    const bait = new Image();
    Object.defineProperty(bait, 'id', {
      get() {
        self.recordSuspicion('Console probing trap tripped', 90, {
          source: 'image-id-getter',
        });
        return 'forbidden';
      },
    });
    console.log('%cTelemetry channel engaged.', 'color:#4fd1c5;font-weight:bold;');
    console.log(bait);
  }

  monitorKeyShortcuts() {
    window.addEventListener('keydown', (event) => {
      const key = event.key?.toLowerCase();
      const devToolsCombo =
        event.key === 'F12' ||
        (event.ctrlKey && event.shiftKey && ['i', 'j', 'c'].includes(key)) ||
        (event.metaKey && event.altKey && key === 'i');
      if (devToolsCombo) {
        event.preventDefault();
        this.recordSuspicion('Blocked restricted shortcut', 90, {
          key: event.key,
          ctrl: event.ctrlKey,
          shift: event.shiftKey,
          meta: event.metaKey,
        });
      }
    }, { passive: false });

    window.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.contextAttempts += 1;
      if (this.contextAttempts === 1) {
        this.recordSuspicion('Context menu blocked', 20);
      } else if (this.contextAttempts > 3) {
        this.recordSuspicion('Repeated context menu access', 40, {
          attempts: this.contextAttempts,
        });
      }
    });
  }

  monitorRefreshPatterns() {
    const lastExit = Number(localStorage.getItem(KEYCHAIN.exit) ?? '0');
    const now = Date.now();
    if (lastExit > 0 && now - lastExit < 1500) {
      this.recordSuspicion('Rapid refresh detected', 65, {
        elapsedMs: now - lastExit,
      });
    }
    window.addEventListener('beforeunload', () => {
      try {
        localStorage.setItem(KEYCHAIN.exit, `${Date.now()}`);
      } catch (error) {
        console.warn('Failed to store exit timestamp', error);
      }
    });
  }

  guardMathRandom() {
    const mathRandom = Math.random;
    try {
      Object.defineProperty(Math, 'random', {
        value: mathRandom,
        configurable: false,
        writable: false,
      });
    } catch (error) {
      console.warn('Unable to lock Math.random', error);
    }
    window.setInterval(() => {
      if (Math.random !== mathRandom) {
        this.recordSuspicion('Entropy source replaced', 140);
      }
    }, 1000);
  }

  observeUserScripts() {
    const check = () => {
      try {
        const gmInfo = globalThis.GM_info;
        if (!gmInfo || typeof gmInfo !== 'object') {
          return;
        }
        const handler = String(gmInfo.scriptHandler ?? '').toLowerCase();
        if (handler.includes('tampermonkey')) {
          if (!this.tampermonkeyFlagged) {
            this.tampermonkeyFlagged = true;
            this.recordSuspicion('Userscript controller detected', 135, {
              handler: gmInfo.scriptHandler,
              script: gmInfo.script?.name ?? 'unknown',
            });
          }
          return;
        }
        const ua = String(globalThis.navigator?.userAgent ?? '').toLowerCase();
        if ((typeof globalThis.Tampermonkey !== 'undefined' || ua.includes('tampermonkey')) && !this.tampermonkeyFlagged) {
          this.tampermonkeyFlagged = true;
          this.recordSuspicion('Userscript bridge exposed', 120, {
            handler: 'Tampermonkey',
          });
        }
      } catch (error) {
        console.warn('Tampermonkey check failed', error);
      }
    };
    check();
    this.userScriptInterval = window.setInterval(check, 3500);
  }

  watchScriptInjection() {
    const evaluateScript = (script) => {
      if (!(script instanceof HTMLScriptElement)) {
        return;
      }
      if (script.dataset && script.dataset.rdIgnore === '1') {
        return;
      }
      const source = script.src ?? '';
      const text = script.textContent ?? '';
      if (source) {
        if (/^(?:data|blob|javascript):/i.test(source) || /bookmarklet/i.test(source) || /tamper/i.test(source)) {
          this.recordSuspicion('Injected script URL detected', 125, { source });
        }
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const snippet = trimmed.slice(0, 120);
      if (/bookmarklet/i.test(trimmed) || /void\s*0/.test(trimmed) || /GM_/.test(trimmed)) {
        this.recordSuspicion('Inline runtime script injection', 125, { snippet });
        return;
      }
      if (trimmed.length < 160) {
        this.recordSuspicion('Short inline script appended', 95, { snippet });
      }
    };

    this.scriptObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLScriptElement) {
            evaluateScript(node);
          }
        }
      }
    });
    this.scriptObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  trapEvaluators() {
    const trap = (fn, label) => {
      if (typeof fn !== 'function') {
        return fn;
      }
      const sentinel = this;
      return new Proxy(fn, {
        apply(target, thisArg, args) {
          if (!sentinel.dynamicEvalFlagged) {
            sentinel.dynamicEvalFlagged = true;
            try {
              const preview = typeof args?.[0] === 'string' ? args[0].slice(0, 80) : typeof args?.[0];
              sentinel.recordSuspicion('Dynamic evaluation invoked', 105, { label, preview });
            } catch (error) {
              console.warn('Dynamic evaluation logging failed', error);
            }
          }
          return Reflect.apply(target, thisArg, args ?? []);
        },
        construct(target, args, newTarget) {
          if (!sentinel.dynamicEvalFlagged) {
            sentinel.dynamicEvalFlagged = true;
            try {
              const preview = typeof args?.[0] === 'string' ? args[0].slice(0, 80) : `${args?.length ?? 0} args`;
              sentinel.recordSuspicion('Dynamic evaluation invoked', 105, { label: `${label}-construct`, preview });
            } catch (error) {
              console.warn('Dynamic evaluation logging failed', error);
            }
          }
          return Reflect.construct(target, args ?? [], newTarget ?? target);
        },
      });
    };

    try {
      window.eval = trap(window.eval, 'eval');
    } catch (error) {
      console.warn('Unable to wrap eval', error);
    }

    try {
      window.Function = trap(window.Function, 'Function');
    } catch (error) {
      console.warn('Unable to wrap Function', error);
    }
  }
}

class DodgingGame {
  constructor(canvas, statusLamp) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    this.statusLamp = statusLamp;
    this.scoreElement = document.getElementById('score');
    this.bestElement = document.getElementById('best-score');
    this.bestScore = Number(localStorage.getItem(KEYCHAIN.best) ?? '0');
    this.bestElement.textContent = `${this.bestScore}`;
    this.activeKeys = new Set();
    this.running = false;
    this.obstacles = [];
    this.score = 0;
    this.lastFrame = 0;

    this.handleKeyDown = (event) => {
      const key = event.key?.toLowerCase();
      if (['arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd'].includes(key)) {
        event.preventDefault();
        this.activeKeys.add(key);
      }
    };

    this.handleKeyUp = (event) => {
      const key = event.key?.toLowerCase();
      if (['arrowup', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd'].includes(key)) {
        this.activeKeys.delete(key);
      }
    };

    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp, { passive: true });

    this.resetGameState();
  }

  resetGameState(fullReset = false) {
    this.player = {
      width: 36,
      height: 36,
      x: this.canvas.width / 2 - 18,
      y: this.canvas.height - 80,
      speed: 280,
    };
    this.obstacles = [];
    for (let i = 0; i < 8; i += 1) {
      this.obstacles.push(this.spawnObstacle(-i * 90 - Math.random() * 200));
    }
    this.score = 0;
    this.lastFrame = 0;
    this.running = false;
    this.scoreElement.textContent = '0';
    if (fullReset) {
      this.bestScore = 0;
      this.bestElement.textContent = '0';
      try {
        localStorage.removeItem(KEYCHAIN.best);
      } catch (error) {
        console.warn('Unable to clear best score', error);
      }
    }
    this.statusLamp.setGame('Ready');
    this.render();
  }

  spawnObstacle(initialY = -60) {
    const width = 24 + Math.random() * 60;
    const height = 24 + Math.random() * 36;
    const speed = 140 + Math.random() * 160;
    return {
      x: Math.random() * (this.canvas.width - width),
      y: initialY,
      width,
      height,
      speed,
      hue: 180 + Math.random() * 120,
    };
  }

  start() {
    if (this.running) {
      return;
    }
    this.resetGameState();
    this.running = true;
    this.statusLamp.setGame('Running — dodge everything!');
    this.lastFrame = performance.now();
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  loop(timestamp) {
    if (!this.running) {
      return;
    }
    const delta = (timestamp - this.lastFrame) / 1000;
    this.lastFrame = timestamp;
    this.update(delta);
    this.render();
    requestAnimationFrame((time) => this.loop(time));
  }

  update(delta) {
    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }
    this.updatePlayer(delta);
    this.updateObstacles(delta);
    this.incrementScore(delta);
  }

  updatePlayer(delta) {
    const moveDistance = this.player.speed * delta;
    if (this.activeKeys.has('arrowleft') || this.activeKeys.has('a')) {
      this.player.x -= moveDistance;
    }
    if (this.activeKeys.has('arrowright') || this.activeKeys.has('d')) {
      this.player.x += moveDistance;
    }
    if (this.activeKeys.has('arrowup') || this.activeKeys.has('w')) {
      this.player.y -= moveDistance;
    }
    if (this.activeKeys.has('arrowdown') || this.activeKeys.has('s')) {
      this.player.y += moveDistance;
    }
    this.player.x = Math.max(0, Math.min(this.canvas.width - this.player.width, this.player.x));
    this.player.y = Math.max(0, Math.min(this.canvas.height - this.player.height, this.player.y));
  }

  updateObstacles(delta) {
    for (const obstacle of this.obstacles) {
      obstacle.y += obstacle.speed * delta;
      if (obstacle.y > this.canvas.height + 40) {
        Object.assign(obstacle, this.spawnObstacle(-120 - Math.random() * 160));
      }
      if (this.intersects(this.player, obstacle)) {
        this.handleFailure();
        break;
      }
    }
  }

  incrementScore(delta) {
    this.score += delta * 12;
    const displayScore = Math.floor(this.score);
    this.scoreElement.textContent = `${displayScore}`;
    if (displayScore > this.bestScore) {
      this.bestScore = displayScore;
      this.bestElement.textContent = `${this.bestScore}`;
      try {
        localStorage.setItem(KEYCHAIN.best, `${this.bestScore}`);
      } catch (error) {
        console.warn('Unable to persist best score', error);
      }
    }
  }

  handleFailure() {
    this.running = false;
    this.statusLamp.setGame('Eliminated — press Start to retry');
  }

  render() {
    const ctx = this.context;
    ctx.fillStyle = '#0b1522';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, 'rgba(79, 209, 197, 0.12)');
    gradient.addColorStop(1, 'rgba(79, 148, 209, 0.08)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.fillStyle = '#1a365d';
    ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
    ctx.strokeStyle = '#63b3ed';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.player.x, this.player.y, this.player.width, this.player.height);

    for (const obstacle of this.obstacles) {
      ctx.fillStyle = `hsla(${obstacle.hue}, 70%, 60%, 0.85)`;
      ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
    }
  }

  intersects(rectA, rectB) {
    return !(
      rectA.x + rectA.width < rectB.x ||
      rectA.x > rectB.x + rectB.width ||
      rectA.y + rectA.height < rectB.y ||
      rectA.y > rectB.y + rectB.height
    );
  }
}

function initialize() {
  const appElement = document.getElementById('app');
  if (!appElement) {
    throw new Error('Missing root element for app');
  }
  const statusLamp = new StatusLamp(document.getElementById('status'));
  const banManager = new BanManager(appElement, statusLamp);
  if (banManager.isBanned()) {
    banManager.renderBanScreen();
    return;
  }

  const sentinel = new Sentinel({ banManager, statusLamp });
  sentinel.start();

  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas element not found');
  }

  const game = new DodgingGame(canvas, statusLamp);

  const startButton = document.getElementById('start-button');
  const resetButton = document.getElementById('reset-button');

  startButton.addEventListener('click', () => {
    if (banManager.isBanned()) {
      banManager.renderBanScreen();
      return;
    }
    game.start();
  });

  resetButton.addEventListener('click', () => {
    if (banManager.isBanned()) {
      banManager.renderBanScreen();
      return;
    }
    game.resetGameState(true);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}

})();
