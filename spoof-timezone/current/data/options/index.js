'use strict';

document.getElementById('version-label').textContent =
  'v' + chrome.runtime.getManifest().version;

const offset = document.getElementById('offset');
const user = document.getElementById('user');
const toast = document.getElementById('toast');
const saveBtn = document.getElementById('save-btn');
const pendingBanner = document.getElementById('pending-banner');

let snapshot = null;

const captureSnapshot = () => ({
  timezone: user.value,
  random: document.getElementById('random').checked,
  update: document.getElementById('update').checked,
  scope: document.getElementById('scope').value,
  allowedSites: document.getElementById('allowed-sites').value
});

const updateDirtyState = () => {
  if (!snapshot) return;
  const cur = captureSnapshot();
  const dirty =
    cur.timezone !== snapshot.timezone ||
    cur.random !== snapshot.random ||
    cur.update !== snapshot.update ||
    cur.scope !== snapshot.scope ||
    cur.allowedSites !== snapshot.allowedSites;
  pendingBanner.hidden = !dirty;
  saveBtn.disabled = !dirty;
};

const notify = (message, timeout = 750) => {
  toast.textContent = message;
  clearTimeout(notify.id);
  notify.id = setTimeout(() => toast.textContent = '', timeout);
};

const update = () => chrome.runtime.sendMessage({
  method: 'get-offset',
  value: user.value
}, offset => {
  if (offset.error) {
    alert(offset.error);
  }
  else {
    document.getElementById('minutes').value = offset;
  }
});

offset.addEventListener('change', update);

document.addEventListener('DOMContentLoaded', async () => {
  const f = document.createDocumentFragment();

  const prefs = await chrome.storage.local.get({
    timezone: 'Etc/GMT',
    random: false,
    update: false,
    scope: ['*://*/*'],
    allowedSites: ['*://challenges.cloudflare.com/*'],
    famousTimeZones: [
      'Etc/GMT',
      'America/New_York',
      'America/Los_Angeles',
      'Europe/London',
      'Europe/Paris',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Shanghai',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Pacific/Auckland'
    ]
  });

  const date = new Date();
  const opt = timeZone => {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset'
    });
    const parts = dtf.formatToParts(date);
    const value = parts.find(p => p.type === 'timeZoneName').value;

    const option = document.createElement('option');
    option.value = timeZone;
    option.textContent = `${timeZone} (${value})`;
    f.appendChild(option);
  };

  for (const timeZone of prefs.famousTimeZones) {
    opt(timeZone);
  }
  const hr = document.createElement('hr');
  f.appendChild(hr);

  for (const timeZone of Intl.supportedValuesOf('timeZone')) {
    if (prefs.famousTimeZones.includes(timeZone) === false) {
      opt(timeZone);
    }
  }
  offset.appendChild(f);

  offset.value = user.value = prefs.timezone;
  offset.dispatchEvent(new Event('change'));
  document.getElementById('random').checked = prefs.random;
  document.getElementById('update').checked = prefs.update;
  document.getElementById('scope').value = prefs.scope.join(', ');
  document.getElementById('allowed-sites').value = prefs.allowedSites.join(', ');

  snapshot = captureSnapshot();
  updateDirtyState();

  document.getElementById('random').addEventListener('change', updateDirtyState);
  document.getElementById('update').addEventListener('change', updateDirtyState);
  document.getElementById('scope').addEventListener('input', updateDirtyState);
  document.getElementById('allowed-sites').addEventListener('input', updateDirtyState);
});

offset.onchange = e => {
  if (e.target.value) {
    user.value = e.target.value;
    user.dispatchEvent(new Event('input'));
  }
  updateDirtyState();
};

const date = new Date();
user.oninput = e => {
  try {
    date.toLocaleString('en', {
      timeZone: e.target.value,
      timeZoneName: 'longOffset'
    });
    update();
    offset.value = user.value;
    e.target.setCustomValidity('');
  }
  catch (ee) {
    e.target.setCustomValidity('Not a valid timezone');
  }
  updateDirtyState();
};

