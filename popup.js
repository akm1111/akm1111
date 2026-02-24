const sbcNameInput = document.getElementById('sbcName');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

let lastStatusAt = 0;
let watchdogId = null;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab available.');
  }
  return tab;
}

function isSupportedTab(tab) {
  return /^https:\/\/(.+\.)?ea\.com\//.test(tab.url || '');
}

async function ensureContentScript(tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['content.js']
  });
}

async function pingContent(tab) {
  return chrome.tabs.sendMessage(tab.id, { type: 'PING_AUTOMATION' });
}

async function sendToActiveTab(payload) {
  const tab = await getActiveTab();
  if (!isSupportedTab(tab)) {
    throw new Error('Active tab is not FC Web App. Open the EA FC Web App tab first.');
  }

  try {
    await pingContent(tab);
  } catch (error) {
    const message = String(error?.message || error);
    if (!message.includes('Receiving end does not exist')) {
      throw error;
    }
    await ensureContentScript(tab);
    await pingContent(tab);
  }

  return chrome.tabs.sendMessage(tab.id, payload);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff8ea0' : '#cbd8ea';
}

function armWatchdog() {
  clearInterval(watchdogId);
  watchdogId = setInterval(async () => {
    const saved = await chrome.storage.local.get(['running']);
    if (!saved.running) {
      return;
    }
    if (Date.now() - lastStatusAt > 8000) {
      setStatus('Automation is running but no UI progress yet. Keep FC tab open and on SBC screen.', true);
    }
  }, 2000);
}

async function restoreState() {
  const saved = await chrome.storage.local.get(['sbcName', 'running', 'lastStatusMessage']);
  sbcNameInput.value = saved.sbcName ?? '';
  if (saved.running) {
    setStatus(saved.lastStatusMessage || 'Automation running...');
  }
  lastStatusAt = Date.now();
  armWatchdog();
}

startBtn.addEventListener('click', async () => {
  const sbcName = sbcNameInput.value.trim();
  if (!sbcName) {
    setStatus('Enter the exact SBC name.', true);
    return;
  }

  try {
    setStatus('Starting automation...');
    await chrome.storage.local.set({ sbcName, running: true, lastStatusMessage: 'Starting automation...' });
    const result = await sendToActiveTab({ type: 'START_AUTOMATION', sbcName });
    if (!result?.ok) {
      throw new Error(result?.error ?? 'Unknown start failure.');
    }
    lastStatusAt = Date.now();
    setStatus(`Running: ${sbcName}`);
  } catch (error) {
    await chrome.storage.local.set({ running: false });
    setStatus(`Start failed: ${error.message}`, true);
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({ running: false, lastStatusMessage: 'Stopped.' });
    const result = await sendToActiveTab({ type: 'STOP_AUTOMATION' });
    if (!result?.ok) {
      throw new Error(result?.error ?? 'Unknown stop failure.');
    }
    setStatus('Stopped.');
  } catch (error) {
    setStatus(`Stop failed: ${error.message}`, true);
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'AUTOMATION_STATUS') {
    return;
  }

  lastStatusAt = Date.now();
  chrome.storage.local.set({ lastStatusMessage: message.message });

  if (message.level === 'error') {
    setStatus(message.message, true);
    chrome.storage.local.set({ running: false });
    return;
  }

  setStatus(message.message, false);
});

restoreState();
