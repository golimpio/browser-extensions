const notify = (message, hide = true) => chrome.notifications.create({
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message
}, id => {
  if (hide) {
    setTimeout(chrome.notifications.clear, 3000, id);
  }
});

const once = c => {
  const run = () => {
    if (run.done) {
      return;
    }
    run.done = true;
    c();
  };
  chrome.runtime.onInstalled.addListener(run);
  chrome.runtime.onStartup.addListener(run);
};

// Draw the provided location-pin SVG (90×90 space) onto an OffscreenCanvas.
// The inner circle is punched out transparently via the evenodd fill rule.
const createIcon = (size, active) => {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  // Scale SVG 90×90 coordinate space → canvas, with a small padding
  const pad = size * 0.03;
  const sc  = (size - pad * 2) / 90;
  const px  = n => n * sc + pad;   // map SVG x → canvas x
  const py  = n => n * sc + pad;   // map SVG y → canvas y

  ctx.beginPath();

  // Outer pin body (converted from SVG path)
  ctx.moveTo(px(45), py(0));
  ctx.bezierCurveTo(px(25.463), py(0),      px(9.625),  py(15.838), px(9.625),  py(35.375));
  ctx.bezierCurveTo(px(9.625),  py(44.097), px(12.796), py(52.068), px(18.029), py(58.236));
  ctx.lineTo(px(45), py(90));
  ctx.lineTo(px(71.97), py(58.235));
  ctx.bezierCurveTo(px(77.203), py(52.068), px(80.374), py(44.096), px(80.374), py(35.374));
  ctx.bezierCurveTo(px(80.375), py(15.838), px(64.537), py(0),      px(45),     py(0));
  ctx.closePath();

  // Inner circle hole — center (45, 34.157), radius 14.548 in SVG space
  ctx.arc(px(45), py(34.157), 14.548 * sc, 0, Math.PI * 2);

  ctx.fillStyle = active ? '#34c759' : '#8e8e93';
  ctx.fill('evenodd');  // inner circle subtracts from the pin → transparent hole

  return ctx.getImageData(0, 0, size, size);
};

const formatOffsetLabel = offset => {
  if (offset === 0) return 'GMT';
  const h = Math.floor(Math.abs(offset) / 60);
  const m = Math.abs(offset) % 60;
  return 'GMT' + (offset > 0 ? '+' : '-') + h + (m !== 0 ? ':' + String(m).padStart(2, '0') : '');
};

const updateTitle = (active, timezone, offset) => {
  const state = active ? 'ON' : 'OFF';
  const label = formatOffsetLabel(offset);
  chrome.action.setTitle({title: 'Timezone protection is ' + state + '\n' + timezone + ' (' + label + ')'});
};

const buildIconData = active => ({
  '16': createIcon(16, active),
  '32': createIcon(32, active),
  '48': createIcon(48, active)
});

