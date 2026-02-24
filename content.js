class AutomationError extends Error {}

class SbcAutomator {
  constructor() {
    this.running = false;
    this.aborted = false;
    this.sbcName = '';
    this.logPrefix = '[FC26-SBC]';
    this.defaultTimeoutMs = 15000;
  }

  start(sbcName) {
    if (this.running) {
      throw new AutomationError('Automation is already running.');
    }
    this.running = true;
    this.aborted = false;
    this.sbcName = sbcName;
    this.main().catch((error) => this.failSafeStop(error));
  }

  stop() {
    this.aborted = true;
    this.running = false;
    this.notify('Stopped by user.');
  }

  async main() {
    this.notify(`Starting on SBC: ${this.sbcName}`);
    await this.ensureOnSbcFavourites();
    await this.openSbcByExactName(this.sbcName);

    while (this.running && !this.aborted) {
      await this.runCommonGoldPassAndSubmit();
      await this.removeExactlyThreePlayers();
      await this.runRareGoldPassAndSubmit();
      await this.verifySubmissionSuccess();
      this.notify('Loop complete; restarting on same SBC.');
      await this.reopenSbcByName(this.sbcName);
    }
  }

  async runCommonGoldPassAndSubmit() {
    this.throwIfStopped();
    this.notify('Pass #1: Building Common Gold squad...');
    await this.openSquadBuilder();
    await this.enableIgnorePosition();
    await this.setSortLowToHigh();
    await this.setPlayerQuality('Common Gold');
    await this.generateAndApplySquad();
    await this.validateRequirementsBeforeSubmit();
    await this.submitCurrentSquad();
  }

  async runRareGoldPassAndSubmit() {
    this.throwIfStopped();
    this.notify('Pass #2: Building Rare Gold squad...');
    await this.openSquadBuilder();
    await this.enableIgnorePosition();
    await this.setSortLowToHigh();
    await this.setPlayerQuality('Rare Gold');
    await this.generateAndApplySquad();
    await this.validateRequirementsBeforeSubmit();
    await this.submitCurrentSquad();
  }

  async ensureOnSbcFavourites() {
    const heading = await this.waitFor(() => this.findByText(['h1', 'h2', 'h3', '[role="heading"]'], 'Favourites'));
    if (!heading) {
      throw new AutomationError('Favourites page not detected. Navigate to SBCs → Favourites first.');
    }
  }

  async openSbcByExactName(name) {
    this.notify(`Locating SBC card: ${name}`);
    const card = await this.waitFor(() => this.findExactTextElement(name), this.defaultTimeoutMs, `SBC card not found: ${name}`);
    if (!card) {
      throw new AutomationError(`SBC "${name}" not found in Favourites.`);
    }

    const candidates = this.getClickCandidates(card);
    let opened = false;

    for (const candidate of candidates) {
      this.throwIfStopped();
      await this.clickElement(candidate);
      const result = await this.waitFor(() => this.isInsideSelectedSbc(name), 4000, '', true);
      if (result) {
        opened = true;
        break;
      }
    }

    if (!opened) {
      throw new AutomationError(`Could not open SBC "${name}" after click attempts.`);
    }

    this.notify(`Verified SBC opened: ${name}`);
  }

  async reopenSbcByName(name) {
    const backButton = this.findButtonByTexts(['Back', 'Return', 'SBCs']);
    if (backButton) {
      await this.clickElement(backButton);
    }
    await this.ensureOnSbcFavourites();
    await this.openSbcByExactName(name);
  }

  async openSquadBuilder() {
    const button = await this.waitFor(() => this.findButtonByTexts(['Squad Builder']));
    if (!button) {
      throw new AutomationError('Squad Builder button not found.');
    }
    await this.clickElement(button);
  }

  async enableIgnorePosition() {
    const option = await this.waitFor(() => this.findToggleByLabel('Ignore Position'));
    if (!option) {
      throw new AutomationError('Ignore Position toggle not found.');
    }

    const checked = this.isToggleEnabled(option);
    if (!checked) {
      await this.clickElement(option);
    }

    if (!this.isToggleEnabled(option)) {
      throw new AutomationError('Failed to enable Ignore Position.');
    }
  }

  async setSortLowToHigh() {
    const sortBtn = await this.waitFor(() => this.findButtonByTexts(['Sort']));
    if (!sortBtn) {
      throw new AutomationError('Sort control not found.');
    }
    await this.clickElement(sortBtn);

    const lowToHigh = await this.waitFor(() => this.findByText(['button', '[role="option"]', 'li'], 'Player Rating (Low -> High)') || this.findByText(['button', '[role="option"]', 'li'], 'Player Rating (Low → High)'));
    if (!lowToHigh) {
      throw new AutomationError('Sort option Player Rating (Low → High) not found.');
    }
    await this.clickElement(lowToHigh);
  }

