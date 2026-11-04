import { z } from 'zod';

// Hình dạng số liệu Remin mà trang Marketing OS được dùng.
//
// Zod bỏ mọi trường không khai, nên schema ở đây cũng là danh sách trắng: công cụ
// `get_attention_items` trả kèm dòng khách (tên, email, SĐT) và các dòng đó KHÔNG
// được khai để không lọt vào cache hay xuống trình duyệt. Danh sách khách cụ thể
// chỉ xem trong admin Remin. Muốn thêm trường về người thì phải cân nhắc lại quyền.

const dateRange = z.object({ from: z.string(), to: z.string() });

const revenueSourceLine = z.object({
  key: z.string(),
  group: z.enum(['hardware', 'software']),
  label: z.string(),
  vnd: z.number(),
  prevVnd: z.number(),
});

export const overviewSchema = z.object({
  range: dateRange,
  prevRange: dateRange,
  devices: z.object({
    active: z.number(),
    bound: z.number(),
    activePct: z.number(),
    prevActivePct: z.number(),
  }),
  paying: z.object({
    customers: z.number(),
    /** null = Remin chưa lưu lịch sử gói nên không so được kỳ trước. */
    prevCustomers: z.number().nullable(),
    pctOfDevices: z.number(),
    planRevenueVnd: z.number(),
    avgVndPerCustomer: z.number(),
  }),
  finance: z.object({
    revenue: z.object({
      netVnd: z.number(),
      prevNetVnd: z.number(),
      hardwareNetVnd: z.number(),
      softwareNetVnd: z.number(),
      prevHardwareNetVnd: z.number(),
      prevSoftwareNetVnd: z.number(),
      subscriptionNetVnd: z.number(),
      packNetVnd: z.number(),
    }),
    devicesSold: z.object({
      units: z.number(),
      prevUnits: z.number(),
      webUnits: z.number(),
      crmUnits: z.number(),
    }),
    sources: z.array(revenueSourceLine),
    pnl: z.object({
      revenueNetVnd: z.number(),
      costs: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          vnd: z.number(),
          prevVnd: z.number(),
        })
      ),
      costTotalVnd: z.number(),
      prevCostTotalVnd: z.number(),
      profitVnd: z.number(),
      /** Tỉ lệ (0.47 = 47%); null = kỳ chưa có thu. */
      marginPct: z.number().nullable(),
      prevProfitVnd: z.number(),
    }),
  }),
});

export const revenueSchema = z.object({
  revenue: z.object({
    bySource: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        vnd: z.number(),
        prevVnd: z.number(),
      })
    ),
  }),
});

export const weeklyTrendsSchema = z.object({
  weeks: z.array(
    z.object({
      weekStart: z.string(),
      activeDevices: z.number(),
      revenueVnd: z.number(),
      /** Lãi tuần, âm = lỗ. */
      profitVnd: z.number(),
    })
  ),
});

export const funnelSchema = z.object({
  steps: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      devices: z.number(),
      keepPct: z.number(),
      moneyVnd: z.number().nullable(),
    })
  ),
});

export const attentionSchema = z.object({
  items: z.array(
    z.object({
      key: z.string(),
      severity: z.enum(['urgent', 'todo', 'watch']),
      title: z.string(),
      count: z.number(),
      moneyVnd: z.number().nullable(),
      moneyLabel: z.string(),
      /** Đường dẫn màn tương ứng trong admin Remin. */
      href: z.string(),
    })
  ),
});

export type ReminOverview = z.infer<typeof overviewSchema>;
export type ReminFinance = ReminOverview['finance'];
export type ReminRevenueLine = ReminFinance['sources'][number];
export type ReminWeek = z.infer<typeof weeklyTrendsSchema>['weeks'][number];
export type ReminFunnelStep = z.infer<typeof funnelSchema>['steps'][number];
export type ReminAttentionItem = z.infer<typeof attentionSchema>['items'][number];