const engine = {};
engine.on = async () => {
  try {
    const prefs = await chrome.storage.local.get({
      scope: ['*://*/*'],
      allowedSites: ['*://challenges.cloudflare.com/*']
    });

    await chrome.scripting.unregisterContentScripts();
    // order is important
    await chrome.scripting.registerContentScripts([{
      id: 'isolated-script',
      world: 'ISOLATED',
      matches: prefs.scope,
      excludeMatches: prefs.allowedSites,
      matchOriginAsFallback: true,
      allFrames: true,
      runAt: 'document_start',
      js: ['/data/inject/isolated.js']
    }]);
    await chrome.scripting.registerContentScripts([{
      id: 'main-script',
      world: 'MAIN',
      matches: prefs.scope,
      excludeMatches: prefs.allowedSites,
      matchOriginAsFallback: true,
      allFrames: true,
      runAt: 'document_start',
      js: ['/data/inject/main.js']
    }]);
    chrome.action.setIcon({imageData: buildIconData(true)});
    chrome.action.setBadgeText({text: ''});
    const onPrefs = await chrome.storage.local.get({timezone: 'Etc/GMT', offset: 0});
    updateTitle(true, onPrefs.timezone, onPrefs.offset);
  }
  catch (e) {
    console.error(e);
    notify(e.message, false);
    chrome.action.setBadgeText({
      text: 'E'
    });
    chrome.action.setTitle({
      title: e.message
    });
  }
};
engine.off = async () => {
  chrome.scripting.unregisterContentScripts();
  chrome.action.setIcon({imageData: buildIconData(false)});
  const offPrefs = await chrome.storage.local.get({timezone: 'Etc/GMT', offset: 0});
  updateTitle(false, offPrefs.timezone, offPrefs.offset);
};
{
  const once = async () => {
    if (once.done) {
      return;
    }
    once.done = true;
    const prefs = await chrome.storage.local.get({
      active: false
    });
    if (prefs.active) {
      engine.on();
    }
    else {
      engine.off();
    }
  };
  chrome.runtime.onStartup.addListener(once);
  chrome.runtime.onInstalled.addListener(once);
}
chrome.storage.onChanged.addListener(async ps => {
  if (ps.active) {
    if (ps.active.newValue) {
      engine.on();
    }
    else {
      engine.off();
    }
    chrome.contextMenus.update('toggle-active', {
      title: ps.active.newValue ? 'Turn Off Protection' : 'Turn On Protection'
    }, () => chrome.runtime.lastError);
  }
  else if (ps.scope || ps.allowedSites) {
    const prefs = await chrome.storage.local.get({
      active: false
    });
    if (prefs.active) {
      engine.on();
    }
  }
});

const uo = async () => {
  const prefs = await chrome.storage.local.get({
    'timezone': 'Etc/GMT'
  });
  try {
    prefs.offset = uo.engine(prefs.timezone);
    chrome.storage.local.set({
      offset: prefs.offset
    });
  }
  catch (e) {
    prefs.timezone = 'Etc/GMT';
    prefs.offset = 0;
    chrome.storage.local.set(prefs);

    notify(`Cannot detect offset for "${prefs.timezone}". Using 0 as offset`);
    console.error(e);
  }
  const activePrefs = await chrome.storage.local.get({active: false});
  updateTitle(activePrefs.active, prefs.timezone, prefs.offset);
  return prefs;
};
uo.engine = timeZone => {
  const value = 'GMT' + new Date().toLocaleString('en', {
    timeZone,
    timeZoneName: 'longOffset'
  }).split('GMT')[1];

  if (value === 'GMT') {
    return 0;
  }
  const o = /(?<hh>[-+]\d{2}):(?<mm>\d{2})/.exec(value);
  const hh = Number(o.groups.hh);
  const mm = Number(o.groups.mm);
  return hh * 60 + (hh < 0 ? -mm : mm);
};

once(uo);

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'update-offset') {
    uo();
  }
  else if (request.method === 'get-timezone-from-ip') {
    fetchTimezoneFromIP()
      .then(timezone => response({timezone}))
      .catch(e => response({error: e.message}));
    return true;
  }
  else if (request.method === 'get-offset') {
    try {
      response(uo.engine(request.value));
    }
    catch (e) {
      console.error(e);
      response({
        error: e.message
      });
    }
  }
  else if (request.method === 'get-prefs') {
    chrome.storage.local.get({
      random: false,
      timezone: 'Etc/GMT',
      offset: 0
    }, prefs => {
      if (prefs.random) {
        const key = 'random.' + sender.tab.id;
        chrome.storage.session.get({
          [key]: false
        }, ps => {
          if (ps[key]) {
            response(ps[key]);
          }
          else {
            response(prefs);
          }
        });
      }
      else {
        response(prefs);
      }
    });
    return true;
  }
  else if (request.method === 'icon') {
    chrome.action.setIcon({
      tabId: sender.tab.id,
      imageData: buildIconData(true)
    });
  }
});

