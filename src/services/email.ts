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
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#163333">
          <h1 style="font-size:22px">Xác nhận ${safePurpose}</h1>
          <p>Mã xác nhận của bạn:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#edf8f2;padding:20px;border-radius:12px;text-align:center">${safeCode}</div>
          <p>Mã có hiệu lực ${params.expiresInMinutes} phút.</p>
          <p style="color:#5f6f6c">Không chia sẻ mã này với bất kỳ ai. ShopTik không bao giờ hỏi OTP ngân hàng.</p>
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
