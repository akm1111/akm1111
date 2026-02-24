class AutomationError extends Error {}

class SbcAutomator {
  constructor() {
    this.running = false;
    this.aborted = false;
    this.sbcName = '';
    this.logPrefix = '[FC26-SBC]';
    this.defaultTimeoutMs = 15000;
    this.lastAction = 'idle';
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
    await this.openSbcByName(this.sbcName);

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
    this.setAction('Verify SBC Favourites screen');
    const heading = await this.waitFor(() => this.findByText(['h1', 'h2', 'h3', '[role="heading"]'], 'Favourites'), this.defaultTimeoutMs, 'Timed out: Favourites heading not found.');
    if (!heading) {
      throw new AutomationError('Favourites page not detected. Navigate to SBCs → Favourites first.');
    }
  }

  async openSbcByName(name) {
    this.setAction(`Open SBC card: ${name}`);
    this.notify(`Locating SBC card: ${name}`);
    const card = await this.waitFor(() => this.findSbcCardByName(name), this.defaultTimeoutMs, `SBC card not found: ${name}`);
    if (!card) {
      throw new AutomationError(`SBC "${name}" not found in Favourites.`);
    }

    const candidates = this.getClickCandidates(card);
    let opened = false;

    for (const candidate of candidates) {
      this.throwIfStopped();
      await this.clickElement(candidate);
      const result = await this.waitFor(() => this.isInsideSelectedSbc(name), 5000, '', true);
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
    await this.openSbcByName(name);
  }

  async openSquadBuilder() {
    this.setAction('Open Squad Builder');
    const button = await this.waitFor(() => this.findButtonByTexts(['Squad Builder']), this.defaultTimeoutMs, 'Timed out: Squad Builder button not found.');
    if (!button) {
      throw new AutomationError('Squad Builder button not found.');
    }
    await this.clickElement(button);
  }

  async enableIgnorePosition() {
    this.setAction('Enable Ignore Position');
    for (let cycle = 0; cycle < 2; cycle += 1) {
      const option = await this.waitFor(
        () => this.findIgnorePositionControl(),
        this.defaultTimeoutMs,
        'Timed out: Ignore Position toggle not found.'
      );
      if (!option) {
        throw new AutomationError('Ignore Position toggle not found.');
      }

      if (this.isIgnorePositionEnabled(option)) {
        return;
      }

      const candidates = this.findIgnorePositionCandidates(option);
      for (const candidate of candidates) {
        this.throwIfStopped();
        await this.clickElement(candidate);
        const enabled = await this.waitFor(() => this.isIgnorePositionEnabled(option), 2500, '', true);
        if (enabled) {
          return;
        }
      }

      // If a bad click closed the builder pane, recover and retry once.
      const squadBuilderButton = this.findButtonByTexts(['Squad Builder']);
      if (squadBuilderButton && cycle === 0) {
        await this.clickElement(squadBuilderButton);
        await this.waitFor(() => this.findIgnorePositionControl(), this.defaultTimeoutMs, 'Timed out reopening Squad Builder.');
      }
    }

    throw new AutomationError('Failed to enable Ignore Position without leaving Squad Builder context.');
  }

  async setSortLowToHigh() {
    this.setAction('Set sort to Player Rating Low to High');
    const sortBtn = await this.waitFor(() => this.findButtonByTexts(['Sort']), this.defaultTimeoutMs, 'Timed out: Sort control not found.');
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
    this.setAction(`Set Player Quality: ${label}`);
    const qualityBtn = await this.waitFor(() => this.findButtonByTexts(['Player Quality', 'Quality']), this.defaultTimeoutMs, 'Timed out: Player Quality control not found.');
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
    this.setAction('Generate and apply squad');
    const generate = await this.waitFor(() => this.findButtonByTexts(['Build Squad', 'Generate Squad', 'Generate']), this.defaultTimeoutMs, 'Timed out: Generate squad button not found.');
    if (!generate) {
      throw new AutomationError('Generate squad button not found.');
    }
    await this.clickElement(generate);

    const apply = await this.waitFor(() => this.findButtonByTexts(['Use Squad', 'Apply', 'Confirm']), this.defaultTimeoutMs, 'Timed out: Apply squad button not found.');
    if (!apply) {
      throw new AutomationError('Apply squad button not found.');
    }
    await this.clickElement(apply);
  }

  async validateRequirementsBeforeSubmit() {
    this.setAction('Validate requirements before submit');
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
    this.setAction('Submit current squad');
    const submit = await this.waitFor(() => this.findButtonByTexts(['Submit', 'Exchange Squad']), this.defaultTimeoutMs, 'Timed out: Submit button not found.');
    if (!submit) {
      throw new AutomationError('Submit button missing before submission.');
    }
    await this.clickElement(submit);

    const confirm = await this.waitFor(() => this.findButtonByTexts(['Submit Squad', 'Yes', 'Confirm']), this.defaultTimeoutMs, 'Timed out: Submission confirmation dialog not found.');
    if (!confirm) {
      throw new AutomationError('Submission confirmation not found.');
    }
    await this.clickElement(confirm);
  }

  async verifySubmissionSuccess() {
    this.setAction('Verify submission success');
    const success = await this.waitFor(() => this.findByText(['div', 'span', 'p'], 'Challenge Complete') || this.findByText(['div', 'span', 'p'], 'Submitted') || this.findByText(['div', 'span', 'p'], 'Completed'), this.defaultTimeoutMs, 'Timed out: Submission success confirmation not detected.');
    if (!success) {
      throw new AutomationError('Submission success state not detected.');
    }
    this.notify('Submission confirmed.');
  }

  findSbcCardByName(name) {
    const exact = this.findExactTextElement(name);
    if (exact) {
      return exact;
    }

    const target = this.simplifySbcName(name);
    const nodes = [...document.querySelectorAll('button, [role="button"], h1, h2, h3, div, span, li, article')];

    return (
      nodes.find((node) => {
        const text = this.simplifySbcName(this.getNormalizedText(node));
        return text === target || text.includes(target) || target.includes(text);
      }) || null
    );
  }

  simplifySbcName(value) {
    return this.normalize(value)
      .replace(/^\d+\s*of\s*\d+\s*/g, '')
      .replace(/^\d+\/\d+\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  getClickCandidates(node) {
    const ordered = [
      node.closest('button, [role="button"], .tile, .listFUTItem, .ut-tile, .sbc-set-tile'),
      node.closest('[tabindex], li, article, .tileContent, .ut-item-view'),
      node.closest('.listFUTItem, .tile, li, article'),
      node,
      node.parentElement
    ].filter(Boolean);

    const unique = [];
    for (const item of ordered) {
      if (item && !unique.includes(item)) {
        unique.push(item);
      }
    }
    for (const item of [...unique]) {
      const nested = [...item.querySelectorAll('button, [role="button"], [tabindex]')];
      for (const child of nested) {
        if (!unique.includes(child)) {
          unique.push(child);
        }
      }
    }

    return unique;
  }

  isInsideSelectedSbc(name) {
    const hasSquadBuilder = !!this.findButtonByTexts(['Squad Builder']);
    const hasSubmitPath = !!this.findButtonByTexts(['Submit', 'Exchange Squad']);
    const hasRequirementLabels = !!this.findByText(['div', 'span', 'li', 'p'], 'Requirements');
    const hasChallengeUi = !!this.findByText(['div', 'span', 'h1', 'h2', 'h3'], 'Challenge') || !!this.findByText(['div', 'span', 'h1', 'h2', 'h3'], 'Squad');

    return hasSquadBuilder || hasSubmitPath || hasRequirementLabels || hasChallengeUi;
  }

  async removeExactlyThreePlayers() {
    this.setAction('Remove exactly 3 players');
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

  findIgnorePositionControl() {
    const root = this.findSquadBuilderRoot();
    const labelNode = this.findByText(['label', 'span', 'div', 'li', 'p'], 'Ignore Position', root);
    if (!labelNode) {
      return null;
    }

    return (
      labelNode.closest('[role="switch"], [role="checkbox"], label, .toggle, li, .row, .setting, .ut-toggle-row') ||
      labelNode.parentElement ||
      labelNode
    );
  }

  findIgnorePositionCandidates(option) {
    const root = this.findSquadBuilderRoot();
    const controls = [
      ...option.querySelectorAll('[role="switch"], [role="checkbox"], input[type="checkbox"], button, [tabindex], .toggle, .ut-toggle')
    ];
    const prioritized = [...controls, option].filter((node) => {
      if (!node || !node.isConnected) {
        return false;
      }
      if (node.matches('a[href]')) {
        return false;
      }
      if (root && root !== document.body && !root.contains(node)) {
        return false;
      }
      return true;
    });

    return prioritized.length ? prioritized : this.getClickCandidates(option);
  }

  findSquadBuilderRoot() {
    const heading = this.findByText(['h1', 'h2', 'h3', 'div', 'span'], 'Squad Builder');
    if (!heading) {
      return document.body;
    }
    return heading.closest('[role="dialog"], .ut-popup, .modal, .panel, .view, .ut-squad-builder-view') || document.body;
  }

  isIgnorePositionEnabled(node) {
    const target = node || this.findIgnorePositionControl();
    if (!target) {
      return false;
    }

    const text = this.getNormalizedText(target);
    return (
      target.getAttribute('aria-checked') === 'true' ||
      target.getAttribute('data-checked') === 'true' ||
      target.classList.contains('is-selected') ||
      target.classList.contains('active') ||
      target.classList.contains('selected') ||
      target.querySelector('input[type="checkbox"]:checked') !== null ||
      text.includes('ignore position on') ||
      text.includes('ignore position yes') ||
      text.includes('ignore position enabled')
    );
  }

  findByText(selectors, text, root = document) {
    const matcher = this.normalize(text);
    const nodes = [...root.querySelectorAll(selectors.join(','))];
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

  async waitFor(predicate, timeoutMs = this.defaultTimeoutMs, timeoutMessage = null, suppressTimeoutError = false) {
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
          fail(new AutomationError(timeoutMessage || `Timed out waiting for UI state during: ${this.lastAction}`));
          return;
        }
        requestAnimationFrame(tryResolve);
      };

      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      requestAnimationFrame(tryResolve);
    });
  }

  setAction(action) {
    this.lastAction = action;
    this.notify(`Step: ${action}`);
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
    this.notify(`Automation stopped: ${reason} (step: ${this.lastAction})`, 'error');
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
