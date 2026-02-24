const sbcInput = document.getElementById('sbcName');
const loopInput = document.getElementById('loopEnabled');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');

const state = {
  logs: [],
};

function renderLog() {
  logEl.textContent = state.logs.slice(-80).join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function addLog(line) {
  const ts = new Date().toLocaleTimeString();
  state.logs.push(`[${ts}] ${line}`);
  renderLog();
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

startBtn.addEventListener('click', async () => {
  const sbcName = sbcInput.value.trim();
  if (!sbcName) {
    addLog('Cannot start: SBC name is required.');
    setStatus('Error');
    return;
  }

  const tab = await getCurrentTab();
  if (!tab?.id) {
    addLog('Cannot start: no active tab.');
    setStatus('Error');
    return;
  }

  await chrome.storage.local.set({ sbcName, loopEnabled: loopInput.checked });
  await chrome.runtime.sendMessage({
    type: 'START_AUTOMATION',
    payload: { tabId: tab.id, sbcName, loopEnabled: loopInput.checked },
  });

  setStatus('Running');
  addLog(`Started automation for "${sbcName}".`);
});

stopBtn.addEventListener('click', async () => {
  const tab = await getCurrentTab();
  await chrome.runtime.sendMessage({ type: 'STOP_AUTOMATION', payload: { tabId: tab?.id } });
  setStatus('Stopping');
  addLog('Stop requested.');
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'AUTOMATION_EVENT') return;
  if (msg.payload?.status) setStatus(msg.payload.status);
  if (msg.payload?.log) addLog(msg.payload.log);
});

(async function init() {
  const saved = await chrome.storage.local.get(['sbcName', 'loopEnabled']);
  if (saved.sbcName) sbcInput.value = saved.sbcName;
  loopInput.checked = saved.loopEnabled !== false;
})();
