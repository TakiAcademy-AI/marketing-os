// Test khoá / mở khoá tài khoản thành viên (migration 068).
//
// Cần một Postgres RIÊNG cho test — test TRUNCATE team_member (CASCADE), nên tên
// DB bắt buộc chứa "test". Schema tự migrate bằng scripts/run-migrations.cjs.
//
//   cd app
//   TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5434/mos_test npm run test:db
//
// Nhóm HTTP (đăng nhập bị chặn, phiên cũ bị chặn, mở khoá dùng lại được, không
// tự khoá) chạy thêm khi có TEST_BASE_URL: app phải đang chạy và nối CÙNG DB đó
// (env tối thiểu như job build trong .github/workflows/ci.yml, với DATABASE_URL =
// TEST_DATABASE_URL), vd `npm run build && npx next start -p 3999` rồi
// TEST_BASE_URL=http://127.0.0.1:3999.
//
// "Không khoá admin cuối" chỉ test ở tầng DB: qua HTTP không dựng được ca đó,
// vì người gọi phải là admin đang hoạt động và không được tự khoá.
//
// Không có TEST_DATABASE_URL thì cả file tự bỏ qua (CI hiện chỉ tsc + build).

import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { lockTeamMember, unlockTeamMember } from '../src/lib/auth/account-lock';

const DB_URL = process.env.TEST_DATABASE_URL ?? '';
const BASE_URL = (process.env.TEST_BASE_URL ?? '').replace(/\/$/, '');
const PASSWORD = 'lock-test-password-1';
const WRONG_LOGIN_MESSAGE = 'Email hoặc mật khẩu sai';

let pool: Pool;
let passwordHash = '';

interface Member {
  id: string;
  email: string;
}

async function resetMembers(): Promise<void> {
  // CASCADE: mọi bảng tham chiếu team_member (social_account, brief…) — chỉ ở DB test.
  await pool.query('TRUNCATE team_member CASCADE');
}

async function createMember(
  role: 'admin' | 'member' | 'guest',
  label: string
): Promise<Member> {
  const email = `lock-${label}-${randomUUID().slice(0, 8)}@example.test`;
  const res = await pool.query<{ id: string }>(
    `INSERT INTO team_member (email, name, role, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [email, `Lock test ${label}`, role, passwordHash]
  );
  const id = res.rows[0]?.id;
  if (!id) throw new Error('insert team_member không trả id');
  return { id, email };
}

async function lockState(
  id: string
): Promise<{ disabled_at: Date | null; disabled_by: string | null }> {
  const res = await pool.query<{ disabled_at: Date | null; disabled_by: string | null }>(
    `SELECT disabled_at, disabled_by FROM team_member WHERE id = $1`,
    [id]
  );
  const row = res.rows[0];
  if (!row) throw new Error(`không thấy team_member ${id}`);
  return row;
}

async function countActiveAdmins(): Promise<number> {
  const res = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM team_member WHERE role = 'admin' AND disabled_at IS NULL`
  );
  return res.rows[0]?.n ?? 0;
}

