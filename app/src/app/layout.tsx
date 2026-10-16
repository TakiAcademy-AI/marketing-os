import type { Metadata } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Be Vietnam Pro — font chữ cho toàn app. Chọn thay Montserrat vì hai lý do:
// dấu tiếng Việt được thiết kế từ đầu chứ không phải thêm vào sau (Montserrat
// hay bị dấu chồng với chữ hoa có dấu), và nó gọn hơn nên bảng số liệu dày
// chữ dễ đọc hơn. Nạp đủ nét để phân cấp tiêu đề/số liệu rõ ràng.
const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-sans-app",
  subsets: ["latin", "vietnamese"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Trước đây còn nguyên mặc định của create-next-app.
  // Không dùng `template`: các trang đã tự gắn hậu tố "— Marketing OS" trong
  // metadata riêng, thêm template nữa sẽ ra "Dashboard — Marketing OS — Marketing OS".
  title: "Marketing OS",
  description: "Một dashboard. Toàn bộ KPI kênh, quảng cáo và doanh thu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${beVietnamPro.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Sonner Toaster — mount tại root để toast.success/info/warning/error
            được hiển thị từ bất kỳ trang nào (login, dashboard, channels...).
            position=top-right để không bị navbar/footer che. richColors=true
            cho màu nền theo từng level (xanh/đỏ/vàng). */}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
