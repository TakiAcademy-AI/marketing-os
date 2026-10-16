// Chạy ở world MAIN trên mọi trang facebook.com — hook window.fetch / XHR để
// bắt response GraphQL của TIMELINE (khác interceptor.js vốn chỉ bắt Ads Library).
//
// Vì sao hook GraphQL thay vì đọc DOM: JSON có cấu trúc (post_id, creation_time,
// feedback.reaction_count…), còn DOM của Comet là class băm ngẫu nhiên, đổi
// liên tục. Đây cũng là cách interceptor.js đang chạy ổn với Ads Library.
//
// Không sửa gì của trang — chỉ clone response để đọc.

(function () {
  const TAG = '[FBFEED]';

  // Một "story node" nhận ra bằng việc có id bài VÀ mốc thời gian tạo. Dùng
  // dấu hiệu cấu trúc thay vì tên field cố định, để Comet đổi tên vẫn bắt được.
  function looksLikeStory(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;

    // Node REEL ở tab /reels: có lượt xem + id, nhưng KHÔNG có feedback hay
    // comet_sections như story ở timeline. Bắt riêng, nếu không thì quét tab
    // reels về tay không.
    const hasViews =
      o.play_count_reduced != null || o.play_count != null || o.video_view_count != null;
    if (hasViews && typeof o.id === 'string') return true;

    const hasId =
      typeof o.post_id === 'string' ||
      typeof o.postID === 'string' ||
      (typeof o.id === 'string' && o.feedback);
    if (!hasId) return false;
    return (
      o.creation_time != null ||
      o.created_time != null ||
      o.creationTime != null ||
      (o.comet_sections && o.comet_sections.content)
    );
  }

  function deepCollect(obj, out, seen, depth) {
    if (!obj || typeof obj !== 'object' || depth > 14) return;
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (const v of obj) deepCollect(v, out, seen, depth + 1);
      return;
    }
    if (looksLikeStory(obj)) out.push(obj);
    for (const k in obj) {
      try {
        deepCollect(obj[k], out, seen, depth + 1);
      } catch (_) {
        /* getter throw — bỏ qua */
      }
    }
  }

  // FB trả nhiều JSON nối nhau (@stream/@defer) hoặc có tiền tố chống hijack.
  function parseMaybeMulti(text) {
    const results = [];
    const cleaned = text.replace(/^\s*for\s*\(;;\);/, '').trim();
    try {
      results.push(JSON.parse(cleaned));
      return results;
    } catch (_) {
      /* multi-part bên dưới */
    }
    for (const line of cleaned.split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        results.push(JSON.parse(t));
      } catch (_) {
        /* bỏ chunk hỏng */
      }
    }
    return results;
  }

  function handleText(text) {
    // Lọc rẻ trước khi parse: response GraphQL của FB rất to, parse hết thì
    // trang giật. Chỉ parse cái có dấu hiệu chứa bài.
    if (!text || text.length < 64) return;
    if (
      text.indexOf('creation_time') === -1 &&
      text.indexOf('comet_sections') === -1 &&
      text.indexOf('post_id') === -1 &&
      text.indexOf('play_count') === -1
    ) {
      return;
    }
    const stories = [];
    const seen = new Set();
    for (const obj of parseMaybeMulti(text)) deepCollect(obj, stories, seen, 0);
    if (stories.length) {
      window.postMessage({ __fbFeedScan: true, stories }, '*');
    }
  }

  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const p = origFetch.apply(this, args);
      try {
        const input = args[0];
        const url = typeof input === 'string' ? input : input && input.url;
        if (typeof url === 'string' && url.indexOf('/api/graphql') !== -1) {
          p.then((res) => {
            try {
              res.clone().text().then(handleText).catch(function () {});
            } catch (_) {}
          }).catch(function () {});
        }
      } catch (_) {}
      return p;
    };
  }

  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
      this.__fbFeedUrl = url;
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function () {
      try {
        if (
          typeof this.__fbFeedUrl === 'string' &&
          this.__fbFeedUrl.indexOf('/api/graphql') !== -1
        ) {
          this.addEventListener('load', function () {
            try {
              if (this.responseType === '' || this.responseType === 'text') {
                handleText(this.responseText);
              }
            } catch (_) {}
          });
        }
      } catch (_) {}
      return origSend.apply(this, arguments);
    };
  } catch (_) {}

  console.log(TAG, 'feed interceptor installed');
})();
