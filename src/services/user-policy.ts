import type { AppConfig } from "../config.js";
import type { Database, Transaction } from "../db.js";
import { formatVnd } from "../lib/format.js";
import { getBusinessConfig } from "./business-config.js";

/**
 * Bộ chính sách người dùng — NGUỒN DUY NHẤT.
 *
 * Cùng nội dung này được dùng cho ba nơi, không chép lại ở đâu khác:
 *   1. Trang công khai `/chinh-sach-nguoi-dung`.
 *   2. Modal đọc nhanh mở từ hyperlink ở chân trang.
 *   3. Email gửi cho người dùng ngay khi đăng ký.
 *
 * Các con số (tỷ lệ hoàn, số ngày giữ tiền, hạn mức rút…) KHÔNG viết cứng mà
 * lấy từ cấu hình nghiệp vụ đang có hiệu lực, để chính sách hiển thị luôn khớp
 * với cách hệ thống thực sự tính tiền.
 *
 * Khi sửa nội dung có ảnh hưởng tới quyền lợi người dùng, hãy tăng
 * USER_POLICY_VERSION để bản ghi đồng ý và email mới phản ánh đúng phiên bản.
 */
export const USER_POLICY_VERSION = "2026.08";

export const USER_POLICY_PATH = "/chinh-sach-nguoi-dung";

export interface UserPolicyFacts {
  appName: string;
  appOrigin: string;
  buyerCashbackPercent: number;
  cashbackHoldDays: number;
  affiliateAttributionDays: number;
  minWithdrawAmountVnd: number;
  communityZaloUrl?: string | undefined;
}

/**
 * Lấy các con số đang có hiệu lực để chính sách hiển thị đúng cách hệ thống
 * thực sự tính tiền (cấu hình nghiệp vụ trong DB, không phải hằng số trong code).
 */
export async function loadUserPolicyFacts(
  db: Database | Transaction,
  config: AppConfig,
): Promise<UserPolicyFacts> {
  const business = await getBusinessConfig(db, config);
  return {
    appName: config.APP_NAME,
    appOrigin: config.APP_ORIGIN,
    buyerCashbackPercent: business.buyerCashbackPercent,
    cashbackHoldDays: business.cashbackHoldDays,
    affiliateAttributionDays: business.affiliateAttributionDays,
    minWithdrawAmountVnd: business.minWithdrawAmountVnd,
    communityZaloUrl: config.COMMUNITY_ZALO_URL || undefined,
  };
}

export interface UserPolicySection {
  id: string;
  heading: string;
  paragraphs: string[];
  items: string[];
}

export interface UserPolicyDocument {
  version: string;
  title: string;
  lead: string;
  url: string;
  sections: UserPolicySection[];
}

function section(
  id: string,
  heading: string,
  paragraphs: string[],
  items: string[] = [],
): UserPolicySection {
  return { id, heading, paragraphs, items };
}

