// Service worker — quét timeline các Page theo lịch, KHÔNG hiện cửa sổ nào.
//
// CÁCH CHẠY: mở tab ở chế độ nền (`active: false`) cho từng page, để
// feed-interceptor bắt GraphQL, bảo feed-content cuộn vài nhịp cho Facebook
// tải thêm bài, gom lại rồi đóng tab. Tab nền có nằm trong thanh tab nhưng
// không nhảy lên trước mặt và không cướp focus.
//
// VÌ SAO KHÔNG FETCH THẲNG TRONG SERVICE WORKER:
// fetch() kèm cookie thì lấy được HTML, nhưng dữ liệu nằm trong khối Relay
// `data-sjs` phải bóc và dựng lại — fb-cli cần tới bốn file Go cho việc đó.
// Để trang tự chạy rồi bắt GraphQL là tái dùng cơ chế đã chạy ổn với Ads
// Library, đổi lại là cần một tab.
//
// MV3: service worker bị tắt khi rảnh, nên lịch phải đặt bằng chrome.alarms
// (worker được đánh thức khi chuông kêu) chứ không dùng setInterval.

const ALARM = 'fb-feed-scrape';
// siteUrl + token dùng CHUNG khoá với popup của phần quét Ads Library
// (popup.js đọc/ghi 'siteUrl','token'), để người dùng không phải cấu hình hai lần.
const DEFAULTS = {
  siteUrl: '',
  token: '',
  handles: [], // ['takidocvinhantam', ...]
  intervalMinutes: 720, // 12 tiếng
  scrollRounds: 6,
  scrollPauseMs: 2500,
  autoEnabled: false,
};

async function cfg() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return { ...DEFAULTS, ...s };
}

function log(...a) {
  console.log('[FBFEED/bg]', ...a);
}

/** Chờ tab load xong. Có timeout vì Facebook đôi khi treo ở trạng thái loading. */
function waitForTabLoad(tabId, timeoutMs = 45000) {
  return new Promise((resolve) => {
    const done = (ok) => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timer);
      resolve(ok);
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') done(true);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendToTab(tabId, msg) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, msg, (res) => {
      // Content script chưa sẵn sàng → lastError; nuốt để không vỡ cả lượt.
      void chrome.runtime.lastError;
      resolve(res || null);
    });
  });
}

/** Quét 1 page. Trả { handle, stories } — chưa đẩy đi đâu. */
async function scrapeHandle(handle, conf) {
  const url = `https://www.facebook.com/${encodeURIComponent(handle)}`;
  const tab = await chrome.tabs.create({ url, active: false, pinned: true });
  try {
    await waitForTabLoad(tab.id);
    // Interceptor chạy ở document_start nhưng GraphQL đầu tiên về sau đó một nhịp.
    await new Promise((r) => setTimeout(r, 3000));
    await sendToTab(tab.id, {
      cmd: 'FEED_SCROLL',
      rounds: conf.scrollRounds,
      pauseMs: conf.scrollPauseMs,
    });
    const res = await sendToTab(tab.id, { cmd: 'FEED_COLLECT' });
    const stories = (res && res.stories) || [];
    log(`${handle}: thu được ${stories.length} bài`);
    return { handle, stories };
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch (_) {
      /* tab có thể đã bị đóng tay */
    }
  }
}

async function push(handle, stories, conf) {
  if (!conf.siteUrl || !conf.token) {
    return { ok: false, error: 'Chưa cấu hình Website URL hoặc token' };
  }
  // Vẫn gửi khi rỗng: để server ghi nhận LÀ CÓ chạy. Không gửi thì phía server
  // không phân biệt được "extension chưa chạy" với "chạy nhưng không thu được
  // gì" — hai nguyên nhân cần sửa khác hẳn nhau.
  const endpoint = conf.siteUrl.replace(/\/+$/, '') + '/api/channels/ingest-posts';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conf.token}`,
      },
      body: JSON.stringify({ handle, items: stories }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** Một lượt đủ: mọi page, tuần tự. */
async function runAll() {
  const conf = await cfg();
  if (!conf.handles.length) {
    log('chưa có page nào trong danh sách — bỏ qua');
    return { results: [] };
  }
  const results = [];
  for (const handle of conf.handles) {
    try {
      const { stories } = await scrapeHandle(handle, conf);
      const pushed = await push(handle, stories, conf);
      results.push({ handle, collected: stories.length, ...pushed });
    } catch (err) {
      results.push({ handle, ok: false, error: String(err) });
    }
    // Giãn nhịp giữa các page: quét dồn là cách nhanh nhất để Facebook để ý.
    await new Promise((r) => setTimeout(r, 15000));
  }
  await chrome.storage.local.set({
    lastRun: { at: new Date().toISOString(), results },
  });
  log('xong lượt:', results);
  return { results };
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) runAll();
});

/** Bật/tắt lịch. Gọi lại mỗi lần đổi chu kỳ trong popup. */
async function rescheduleAlarm() {
  const conf = await cfg();
  await chrome.alarms.clear(ALARM);
  if (conf.autoEnabled && conf.handles.length) {
    chrome.alarms.create(ALARM, {
      periodInMinutes: Math.max(30, conf.intervalMinutes),
      delayInMinutes: 1,
    });
    log(`đã hẹn lịch mỗi ${conf.intervalMinutes} phút`);
  } else {
    log('lịch tắt');
  }
}

chrome.runtime.onInstalled.addListener(rescheduleAlarm);
chrome.runtime.onStartup.addListener(rescheduleAlarm);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.cmd === 'FEED_RUN_NOW') {
    runAll().then((r) => sendResponse(r));
    return true;
  }
  if (msg.cmd === 'FEED_RESCHEDULE') {
    rescheduleAlarm().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.cmd === 'FEED_STATUS') {
    Promise.all([cfg(), chrome.alarms.get(ALARM), chrome.storage.local.get('lastRun')]).then(
      ([conf, alarm, { lastRun }]) =>
        sendResponse({
          handles: conf.handles,
          autoEnabled: conf.autoEnabled,
          intervalMinutes: conf.intervalMinutes,
          nextRun: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
          lastRun: lastRun || null,
        })
    );
    return true;
  }
});
