import 'server-only';

import { getReminConfig } from './config';

// Client gọi cổng MCP chỉ đọc của Remin (POST <REMIN_API_URL>/api/admin/v1/mcp).
// Stateless, không cần `initialize`: gửi thẳng JSON-RPC `tools/call`, kết quả nằm
// ở `result.structuredContent`.
//
// Token là mã kết nối cá nhân `rmn_mcp_…` tạo trong admin Remin (mục "Kết nối
// Claude"), lấy qua getReminConfig (Settings → Tích hợp API, rồi mới tới env). Chỉ
// đọc ở server, KHÔNG bao giờ gửi xuống trình duyệt và không đưa vào câu lỗi.

const TIMEOUT_MS = 30_000;

export class ReminApiError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ReminApiError';
  }
}

const NEW_TOKEN_HINT =
  'Admin cần tạo mã mới trong admin Remin (mục "Kết nối Claude") rồi cập nhật ở Settings → Tích hợp API.';

const INVALID_TOKEN_MESSAGE = `Mã kết nối Remin không hợp lệ. ${NEW_TOKEN_HINT}`;

const AUTH_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED: `Mã kết nối Remin đã hết hạn. ${NEW_TOKEN_HINT}`,
  TOKEN_REVOKED: `Mã kết nối Remin đã bị thu hồi. ${NEW_TOKEN_HINT}`,
  ACCOUNT_NOT_ALLOWED: `Chủ mã kết nối không còn quyền đọc số liệu Remin. ${NEW_TOKEN_HINT}`,
};

interface McpEnvelope {
  error?: { message?: string; data?: { code?: string } };
  result?: {
    isError?: boolean;
    structuredContent?: {
      error?: { code?: string; required?: string };
    } & Record<string, unknown>;
  };
}

function errorForStatus(status: number, body: McpEnvelope | null): ReminApiError {
  if (status === 401) {
    const code = body?.error?.data?.code ?? 'INVALID_TOKEN';
    return new ReminApiError(code, AUTH_MESSAGES[code] ?? INVALID_TOKEN_MESSAGE);
  }
  if (status === 429) {
    return new ReminApiError(
      'RATE_LIMITED',
      'Remin đang giới hạn lượt đọc số liệu. Thử lại sau một phút.'
    );
  }
  if (status === 503) {
    return new ReminApiError(
      'MCP_DISABLED',
      'Cổng đọc số liệu của Remin đang tắt (ADMIN_MCP_ENABLED).'
    );
  }
  return new ReminApiError(
    'UPSTREAM_ERROR',
    `Remin trả lỗi ${status}. Thử lại sau ít phút.`
  );
}

/** Gọi một công cụ MCP của Remin. Lỗi nào cũng là `ReminApiError`, câu lỗi đã an toàn để hiện. */
export async function callReminTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<unknown> {
  const { apiUrl: baseUrl, mcpToken: token } = await getReminConfig();
  if (!baseUrl || !token) {
    throw new ReminApiError(
      'NOT_CONFIGURED',
      'Chưa cấu hình kết nối Remin (Settings → Tích hợp API).'
    );
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/admin/v1/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ReminApiError(
      'UNREACHABLE',
      'Không kết nối được tới Remin. Thử lại sau ít phút.'
    );
  }

  const body = (await res.json().catch(() => null)) as McpEnvelope | null;
  if (!res.ok) throw errorForStatus(res.status, body);

  const result = body?.result;
  if (result?.isError) {
    const toolError = result.structuredContent?.error;
    if (toolError?.code === 'TOOL_PERMISSION_DENIED') {
      throw new ReminApiError(
        toolError.code,
        `Mã kết nối Remin thiếu quyền ${toolError.required ?? ''}. ${NEW_TOKEN_HINT}`
      );
    }
    // Trang gọi công cụ mà bản Remin đang chạy chưa có (trang lên trước, Remin chờ đợt
    // phát hành sau). Không phải lỗi tạm thời nên không bảo "thử lại".
    if (toolError?.code === 'TOOL_NOT_FOUND') {
      throw new ReminApiError(
        toolError.code,
        'Bản Remin đang chạy chưa có số này. Số tự hiện khi Remin lên bản mới, không cần làm gì thêm.'
      );
    }
    throw new ReminApiError(
      toolError?.code ?? 'TOOL_FAILED',
      'Remin không tính được số liệu này. Thử lại sau ít phút.'
    );
  }
  if (!result?.structuredContent) {
    throw new ReminApiError(
      'BAD_RESPONSE',
      'Remin trả dữ liệu không đúng định dạng.'
    );
  }
  return result.structuredContent;
}