describe('khoá tài khoản', { skip: DB_URL ? false : 'cần TEST_DATABASE_URL' }, () => {
  before(async () => {
    const dbName = new URL(DB_URL).pathname.replace(/^\//, '');
    if (!/test/i.test(dbName)) {
      throw new Error(
        `TEST_DATABASE_URL phải trỏ tới DB có chữ "test" trong tên (đang là "${dbName}"): test này TRUNCATE team_member.`
      );
    }
    const migrator = path.resolve(process.cwd(), 'scripts/run-migrations.cjs');
    if (!existsSync(migrator)) {
      throw new Error('Chạy test từ thư mục app/ (không thấy scripts/run-migrations.cjs).');
    }
    execFileSync(process.execPath, [migrator], {
      env: { ...process.env, DATABASE_URL: DB_URL },
      stdio: 'pipe',
    });
    pool = new Pool({ connectionString: DB_URL, max: 5 });
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  after(async () => {
    await pool?.end();
  });

  describe('lockTeamMember / unlockTeamMember (DB)', () => {
    beforeEach(resetMembers);

    test('khoá ghi disabled_at + disabled_by; mở khoá xoá cả hai', async () => {
      const admin = await createMember('admin', 'admin');
      const member = await createMember('member', 'member');

      assert.deepEqual(
        await lockTeamMember(pool, { actorId: admin.id, targetId: member.id }),
        { ok: true, changed: true }
      );
      const locked = await lockState(member.id);
      assert.ok(locked.disabled_at instanceof Date);
      assert.equal(locked.disabled_by, admin.id);

      assert.deepEqual(await unlockTeamMember(pool, member.id), { ok: true, changed: true });
      assert.deepEqual(await lockState(member.id), { disabled_at: null, disabled_by: null });
    });

    test('không tự khoá được chính mình', async () => {
      const admin = await createMember('admin', 'admin');
      await createMember('admin', 'admin2');

      assert.deepEqual(
        await lockTeamMember(pool, { actorId: admin.id, targetId: admin.id }),
        { ok: false, reason: 'self' }
      );
      assert.equal((await lockState(admin.id)).disabled_at, null);
    });

    test('không khoá được admin đang hoạt động cuối cùng', async () => {
      const a = await createMember('admin', 'a');
      const b = await createMember('admin', 'b');
      const member = await createMember('member', 'member');

      // Hai admin: khoá một người được, vì vẫn còn người kia.
      assert.deepEqual(await lockTeamMember(pool, { actorId: a.id, targetId: b.id }), {
        ok: true,
        changed: true,
      });

      // Giờ `a` là admin hoạt động duy nhất. Route không cho người gọi như vậy
      // tới đây (người gọi phải là admin đang hoạt động, khác người bị khoá),
      // nhưng bất biến phải đứng vững với mọi đường gọi khác.
      assert.deepEqual(await lockTeamMember(pool, { actorId: b.id, targetId: a.id }), {
        ok: false,
        reason: 'last_admin',
      });
      assert.deepEqual(
        await lockTeamMember(pool, { actorId: member.id, targetId: a.id }),
        { ok: false, reason: 'last_admin' }
      );
      assert.equal((await lockState(a.id)).disabled_at, null);
      assert.equal(await countActiveAdmins(), 1);
    });

    test('hai admin khoá chéo nhau cùng lúc: đúng một lệnh thành công, còn đúng một admin', async () => {
      const a = await createMember('admin', 'a');
      const b = await createMember('admin', 'b');

      for (let round = 0; round < 20; round += 1) {
        await pool.query(
          `UPDATE team_member SET disabled_at = NULL, disabled_by = NULL WHERE id = ANY($1)`,
          [[a.id, b.id]]
        );
        const results = await Promise.all([
          lockTeamMember(pool, { actorId: a.id, targetId: b.id }),
          lockTeamMember(pool, { actorId: b.id, targetId: a.id }),
        ]);
        const succeeded = results.filter((r) => r.ok);
        const blocked = results.filter((r) => !r.ok && r.reason === 'last_admin');
        assert.equal(succeeded.length, 1, `round ${round}: ${JSON.stringify(results)}`);
        assert.equal(blocked.length, 1, `round ${round}: ${JSON.stringify(results)}`);
        assert.equal(await countActiveAdmins(), 1, `round ${round}`);
      }
    });

    test('khoá lại tài khoản đã khoá: không đổi mốc thời gian / người khoá', async () => {
      const a = await createMember('admin', 'a');
      const b = await createMember('admin', 'b');
      const member = await createMember('member', 'member');

      await lockTeamMember(pool, { actorId: a.id, targetId: member.id });
      const first = await lockState(member.id);

      assert.deepEqual(await lockTeamMember(pool, { actorId: b.id, targetId: member.id }), {
        ok: true,
        changed: false,
      });
      assert.deepEqual(await lockState(member.id), first);
      assert.deepEqual(await unlockTeamMember(pool, member.id), { ok: true, changed: true });
      assert.deepEqual(await unlockTeamMember(pool, member.id), { ok: true, changed: false });
    });

    test('id không tồn tại → not_found', async () => {
      const admin = await createMember('admin', 'admin');
      const ghost = randomUUID();

      assert.deepEqual(await lockTeamMember(pool, { actorId: admin.id, targetId: ghost }), {
        ok: false,
        reason: 'not_found',
      });
      assert.deepEqual(await unlockTeamMember(pool, ghost), { ok: false, reason: 'not_found' });
    });

    test('khoá giữ nguyên kênh người đó làm chủ + gán kênh', async () => {
      const admin = await createMember('admin', 'admin');
      const member = await createMember('member', 'owner');
      const account = await pool.query<{ id: string }>(
        `INSERT INTO social_account (platform, external_id, name, owner_member_id)
         VALUES ('facebook', $1, 'Lock test page', $2)
         RETURNING id`,
        [`lock-test-${randomUUID()}`, member.id]
      );
      const accountId = account.rows[0]?.id;
      assert.ok(accountId);
      await pool.query(
        `INSERT INTO social_account_member (account_id, member_id, role) VALUES ($1, $2, 'primary')`,
        [accountId, member.id]
      );

      await lockTeamMember(pool, { actorId: admin.id, targetId: member.id });

      const owner = await pool.query<{ owner_member_id: string | null; status: string }>(
        `SELECT owner_member_id, status::text AS status FROM social_account WHERE id = $1`,
        [accountId]
      );
      assert.deepEqual(owner.rows[0], { owner_member_id: member.id, status: 'active' });
      const links = await pool.query<{ member_id: string; role: string }>(
        `SELECT member_id, role FROM social_account_member WHERE account_id = $1`,
        [accountId]
      );
      assert.deepEqual(links.rows, [{ member_id: member.id, role: 'primary' }]);
    });
  });

  describe('qua HTTP (app đang chạy)', { skip: BASE_URL ? false : 'cần TEST_BASE_URL' }, () => {
    let admin: Member;
    let member: Member;
    let guest: Member;
    let adminCookie = '';

    async function login(
      email: string,
      password = PASSWORD
    ): Promise<{ status: number; cookie: string; error?: string }> {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const cookie =
        res.headers
          .getSetCookie()
          .find((c) => c.startsWith('mos_session='))
          ?.split(';')[0] ?? '';
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { status: res.status, cookie, error: body.error };
    }

    function request(
      pathname: string,
      cookie: string,
      method = 'GET'
    ): Promise<Response> {
      return fetch(`${BASE_URL}${pathname}`, {
        method,
        headers: { cookie, 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
        redirect: 'manual',
      });
    }

    function assertBouncedToLogin(res: Response, label: string): void {
      assert.equal(res.status, 307, `${label}: status`);
      const location = res.headers.get('location') ?? '';
      assert.equal(new URL(location, BASE_URL).pathname, '/login', `${label}: location`);
    }

    before(async () => {
      await resetMembers();
      admin = await createMember('admin', 'http-admin');
      await createMember('admin', 'http-admin2');
      member = await createMember('member', 'http-member');
      guest = await createMember('guest', 'http-guest');
      const res = await login(admin.email);
      assert.equal(res.status, 200);
      adminCookie = res.cookie;
      assert.ok(adminCookie);
    });

    test('đang hoạt động: đăng nhập + vào trang bình thường', async () => {
      const res = await login(member.email);
      assert.equal(res.status, 200);
      assert.equal((await request('/settings/account', res.cookie)).status, 200);
    });

    test('thành viên thường không khoá được ai', async () => {
      const { cookie } = await login(member.email);
      const res = await request(`/api/team-members/${admin.id}/lock`, cookie, 'POST');
      assert.equal(res.status, 403);
    });

    test('khoá xong: phiên cũ bị chặn ngay ở trang, API qua proxy và API proxy bỏ qua', async () => {
      const { cookie } = await login(member.email);
      assert.equal((await request('/settings/account', cookie)).status, 200);

      const lock = await request(`/api/team-members/${member.id}/lock`, adminCookie, 'POST');
      assert.equal(lock.status, 200);
      assert.deepEqual(await lock.json(), { ok: true, changed: true });

      const page = await request('/settings/account', cookie);
      assertBouncedToLogin(page, 'trang');
      const cleared = page.headers
        .getSetCookie()
        .find((c) => c.startsWith('mos_session='));
      assert.match(cleared ?? '', /^mos_session=;.*Expires=Thu, 01 Jan 1970/i);

      assertBouncedToLogin(await request('/api/team-members', cookie), 'API qua proxy');

      // /api/auth/* nằm ngoài matcher của proxy → chặn nhờ getCurrentUser().
      const excluded = await request('/api/auth/change-password', cookie, 'POST');
      assert.equal(excluded.status, 401);

      // Trang đăng nhập không đẩy ngược về /dashboard (không vòng redirect).
      assert.equal((await request('/login', cookie)).status, 200);
    });

    test('tài khoản bị khoá: đăng nhập bị từ chối, cùng thông báo như sai mật khẩu', async () => {
      const locked = await login(member.email);
      assert.equal(locked.status, 401);
      assert.equal(locked.error, WRONG_LOGIN_MESSAGE);
      assert.equal(locked.cookie, '');

      const unknown = await login(`nobody-${randomUUID().slice(0, 8)}@example.test`);
      assert.equal(unknown.status, 401);
      assert.equal(unknown.error, locked.error);
    });

    test('mở khoá: đăng nhập lại bằng mật khẩu cũ, dùng bình thường', async () => {
      const unlock = await request(`/api/team-members/${member.id}/lock`, adminCookie, 'DELETE');
      assert.equal(unlock.status, 200);
      assert.deepEqual(await unlock.json(), { ok: true, changed: true });

      const res = await login(member.email);
      assert.equal(res.status, 200);
      assert.equal((await request('/settings/account', res.cookie)).status, 200);
    });

    test('admin không tự khoá được chính mình', async () => {
      const res = await request(`/api/team-members/${admin.id}/lock`, adminCookie, 'POST');
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error?: string }).error, 'Không thể tự khoá tài khoản của bạn.');
      assert.equal((await lockState(admin.id)).disabled_at, null);
    });

    test('xoá thành viên: phiên cũ của người đó chết ngay', async () => {
      const temp = await createMember('member', 'http-temp');
      const { cookie } = await login(temp.email);
      assert.equal((await request('/settings/account', cookie)).status, 200);

      const del = await request(`/api/team-members/${temp.id}`, adminCookie, 'DELETE');
      assert.equal(del.status, 200);
      assertBouncedToLogin(await request('/settings/account', cookie), 'sau khi xoá');
    });

    test('khách (guest) vẫn bị chặn ghi như cũ', async () => {
      const { status, cookie } = await login(guest.email);
      assert.equal(status, 200);
      const res = await request('/api/team-members', cookie, 'POST');
      assert.equal(res.status, 403);
    });
  });
});