chrome.tabs.onRemoved.addListener(tabId => chrome.storage.session.remove('random.' + tabId));

const onCommitted = ({url, tabId, frameId}) => {
  const send = o => chrome.scripting.executeScript({
    target: {
      tabId,
      frameIds: [frameId]
    },
    injectImmediately: true,
    func: o => {
      self.prefs = o;
      try {
        self.update('committed');
      }
      catch (e) {}
    },
    args: [o]
  }).catch(() => {});

  if (url && url.startsWith('http')) {
    chrome.storage.local.get({
      random: false,
      timezone: 'Etc/GMT',
      offset: 0
    }, prefs => {
      if (prefs.random) {
        const key = 'random.' + tabId;

        chrome.storage.session.get({
          [key]: false
        }, ps => {
          if (frameId === 0 || !ps[key]) {
            const ofs = Intl.supportedValuesOf('timeZone');

            const n = ofs[Math.floor(Math.random() * ofs.length)];

            try {
              ps[key] = {
                offset: uo.engine(n),
                timezone: n
              };
              chrome.storage.session.set({
                [key]: ps[key]
              });
            }
            catch (e) {}
          }
          send(ps[key] || prefs);
        });
      }
      else {
        send(prefs);
      }
    });
  }
};
chrome.webNavigation.onCommitted.addListener(onCommitted);

const fetchTimezoneFromIP = async () => {
  let r;
  const ipinfo = await fetch('https://ipinfo.io/json').catch(() => null);
  if (ipinfo && ipinfo.ok) {
    r = await ipinfo.json().catch(() => null);
  }
  if (!r || !r.timezone) {
    const ipapi = await fetch('https://ipapi.co/timezone/').catch(() => null);
    if (ipapi && ipapi.ok) {
      const text = await ipapi.text().catch(() => null);
      if (text) {
        r = {timezone: text.trim()};
      }
    }
  }
  const {timezone} = r || {};
  if (!timezone) {
    throw Error('cannot resolve timezone for your IP address. Use options page to set manually');
  }
  if (!Intl.supportedValuesOf('timeZone').includes(timezone)) {
    throw Error('Unrecognized timezone received from IP service: ' + timezone);
  }
  return timezone;
};

const server = async (silent = true) => {
  try {
    const timezone = await fetchTimezoneFromIP();
    chrome.storage.local.get({timezone: 'Etc/GMT'}, prefs => {
      if (prefs.timezone !== timezone) {
        chrome.storage.local.set({timezone}, () => {
          uo().then(({timezone, offset}) => notify('New Timezone: ' + timezone + ' (' + offset + ')'));
        });
      }
      else if (silent === false) {
        notify('Already in Timezone: ' + timezone);
      }
    });
  }
  catch (e) {
    if (silent === false) {
      console.warn(e);
      notify(e.errors ? e.errors.map(e => e.message).join('\n') : e.message);
    }
  }
};

/* update on startup */
once(async () => {
  const prefs = await chrome.storage.local.get({
    update: false
  });
  if (prefs.update) {
    server();
  }
});

/* context menu */
once(async () => {
  const prefs = await chrome.storage.local.get({active: false});

  chrome.contextMenus.create({
    id: 'toggle-active',
    title: prefs.active ? 'Turn Off Protection' : 'Turn On Protection',
    contexts: ['action']
  }, () => chrome.runtime.lastError);

  if (navigator.userAgent.includes('Firefox')) {
    chrome.contextMenus.create({
      id: 'open-options',
      title: 'Options',
      contexts: ['action']
    }, () => chrome.runtime.lastError);
  }
});

chrome.contextMenus.onClicked.addListener(({menuItemId}) => {
  if (menuItemId === 'toggle-active') {
    chrome.storage.local.get({active: false}, prefs => {
      chrome.storage.local.set({active: !prefs.active});
    });
  }
  else if (menuItemId === 'open-options') {
    chrome.runtime.openOptionsPage();
  }
});

