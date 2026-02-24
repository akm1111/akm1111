const sbcNameInput = document.getElementById('sbcName');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('No active tab available.');
  }
  return tab;
}

async function sendToActiveTab(payload) {
  const tab = await getActiveTab();
  return chrome.tabs.sendMessage(tab.id, payload);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff8ea0' : '#cbd8ea';
}

async function restoreState() {
  const saved = await chrome.storage.local.get(['sbcName', 'running']);
  sbcNameInput.value = saved.sbcName ?? '';
  if (saved.running) {
    setStatus('Automation running...');
  }
}

startBtn.addEventListener('click', async () => {
  const sbcName = sbcNameInput.value.trim();
  if (!sbcName) {
    setStatus('Enter the exact SBC name.', true);
    return;
  }

  try {
    setStatus('Starting automation...');
    await chrome.storage.local.set({ sbcName, running: true });
    const result = await sendToActiveTab({ type: 'START_AUTOMATION', sbcName });
    if (!result?.ok) {
      throw new Error(result?.error ?? 'Unknown start failure.');
    }
    setStatus(`Running: ${sbcName}`);
  } catch (error) {
    await chrome.storage.local.set({ running: false });
    setStatus(`Start failed: ${error.message}`, true);
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    await chrome.storage.local.set({ running: false });
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

  if (message.level === 'error') {
    setStatus(message.message, true);
    chrome.storage.local.set({ running: false });
    return;
  }

  setStatus(message.message, false);
});

restoreState();
