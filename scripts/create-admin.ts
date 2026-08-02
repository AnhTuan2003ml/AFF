import { loadConfig } from "../src/config.js";
import { createDatabase, query } from "../src/db.js";
import {
  normalizeEmail,
  randomReferralCode,
} from "../src/lib/crypto.js";
import { passwordSchema, hashPassword } from "../src/lib/password.js";

const config = loadConfig();
const db = createDatabase(config);

async function run(): Promise<void> {
  const emailInput = process.argv[2];
  const passwordInput = process.env.ADMIN_INITIAL_PASSWORD;
  if (!emailInput) {
    throw new Error(
      "Cách dùng: ADMIN_INITIAL_PASSWORD='...' npm run admin:create -- admin@example.com",
    );
  }
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email quản trị không hợp lệ.");
  }
  const password = passwordSchema.parse(passwordInput);
  const passwordHash = await hashPassword(password);
  const fullName = process.env.ADMIN_FULL_NAME?.trim() || "Quản trị ShopTik";

  const result = await query<{ id: string }>(
    db,
    `
      INSERT INTO users (
        email, full_name, password_hash, status, role,
        email_verified_at, referral_code, password_changed_at
      ) VALUES (
        $1, $2, $3, 'ACTIVE', 'ADMIN', now(), $4, now()
      )
      ON CONFLICT (lower(email))
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        password_hash = EXCLUDED.password_hash,
        status = 'ACTIVE',
        role = 'ADMIN',
        email_verified_at = COALESCE(users.email_verified_at, now()),
        password_changed_at = now()
      RETURNING id
    `,
    [email, fullName, passwordHash, randomReferralCode()],
  );
  await query(
    db,
    `
      INSERT INTO auth_identities (user_id, provider, provider_subject)
      VALUES ($1, 'EMAIL', $2)
      ON CONFLICT (provider, provider_subject) DO NOTHING
    `,
    [result.rows[0]!.id, email],
  );
  console.info(`Đã tạo/cập nhật quản trị ${email}.`);
  await db.end();
}

run().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await db.end().catch(() => undefined);
  process.exitCode = 1;
});