  async setPlayerQuality(label) {
    const qualityBtn = await this.waitFor(() => this.findButtonByTexts(['Player Quality', 'Quality']));
    if (!qualityBtn) {
      throw new AutomationError('Player Quality control not found.');
    }
    await this.clickElement(qualityBtn);

    const qualityOpt = await this.waitFor(() => this.findByText(['button', '[role="option"]', 'li'], label));
    if (!qualityOpt) {
      throw new AutomationError(`${label} option not found.`);
    }
    await this.clickElement(qualityOpt);
  }

  async generateAndApplySquad() {
    const generate = await this.waitFor(() => this.findButtonByTexts(['Build Squad', 'Generate Squad', 'Generate']));
    if (!generate) {
      throw new AutomationError('Generate squad button not found.');
    }
    await this.clickElement(generate);

    const apply = await this.waitFor(() => this.findButtonByTexts(['Use Squad', 'Apply', 'Confirm']));
    if (!apply) {
      throw new AutomationError('Apply squad button not found.');
    }
    await this.clickElement(apply);
  }

  async validateRequirementsBeforeSubmit() {
    const invalidRequirement = document.querySelector('.requirement.is-failed, .requirement.failed, .sbc-requirement--failed, .negative');
    if (invalidRequirement) {
      throw new AutomationError('SBC requirements not met. Submission blocked for safety.');
    }

    const submit = this.findButtonByTexts(['Submit', 'Exchange Squad']);
    if (!submit) {
      throw new AutomationError('Submit button not found.');
    }

    if (submit.hasAttribute('disabled') || submit.getAttribute('aria-disabled') === 'true') {
      throw new AutomationError('Submit button is disabled. Validation failed.');
    }
  }

  async submitCurrentSquad() {
    const submit = await this.waitFor(() => this.findButtonByTexts(['Submit', 'Exchange Squad']));
    if (!submit) {
      throw new AutomationError('Submit button missing before submission.');
    }
    await this.clickElement(submit);

    const confirm = await this.waitFor(() => this.findButtonByTexts(['Submit Squad', 'Yes', 'Confirm']));
    if (!confirm) {
      throw new AutomationError('Submission confirmation not found.');
    }
    await this.clickElement(confirm);
  }

  async verifySubmissionSuccess() {
    const success = await this.waitFor(() => this.findByText(['div', 'span', 'p'], 'Challenge Complete') || this.findByText(['div', 'span', 'p'], 'Submitted') || this.findByText(['div', 'span', 'p'], 'Completed'));
    if (!success) {
      throw new AutomationError('Submission success state not detected.');
    }
    this.notify('Submission confirmed.');
  }

  getClickCandidates(node) {
    const ordered = [
      node.closest('button, [role="button"], .tile, .listFUTItem, .ut-tile, .sbc-set-tile'),
      node.closest('[tabindex], li, article, .tileContent'),
      node,
      node.parentElement
    ].filter(Boolean);

    const unique = [];
    for (const item of ordered) {
      if (item && !unique.includes(item)) {
        unique.push(item);
      }
    }
    return unique;
  }

  isInsideSelectedSbc(name) {
    const hasSquadBuilder = !!this.findButtonByTexts(['Squad Builder']);
    const hasSubmitPath = !!this.findButtonByTexts(['Submit', 'Exchange Squad']);
    const inFavourites = !!this.findByText(['h1', 'h2', 'h3', '[role="heading"]'], 'Favourites');
    const titlePresent = !!this.findExactTextElement(name);

    return (hasSquadBuilder || hasSubmitPath) && (!inFavourites || titlePresent);
  }

  async removeExactlyThreePlayers() {
    this.notify('Removing exactly 3 players from next squad...');
    const playerSlots = await this.waitFor(() => [...document.querySelectorAll('.player, .squadSlot, .slot')].filter((node) => !node.classList.contains('empty')));
    if (!playerSlots || playerSlots.length < 3) {
      throw new AutomationError('Not enough filled players to remove exactly 3.');
    }

    for (let i = 0; i < 3; i += 1) {
      this.throwIfStopped();
      await this.clickElement(playerSlots[i]);
      const removeBtn = await this.waitFor(() => this.findButtonByTexts(['Remove From Squad', 'Remove', 'Clear']));
      if (!removeBtn) {
        throw new AutomationError(`Remove action not found for player index ${i + 1}.`);
      }
      await this.clickElement(removeBtn);
    }

    const remaining = [...document.querySelectorAll('.player, .squadSlot, .slot')].filter((node) => !node.classList.contains('empty'));
    const expected = playerSlots.length - 3;
    if (remaining.length !== expected) {
      throw new AutomationError('Visual verification failed after removing 3 players.');
    }
  }

