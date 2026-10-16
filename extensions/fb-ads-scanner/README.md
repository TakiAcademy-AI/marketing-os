# FB Ads + Web Clip → Marketing OS (Chrome extension)

Hai tính năng, đẩy thẳng về Marketing OS (tab **Tin tức AI**), **miễn phí**:

1. **Quét Facebook Ads Library** — hook GraphQL của trang Ads Library → lấy JSON
   ad có cấu trúc → POST `/api/news/ingest-ads` (badge "FB Ads").
2. **Clip trang web bất kỳ** — mở 1 trang bất kỳ, bấm Clip → lấy tiêu đề + ảnh +
   nội dung → POST `/api/news/ingest-web` (badge "Web").

```
[FB Ads]  facebook.com/ads/library → cuộn nạp ad → Scan → badge "FB Ads"
[Clip]    bất kỳ trang web nào → bấm "Clip trang đang mở" → badge "Web"
```

Cả hai dùng chung 1 token (ADS_INGEST_TOKEN). Server dedupe theo link.

---

## 1. Lấy token (1 lần)

Cần một `ADS_INGEST_TOKEN` — chuỗi bí mật để xác thực extension.

**Cách dễ nhất — qua giao diện web (khuyên dùng):**

1. Đăng nhập website bằng tài khoản **admin**.
2. Vào **Settings → Tích hợp API** (`/settings/integrations`).
3. Tới khối **"Token quét FB Ads"** → bấm **Tạo token**.
4. Bấm **Copy**. Xong — không cần đụng server, không cần restart.

**Cách thủ công — qua env** (nếu không muốn dùng UI):

```bash
# Sinh token:
openssl rand -hex 24
# Thêm vào app/.env (dev) hoặc .env.production (prod) rồi restart app:
ADS_INGEST_TOKEN="...token..."
```

> Route `/api/news/ingest-ads` được loại trừ khỏi proxy auth nên gọi được mà
> không cần đăng nhập; bảo mật dựa hoàn toàn vào token này. Giữ token bí mật,
> không commit lên GitHub.

## 2. Cài extension (Developer mode)

1. Mở `chrome://extensions`
2. Bật **Developer mode** (góc phải trên)
3. **Load unpacked** → chọn thư mục `extensions/fb-ads-scanner/`
4. Ghim extension cho dễ bấm.

## 3. Cấu hình extension

Bấm icon extension → popup:

- **Website URL**: gốc website Marketing OS, ví dụ `https://marketing-os.cua-ban.com`
  (không kèm `/`).
- **Ingest token**: đúng chuỗi `ADS_INGEST_TOKEN` đã set ở bước 1.
- Bấm **Lưu**.

## 4. Quét

1. Mở <https://www.facebook.com/ads/library/>, chọn quốc gia/từ khoá/Page cần xem.
2. **Cuộn xuống** để Facebook nạp thêm ad (extension gom dần khi bạn cuộn).
3. Bấm icon extension → **Scan & đẩy**.
4. Popup báo `thêm mới N ad`. Vào **Tin tức AI** trên website để xem.

---

## Lưu ý

- Ads Library là trang **công khai** — extension không đụng tài khoản Facebook
  của bạn, chỉ đọc dữ liệu trang.
- Extension chỉ chạy script trên `facebook.com/ads/library*` (xem `manifest.json`).
- Nếu Scan báo "chưa bắt được ad": cuộn thêm để FB load ad, hoặc tải lại trang
  rồi cuộn lại (interceptor cần chạy từ đầu trang).
- Trùng lặp: server dedupe theo link ad nên đẩy lại nhiều lần không tạo bản sao.
- Đổi field do FB cập nhật: chỉ cần sửa `mapFacebookAdItem` ở
  `app/src/lib/news/apify-mapper.ts` (server), **không cần build lại extension**.

## File

| File | Vai trò |
|------|---------|
| `manifest.json` | Khai báo MV3, quyền, content scripts |
| `interceptor.js` | World MAIN — hook `fetch`/XHR, bắt JSON ad từ GraphQL |
| `content.js` | World ISOLATED — gom buffer, trả về khi Scan |
| `popup.html` / `popup.js` | Cấu hình + nút Scan + POST về website |

---

## 5. Quét timeline Page chạy ngầm (v1.1)

Dành cho Page **đã mất quyền quản trị** nên không có Page Access Token.

### Vì sao phải làm ở extension

Quét từ server bằng `fb-cli` đã thử và bế tắc: session được Facebook công nhận
(`fb whoami` trả tier 1) nhưng **không page nào qua được bài đầu tiên** — đo
trên cả `nasa` lẫn page của khách, cả `fb feed` lẫn `fb page --posts`. Extension
chạy trong Chrome thật mới có đủ cookie, header và IP mà Facebook tin.

### Lấy được gì

| | |
|---|---|
| ✅ Danh sách bài, tần suất đăng | tự động |
| ✅ Reactions / comments / shares → ER | tự động |
| ✅ Phân loại reel vs video | tự động |
| ❌ Reach, impressions, inbox | **không bao giờ** — là Page Insights, dữ liệu riêng tư của Page |

Followers và reach phải nhập tay trong trang chi tiết kênh.

### Chuẩn bị

Mỗi page cần một kênh tương ứng trong Marketing OS:
**Kênh → Onboard kênh mới → ✍️ Kênh thủ công** → chọn Facebook → điền ô
**"Page Facebook để quét công khai"**. Không có kênh thì server trả 404.

### Dùng

Trong popup, khối **🕗 Quét timeline Page**:

1. Dán danh sách page, mỗi dòng một cái (slug hoặc URL đầy đủ đều được).
2. Tick **Tự chạy** và đặt chu kỳ (tối thiểu 30 phút, mặc định 720 = 12 tiếng).
3. **Lưu lịch**. Hoặc bấm **Quét ngay** để chạy thử.

`siteUrl` và token dùng chung với phần quét Ads Library ở trên — không phải
cấu hình lại.

### Cách nó chạy

Tới giờ, service worker mở **tab nền** (`active: false`, có ghim) cho từng page,
để `feed-interceptor.js` bắt response GraphQL, cuộn vài nhịp cho Facebook tải
thêm bài, gom rồi đóng tab. Tab có nằm trong thanh tab nhưng không nhảy lên
trước mặt và không cướp focus. Giữa các page nghỉ 15 giây.

Node thô được **rút gọn** trước khi gửi (node Comet nặng vài trăm KB → body
phình → 502), rồi POST về `/api/channels/ingest-posts`. **Server map, không
phải extension** — Facebook đổi tên field thì sửa server, không phải bảo mọi
người cài lại extension.

### Hạn chế phải biết

- **Chrome phải đang chạy** và đã đăng nhập Facebook. Máy ngủ thì không có dữ
  liệu. Đây không còn là cron trên server.
- MV3 tắt service worker khi rảnh, nên lịch chạy bằng `chrome.alarms`; Chrome
  có thể lệch giờ đôi chút.
- Nó lái tài khoản Facebook thật theo lịch. Facebook có thể giới hạn, bắt
  checkpoint hoặc khoá tài khoản đó. Cân nhắc dùng tài khoản phụ.
- Vẫn là scraping: Facebook đổi payload là hỏng. Khi hỏng, response có
  `unmappedSample` để cập nhật mapper nhanh.
