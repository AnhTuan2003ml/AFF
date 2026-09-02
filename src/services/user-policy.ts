import type { AppConfig } from "../config.js";
import type { Database, Transaction } from "../db.js";
import { formatVnd } from "../lib/format.js";
import { getBusinessConfig } from "./business-config.js";

/**
 * Chính sách người dùng — nguồn duy nhất cho trang công khai, modal chân trang
 * và email đăng ký. Con số lấy từ cấu hình nghiệp vụ trong DB, không viết cứng.
 * Sửa nội dung ảnh hưởng quyền lợi thì tăng USER_POLICY_VERSION.
 */
export const USER_POLICY_VERSION = "2026.08.25";

export const USER_POLICY_PATH = "/chinh-sach-nguoi-dung";

export interface UserPolicyFacts {
  appName: string;
  appOrigin: string;
  buyerCashbackPercent: number;
  smallOrderThresholdVnd: number;
  smallOrderBuyerPercent: number;
  cashbackHoldDays: number;
  affiliateAttributionDays: number;
  minWithdrawAmountVnd: number;
  communityZaloUrl?: string | undefined;
}

export async function loadUserPolicyFacts(
  db: Database | Transaction,
  config: AppConfig,
): Promise<UserPolicyFacts> {
  const business = await getBusinessConfig(db, config);
  return {
    appName: config.APP_NAME,
    appOrigin: config.APP_ORIGIN,
    buyerCashbackPercent: business.buyerCashbackPercent,
    smallOrderThresholdVnd: business.smallOrderThresholdVnd,
    smallOrderBuyerPercent: business.smallOrderBuyerPercent,
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

export function buildUserPolicy(
  facts: UserPolicyFacts,
  lang: string = "vi",
): UserPolicyDocument {
  if (lang === "en") return buildUserPolicyEn(facts);
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
            `${facts.buyerCashbackPercent}% phần hoa hồng thực nhận của đơn đó ` +
            `(riêng đơn có giá trị từ ${facts.smallOrderThresholdVnd.toLocaleString("vi-VN")}₫ ` +
            `trở xuống: tới ${facts.smallOrderBuyerPercent}%); phần còn lại chia cho ` +
            "người giới thiệu (nếu có) và vận hành nền tảng.",
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

/** Bản tiếng Anh của chính sách người dùng — cùng cấu trúc, cùng số liệu. */
function buildUserPolicyEn(facts: UserPolicyFacts): UserPolicyDocument {
  const app = facts.appName;
  const hold = facts.cashbackHoldDays;
  const holdText =
    hold > 0
      ? "Completed: cashback goes into your PENDING wallet and is held for an " +
        `extra ${hold} days from the date the platform records the order as ` +
        "Completed, then moves to your AVAILABLE balance for withdrawal. This " +
        "wait covers cases where the platform claws back commission due to returns."
      : "Completed: cashback moves straight to your AVAILABLE balance as soon as " +
        "the platform records the order as Completed, with no waiting period.";
  const threshold = facts.smallOrderThresholdVnd.toLocaleString("vi-VN");

  return {
    version: USER_POLICY_VERSION,
    title: "User Policy",
    url: `${facts.appOrigin.replace(/\/+$/, "")}${USER_POLICY_PATH}`,
    lead:
      `${app} is a cashback platform for shopping via Shopee, TikTok Shop and ` +
      "Lazada affiliate links. This policy explains what you get, what you need " +
      "to do for an order to be tracked, how cashback flows into your wallet, and " +
      "when you can withdraw. Please read it before your first purchase.",
    sections: [
      section(
        "dich-vu",
        "1. What this service does and doesn't do",
        [
          `${app} creates a personal affiliate link for you, records your buy ` +
            "clicks, reconciles orders from the platform's reports, and shares back " +
            "the commission it receives.",
          `${app} does NOT sell, hold or ship goods, and does not decide order ` +
            "status. Pricing, promotions, shipping, returns and warranty belong " +
            "entirely to the seller and the e-commerce platform.",
        ],
      ),
      section(
        "tai-khoan",
        "2. Your account",
        [
          "Each person may use only one account, registered with an active email " +
            "and verified by a 6-digit OTP sent to that email.",
        ],
        [
          "Your full name must match the holder of the bank account used to receive money.",
          "You are responsible for keeping your password and OTP secure. " +
            `${app} will never ask for your password, PIN or bank OTP.`,
          "Accounts showing signs of impersonation, sharing or trading will be " +
            "temporarily locked for verification.",
        ],
      ),
      section(
        "ghi-nhan-don",
        "3. Conditions for an order to be tracked",
        [
          `An order only qualifies for cashback when you tap Buy now on ${app} and ` +
            "complete payment in the shopping session opened from that link. The " +
            "link carries your personal tracking code; the platform uses this code " +
            "to report the order back.",
        ],
        [
          "Don't close the platform app and reopen it via a different link before " +
            "placing the order.",
          "Don't use another cashback link, marketing code or browser extension in " +
            "the same purchase — a later click overrides the earlier one.",
          `A buy click is valid for reconciliation for ${facts.affiliateAttributionDays} ` +
            "days; past that, if the order hasn't arrived, the system stops waiting for it.",
          "Orders placed by adding the product to your cart beforehand, buying " +
            "during a seller's livestream, or via a third-party link may not be " +
            "reported by the platform.",
        ],
      ),
      section(
        "tinh-tien",
        "4. How cashback is calculated",
        [
          `The platform pays ${app} commission after a valid order. You receive ` +
            `${facts.buyerCashbackPercent}% of the actual commission for that order ` +
            `(for orders worth ${threshold}₫ or less: up to ` +
            `${facts.smallOrderBuyerPercent}%); the rest is shared with the referrer ` +
            "(if any) and platform operations.",
          "The amount shown before purchase is an ESTIMATE, based on the commission " +
            "rate the platform publishes at viewing time. The final amount follows " +
            "the actual commission in the platform's report and may be lower than " +
            "estimated if you use extra discount codes, partially refund the order, " +
            "or the platform adjusts the rate.",
          "Every recorded amount is a whole đồng, rounded down, and stored with " +
            "double-entry bookkeeping so you can reconcile every đồng in the Balance section.",
        ],
      ),
      section(
        "trang-thai",
        "5. Order status and when cashback reaches your wallet",
        [
          "As soon as you tap Buy now, the order appears in Order History as " +
            "Awaiting platform confirmation. The system periodically reconciles with " +
            "the platform's reports and updates to the status the platform returns.",
        ],
        [
          "Under review: the platform hasn't finalized the order. The system keeps " +
            "checking on later runs.",
          holdText,
          "Cancelled: the order was cancelled, returned or rejected by the platform. " +
            "The corresponding cashback is reversed and you see the reason right in " +
            "the order history.",
          "If the platform changes commission while the order is pending, the system " +
            "reverses the old entry and records a new one matching the platform's " +
            "final figure.",
        ],
      ),
      section(
        "rut-tien",
        "6. Withdrawals",
        [
          "You withdraw from your available balance to your own verified bank " +
            `account, a minimum of ${formatVnd(facts.minWithdrawAmountVnd)} per request.`,
        ],
        [
          "Account numbers and holder names are encrypted at rest; the interface " +
            "only shows a masked form.",
          "Withdrawal requests are risk-checked before money is sent; suspicious " +
            "requests may be paused for additional verification.",
          "Wrong bank details you entered leading to a misdirected transfer are your " +
            "responsibility; please check carefully before confirming.",
        ],
      ),
      section(
        "gioi-thieu",
        "7. Referrals and missions",
        [
          "You can invite friends with your personal referral code. Referral and " +
            "mission rewards are only recorded when the corresponding conditions are " +
            "met and the related order has been confirmed by the platform.",
          "Inviting yourself, creating fake accounts, or mass-inviting with automated " +
            "tools will forfeit all rewards.",
        ],
      ),
      section(
        "hanh-vi-cam",
        "8. Prohibited behavior",
        [
          "The following distort reconciliation and may lead to cashback clawback, " +
            "account lock or withdrawal refusal:",
        ],
        [
          "Creating fake orders, placing then mass-cancelling, or buying on behalf " +
            "to pocket a cashback margin.",
          "Using automated tools to click links, faking clicks, or tampering with " +
            "tracking parameters.",
          "Using another person's identity, email or bank account.",
          "Exploiting system bugs instead of reporting them to support.",
        ],
      ),
      section(
        "du-lieu",
        "9. Personal data",
        [
          `${app} only collects data needed to authenticate accounts, track orders, ` +
            "calculate cashback, transfer money and prevent fraud. Passwords are " +
            "one-way hashed, bank data is encrypted, and OTPs are not stored in plain text.",
          "Details on data types, how it's shared with partners, and your rights are " +
            "in the Privacy Policy. Transaction and audit data must be retained per " +
            "legal obligations even if you request account deletion.",
        ],
      ),
      section(
        "khieu-nai",
        "10. Complaints and support",
        [
          "If an order bought through the correct link still hasn't appeared after " +
            "72 hours, submit a request in Support with the platform order code and " +
            "the purchase time. A complaint about an order must be submitted within " +
            "30 days of the order date.",
          facts.communityZaloUrl
            ? `You can also reach us via the official community group: ${facts.communityZaloUrl}.`
            : "All official contact goes through the Support section after signing in.",
        ],
      ),
      section(
        "thay-doi",
        "11. Policy changes",
        [
          "This policy may be updated when platforms change their commission " +
            "mechanics or when laws change. The latest version is always at the " +
            "policy link in the footer, with a version number. Changes affecting your " +
            "benefits will be announced before applying to orders placed afterward.",
          "Orders placed before the effective date are still calculated under the " +
            "policy in effect at the time of purchase.",
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
      return `<h2 style="font-size:16px;margin:22px 0 8px;color:#0f2544">${escapeHtml(
        item.heading,
      )}</h2>${paragraphs}${bullets}`;
    })
    .join("");

  return {
    subject: `Chính sách người dùng ${app} (phiên bản ${policy.version})`,
    text: textLines.join("\n"),
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:auto;color:#0f2544;font-size:14px">
        <h1 style="font-size:22px;margin:0 0 6px">${escapeHtml(policy.title)}</h1>
        <p style="margin:0 0 18px;color:#5b6b85">Phiên bản ${escapeHtml(policy.version)}</p>
        <p style="line-height:1.6">Chào ${escapeHtml(greetName)}, cảm ơn bạn đã đăng ký ${escapeHtml(app)}.</p>
        <p style="line-height:1.6">${escapeHtml(policy.lead)}</p>
        ${sectionsHtml}
        <p style="margin:24px 0 8px">
          <a href="${escapeHtml(policy.url)}" style="background:#002d9c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">Xem bản mới nhất</a>
        </p>
        <p style="color:#5b6b85;line-height:1.6">${escapeHtml(app)} không bao giờ hỏi mật khẩu, mã PIN hay OTP ngân hàng của bạn.</p>
      </div>
    `,
  };
}
