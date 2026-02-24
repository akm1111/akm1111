const runStateByTab = new Map();

function notifyPopup(payload) {
  chrome.runtime.sendMessage({ type: 'AUTOMATION_EVENT', payload }).catch(() => {});
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
}

async function startAutomation({ tabId, sbcName, loopEnabled }) {
  if (!tabId || !sbcName) {
    notifyPopup({ status: 'Error', log: 'Missing tab or SBC name.' });
    return;
  }

  runStateByTab.set(tabId, { running: true, sbcName, loopEnabled: loopEnabled !== false });

  try {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, {
      type: 'START_AUTOMATION',
      payload: { sbcName, loopEnabled: loopEnabled !== false },
    });
    notifyPopup({ status: 'Running', log: `Automation started for "${sbcName}".` });
  } catch (err) {
    runStateByTab.delete(tabId);
    notifyPopup({ status: 'Error', log: `Failed to start automation: ${String(err.message || err)}` });
  }
}

async function stopAutomation(tabId) {
  if (!tabId) {
    notifyPopup({ status: 'Error', log: 'Stop failed: no target tab.' });
    return;
  }

  runStateByTab.delete(tabId);
  await chrome.tabs.sendMessage(tabId, { type: 'STOP_AUTOMATION' }).catch(() => {});
  notifyPopup({ status: 'Stopped', log: 'Stop signal sent.' });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'START_AUTOMATION') {
    startAutomation(msg.payload || {});
  }

  if (msg?.type === 'STOP_AUTOMATION') {
    const tabId = msg.payload?.tabId ?? sender.tab?.id;
    stopAutomation(tabId);
  }

  if (msg?.type === 'AUTOMATION_RUNTIME_EVENT') {
    notifyPopup(msg.payload || {});
  }

  sendResponse?.({ ok: true });
  return true;
});
