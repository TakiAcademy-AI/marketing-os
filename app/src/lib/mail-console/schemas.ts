import { z } from 'zod';

// Hình dạng số liệu console mail mà trang /email dùng. Zod bỏ mọi trường không khai,
// nên đây cũng là danh sách trắng trước khi vào cache.

const metric = z.object({
  key: z.string(),
  label: z.string(),
  /** null = kỳ chưa gửi mail nào, hoặc CRM chưa đọc được (đơn / doanh thu). */
  value: z.number().nullable(),
  unit: z.string(),
  /** Chữ ngưỡng, vd "≥ 90%"; rỗng với đơn / doanh thu. */
  target: z.string(),
  /** true = đạt ngưỡng, false = chưa đạt, null = không có ngưỡng hoặc chưa có số. */
  ok: z.boolean().nullable(),
});

export const mailDashboardSchema = z.object({
  window_days: z.number(),
  sent: z.number(),
  metrics: z.array(metric),
  mail: z.object({
    /** Kỳ của đơn / doanh thu: console tính từ đầu tháng tới hôm nay, KHÔNG theo `window_days`. */
    period: z.object({ from: z.string(), to: z.string() }).optional(),
    note: z.string().optional(),
  }),
});

export const mailAutomationsSchema = z.object({
  automations: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      published: z.boolean(),
      /** Tên segment nguồn, cách nhau dấu phẩy. */
      source_segments: z.string(),
      nodes: z.number(),
      decisions: z.number(),
      contacts_in_campaign: z.number(),
      sent: z.number(),
      open_rate: z.number().nullable(),
      clicked: z.number().nullable(),
      click_rate: z.number().nullable(),
      is_sales: z.boolean(),
    })
  ),
});

export type MailDashboard = z.infer<typeof mailDashboardSchema>;
export type MailMetric = MailDashboard['metrics'][number];
export type MailAutomation = z.infer<typeof mailAutomationsSchema>['automations'][number];
