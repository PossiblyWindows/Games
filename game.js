const BAN_STORAGE_KEY = 'reflex-dodger:ban';
const LAST_EXIT_KEY = 'reflex-dodger:last-exit';
const BEST_SCORE_KEY = 'reflex-dodger:best-score';

const TONE_CLASSES = {
  ok: 'status-ok',
  warning: 'status-warning',
  alert: 'status-alert',
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

class StatusIndicator {
  constructor(element) {
    this.element = element;
    this.gameMessage = 'Ready';
    this.securityMessage = 'Secure';
    this.securityTone = 'ok';
    this.render();
  }

  setGame(message) {
    this.gameMessage = message;
    this.render();
  }

  setSecurity(message, tone = 'ok') {
    this.securityMessage = message;
    this.securityTone = tone;
    this.render();
  }

  render() {
    const combined = `Game: ${this.gameMessage} • Security: ${this.securityMessage}`;
    this.element.textContent = combined;
    this.element.classList.remove(...Object.values(TONE_CLASSES));
    const toneClass = TONE_CLASSES[this.securityTone] ?? TONE_CLASSES.ok;
    this.element.classList.add(toneClass);
  }
}

class BanManager {
  constructor(rootElement, statusIndicator) {
    this.rootElement = rootElement;
    this.statusIndicator = statusIndicator;
    this.storageKey = BAN_STORAGE_KEY;
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
    if (this.statusIndicator) {
      this.statusIndicator.setSecurity('Security lockout in place', 'alert');
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
        const description = escapeHtml(entry.reason ?? 'Suspicious activity');
        const severity = typeof entry.severity === 'number' ? ` (severity ${entry.severity})` : '';
        const details = entry.metadata ? ` — ${escapeHtml(JSON.stringify(entry.metadata))}` : '';
        const when = entry.timestamp ? `<time datetime="${escapeHtml(entry.timestamp)}">${formatDate(entry.timestamp)}</time>` : 'Unknown time';
        return `<li>${when}: ${description}${severity}${details}</li>`;
      })
      .join('');

    this.rootElement.innerHTML = `
      <section class="ban-screen" role="alert" aria-live="assertive">
        <h2>Session Banned</h2>
        <p>Your client has been permanently locked for violating the fair play policy.</p>
        <div class="ban-details">
          <h3>Ban Details</h3>
          <p><strong>Reason:</strong> ${escapeHtml(info.reason ?? 'Security policy violation')}</p>
          <p><strong>Issued:</strong> <time datetime="${escapeHtml(info.timestamp)}">${formatDate(info.timestamp)}</time></p>
          ${logMarkup ? `<h3>Security Log</h3><ul>${logMarkup}</ul>` : ''}
          <p class="ban-note">Refreshing or reopening this page will not lift the ban.</p>
        </div>
      </section>
    `;
  }
}

class AntiCheat {
  constructor({ banManager, statusIndicator }) {
    this.banManager = banManager;
    this.statusIndicator = statusIndicator;
    this.suspicionScore = 0;
    this.suspicionLog = [];
    this.threshold = 140;
    this.devToolsStreak = 0;
    this.contextAttempts = 0;
    this.monitoring = false;
    this.decayInterval = null;
  }

  start() {
    if (this.monitoring || this.banManager.isBanned()) {
      return;
    }
    this.monitoring = true;
    this.statusIndicator.setSecurity('Monitoring for tampering…', 'ok');
    this.monitorDevTools();
    this.monitorConsoleInspection();
    this.monitorKeyShortcuts();
    this.monitorRefreshPatterns();
    this.guardMathRandom();
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
        this.statusIndicator.setSecurity('Monitoring clean', 'ok');
      }
    }, 8000);
  }

  recordSuspicion(reason, severity, metadata = {}) {
    if (this.banManager.isBanned()) {
      return;
    }
    const entry = {
      reason,
      severity,
      metadata,
      timestamp: new Date().toISOString(),
    };
    this.suspicionLog.push(entry);
    this.suspicionScore = Math.min(240, this.suspicionScore + severity);

    if (this.statusIndicator) {
      const tone = this.suspicionScore >= this.threshold ? 'alert' : 'warning';
      const message = tone === 'alert'
        ? 'Security breach detected — banning session…'
        : 'Suspicious behaviour observed';
      this.statusIndicator.setSecurity(message, tone);
    }

    if (severity >= 120 || this.suspicionScore >= this.threshold) {
      this.banManager.issueBan(reason, this.suspicionLog.slice());
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
          this.recordSuspicion('Developer tools interface detected', 130, {
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
        self.recordSuspicion('Console inspection bait accessed', 90, {
          source: 'image-id-getter',
        });
        return 'forbidden';
      },
    });
    console.log('%cSecurity monitors active.', 'color:#4fd1c5;font-weight:bold;');
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
        this.recordSuspicion('Blocked developer shortcut', 90, {
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
    const lastExit = Number(localStorage.getItem(LAST_EXIT_KEY) ?? '0');
    const now = Date.now();
    if (lastExit > 0 && now - lastExit < 1500) {
      this.recordSuspicion('Rapid refresh detected', 65, {
        elapsedMs: now - lastExit,
      });
    }
    window.addEventListener('beforeunload', () => {
      try {
        localStorage.setItem(LAST_EXIT_KEY, `${Date.now()}`);
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
        this.recordSuspicion('Math.random tampering detected', 140);
      }
    }, 1000);
  }
}

class DodgingGame {
  constructor(canvas, statusIndicator) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: false });
    this.statusIndicator = statusIndicator;
    this.scoreElement = document.getElementById('score');
    this.bestElement = document.getElementById('best-score');
    this.bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) ?? '0');
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
        localStorage.removeItem(BEST_SCORE_KEY);
      } catch (error) {
        console.warn('Unable to clear best score', error);
      }
    }
    this.statusIndicator.setGame('Ready');
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
    this.statusIndicator.setGame('Running — dodge everything!');
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
        localStorage.setItem(BEST_SCORE_KEY, `${this.bestScore}`);
      } catch (error) {
        console.warn('Unable to persist best score', error);
      }
    }
  }

  handleFailure() {
    this.running = false;
    this.statusIndicator.setGame('Eliminated — press Start to retry');
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
  const statusIndicator = new StatusIndicator(document.getElementById('status'));
  const banManager = new BanManager(appElement, statusIndicator);
  if (banManager.isBanned()) {
    banManager.renderBanScreen();
    return;
  }

  const antiCheat = new AntiCheat({ banManager, statusIndicator });
  antiCheat.start();

  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas element not found');
  }

  const game = new DodgingGame(canvas, statusIndicator);

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