export function buildUserPolicy(facts: UserPolicyFacts): UserPolicyDocument {
  const app = facts.appName;
  const hold = facts.cashbackHoldDays;
  const holdText =
    hold > 0
      ? "Hoàn thành: tiền hoàn vào ví CHỜ và được giữ thêm " +
        `${hold} ngày kể từ ngày sàn ghi nhận đơn Hoàn thành, sau đó mới ` +
        "chuyển sang số dư KHẢ DỤNG để rút. Khoảng chờ này để phòng trường " +
        "hợp sàn thu hồi hoa hồng do khách trả hàng."
      : "Hoàn thành: tiền hoàn chuyển thẳng sang số dư KHẢ DỤNG ngay khi sàn " +
        "ghi nhận đơn Hoàn thành, không có thời gian chờ.";

  return {
    version: USER_POLICY_VERSION,
    title: "Chính sách người dùng",
    url: `${facts.appOrigin.replace(/\/+$/, "")}${USER_POLICY_PATH}`,
    lead:
      `${app} là nền tảng hoàn tiền mua sắm qua liên kết Affiliate của Shopee, ` +
      "TikTok Shop và Lazada. Chính sách này nói rõ bạn được gì, cần làm gì để " +
      "đơn được ghi nhận, tiền hoàn về ví theo trình tự nào và khi nào bạn có " +
      "thể rút. Hãy đọc trước khi mua đơn đầu tiên.",
    sections: [
      section(
        "dich-vu",
        "1. Dịch vụ này làm gì và không làm gì",
        [
          `${app} tạo đường dẫn Affiliate riêng cho bạn, ghi nhận lượt bấm mua, ` +
            "đối soát đơn từ báo cáo của sàn rồi chia lại phần hoa hồng nhận được.",
          `${app} KHÔNG bán hàng, không giữ hàng, không giao hàng và không quyết ` +
            "định trạng thái đơn. Giá, khuyến mãi, vận chuyển, đổi trả và bảo hành " +
            "hoàn toàn thuộc về người bán và sàn thương mại điện tử.",
        ],
      ),
      section(
        "tai-khoan",
        "2. Tài khoản của bạn",
        [
          "Mỗi người chỉ được dùng một tài khoản, đăng ký bằng email đang hoạt " +
            "động và xác nhận bằng mã OTP 6 số gửi tới chính email đó.",
        ],
        [
          "Thông tin họ tên phải trùng với chủ tài khoản ngân hàng dùng để nhận tiền.",
          "Bạn tự chịu trách nhiệm bảo mật mật khẩu và mã OTP. " +
            `${app} không bao giờ hỏi mật khẩu, mã PIN hay OTP ngân hàng của bạn.`,
          "Tài khoản có dấu hiệu mạo danh, dùng chung hoặc mua bán sẽ bị tạm khóa " +
            "để xác minh.",
        ],
      ),
      section(
        "ghi-nhan-don",
        "3. Điều kiện để đơn được ghi nhận",
        [
          `Đơn chỉ được tính hoàn tiền khi bạn bấm nút Mua ngay trên ${app} và hoàn ` +
            "tất thanh toán trong phiên mua mở ra từ liên kết đó. Liên kết mang mã " +
            "theo dõi riêng của bạn; sàn dựa vào mã này để báo lại đơn.",
        ],
        [
          "Không đóng ứng dụng sàn rồi mở lại bằng đường dẫn khác trước khi đặt hàng.",
          "Không dùng thêm liên kết hoàn tiền, mã tiếp thị hay tiện ích trình duyệt " +
            "khác trong cùng lượt mua — lượt sau sẽ ghi đè lượt trước.",
          `Lượt bấm mua có hiệu lực đối soát trong ${facts.affiliateAttributionDays} ` +
            "ngày; quá hạn mà đơn chưa về, hệ thống ngừng chờ đơn đó.",
          "Đơn mua bằng cách thêm sản phẩm vào giỏ từ trước, mua trong livestream " +
            "của người bán hoặc qua liên kết của bên thứ ba có thể không được sàn báo về.",
        ],
      ),
      section(
        "tinh-tien",
        "4. Tiền hoàn được tính thế nào",
        [
          `Sàn trả hoa hồng cho ${app} sau khi đơn hợp lệ. Bạn nhận ` +
            `${facts.buyerCashbackPercent}% phần hoa hồng thực nhận của đơn đó; phần ` +
            "còn lại dùng để vận hành nền tảng.",
          "Số tiền hiển thị trước khi mua là DỰ KIẾN, tính theo tỷ lệ hoa hồng sàn " +
            "công bố tại thời điểm xem. Số tiền cuối cùng lấy theo hoa hồng thực tế " +
            "trong báo cáo của sàn và có thể thấp hơn dự kiến khi bạn dùng thêm mã " +
            "giảm giá, hoàn một phần đơn hoặc sàn điều chỉnh tỷ lệ.",
          "Mọi khoản ghi nhận đều bằng số nguyên đồng, làm tròn xuống, và được lưu " +
            "bằng bút toán kép để bạn đối chiếu được từng đồng trong mục Số dư.",
        ],
      ),
      section(
        "trang-thai",
        "5. Trạng thái đơn và thời điểm tiền về ví",
        [
          "Ngay khi bấm Mua ngay, đơn xuất hiện trong Lịch sử đơn ở trạng thái " +
            "Chờ sàn xác nhận. Hệ thống định kỳ đối soát lại với báo cáo của sàn và " +
            "cập nhật theo trạng thái sàn trả về.",
        ],
        [
          "Đang duyệt: sàn chưa chốt đơn. Hệ thống tiếp tục hỏi lại ở các lượt sau.",
          holdText,
          "Đã hủy: đơn bị hủy, trả hàng hoặc bị sàn từ chối. Khoản hoàn tương ứng bị " +
            "đảo lại và bạn thấy lý do ngay trong lịch sử đơn.",
          "Nếu sàn sửa hoa hồng khi đơn còn chờ, hệ thống đảo khoản cũ và ghi khoản " +
            "mới theo đúng số sàn chốt.",
        ],
      ),
      section(
        "rut-tien",
        "6. Rút tiền",
        [
          `Bạn rút từ số dư khả dụng về tài khoản ngân hàng chính chủ đã xác minh, ` +
            `tối thiểu ${formatVnd(facts.minWithdrawAmountVnd)} mỗi lần.`,
        ],
        [
          "Số tài khoản và tên chủ tài khoản được mã hóa khi lưu; giao diện chỉ hiển " +
            "thị dạng đã che.",
          "Yêu cầu rút được kiểm tra rủi ro trước khi chuyển tiền; yêu cầu nghi vấn " +
            "có thể bị tạm dừng để xác minh bổ sung.",
          "Sai thông tin ngân hàng do bạn nhập dẫn tới chuyển nhầm là trách nhiệm của " +
            "bạn; hãy kiểm tra kỹ trước khi xác nhận.",
        ],
      ),
      section(
        "gioi-thieu",
        "7. Giới thiệu và nhiệm vụ",
        [
          "Bạn có thể mời bạn bè bằng mã giới thiệu riêng. Thưởng giới thiệu và " +
            "thưởng nhiệm vụ chỉ được ghi nhận khi điều kiện tương ứng hoàn tất và " +
            "đơn liên quan đã được sàn xác nhận.",
          "Tự mời chính mình, tạo tài khoản ảo hoặc mời hàng loạt bằng công cụ tự động " +
            "sẽ bị thu hồi toàn bộ phần thưởng.",
        ],
      ),
      section(
        "hanh-vi-cam",
        "8. Hành vi không được phép",
        [
          "Các hành vi dưới đây làm sai lệch đối soát và có thể dẫn tới thu hồi tiền " +
            "hoàn, khóa tài khoản hoặc từ chối yêu cầu rút:",
        ],
        [
          "Tạo đơn giả, đặt rồi hủy hàng loạt, mua hộ để hưởng hoàn tiền chênh lệch.",
          "Dùng công cụ tự động bấm liên kết, làm giả lượt click hoặc can thiệp tham số " +
            "theo dõi.",
          "Dùng danh tính, email hoặc tài khoản ngân hàng của người khác.",
          "Khai thác lỗi hệ thống thay vì báo cho bộ phận hỗ trợ.",
        ],
      ),
      section(
        "du-lieu",
        "9. Dữ liệu cá nhân",
        [
          `${app} chỉ thu thập dữ liệu cần thiết để xác thực tài khoản, ghi nhận đơn, ` +
            "tính hoàn tiền, chuyển tiền và chống gian lận. Mật khẩu được băm một " +
            "chiều, dữ liệu ngân hàng được mã hóa, OTP không lưu ở dạng rõ.",
          "Chi tiết về loại dữ liệu, cách chia sẻ với đối tác và quyền của bạn được " +
            "nêu trong Chính sách quyền riêng tư. Dữ liệu giao dịch và kiểm toán phải " +
            "được lưu theo nghĩa vụ pháp lý kể cả khi bạn yêu cầu xóa tài khoản.",
        ],
      ),
      section(
        "khieu-nai",
        "10. Khiếu nại và hỗ trợ",
        [
          "Nếu đơn đã mua đúng liên kết mà sau 72 giờ vẫn chưa xuất hiện, hãy gửi yêu " +
            "cầu trong mục Hỗ trợ kèm mã đơn của sàn và thời điểm đặt hàng. Khiếu nại " +
            "về một đơn cần được gửi trong vòng 30 ngày kể từ ngày đặt.",
          facts.communityZaloUrl
            ? `Bạn cũng có thể liên hệ qua nhóm cộng đồng chính thức: ${facts.communityZaloUrl}.`
            : "Mọi liên hệ chính thức đều đi qua mục Hỗ trợ sau khi đăng nhập.",
        ],
      ),
      section(
        "thay-doi",
        "11. Thay đổi chính sách",
        [
          "Chính sách có thể được cập nhật khi sàn đổi cơ chế hoa hồng hoặc khi quy " +
            "định pháp luật thay đổi. Bản mới nhất luôn nằm tại đường dẫn chính sách " +
            "ở chân trang, kèm số phiên bản. Thay đổi ảnh hưởng tới quyền lợi sẽ được " +
            "thông báo trước khi áp dụng cho các đơn phát sinh sau đó.",
          "Các đơn đã phát sinh trước thời điểm áp dụng vẫn được tính theo chính sách " +
            "có hiệu lực lúc đặt hàng.",
        ],
      ),
    ],
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Dựng email chính sách gửi ngay sau khi người dùng đăng ký. Toàn bộ nội dung
 * lấy từ buildUserPolicy nên email và trang web không bao giờ lệch nhau.
 */
export function renderUserPolicyEmail(params: {
  fullName: string;
  facts: UserPolicyFacts;
}): RenderedEmail {
  const policy = buildUserPolicy(params.facts);
  const app = params.facts.appName;
  const greetName = params.fullName.trim() || "bạn";

  const textLines = [
    `Chào ${greetName},`,
    "",
    `Cảm ơn bạn đã đăng ký ${app}. Đây là bộ chính sách người dùng đang có hiệu lực (phiên bản ${policy.version}).`,
    "",
  ];
  for (const item of policy.sections) {
    textLines.push(item.heading);
    for (const paragraph of item.paragraphs) textLines.push(paragraph);
    for (const bullet of item.items) textLines.push(`- ${bullet}`);
    textLines.push("");
  }
  textLines.push(
    `Xem bản đầy đủ và mới nhất: ${policy.url}`,
    "",
    `${app} không bao giờ hỏi mật khẩu, mã PIN hay OTP ngân hàng của bạn.`,
  );

  const sectionsHtml = policy.sections
    .map((item) => {
      const paragraphs = item.paragraphs
        .map(
          (paragraph) =>
            `<p style="margin:0 0 10px;line-height:1.6">${escapeHtml(paragraph)}</p>`,
        )
        .join("");
      const bullets = item.items.length
        ? `<ul style="margin:0 0 10px;padding-left:20px;line-height:1.6">${item.items
            .map((bullet) => `<li style="margin:0 0 6px">${escapeHtml(bullet)}</li>`)
            .join("")}</ul>`
        : "";
      return `<h2 style="font-size:16px;margin:22px 0 8px;color:#0f2e26">${escapeHtml(
        item.heading,
      )}</h2>${paragraphs}${bullets}`;
    })
    .join("");

  return {
    subject: `Chính sách người dùng ${app} (phiên bản ${policy.version})`,
    text: textLines.join("\n"),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#163333;font-size:14px">
        <h1 style="font-size:22px;margin:0 0 6px">${escapeHtml(policy.title)}</h1>
        <p style="margin:0 0 18px;color:#5f6f6c">Phiên bản ${escapeHtml(policy.version)}</p>
        <p style="line-height:1.6">Chào ${escapeHtml(greetName)}, cảm ơn bạn đã đăng ký ${escapeHtml(app)}.</p>
        <p style="line-height:1.6">${escapeHtml(policy.lead)}</p>
        ${sectionsHtml}
        <p style="margin:24px 0 8px">
          <a href="${escapeHtml(policy.url)}" style="background:#ee4d2d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">Xem bản mới nhất</a>
        </p>
        <p style="color:#5f6f6c;line-height:1.6">${escapeHtml(app)} không bao giờ hỏi mật khẩu, mã PIN hay OTP ngân hàng của bạn.</p>
      </div>
    `,
  };
}
