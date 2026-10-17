import type { TeamMemberKpi } from '@/lib/queries/team-kpi';

export interface FeedbackTurn {
  role: 'user' | 'assistant';
  content: string;
}

function memberContext(m: TeamMemberKpi): string {
  const goals = m.goals.progress;
  const lines = [
    `Tên: ${m.name} (${m.roleLabel})`,
    `Điểm KPI: ${m.score.toFixed(1)} — trạng thái: ${m.status}`,
    `Chỉ số: ${m.metrics.map((x) => `${x.label}=${x.value}`).join('; ')}`,
    `Radar: ${m.radar.map((x) => `${x.label}=${Math.round(x.value)}`).join('; ')}`,
    `Mục tiêu 30 ngày: ${[goals.follow, goals.reach, goals.postsPerChannel]
      .map((g) => `${g.label}: ${g.actualLabel}/${g.goalLabel}${g.progressPct != null ? ` (${g.progressPct}%)` : ''}`)
      .join('; ')}`,
    `Kênh phụ trách (${m.goals.numChannels}): ${m.tags.join(', ') || '—'}`,
  ];
  return lines.join('\n');
}

const SYSTEM = `Bạn là cố vấn quản lý đội marketing, hỗ trợ admin chạy "feedback loop" cho từng thành viên.
Nhiệm vụ: giúp admin đánh giá hiệu suất dựa trên số liệu KPI bên dưới, soạn feedback cụ thể, công bằng, có thể hành động, và đề xuất bước cải thiện kèm cách đo ở vòng sau.
Quy tắc: trả lời tiếng Việt, ngắn gọn, dùng gạch đầu dòng khi liệt kê; không bịa số liệu ngoài dữ liệu được cung cấp; nếu thiếu dữ liệu thì nói rõ và hỏi admin.`;

export function buildChatPrompt(
  member: TeamMemberKpi | null,
  memberName: string,
  history: FeedbackTurn[]
): string {
  const ctx = member ? memberContext(member) : `Tên: ${memberName} (chưa có dữ liệu KPI)`;
  const convo = history
    .map((t) => `${t.role === 'user' ? 'Admin' : 'Trợ lý'}: ${t.content}`)
    .join('\n\n');
  return `${SYSTEM}\n\n=== DỮ LIỆU KPI THÀNH VIÊN ===\n${ctx}\n\n=== HỘI THOẠI ===\n${convo}\n\nHãy viết lượt trả lời tiếp theo của Trợ lý (chỉ nội dung trả lời).`;
}

export function buildSummaryPrompt(
  member: TeamMemberKpi | null,
  memberName: string,
  history: FeedbackTurn[]
): string {
  const ctx = member ? memberContext(member) : `Tên: ${memberName}`;
  const convo = history
    .map((t) => `${t.role === 'user' ? 'Admin' : 'Trợ lý'}: ${t.content}`)
    .join('\n\n');
  return `${SYSTEM}\n\n=== DỮ LIỆU KPI THÀNH VIÊN ===\n${ctx}\n\n=== HỘI THOẠI ===\n${convo}\n\nTóm tắt phiên feedback trên theo đúng 3 mục markdown: "## Nhận định", "## Feedback gửi thành viên", "## Action items" (mỗi action: việc, hạn dự kiến, cách đo). Chỉ trả về bản tóm tắt.`;
}
