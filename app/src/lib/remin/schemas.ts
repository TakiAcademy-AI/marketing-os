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

// Dashboard MKT của admin Remin (`/mkt`), công cụ `get_mkt_dashboard`: số tổng theo kênh,
// không có từng đơn hay khách. "Data" = lead để lại form đặt mua (đã bỏ rác), gán kênh
// theo lần chạm cuối. Đơn chốt / Chờ thu = đơn chốt trong kỳ kể cả mới cọc và phần chưa thu.
const closedCols = {
  closedOrders: z.number(),
  pendingVnd: z.number(),
};

const leadQuality = {
  leads: z.number(),
  junk: z.number(),
  contacted: z.number(),
  purchased: z.number(),
};

export const mktDashboardSchema = z.object({
  range: dateRange,
  ads: z.object({
    rows: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        spendVnd: z.number(),
        leads: z.number(),
        orders: z.number(),
        netVnd: z.number(),
        ...closedCols,
      })
    ),
    total: z.object({
      spendVnd: z.number(),
      leads: z.number(),
      orders: z.number(),
      netVnd: z.number(),
      ...closedCols,
    }),
  }),
  organic: z.object({
    rows: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        /** Hàng phụ (SEO, organic khác): toàn số 0 thì ẩn, như admin. */
        extra: z.boolean(),
        /** null = không áp dụng (SEO). */
        posts: z.number().nullable(),
        traffic: z.number(),
        /** null = hàng chưa nối kênh social. */
        reach: z.number().nullable(),
        engagement: z.number().nullable(),
        followers: z.number().nullable(),
        followersDelta: z.number().nullable(),
        leads: z.number(),
        orders: z.number(),
        netVnd: z.number(),
        ...closedCols,
      })
    ),
    total: z.object({
      posts: z.number(),
      traffic: z.number(),
      reach: z.number().nullable(),
      engagement: z.number().nullable(),
      followers: z.number().nullable(),
      followersDelta: z.number().nullable(),
      leads: z.number(),
      orders: z.number(),
      netVnd: z.number(),
      ...closedCols,
    }),
  }),
  campaigns: z.array(
    z.object({
      channelLabel: z.string(),
      /** '' = link không ghi tên chiến dịch. */
      campaign: z.string(),
      spendVnd: z.number(),
      orders: z.number(),
      netVnd: z.number(),
      /** Doanh thu / chi; null = chưa chi. */
      roas: z.number().nullable(),
      ...leadQuality,
    })
  ),
  campaignsTotal: z.number(),
  quality: z.object({
    rows: z.array(z.object({ key: z.string(), label: z.string(), ...leadQuality })),
    total: z.object(leadQuality),
  }),
  overall: z.object({
    leads: z.number(),
    leadsOutside: z.number(),
    visits: z.number(),
    visitsOutside: z.number(),
    visitsDirect: z.number(),
    orders: z.number(),
    netVnd: z.number(),
  }),
});

export type ReminOverview = z.infer<typeof overviewSchema>;
export type ReminMktDashboard = z.infer<typeof mktDashboardSchema>;
export type ReminFinance = ReminOverview['finance'];
export type ReminRevenueLine = ReminFinance['sources'][number];
export type ReminWeek = z.infer<typeof weeklyTrendsSchema>['weeks'][number];
export type ReminFunnelStep = z.infer<typeof funnelSchema>['steps'][number];
export type ReminAttentionItem = z.infer<typeof attentionSchema>['items'][number];