  findButtonByTexts(texts) {
    const buttons = [...document.querySelectorAll('button, [role="button"], .btn, .ut-button')];
    return buttons.find((btn) => {
      const label = this.getNormalizedText(btn);
      return texts.some((text) => label.includes(this.normalize(text)));
    });
  }

  findToggleByLabel(label) {
    const target = this.findByText(['label', 'span', 'div'], label);
    if (!target) {
      return null;
    }
    return target.closest('[role="switch"], [role="checkbox"], label, .toggle') || target;
  }

  isToggleEnabled(node) {
    return (
      node.getAttribute('aria-checked') === 'true' ||
      node.getAttribute('data-checked') === 'true' ||
      node.classList.contains('is-selected') ||
      node.classList.contains('active') ||
      node.querySelector('input[type="checkbox"]:checked') !== null
    );
  }

  findByText(selectors, text) {
    const matcher = this.normalize(text);
    const nodes = [...document.querySelectorAll(selectors.join(','))];
    return nodes.find((node) => this.getNormalizedText(node).includes(matcher)) || null;
  }

  findExactTextElement(text) {
    const matcher = this.normalize(text);
    const nodes = [...document.querySelectorAll('button, [role="button"], h1, h2, h3, div, span')];
    return nodes.find((node) => this.getNormalizedText(node) === matcher) || null;
  }

  normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  getNormalizedText(node) {
    return this.normalize(node?.textContent || node?.innerText || '');
  }

  async clickElement(el) {
    this.throwIfStopped();
    if (!el || !el.isConnected) {
      throw new AutomationError('Cannot click disconnected element.');
    }
    const clickable = el.closest('button, [role="button"], [tabindex], .clickable') || el;
    clickable.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    clickable.click();
    await this.waitForFrame();
  }

  waitForFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  async waitFor(predicate, timeoutMs = this.defaultTimeoutMs, timeoutMessage = "Timed out waiting for UI state.", suppressTimeoutError = false) {
    this.throwIfStopped();
    const existing = predicate();
    if (existing) {
      return existing;
    }

    return new Promise((resolve, reject) => {
      const started = performance.now();
      let done = false;
      const observer = new MutationObserver(() => tryResolve());

      const cleanup = () => {
        if (done) {
          return;
        }
        done = true;
        observer.disconnect();
      };

      const fail = (error) => {
        cleanup();
        reject(error);
      };

      const tryResolve = () => {
        if (done) {
          return;
        }
        if (!this.running || this.aborted) {
          fail(new AutomationError('Automation stopped.'));
          return;
        }
        const value = predicate();
        if (value) {
          cleanup();
          resolve(value);
          return;
        }
        if (performance.now() - started > timeoutMs) {
          if (suppressTimeoutError) {
            cleanup();
            resolve(null);
            return;
          }
          fail(new AutomationError(timeoutMessage));
          return;
        }
        requestAnimationFrame(tryResolve);
      };

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      requestAnimationFrame(tryResolve);
    });
  }

  throwIfStopped() {
    if (!this.running || this.aborted) {
      throw new AutomationError('Automation stopped.');
    }
  }

  failSafeStop(error) {
    this.running = false;
    this.aborted = true;
    const reason = error instanceof Error ? error.message : String(error);
    console.error(this.logPrefix, reason, error);
    this.notify(`Automation stopped: ${reason}`, 'error');
  }

  notify(message, level = 'info') {
    console.log(this.logPrefix, message);
    chrome.storage?.local?.set({ lastStatusMessage: message }).catch(() => {
      // ignore storage failures
    });
    chrome.runtime.sendMessage({ type: 'AUTOMATION_STATUS', message, level }).catch(() => {
      // popup may be closed; ignore
    });
  }
}

const automator = new SbcAutomator();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message?.type) {
    return;
  }

  if (message.type === 'PING_AUTOMATION') {
    sendResponse({ ok: true, running: automator.running, sbcName: automator.sbcName });
    return true;
  }

  if (message.type === 'START_AUTOMATION') {
    try {
      automator.start(message.sbcName);
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return true;
  }

  if (message.type === 'STOP_AUTOMATION') {
    automator.stop();
    sendResponse({ ok: true });
    return true;
  }
});
