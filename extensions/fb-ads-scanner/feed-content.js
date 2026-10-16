// World ISOLATED — cầu nối giữa feed-interceptor (MAIN) và background worker.
// Gom story node vào buffer (dedupe theo id) và tự cuộn trang để Facebook tải
// thêm bài, vì timeline chỉ load dần khi cuộn.

(function () {
  const buffer = new Map(); // post_id -> node đã rút gọn

  function idOf(s) {
    // Chỉ post_id. Fallback về o.id sẽ gom cả node comment/feedback.
    return String(s.post_id || s.postID || '');
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
      wwwURL:
        s.wwwURL ||
        s.www_url ||
        s.url ||
        pick(s, 'comet_sections.content.story.wwwURL') ||
        // Reel ở tab /reels: permalink nằm trong short_form_video_context,
        // dạng https://www.facebook.com/reel/<id>. Thiếu nó thì server không
        // nhận ra là reel và gán nhầm thành 'status'.
        pick(s, 'short_form_video_context.shareable_url'),
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
      // Cờ nhận dạng reel: giữ lại để server không phải suy từ URL (URL có thể
      // thiếu ở surface khác).
      short_form_video_context: s.short_form_video_context
        ? { play_count_reduced: pick(s, 'short_form_video_context.play_count_reduced') }
        : undefined,
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
          compact(s.play_count_reduced) ??
          // Đường thật của reel ở tab /reels, đo trên HTML production.
          compact(pick(s, 'short_form_video_context.play_count_reduced')) ??
          num(pick(s, 'short_form_video_context.play_count')),
      },
    };
  }


  // ─── Đọc dữ liệu nhúng sẵn trong HTML ────────────────────────────────────
  // Lô bài ĐẦU TIÊN Facebook render thẳng vào trang qua khối
  // <script type="application/json" data-sjs>, KHÔNG đi qua /api/graphql.
  // Interceptor chỉ hook graphql nên không thấy lô này — và trong TAB NỀN thì
  // Chrome tiết chế, IntersectionObserver thường không chạy nên cuộn cũng
  // không sinh request. Kết quả: quét về 0 bài. Đọc thẳng DOM là đường chắc
  // chắn nhất, không phụ thuộc cuộn hay tab có được vẽ hay không.
  function looksLikeStory(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    // BẮT BUỘC có post_id. Chỉ dựa vào `id` thì vớ cả node bình luận và node
    // feedback — đo trên HTML thật: id của chúng là base64 của "comment:…" và
    // "feedback:…", vẫn kèm creation_time và lượt xem nên lọt mọi bộ lọc mềm.
    // Node reel ở tab /reels CÓ post_id (xác nhận trên HTML production), nên
    // siết thế này không làm mất reel.
    const postId = o.post_id || o.postID;
    if (typeof postId !== 'string' || !postId) return false;
    return (
      o.creation_time != null ||
      o.created_time != null ||
      o.creationTime != null ||
      o.short_form_video_context != null ||
      (o.comet_sections && o.comet_sections.content)
    );
  }

  // Độ sâu 40 chứ không phải 14: node reel thật nằm ở độ sâu 23 trong cây
  // Relay (đo trên HTML thật — require.0.3.0.__bbox.require…profile_reel_node.
  // node). Giới hạn 14 khiến quét về 0 bài mà không báo lỗi gì.
  function deepCollect(obj, out, seen, depth) {
    if (!obj || typeof obj !== 'object' || depth > 40) return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const v of obj) deepCollect(v, out, seen, depth + 1);
      return;
    }
    if (looksLikeStory(obj)) out.push(obj);
    for (const k in obj) {
      try { deepCollect(obj[k], out, seen, depth + 1); } catch (_) {}
    }
  }

  function scanInline() {
    let added = 0;
    const nodes = document.querySelectorAll('script[type="application/json"]');
    for (const el of nodes) {
      const txt = el.textContent;
      if (!txt || txt.length < 64) continue;
      if (
        txt.indexOf('creation_time') === -1 &&
        txt.indexOf('comet_sections') === -1 &&
        txt.indexOf('play_count') === -1
      ) continue;
      let parsed;
      try { parsed = JSON.parse(txt); } catch (_) { continue; }
      const found = [];
      deepCollect(parsed, found, new Set(), 0);
      for (const st of found) {
        const id = idOf(st);
        if (id && !buffer.has(id)) { buffer.set(id, slim(st)); added++; }
      }
    }
    return added;
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
      // Một số surface chỉ nạp thêm khi thấy sự kiện scroll thật.
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, pauseMs));
      try { scanInline(); } catch (_) {}
    }
  }

  // Quét ngay khi trang dựng xong, không đợi ai hỏi.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(scanInline, 1500));
  } else {
    setTimeout(scanInline, 1500);
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
    if (!msg) return;
    if (msg.cmd === 'FEED_COLLECT') {
      // Quét lại DOM ngay trước khi trả: bài có thể vừa được render thêm.
      let inline = 0;
      try { inline = scanInline(); } catch (_) {}
      sendResponse({
        stories: Array.from(buffer.values()),
        count: buffer.size,
        inlineFound: inline,
      });
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
