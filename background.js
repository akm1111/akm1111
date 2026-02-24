chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ running: false });
});
