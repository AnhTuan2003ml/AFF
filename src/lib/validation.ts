import type { ZodType } from "zod";
import { AppError } from "./errors.js";

export function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new AppError(
      "VALIDATION_ERROR",
      first?.message ?? "Dữ liệu chưa hợp lệ.",
      400,
      {
        field: first?.path.join(".") ?? "",
      },
    );
  }
  return result.data;
}
