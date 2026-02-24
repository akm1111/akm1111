(() => {
  if (window.__fc26SbcAutomatorLoaded) return;
  window.__fc26SbcAutomatorLoaded = true;

  const LABELS = {
    squadBuilder: ['Squad Builder'],
    ignorePosition: ['Ignore Position'],
    sort: ['Sort'],
    lowToHigh: ['Low to High'],
    playerQuality: ['Player Quality', 'Quality'],
    commonGold: ['Common Gold'],
    rareGold: ['Rare Gold'],
    generateSquad: ['Generate Squad', 'Build Squad'],
    apply: ['Apply', 'Use Squad'],
    submit: ['Submit', 'Submit Squad'],
    confirmSubmit: ['Yes', 'Confirm', 'Submit'],
    removePlayer: ['Remove from Squad', 'Remove Player'],
    requirements: ['Requirements'],
    reqFail: ['Not Met', 'Incomplete'],
    success: ['Challenge Complete', 'SBC Complete', 'Completed', 'Congratulations'],
    favourites: ['Favourites', 'Favorites'],
    expired: ['Expired', 'No longer available'],
    noPlayers: ['No players found', 'No eligible players'],
  };

  const SLOT_CANDIDATES = ['.squadSlot', '.ut-squad-slot', '[data-role="slot"]', '[class*="slot"]'];
  const FILLED_HINTS = ['filled', 'occupied', 'has-player'];

  let running = false;
  let stopRequested = false;

  function emit(status, log) {
    chrome.runtime.sendMessage({ type: 'AUTOMATION_RUNTIME_EVENT', payload: { status, log } }).catch(() => {});
  }

  function norm(v) {
    return String(v || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function visible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }

  function textContains(el, values) {
    const t = norm(el?.textContent || el?.innerText);
    return values.some((v) => t.includes(norm(v)));
  }

  function assertNotStopped() {
    if (!running || stopRequested) {
      throw new Error('Stopped by user.');
    }
  }

  async function waitFor(predicate, description, timeoutMs = 15000) {
    assertNotStopped();
    const now = predicate();
    if (now) return now;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        obs.disconnect();
        reject(new Error(`Timed out waiting for ${description}.`));
      }, timeoutMs);

      const obs = new MutationObserver(() => {
        if (stopRequested) {
          clearTimeout(timer);
          obs.disconnect();
          reject(new Error('Stopped by user.'));
          return;
        }
        const result = predicate();
        if (result) {
          clearTimeout(timer);
          obs.disconnect();
          resolve(result);
        }
      });

      obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    });
  }

  function clickableNodes() {
    return [...document.querySelectorAll('button,[role="button"],a,.btn')].filter((el) => {
      if (!visible(el)) return false;
      if (el.disabled) return false;
      return el.getAttribute('aria-disabled') !== 'true';
    });
  }

  async function clickByLabel(labels, description) {
    const el = await waitFor(() => clickableNodes().find((n) => textContains(n, labels)), description);
    assertNotStopped();
    el.click();
    return el;
  }

  function findExactTextNode(targetText) {
    const target = norm(targetText);
    const tree = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = tree.nextNode();
    while (node) {
      if (visible(node) && norm(node.textContent) === target) {
        return node;
      }
      node = tree.nextNode();
    }
    return null;
  }

  async function ensureSbcContext(sbcName) {
    const heading = [...document.querySelectorAll('h1,h2,h3,[class*="title"],[class*="header"]')]
      .filter(visible)
      .find((n) => norm(n.textContent) === norm(sbcName));
    if (!heading) throw new Error(`SBC context verification failed for "${sbcName}".`);
  }

  function pageContains(values) {
    return [...document.querySelectorAll('body *')].some((n) => visible(n) && textContains(n, values));
  }

  async function openSbcByExactName(sbcName) {
    const sbcNode = await waitFor(() => findExactTextNode(sbcName), `SBC named exactly "${sbcName}"`);
    if (norm(sbcNode.textContent) !== norm(sbcName)) {
      throw new Error(`Exact SBC text mismatch. Found "${sbcNode.textContent?.trim()}".`);
    }
    sbcNode.click();
    await waitFor(() => pageContains([sbcName]), 'SBC page transition');
    await ensureSbcContext(sbcName);
    emit('Running', `Opened and verified SBC: "${sbcName}".`);
  }

  async function enableIgnorePosition() {
    const label = await waitFor(
      () => [...document.querySelectorAll('label,button,span,div')].find((n) => visible(n) && textContains(n, LABELS.ignorePosition)),
      'Ignore Position toggle',
    );

    const shell = label.closest('label,.toggle,.switch,[role="switch"]') || label.parentElement;
    const checkbox = shell?.querySelector('input[type="checkbox"]');

    if (checkbox) {
      if (!checkbox.checked) {
        label.click();
        await waitFor(() => checkbox.checked, 'Ignore Position enabled');
      }
    } else {
      label.click();
    }
    emit('Running', 'Ignore Position enabled.');
  }

  async function setSortLowToHigh() {
    await clickByLabel(LABELS.sort, 'Sort button');
    await clickByLabel(LABELS.lowToHigh, 'Low to High option');
  }

  async function setQuality(labels) {
    await clickByLabel(LABELS.playerQuality, 'Player Quality filter');
    await clickByLabel(labels, `Quality option ${labels.join('/')}`);
  }

  async function openBuilderGenerateApply(qualityLabel) {
    await clickByLabel(LABELS.squadBuilder, 'Squad Builder');
    await enableIgnorePosition();
    await setSortLowToHigh();
    await setQuality(qualityLabel);
    await clickByLabel(LABELS.generateSquad, 'Generate Squad');

    if (pageContains(LABELS.noPlayers)) {
      throw new Error('No eligible players remain for current filter.');
    }

    await clickByLabel(LABELS.apply, 'Apply Squad');
  }

  function requirementsMet() {
    const reqSection = [...document.querySelectorAll('section,div,ul')].find((n) => visible(n) && textContains(n, LABELS.requirements));
    if (!reqSection) return false;
    const failed = [...reqSection.querySelectorAll('*')].some((n) => textContains(n, LABELS.reqFail));
    return !failed;
  }

  async function validateBeforeSubmit() {
    const valid = await waitFor(() => requirementsMet(), 'requirements to be fully met', 12000).catch(() => false);
    if (!valid) throw new Error('SBC requirements check failed; submission aborted.');
  }

  async function submitAndConfirmSuccess() {
    await clickByLabel(LABELS.submit, 'Submit');
    await clickByLabel(LABELS.confirmSubmit, 'Confirm submit');
    await waitFor(() => pageContains(LABELS.success), 'submission success message', 20000);
    emit('Running', 'Submission success explicitly confirmed.');
  }

  function allSlots() {
    return SLOT_CANDIDATES.flatMap((s) => [...document.querySelectorAll(s)]).filter(visible);
  }

  function filledSlots() {
    return allSlots().filter((slot) => {
      const classes = norm(slot.className || '');
      const byClass = FILLED_HINTS.some((h) => classes.includes(h));
      const byContent = slot.querySelector('img,.player,[data-player-id]');
      return byClass || Boolean(byContent);
    });
  }

  async function removeExactlyThree() {
    const initial = filledSlots().length;
    if (initial < 3) throw new Error('Not enough filled players to remove exactly 3.');

    let removed = 0;
    const slots = [...filledSlots()];
    for (const slot of slots) {
      assertNotStopped();
      if (removed === 3) break;
      slot.click();
      await clickByLabel(LABELS.removePlayer, 'Remove Player');
      removed += 1;
      const expected = initial - removed;
      await waitFor(() => filledSlots().length <= expected, `visual empty-slot confirmation ${removed}`);
    }

    if (removed !== 3) {
      throw new Error(`Adjustment failed. Required 3 removals, got ${removed}.`);
    }
    emit('Running', 'Adjustment complete: removed exactly 3 players with visual confirmation.');
  }

  function shouldStopForTerminalState() {
    if (pageContains(LABELS.expired)) {
      throw new Error('SBC has expired.');
    }
    if (pageContains(LABELS.noPlayers)) {
      throw new Error('No eligible players remain.');
    }
  }

  async function runFlow(sbcName, loopEnabled) {
    let cycle = 0;
    while (running && !stopRequested) {
      shouldStopForTerminalState();
      cycle += 1;

      emit('Running', `Cycle ${cycle}: PASS 1 (Common Gold).`);
      await openSbcByExactName(sbcName);
      await openBuilderGenerateApply(LABELS.commonGold);
      await validateBeforeSubmit();
      await submitAndConfirmSuccess();

      emit('Running', `Cycle ${cycle}: ADJUSTMENT (remove 3).`);
      await openSbcByExactName(sbcName);
      await ensureSbcContext(sbcName);
      await removeExactlyThree();

      emit('Running', `Cycle ${cycle}: PASS 2 (Rare Gold).`);
      await openBuilderGenerateApply(LABELS.rareGold);
      await validateBeforeSubmit();
      await submitAndConfirmSuccess();

      if (!loopEnabled) {
        running = false;
        emit('Stopped', 'Loop disabled; stopped after one full cycle.');
      }
    }
  }

  async function start({ sbcName, loopEnabled }) {
    if (running) {
      emit('Running', 'Already running.');
      return;
    }

    if (!pageContains(LABELS.favourites)) {
      emit('Error', 'You must be on SBCs → Favourites before starting.');
      return;
    }

    running = true;
    stopRequested = false;

    try {
      await runFlow(sbcName, loopEnabled !== false);
      if (!stopRequested && !running) emit('Stopped', 'Automation stopped normally.');
    } catch (err) {
      running = false;
      stopRequested = true;
      emit('Error', `Critical stop: ${String(err.message || err)}`);
    }
  }

  function stop() {
    stopRequested = true;
    running = false;
    emit('Stopped', 'Stop pressed: automation halted immediately.');
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'START_AUTOMATION') start(msg.payload || {});
    if (msg?.type === 'STOP_AUTOMATION') stop();
  });
})();
