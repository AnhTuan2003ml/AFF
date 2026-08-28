import type { FastifyInstance } from "fastify";
import { requireApiUser } from "../../auth/guards.js";
import {
  getKolFile,
  getUserKolApplication,
  getUserKolStatus,
  submitKolApplication,
  type KolFileKind,
} from "../../services/kol-application.js";
import {
  KOL_AGREEMENT_SECTIONS,
  KOL_AGREEMENT_VERSION,
} from "../../services/kol-agreement.js";
import {
  multipartBuffer,
  sniffMime,
  toDisplayableImage,
} from "../../services/kyc-upload.js";
import type { ApiDeps } from "./deps.js";

/**
 * Đăng ký KOL/KOC cho app di động — vỏ JSON/multipart mỏng gọi lại đúng service
 * mà web dùng (submitKolApplication), không chép logic. Ảnh CCCD từ iPhone
 * (HEIC) được chuyển sang JPEG trước khi lưu, giống web.
 */
export async function registerKolApiRoutes(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  // Điều khoản để app hiển thị ở bước 1 (không cần bundle vào app).
  app.get("/kol/terms", { preHandler: requireApiUser }, async () => ({
    version: KOL_AGREEMENT_VERSION,
    sections: KOL_AGREEMENT_SECTIONS,
  }));

  // Trạng thái hồ sơ hiện tại của người dùng.
  app.get("/kol/status", { preHandler: requireApiUser }, async (request) => {
    const kol = await getUserKolStatus(deps.db, request.currentUser!.id);
    return { status: kol.status };
  });

  // Hồ sơ của chính người dùng (để app hiện lại thông tin sau khi được duyệt).
  app.get("/kol/me", { preHandler: requireApiUser }, async (request) => {
    const a = await getUserKolApplication(deps.db, request.currentUser!.id);
    if (!a) return { status: null, application: null };
    return {
      status: a.status,
      application: {
        fullName: a.full_name,
        cccdNumber: a.cccd_number,
        birthDate: a.birth_date,
        cccdIssue: a.cccd_issue,
        phone: a.phone,
        email: a.email,
        address: a.address,
        bankAccount: a.bank_account,
        bankName: a.bank_name,
        hasContract: a.has_contract,
      },
    };
  });

  // Xem file KYC/hợp đồng của chính người dùng (bearer).
  app.get<{ Params: { kind: string } }>(
    "/kol/file/:kind",
    { preHandler: requireApiUser },
    async (request, reply) => {
      const kind = request.params.kind.toUpperCase();
      if (
        !["CCCD_FRONT", "CCCD_BACK", "FACE_VIDEO", "CONTRACT_PDF"].includes(kind)
      ) {
        return reply.code(404).send("Không tìm thấy.");
      }
      const a = await getUserKolApplication(deps.db, request.currentUser!.id);
      if (!a) return reply.code(404).send("Không tìm thấy hồ sơ.");
      const file = await getKolFile(deps.db, a.id, kind as KolFileKind);
      if (!file) return reply.code(404).send("Không tìm thấy file.");
      reply.header("content-type", file.contentType);
      reply.header("cache-control", "private, no-store");
      return reply.send(file.content);
    },
  );

  // Nộp hồ sơ + KYC (multipart: cccdFront, cccdBack, faceVideo + các field text).
  app.post("/kol/apply", { preHandler: requireApiUser }, async (request) => {
    const body = request.body as Record<string, unknown>;
    const str = (k: string): string | undefined => {
      const v = body[k];
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };
    // Ngày cấp + Nơi cấp và Chủ TK + Ngân hàng nhập tách rời, lưu gộp (khớp web).
    const join = (a?: string, b?: string, sep = " · "): string | undefined => {
      const parts = [a, b].filter(Boolean) as string[];
      return parts.length ? parts.join(sep) : undefined;
    };

    const fileDefs = [
      { kind: "CCCD_FRONT" as const, field: "cccdFront", isImage: true },
      { kind: "CCCD_BACK" as const, field: "cccdBack", isImage: true },
      { kind: "FACE_VIDEO" as const, field: "faceVideo", isImage: false },
    ];
    const files: {
      kind: "CCCD_FRONT" | "CCCD_BACK" | "FACE_VIDEO";
      contentType: string;
      buffer: Buffer;
    }[] = [];
    for (const f of fileDefs) {
      const buf = multipartBuffer(body[f.field]);
      if (!buf) continue;
      const mime = sniffMime(buf);
      if (f.isImage) {
        const img = await toDisplayableImage(buf, mime);
        files.push({
          kind: f.kind,
          contentType: img.contentType,
          buffer: img.buffer,
        });
      } else {
        files.push({ kind: f.kind, contentType: mime, buffer: buf });
      }
    }

    await submitKolApplication(
      deps.db,
      request.currentUser!.id,
      {
        fullName: str("fullName") ?? "",
        birthDate: str("birthDate"),
        cccdNumber: str("cccdNumber") ?? "",
        cccdIssue: join(str("cccdIssueDate"), str("cccdIssuePlace")),
        address: str("address"),
        phone: str("phone") ?? "",
        email: str("email"),
        taxCode: str("taxCode"),
        bankAccount: str("bankAccount"),
        bankName: join(str("bankHolder"), str("bankName"), " - "),
        socialLinks: str("socialLinks"),
        agreementVersion: KOL_AGREEMENT_VERSION,
      },
      files,
    );
    return { ok: true };
  });
}
