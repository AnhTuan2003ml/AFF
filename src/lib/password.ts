import argon2 from "argon2";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Mật khẩu cần ít nhất 10 ký tự.")
  .max(128, "Mật khẩu quá dài.")
  .regex(/[a-z]/, "Mật khẩu cần có chữ thường.")
  .regex(/[A-Z]/, "Mật khẩu cần có chữ hoa.")
  .regex(/[0-9]/, "Mật khẩu cần có chữ số.");

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
    hashLength: 32,
  });
}

export async function verifyPassword(
  hash: string,
  password: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