document.addEventListener('submit', async e => {
  e.preventDefault();

  try {
    const scope = document.getElementById('scope').value.split(/\s*,\s*/).filter(a => a);
    if (scope.length === 0) {
      scope.push('*://*/*');
    }

    const allowedSites = document.getElementById('allowed-sites').value.split(/\s*,\s*/).filter(a => a);

    // Test scoping
    await chrome.scripting.unregisterContentScripts({
      ids: ['test-script']
    }).catch(() => {});
    await chrome.scripting.registerContentScripts([{
      id: 'test-script',
      world: 'ISOLATED',
      matches: scope,
      excludeMatches: allowedSites,
      js: ['/data/inject/test.js']
    }]);
    await chrome.scripting.unregisterContentScripts({
      ids: ['test-script']
    });

    chrome.storage.local.set({
      timezone: user.value,
      random: document.getElementById('random').checked,
      update: document.getElementById('update').checked,
      scope,
      allowedSites
    }, () => {
      chrome.runtime.sendMessage({
        method: 'update-offset'
      });
      snapshot = captureSnapshot();
      updateDirtyState();
      notify('Options saved');
    });
  }
  catch (e) {
    console.error(e);
    notify('Issue on "Scope" or "Allowed Sites" patterns - ' + e.message, 10000);
  }
});

// update once from IP — fetch only, preview in UI, user must click Save to apply
document.getElementById('update-once').addEventListener('click', function () {
  this.disabled = true;
  this.textContent = 'Detecting…';
  chrome.runtime.sendMessage({method: 'get-timezone-from-ip'}, result => {
    this.disabled = false;
    this.textContent = 'Update from IP once';
    if (!result || result.error) {
      notify((result && result.error) || 'Could not detect timezone from IP', 5000);
      return;
    }
    const tz = result.timezone;
    user.value = tz;
    offset.value = tz;
    user.dispatchEvent(new Event('input'));
    updateDirtyState();
  });
});

// reset
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm('Reset all settings to their defaults?')) return;

  chrome.storage.local.set({
    timezone: 'Etc/GMT',
    offset: 0,
    active: false,
    random: false,
    update: false,
    theme: 'system',
    scope: ['*://*/*'],
    allowedSites: ['*://challenges.cloudflare.com/*']
  }, () => {
    chrome.runtime.sendMessage({method: 'update-offset'});
    location.reload();
  });
});

// links
const homepageUrl = chrome.runtime.getManifest().homepage_url;
for (const a of [...document.querySelectorAll('[data-href]')]) {
  if (a.hasAttribute('href') === false) {
    if (homepageUrl) {
      a.href = homepageUrl + '#' + a.dataset.href;
    }
    else {
      a.removeAttribute('data-href');
      a.style.pointerEvents = 'none';
      a.style.color = 'inherit';
    }
  }
}

// protection toggle
const protBtn   = document.getElementById('protection-btn');
const protLabel = document.getElementById('protection-label');

const setProtectionUI = active => {
  protBtn.classList.toggle('active', active);
  protLabel.classList.toggle('active', active);
  protLabel.textContent = active ? 'On' : 'Off';
};

chrome.storage.local.get({active: false}, ({active}) => setProtectionUI(active));

protBtn.addEventListener('click', () => {
  const active = !protBtn.classList.contains('active');
  chrome.storage.local.set({active});
  setProtectionUI(active);
});

// keep in sync if toggled from popup while options page is open
// also reflects external timezone/offset changes (e.g. from the map site)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.active) {
    setProtectionUI(changes.active.newValue);
  }
  if (changes.timezone) {
    const tz = changes.timezone.newValue;
    user.value = tz;
    offset.value = tz;
    update();
    if (snapshot) {
      snapshot.timezone = tz;
      updateDirtyState();
    }
  }
  if (changes.offset) {
    document.getElementById('minutes').value = changes.offset.newValue;
  }
});

// theme slider
const themeTrack = document.querySelector('.theme-track');
const themeOrder = ['light', 'system', 'dark'];

const applyTheme = theme => {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  // drive thumb position via data attribute on the track element
  themeTrack.dataset.themeState = theme;
  // highlight active icon
  document.querySelectorAll('.theme-icon').forEach(el => {
    el.style.color = el.dataset.themeBtn === theme ? 'var(--accent)' : '';
  });
};

const cycleTheme = () => {
  const current = document.querySelector('.theme-track').dataset.themeState || 'system';
  const next = themeOrder[(themeOrder.indexOf(current) + 1) % themeOrder.length];
  applyTheme(next);
  chrome.storage.local.set({theme: next});
};

themeTrack.addEventListener('click', cycleTheme);

// clicking the icons jumps directly to that theme
document.querySelectorAll('.theme-icon').forEach(el => {
  el.addEventListener('click', () => {
    applyTheme(el.dataset.themeBtn);
    chrome.storage.local.set({theme: el.dataset.themeBtn});
  });
});

chrome.storage.local.get({theme: 'system'}, ({theme}) => applyTheme(theme));
