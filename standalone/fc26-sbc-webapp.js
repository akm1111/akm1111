(function () {
  if (window.__FC26_SBC_WEBAPP__) {
    window.__FC26_SBC_WEBAPP__.ui.toggle();
    return;
  }

  class AutomationError extends Error {}

  class Logger {
    constructor(listNode) {
      this.listNode = listNode;
      this.entries = [];
    }

    push(level, message, meta = {}) {
      const entry = { ts: new Date().toISOString(), level, message, meta };
      this.entries.push(entry);
      const row = document.createElement('div');
      row.className = `fc26-log fc26-log-${level}`;
      row.textContent = `[${entry.ts}] [${level.toUpperCase()}] ${message}`;
      this.listNode.prepend(row);
      if (this.listNode.childElementCount > 300) {
        this.listNode.removeChild(this.listNode.lastChild);
      }
      console[level === 'error' ? 'error' : level === 'warning' ? 'warn' : 'log']('[FC26-SBC-WEBAPP]', message, meta);
    }
  }

  class Dashboard {
    constructor() {
      this.root = document.createElement('div');
      this.root.className = 'fc26-dash';
      this.root.innerHTML = `
        <style>
          .fc26-dash{position:fixed;top:16px;right:16px;z-index:2147483647;width:420px;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:12px;font:12px/1.4 system-ui;padding:10px;box-shadow:0 12px 30px rgba(0,0,0,.4)}
          .fc26-row{display:flex;gap:8px;margin:6px 0}.fc26-row input{flex:1;background:#111827;color:#e5e7eb;border:1px solid #374151;border-radius:6px;padding:6px}
          .fc26-row button{background:#1f2937;color:#e5e7eb;border:1px solid #475569;border-radius:6px;padding:6px 8px;cursor:pointer}
          .fc26-status{padding:6px;background:#111827;border-radius:6px;border:1px solid #334155;margin-top:4px}
          .fc26-log-wrap{max-height:260px;overflow:auto;margin-top:8px;border:1px solid #334155;border-radius:6px;padding:6px;background:#020617}
          .fc26-log{margin-bottom:4px}.fc26-log-warning{color:#fbbf24}.fc26-log-error{color:#fca5a5}.fc26-log-info{color:#93c5fd}
          .fc26-mini{font-size:11px;color:#94a3b8}
        </style>
        <div><strong>FC26 SBC Automation Web App</strong></div>
        <div class="fc26-row"><input id="fc26-name" placeholder="Exact SBC name"></div>
        <div class="fc26-row">
          <button id="fc26-start">Start</button><button id="fc26-stop">Stop</button><button id="fc26-recover">Manual Recover</button><button id="fc26-hide">Hide</button>
        </div>
        <div id="fc26-status" class="fc26-status">Idle</div>
        <div class="fc26-mini">Self-healing enabled • bounded retries • safe pause on unrecoverable states</div>
        <div id="fc26-logs" class="fc26-log-wrap"></div>
      `;
      document.body.appendChild(this.root);
      this.name = this.root.querySelector('#fc26-name');
      this.status = this.root.querySelector('#fc26-status');
      this.logs = this.root.querySelector('#fc26-logs');
      this.onStart = null;
      this.onStop = null;
      this.onRecover = null;
      this.root.querySelector('#fc26-start').onclick = () => this.onStart && this.onStart(this.name.value.trim());
      this.root.querySelector('#fc26-stop').onclick = () => this.onStop && this.onStop();
      this.root.querySelector('#fc26-recover').onclick = () => this.onRecover && this.onRecover();
      this.root.querySelector('#fc26-hide').onclick = () => this.toggle();
    }

    setStatus(text) { this.status.textContent = text; }
    toggle() { this.root.style.display = this.root.style.display === 'none' ? 'block' : 'none'; }
  }

  class Automator {
    constructor(ui, logger) {
      this.ui = ui;
      this.log = logger;
      this.running = false;
      this.paused = false;
      this.aborted = false;
      this.sbcName = '';
      this.defaultTimeout = 15000;
      this.maxRetries = 3;
      this.lastStep = 'idle';
    }

    async start(name) {
      if (!name) throw new AutomationError('Enter exact SBC name.');
      if (this.running) return;
      this.running = true; this.paused = false; this.aborted = false; this.sbcName = name;
      this.log.push('info', `Starting automation: ${name}`);
      this.ui.setStatus(`Running: ${name}`);
      this.loop().catch((e) => this.stopWithError(e));
    }

    stop() {
      this.aborted = true; this.running = false; this.paused = false;
      this.log.push('info', 'Stopped by user.');
      this.ui.setStatus('Stopped');
    }

    async loop() {
      const preflight = await this.runRecoverable('Preflight', async () => {
        await this.ensureFavourites();
        await this.openSbc(this.sbcName);
      });
      if (!preflight) return this.pause('Preflight unrecoverable');

      while (this.running && !this.aborted) {
        await this.waitWhilePaused();
        const steps = [
          ['Common Gold pass', () => this.runPass('Common Gold')],
          ['Remove 3 players', () => this.removeThree()],
          ['Rare Gold pass', () => this.runPass('Rare Gold')],
          ['Verify success', () => this.verifySuccess()],
          ['Reopen challenge', () => this.reopenChallenge()]
        ];
        for (const [step, fn] of steps) {
          const ok = await this.runRecoverable(step, fn);
          if (!ok) { this.pause(`Paused on ${step}`); break; }
        }
      }
    }

    async runRecoverable(step, fn) {
      this.lastStep = step;
      for (let i = 1; i <= this.maxRetries; i++) {
        this.throwIfStopped();
        try { await fn(); return true; }
        catch (e) {
          this.log.push('warning', `${step} failed ${i}/${this.maxRetries}: ${e.message}`);
          const healed = await this.recover(step, e);
          if (!healed && i === this.maxRetries) return false;
        }
      }
      return false;
    }

    async recover(step) {
      this.log.push('info', `Self-heal running for: ${step}`);
      await this.wait(700);
      if (/open|favourites|reopen/i.test(step)) return this.safeEnsureFavourites();
      if (/pass|sort|quality|builder|remove|verify|success/i.test(step)) {
        await this.safeEnsureChallenge();
        return true;
      }
      return true;
    }

    pause(reason) {
      this.paused = true;
      this.ui.setStatus(`Paused: ${reason}`);
      this.log.push('warning', `Paused safely: ${reason}`);
    }

    async manualRecover() {
      this.log.push('info', 'Manual recover requested.');
      await this.safeEnsureChallenge();
      this.paused = false;
      this.ui.setStatus(`Running: ${this.sbcName}`);
    }

    async waitWhilePaused() {
      while (this.running && !this.aborted && this.paused) {
        await this.wait(2000);
        const ok = await this.runRecoverable('Paused checkpoint', async () => this.safeEnsureChallenge());
        if (ok) { this.paused = false; this.ui.setStatus(`Running: ${this.sbcName}`); }
      }
    }

    async ensureFavourites() {
      await this.waitFor(() => this.findByText(['h1','h2','h3','[role="heading"]'],'Favourites'), this.defaultTimeout, 'Favourites not found');
    }

    async openSbc(name) {
      for (let i = 0; i < 4; i++) {
        const card = this.findSbcCard(name);
        if (card) {
          card.scrollIntoView({ block: 'center', behavior: 'auto' });
          await this.click(card);
          const opened = await this.waitFor(() => this.insideChallenge(name), 7000, '', true);
          if (opened) return;
        }
        await this.scrollList();
      }
      throw new AutomationError(`Could not open SBC: ${name}`);
    }

    async reopenChallenge() {
      const back = this.findButton(['Back','Return','SBCs']);
      if (back) await this.click(back);
      await this.ensureFavourites();
      await this.openSbc(this.sbcName);
    }

    async runPass(label) {
      await this.openBuilder();
      await this.enableIgnorePosition();
      await this.setSortLowToHigh();
      await this.setQuality(label);
      await this.generateApply();
      await this.validateBeforeSubmit();
      await this.submit();
    }

    async openBuilder() {
      const btn = await this.waitFor(() => this.findButton(['Squad Builder']), this.defaultTimeout, 'Squad Builder not found');
      await this.click(btn);
    }

    async enableIgnorePosition() {
      const row = await this.waitFor(() => this.findByText(['label','span','div','li','p'], 'Ignore Position'), this.defaultTimeout, 'Ignore Position not found');
      const root = row.closest('[role="switch"], [role="checkbox"], label, .toggle, li, .row, .setting') || row;
      if (this.ignoreEnabled(root)) return;
      await this.click(root);
      await this.waitFor(() => this.ignoreEnabled(root), 3000, 'Ignore Position not enabled');
    }

    ignoreEnabled(node) {
      const t = this.text(node);
      return node.getAttribute('aria-checked') === 'true' || node.classList.contains('active') || t.includes('ignore position on');
    }

    async setSortLowToHigh() {
      await this.click(await this.waitFor(() => this.findButton(['Sort']), this.defaultTimeout, 'Sort not found'));
      await this.click(await this.waitFor(() => this.findByText(['button','[role="option"]','li'], 'Player Rating (Low'), this.defaultTimeout, 'Low->High not found'));
    }

    async setQuality(label) {
      await this.click(await this.waitFor(() => this.findButton(['Player Quality','Quality']), this.defaultTimeout, 'Quality menu not found'));
      await this.click(await this.waitFor(() => this.findByText(['button','[role="option"]','li'], label), this.defaultTimeout, `${label} not found`));
    }

    async generateApply() {
      await this.click(await this.waitFor(() => this.findButton(['Build Squad','Generate Squad','Generate']), this.defaultTimeout, 'Generate not found'));
      await this.click(await this.waitFor(() => this.findButton(['Use Squad','Apply','Confirm']), this.defaultTimeout, 'Apply not found'));
    }

    async validateBeforeSubmit() {
      if (document.querySelector('.requirement.is-failed, .requirement.failed, .sbc-requirement--failed, .negative')) {
        throw new AutomationError('Requirements failed');
      }
      const submit = this.findButton(['Submit','Exchange Squad']);
      if (!submit || submit.hasAttribute('disabled') || submit.getAttribute('aria-disabled') === 'true') throw new AutomationError('Submit disabled');
    }

    async submit() {
      await this.click(await this.waitFor(() => this.findButton(['Submit','Exchange Squad']), this.defaultTimeout, 'Submit not found'));
      await this.click(await this.waitFor(() => this.findButton(['Submit Squad','Yes','Confirm']), this.defaultTimeout, 'Confirm not found'));
    }

    async verifySuccess() {
      await this.waitFor(() => this.findByText(['div','span','p'], 'Challenge Complete') || this.findByText(['div','span','p'], 'Submitted') || this.findByText(['div','span','p'], 'Completed'), this.defaultTimeout, 'Submission success not detected');
    }

    async removeThree() {
      const slots = await this.waitFor(() => [...document.querySelectorAll('.player,.squadSlot,.slot')].filter((n) => !n.classList.contains('empty')), this.defaultTimeout, 'No filled slots');
      if (slots.length < 3) throw new AutomationError('Not enough players to remove 3');
      for (let i = 0; i < 3; i++) {
        await this.click(slots[i]);
        await this.click(await this.waitFor(() => this.findButton(['Remove From Squad','Remove','Clear']), this.defaultTimeout, 'Remove button missing'));
      }
    }

    findSbcCard(name) {
      const target = this.norm(name).replace(/^\d+\s*of\s*\d+\s*/,'').replace(/^\d+\/\d+\s*/,'').trim();
      const cards = [...document.querySelectorAll('article, li, .listFUTItem, .tile, .ut-tile, .sbc-set-tile, [role="button"], button')]
        .filter((n) => n.offsetParent && this.text(n).length > 3);
      let best = null; let bestScore = 0;
      for (const card of cards) {
        const text = this.norm(card.textContent || '');
        const score = text.includes(target) ? 1 : this.tokenScore(text, target);
        if (score > bestScore) { best = card; bestScore = score; }
      }
      return bestScore >= 0.5 ? best : null;
    }

    tokenScore(text, target) {
      const a = new Set(text.split(' ').filter(Boolean));
      const b = new Set(target.split(' ').filter(Boolean));
      let m = 0; for (const x of b) if (a.has(x)) m++;
      return m / Math.max(1, b.size);
    }

    insideChallenge(name) {
      const hasUI = this.findButton(['Squad Builder','Submit','Exchange Squad']) || this.findByText(['div','span','li','p'], 'Requirements');
      if (!hasUI) return false;
      const t = this.norm(name);
      return [...document.querySelectorAll('h1,h2,h3,.title,.challenge-name,.tileTitle,[role="heading"]')]
        .some((n) => this.norm(n.textContent || '').includes(t.replace(/^\d+\s*of\s*\d+\s*/, '')));
    }

    async safeEnsureFavourites() {
      if (this.findByText(['h1','h2','h3','[role="heading"]'],'Favourites')) return true;
      const back = this.findButton(['Back','Return','SBCs']);
      if (back) await this.click(back);
      await this.waitFor(() => this.findByText(['h1','h2','h3','[role="heading"]'],'Favourites'), this.defaultTimeout, '', true);
      return true;
    }

    async safeEnsureChallenge() {
      if (this.insideChallenge(this.sbcName)) return true;
      await this.safeEnsureFavourites();
      await this.openSbc(this.sbcName);
      return true;
    }

    async scrollList() {
      const c = document.querySelector('.ut-item-view,.listFUTItemContainer,.ut-sbc-set-view,.scrollable,main') || document.scrollingElement;
      if (!c) return;
      c.scrollBy({ top: Math.max(200, Math.floor(innerHeight * 0.5)), behavior: 'auto' });
      await this.wait(200);
    }

    async click(el) {
      this.throwIfStopped();
      if (!el || !el.isConnected) throw new AutomationError('Element disconnected');
      const c = el.closest('button,[role="button"],[tabindex],.clickable') || el;
      c.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      c.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      c.click();
      await this.wait(80);
    }

    findButton(labels) {
      return [...document.querySelectorAll('button,[role="button"],.btn,.ut-button')]
        .find((b) => labels.some((x) => this.text(b).includes(this.norm(x))));
    }

    findByText(selectors, text) {
      const m = this.norm(text);
      return [...document.querySelectorAll(selectors.join(','))].find((n) => this.text(n).includes(m)) || null;
    }

    text(n) { return this.norm(n?.textContent || n?.innerText || ''); }
    norm(v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); }

    async waitFor(predicate, timeout = this.defaultTimeout, msg = 'Timed out waiting for state', silent = false) {
      const start = performance.now();
      while (performance.now() - start < timeout) {
        this.throwIfStopped();
        const v = predicate();
        if (v) return v;
        await this.wait(80);
      }
      if (silent) return null;
      throw new AutomationError(msg);
    }

    wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

    throwIfStopped() { if (!this.running || this.aborted) throw new AutomationError(`Automation stopped (running=${this.running}, aborted=${this.aborted}).`); }

    stopWithError(error) {
      this.running = false;
      this.paused = false;
      this.aborted = true;
      this.log.push('error', `Automation stopped: ${error.message} (step: ${this.lastStep})`, { error });
      this.ui.setStatus(`Stopped: ${error.message}`);
    }
  }

  const ui = new Dashboard();
  const logger = new Logger(ui.logs);
  const automator = new Automator(ui, logger);

  ui.onStart = async (name) => {
    try { await automator.start(name); }
    catch (e) { logger.push('error', e.message); }
  };
  ui.onStop = () => automator.stop();
  ui.onRecover = () => automator.manualRecover();

  window.__FC26_SBC_WEBAPP__ = { automator, ui, logger };
  logger.push('info', 'Dashboard loaded. Enter exact SBC name and press Start.');
})();
