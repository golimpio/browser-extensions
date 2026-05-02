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

const formatOffset = offset => {
  if (offset === 0) return 'GMT';
  const h = Math.floor(Math.abs(offset) / 60);
  const m = Math.abs(offset) % 60;
  return 'GMT' + (offset > 0 ? '+' : '-') + h + (m !== 0 ? ':' + String(m).padStart(2, '0') : '');
};

const updateTimezoneInfo = (timezone, offset) => {
  const el = document.getElementById('timezone-info');
  if (el) {
    el.innerHTML = timezone + '<br>(' + formatOffset(offset) + ')';
  }
};

// Load both active state and theme preference in one call
chrome.storage.local.get({active: false, theme: 'system', timezone: 'Etc/GMT', offset: 0}, prefs => {
  if (prefs.theme !== 'system') {
    document.documentElement.setAttribute('data-theme', prefs.theme);
  }
  state(prefs.active);
  updateTimezoneInfo(prefs.timezone, prefs.offset);
});

chrome.storage.onChanged.addListener(changes => {
  const timezone = changes.timezone ? changes.timezone.newValue : null;
  const offset = changes.offset ? changes.offset.newValue : null;
  if (timezone !== null || offset !== null) {
    chrome.storage.local.get({timezone: 'Etc/GMT', offset: 0}, prefs => {
      updateTimezoneInfo(
        timezone !== null ? timezone : prefs.timezone,
        offset !== null ? offset : prefs.offset
      );
    });
  }
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
