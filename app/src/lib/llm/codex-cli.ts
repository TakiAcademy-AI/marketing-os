import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Gọi OpenAI Codex CLI ở chế độ non-interactive (`codex exec`).
// Đăng nhập ChatGPT lưu ở $CODEX_HOME (mặc định ~/.codex) — xem docs/codex-cli.md.
// Env tuỳ chọn: CODEX_BIN (đường dẫn binary), CODEX_MODEL.

const DEFAULT_TIMEOUT_MS = 180_000;

export class CodexError extends Error {}

export async function runCodex(
  prompt: string,
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  const workDir = await mkdtemp(path.join(tmpdir(), 'codex-'));
  const outFile = path.join(workDir, 'last-message.txt');
  const bin = process.env.CODEX_BIN || 'codex';

  // read-only sandbox + thư mục rỗng: AI chỉ trả lời văn bản, không đụng file app.
  const args = [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--color', 'never',
    '-s', 'read-only',
    '-C', workDir,
    '-o', outFile,
  ];
  if (process.env.CODEX_MODEL) args.push('-m', process.env.CODEX_MODEL);
  args.push('-'); // prompt đọc từ stdin

  try {
    const { stdout, stderr, code } = await new Promise<{
      stdout: string;
      stderr: string;
      code: number | null;
    }>((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new CodexError('Codex CLI quá thời gian chờ'));
      }, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(
          new CodexError(
            err.code === 'ENOENT'
              ? `Không tìm thấy Codex CLI ("${bin}"). Cài @openai/codex hoặc đặt CODEX_BIN.`
              : `Không chạy được Codex CLI: ${err.message}`
          )
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });
      child.stdin.on('error', () => { /* CLI thoát sớm — lỗi xử lý ở 'close' */ });
      child.stdin.end(prompt);
    });

    let reply = '';
    try {
      reply = (await readFile(outFile, 'utf8')).trim();
    } catch {
      reply = '';
    }
    if (code !== 0 || !reply) {
      const detail = (stderr || stdout).trim().split('\n').slice(-5).join('\n');
      throw new CodexError(
        `Codex CLI lỗi (exit ${code ?? 'null'})${detail ? `: ${detail}` : ''}. ` +
          'Kiểm tra đã đăng nhập: codex login.'
      );
    }
    return reply;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
