// World ISOLATED — cầu nối giữa feed-interceptor (MAIN) và background worker.
// Gom story node vào buffer (dedupe theo id) và tự cuộn trang để Facebook tải
// thêm bài, vì timeline chỉ load dần khi cuộn.

(function () {
  const buffer = new Map(); // post_id -> node đã rút gọn

  function idOf(s) {
    return String(s.post_id || s.postID || s.id || '');
  }

  function num(v) {
    if (typeof v === 'number' && isFinite(v) && v >= 0) return Math.round(v);
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
    return undefined;
  }

  // "238K" -> 238000. Tab reels chỉ render số rút gọn, không có số nguyên.
  function compact(v) {
    if (typeof v !== 'string') return undefined;
    const m = v.trim().match(/^([\d.,]+)\s*([KkMmBb])?$/);
    if (!m) return undefined;
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(n)) return undefined;
    const suf = (m[2] || '').toLowerCase();
    if (suf === 'k') return Math.round(n * 1e3);
    if (suf === 'm') return Math.round(n * 1e6);
    if (suf === 'b') return Math.round(n * 1e9);
    return Math.round(n);
  }

  function pick(o, path) {
    let cur = o;
    for (const k of path.split('.')) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[k];
    }
    return cur;
  }

  // Story node thô của Comet nặng vài trăm KB (ảnh, actor, tracking, cây
  // render). Đẩy nguyên thì body phình → Nginx/app ngắt giữa chừng → 502.
  // Bài học đã gặp với ad node, xem slimAd() trong content.js.
  //
  // Giữ ĐÚNG các đường dẫn mà mapExtensionPost ở server đọc. Giữ nguyên hình
  // dạng lồng nhau để mapper không phải biết là dữ liệu đã bị rút gọn.
  function slim(s) {
    const fb = s.feedback || {};
    return {
      post_id: s.post_id || s.postID || s.id,
      wwwURL: s.wwwURL || s.www_url || s.url || pick(s, 'comet_sections.content.story.wwwURL'),
      creation_time:
        s.creation_time ||
        s.created_time ||
        s.creationTime ||
        pick(s, 'comet_sections.content.story.creation_time'),
      message: {
        text:
          pick(s, 'message.text') ||
          pick(s, 'comet_sections.content.story.message.text') ||
          s.message_text,
      },
      feedback: {
        reaction_count: { count: num(pick(fb, 'reaction_count.count')) },
        comment_rendering_instance: {
          comments: {
            total_count:
              num(pick(fb, 'comment_rendering_instance.comments.total_count')) ??
              num(pick(fb, 'total_comment_count')) ??
              num(pick(fb, 'comment_count.total_count')),
          },
        },
        share_count: { count: num(pick(fb, 'share_count.count')) ?? num(fb.reshare_count) },
        video_view_count:
          num(fb.video_view_count) ??
          num(s.video_view_count) ??
          num(s.play_count) ??
          compact(s.play_count_reduced),
      },
    };
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || !d.__fbFeedScan || !Array.isArray(d.stories)) return;
    for (const s of d.stories) {
      const id = idOf(s);
      if (id) buffer.set(id, slim(s));
    }
  });

  // Timeline chỉ tải thêm khi cuộn. Background bảo cuộn bao nhiêu nhịp thì
  // cuộn bấy nhiêu, nghỉ giữa các nhịp cho FB kịp trả dữ liệu.
  async function autoScroll(rounds, pauseMs) {
    for (let i = 0; i < rounds; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, pauseMs));
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg) return;
    if (msg.cmd === 'FEED_COLLECT') {
      sendResponse({ stories: Array.from(buffer.values()), count: buffer.size });
    } else if (msg.cmd === 'FEED_SCROLL') {
      autoScroll(msg.rounds || 5, msg.pauseMs || 2000).then(() =>
        sendResponse({ ok: true, count: buffer.size })
      );
      return true; // giữ kênh mở cho sendResponse bất đồng bộ
    } else if (msg.cmd === 'FEED_CLEAR') {
      buffer.clear();
      sendResponse({ ok: true });
    } else if (msg.cmd === 'FEED_PING') {
      sendResponse({ ok: true, count: buffer.size });
    }
    return true;
  });
})();
