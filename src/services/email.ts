import nodemailer, { type Transporter } from "nodemailer";
import type { AppConfig } from "../config.js";
import {
  renderUserPolicyEmail,
  type UserPolicyFacts,
} from "./user-policy.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export class EmailService {
  private readonly transporter: Transporter | null;

  constructor(private readonly config: AppConfig) {
    this.transporter =
      config.EMAIL_MODE === "smtp"
        ? nodemailer.createTransport({
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            secure: config.SMTP_SECURE,
            auth: {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            },
            connectionTimeout: 8_000,
            greetingTimeout: 8_000,
            socketTimeout: 10_000,
          })
        : null;
  }

  async sendOtp(params: {
    to: string;
    code: string;
    purposeLabel: string;
    expiresInMinutes: number;
  }): Promise<void> {
    if (!this.transporter) {
      if (this.config.NODE_ENV !== "production") {
        console.info(
          `[EMAIL DEV] ${params.to} | ${params.purposeLabel} | OTP ${params.code}`,
        );
      }
      return;
    }

    const subject = `${params.code} là mã xác nhận ${this.config.APP_NAME}`;
    const safePurpose = escapeHtml(params.purposeLabel);
    const safeCode = escapeHtml(params.code);
    await this.transporter.sendMail({
      from: {
        name: this.config.SMTP_FROM_NAME,
        address: this.config.SMTP_FROM_EMAIL,
      },
      to: params.to,
      subject,
      text: [
        `Mã xác nhận: ${params.code}`,
        `Mục đích: ${params.purposeLabel}`,
        `Mã có hiệu lực ${params.expiresInMinutes} phút.`,
        "Không chia sẻ mã này với bất kỳ ai. ShopTik không bao giờ hỏi OTP ngân hàng.",
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f2544">
          <h1 style="font-size:22px">Xác nhận ${safePurpose}</h1>
          <p>Mã xác nhận của bạn:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#eef4ff;padding:20px;border-radius:12px;text-align:center">${safeCode}</div>
          <p>Mã có hiệu lực ${params.expiresInMinutes} phút.</p>
          <p style="color:#5b6b85">Không chia sẻ mã này với bất kỳ ai. ShopTik không bao giờ hỏi OTP ngân hàng.</p>
        </div>
      `,
    });
  }

  /**
   * Báo cho khách khi đội CSKH phản hồi: nhắc lại vấn đề họ hỏi và nội dung
   * trả lời, kèm link mở trang Hỗ trợ để trao đổi tiếp.
   */
  async sendSupportReply(params: {
    to: string;
    fullName: string;
    /** Tin nhắn/yêu cầu gần nhất của khách (có thể trống). */
    question: string;
    reply: string;
  }): Promise<void> {
    const subject = `${this.config.APP_NAME} — Đội hỗ trợ đã phản hồi bạn`;
    if (!this.transporter) {
      if (this.config.NODE_ENV !== "production") {
        console.info(`[EMAIL DEV] ${params.to} | ${subject}`);
      }
      return;
    }

    const supportUrl = `${this.config.APP_ORIGIN}/app/support`;
    const safeName = escapeHtml(params.fullName);
    const safeQuestion = escapeHtml(params.question);
    const safeReply = escapeHtml(params.reply);
    await this.transporter.sendMail({
      from: {
        name: this.config.SMTP_FROM_NAME,
        address: this.config.SMTP_FROM_EMAIL,
      },
      to: params.to,
      subject,
      text: [
        `Chào ${params.fullName},`,
        "",
        ...(params.question
          ? ["Vấn đề bạn gửi:", params.question, ""]
          : []),
        "Phản hồi của đội hỗ trợ:",
        params.reply,
        "",
        `Xem và trả lời tại: ${supportUrl}`,
      ].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f2544">
          <h1 style="font-size:20px">Đội hỗ trợ đã phản hồi bạn</h1>
          <p>Chào ${safeName},</p>
          ${
            params.question
              ? `<p style="margin-bottom:4px;color:#5b6b85">Vấn đề bạn gửi:</p>
          <div style="background:#f1f5f9;padding:14px 16px;border-radius:10px;white-space:pre-wrap">${safeQuestion}</div>`
              : ""
          }
          <p style="margin-bottom:4px;color:#5b6b85">Phản hồi của đội hỗ trợ:</p>
          <div style="background:#eef4ff;padding:14px 16px;border-radius:10px;white-space:pre-wrap">${safeReply}</div>
          <p style="margin-top:20px"><a href="${supportUrl}" style="color:#002d9c">Mở trang Hỗ trợ để trao đổi tiếp</a></p>
        </div>
      `,
    });
  }

  /**
   * Gửi bộ chính sách người dùng ngay khi tài khoản được đăng ký. Nội dung lấy
   * từ src/services/user-policy.ts — cùng nguồn với trang /chinh-sach-nguoi-dung.
   */
  async sendUserPolicy(params: {
    to: string;
    fullName: string;
    facts: UserPolicyFacts;
  }): Promise<void> {
    const mail = renderUserPolicyEmail({
      fullName: params.fullName,
      facts: params.facts,
    });

    if (!this.transporter) {
      if (this.config.NODE_ENV !== "production") {
        console.info(`[EMAIL DEV] ${params.to} | ${mail.subject}`);
      }
      return;
    }

    await this.transporter.sendMail({
      from: {
        name: this.config.SMTP_FROM_NAME,
        address: this.config.SMTP_FROM_EMAIL,
      },
      to: params.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  }
}
