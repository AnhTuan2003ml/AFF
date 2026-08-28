import { readFileSync } from "node:fs";
import path from "node:path";
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

  /**
   * Gửi email chào mừng đối tác KOL/KOC (HTML có logo, đẹp) kèm file PDF hợp đồng
   * admin đã đính kèm, sau khi hồ sơ được duyệt. Không có SMTP (dev) thì chỉ log.
   */
  async sendKolContract(params: {
    to: string;
    fullName: string;
    partnerCode: string;
    email: string;
    phone: string;
    approvedAt: Date;
    pdf: Buffer;
  }): Promise<void> {
    const subject = `Chúc mừng! Bạn đã trở thành Đối tác KOL/KOC ${this.config.APP_NAME}`;
    if (!this.transporter) {
      if (this.config.NODE_ENV !== "production") {
        console.info(
          `[EMAIL DEV] ${params.to} | ${subject} | PDF ${params.pdf.length} bytes`,
        );
      }
      return;
    }

    const vn = new Date(params.approvedAt.getTime() + 7 * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const approvedStr = `${pad(vn.getUTCDate())}/${pad(vn.getUTCMonth() + 1)}/${vn.getUTCFullYear()}`;
    const supportEmail =
      this.config.SUPPORT_EMAIL || this.config.SMTP_FROM_EMAIL;
    const website = this.config.APP_ORIGIN;

    // Logo nhúng theo CID để hiện cả khi client chặn ảnh ngoài.
    const attachments: nodemailer.SendMailOptions["attachments"] = [
      {
        filename: "Hop-dong-hop-tac-KOL-KOC-ShopTik.pdf",
        content: params.pdf,
        contentType: "application/pdf",
      },
    ];
    let logoTag = "";
    try {
      const logo = readFileSync(
        path.join(process.cwd(), "public", "images", "shoptik_logo_120x120.png"),
      );
      attachments.push({
        filename: "shoptik-logo.png",
        content: logo,
        cid: "shoptik-logo",
        contentDisposition: "inline",
      });
      logoTag = `<img src="cid:shoptik-logo" width="64" height="64" alt="ShopTik" style="display:block;border-radius:14px">`;
    } catch {
      logoTag = `<div style="font-size:22px;font-weight:800;color:#fff">${escapeHtml(this.config.APP_NAME)}</div>`;
    }

    const html = this.renderKolApprovalHtml({
      logoTag,
      fullName: params.fullName,
      partnerCode: params.partnerCode,
      email: params.email,
      phone: params.phone,
      approvedStr,
      supportEmail,
      website,
    });

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
        `Chúc mừng! Hồ sơ đăng ký của bạn đã được ${this.config.APP_NAME} phê duyệt. Tài khoản của bạn đã chính thức trở thành Đối tác KOC/KOL.`,
        "",
        "Thông tin đối tác:",
        `- Họ và tên: ${params.fullName}`,
        `- Mã đối tác: ${params.partnerCode}`,
        `- Email: ${params.email}`,
        `- Số điện thoại: ${params.phone}`,
        `- Ngày được phê duyệt: ${approvedStr}`,
        `- Trạng thái: Đối tác chính thức`,
        "",
        "Bản hợp đồng hợp tác (PDF) được đính kèm trong email này. Vui lòng lưu lại.",
        "",
        `Trân trọng, Đội ngũ ${this.config.APP_NAME}.`,
        `Hỗ trợ: ${supportEmail} · ${website}`,
      ].join("\n"),
      html,
      attachments,
    });
  }

  /** Dựng HTML email chào mừng đối tác (bố cục bảng, an toàn cho email client). */
  private renderKolApprovalHtml(p: {
    logoTag: string;
    fullName: string;
    partnerCode: string;
    email: string;
    phone: string;
    approvedStr: string;
    supportEmail: string;
    website: string;
  }): string {
    const brand = "#ee4d2d";
    const ink = "#2c1d17";
    const muted = "#6b5a4e";
    const appName = escapeHtml(this.config.APP_NAME);
    const infoRow = (label: string, value: string) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid #f0e9df;font-size:13px;color:${muted};width:44%">${label}</td>
        <td style="padding:9px 0;border-bottom:1px solid #f0e9df;font-size:13.5px;font-weight:700;color:${ink}">${value}</td>
      </tr>`;
    const benefit = (t: string) => `
      <tr><td style="padding:5px 0;font-size:13.5px;color:#3a302a;line-height:1.5">
        <span style="color:${brand};font-weight:800">✓</span>&nbsp; ${t}
      </td></tr>`;
    const note = (t: string) => `
      <tr><td style="padding:5px 0;font-size:13px;color:${muted};line-height:1.55">• ${t}</td></tr>`;

    return `
<div style="background:#f6f1ea;padding:24px 12px;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #eadfce">
    <tr>
      <td style="background:${brand};padding:26px 28px;text-align:center">
        <div style="display:inline-block;margin-bottom:8px">${p.logoTag}</div>
        <div style="color:#fff;font-size:19px;font-weight:800;letter-spacing:.2px">Chúc mừng bạn trở thành Đối tác KOC/KOL!</div>
      </td>
    </tr>
    <tr>
      <td style="padding:26px 28px 6px">
        <p style="margin:0 0 12px;font-size:15px;color:${ink}">Chào <b>${escapeHtml(p.fullName)}</b>,</p>
        <p style="margin:0 0 14px;font-size:14px;color:#3a302a;line-height:1.65">
          ${appName} xin thông báo hồ sơ đăng ký của bạn đã được <b>xác minh và phê duyệt thành công</b>.
          Tài khoản của bạn hiện đã chính thức được kích hoạt với tư cách <b>Đối tác KOC/KOL ${appName}</b>.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:6px 28px 8px">
        <div style="font-size:12px;font-weight:800;color:${brand};letter-spacing:.08em;margin-bottom:6px">THÔNG TIN ĐỐI TÁC</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${infoRow("Họ và tên", escapeHtml(p.fullName))}
          ${infoRow("Mã đối tác", escapeHtml(p.partnerCode))}
          ${infoRow("Email", escapeHtml(p.email))}
          ${infoRow("Số điện thoại", escapeHtml(p.phone))}
          ${infoRow("Ngày được phê duyệt", p.approvedStr)}
          ${infoRow("Trạng thái", '<span style="color:' + brand + '">Đối tác chính thức</span>')}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 28px 6px">
        <div style="font-size:12px;font-weight:800;color:${brand};letter-spacing:.08em;margin-bottom:4px">QUYỀN LỢI DÀNH CHO ĐỐI TÁC</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${benefit("Tham gia các chiến dịch tiếp thị liên kết phù hợp.")}
          ${benefit("Tạo và sử dụng link giới thiệu/affiliate theo chương trình.")}
          ${benefit("Theo dõi lượt truy cập, đơn hàng và hiệu quả giới thiệu.")}
          ${benefit("Theo dõi hoa hồng phát sinh từ hoạt động của mình.")}
          ${benefit("Nhận các chương trình, chính sách và quyền lợi riêng cho đối tác.")}
          ${benefit("Nhận hỗ trợ từ đội ngũ " + appName + " trong quá trình hợp tác.")}
        </table>
        <p style="margin:10px 0 0;font-size:12.5px;color:${muted};line-height:1.55">
          Hoa hồng và điều kiện ghi nhận áp dụng theo chính sách của từng chiến dịch và được hiển thị trên hệ thống ${appName}.
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:12px 28px 8px">
        <div style="background:#fff7ef;border:1px solid #ffe0c2;border-radius:12px;padding:14px 16px">
          <div style="font-size:12px;font-weight:800;color:${brand};margin-bottom:6px">LƯU Ý DÀNH CHO ĐỐI TÁC</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${note("Tuân thủ điều khoản đối tác, chính sách nội dung và quy định của " + appName + " cùng các nền tảng bạn sử dụng để quảng bá.")}
            ${note("Không tạo đơn ảo, traffic giả, tự tạo giao dịch bất thường hay gian lận để phát sinh hoa hồng không hợp lệ.")}
            ${note(appName + " KHÔNG BAO GIỜ yêu cầu bạn cung cấp mật khẩu hoặc mã OTP qua email, tin nhắn hoặc cuộc gọi.")}
          </table>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px 6px">
        <p style="margin:0 0 4px;font-size:13.5px;color:#3a302a;line-height:1.6">
          Bản <b>hợp đồng hợp tác</b> được đính kèm email này ở định dạng <b>PDF</b> — vui lòng lưu lại để đối chiếu khi cần.
        </p>
        <p style="margin:8px 0 0;font-size:13.5px;color:#3a302a;line-height:1.6">
          Chào mừng bạn chính thức là một phần của cộng đồng đối tác ${appName}. Chúc bạn thật nhiều chiến dịch thành công!
        </p>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px 24px;border-top:1px solid #f0e9df;margin-top:8px">
        <div style="font-size:13.5px;font-weight:800;color:${ink}">Đội ngũ ${appName}</div>
        <div style="font-size:12px;color:${muted};margin-top:2px">Nền tảng tiếp thị liên kết &amp; hoàn tiền</div>
        <div style="font-size:12px;color:${muted};margin-top:8px">
          Hỗ trợ: <a href="mailto:${p.supportEmail}" style="color:${brand};text-decoration:none">${escapeHtml(p.supportEmail)}</a>
          &nbsp;·&nbsp;
          <a href="${escapeHtml(p.website)}" style="color:${brand};text-decoration:none">${escapeHtml(p.website)}</a>
        </div>
      </td>
    </tr>
  </table>
</div>`;
  }
}
