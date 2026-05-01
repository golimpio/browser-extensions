const state = active => {
  if (active) {
    self.power.classList.add('on');
    self.power.classList.remove('off');
  }
  else {
    self.power.classList.add('off');
    self.power.classList.remove('on');
  }
};

// Load both active state and theme preference in one call
chrome.storage.local.get({active: true, theme: 'system'}, prefs => {
  if (prefs.theme !== 'system') {
    document.documentElement.setAttribute('data-theme', prefs.theme);
  }
  state(prefs.active);
});

self.power.onclick = () => {
  const active = self.power.classList.contains('on') === false;
  chrome.storage.local.set({active});
  state(active);
};

self.options.onclick = () => chrome.runtime.openOptionsPage();

self.refresh.onclick = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  });
  if (tab) {
    chrome.tabs.reload(tab.id);
  }
};
