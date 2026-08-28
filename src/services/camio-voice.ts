/**
 * Giọng nói của Camio — trợ lý hoàn tiền của ShopTik — cho THÔNG BÁO và PUSH.
 *
 * Camio là một người bạn săn hoàn tiền, không phải nhân viên CSKH: câu ngắn
 * (push 5–18 từ), xưng "Camio – bạn", có phản ứng trước rồi mới tới thông tin
 * và bước tiếp theo ("Ting! 🎉 + Bạn vừa được hoàn 35.000đ + Vào ví xem nhé!").
 * Không dùng thuật ngữ Affiliate; nói "hoàn tiền", "đơn hàng", "link sản phẩm".
 * Không cam kết tiền chắc chắn về khi đơn mới ở trạng thái dự kiến/chờ.
 *
 * Toàn bộ bộ thoại (mọi nhóm tình huống, cả web lẫn app) ở
 * docs/10-giong-noi-camio.md — sửa lời thoại thì sửa ở đây + tài liệu đó, KHÔNG
 * viết chuỗi rời rạc trong nghiệp vụ. Web dùng public/camio-voice.js, app dùng
 * mobile/src/lib/camio-voice.ts với cùng nhóm câu.
 */

export interface CamioNotice {
  title: string;
  body: string;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

const PLATFORM_NAMES: Record<string, string> = {
  SHOPEE: "Shopee",
  TIKTOK: "TikTok Shop",
  LAZADA: "Lazada",
};

/** Tên sàn để nói chuyện ("Shopee"), nhận cả mã hoa ("SHOPEE") lẫn chữ thường. */
export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform.toUpperCase()] ?? platform;
}

export const camioVoice = {
  /** Sàn vừa XÁC NHẬN đơn — tiền hoàn ghi nhận vào ví CHỜ (chưa rút được). */
  orderApproved(p: { orderCode: string; platform: string; amount: string }): CamioNotice {
    const san = platformName(p.platform);
    return {
      title: pick([
        "🎯 Bắt được đơn rồi!",
        "Camio thấy đơn của bạn rồi nha 👀",
        "Có tín hiệu từ đơn hàng rồi!",
        "Đơn đã về hệ thống 🧡",
      ]),
      body: pick([
        `Đơn ${p.orderCode} trên ${san} đã ghi nhận. Dự kiến hoàn ${p.amount} — đang chờ về ví.`,
        `${san} xác nhận đơn ${p.orderCode}. Khoản ${p.amount} đang trên đường về, Camio theo sát 👀`,
        `Đơn ${p.orderCode} ổn rồi! ${p.amount} tiền hoàn đang chờ xác nhận về ví.`,
      ]),
    };
  },

  /** Tiền hoàn chuyển từ ví CHỜ sang KHẢ DỤNG — nhóm "dopamine" mạnh nhất. */
  cashbackReleased(p: { amount: string; orderCode?: string | undefined }): CamioNotice {
    const don = p.orderCode ? `Đơn ${p.orderCode}` : "Đơn của bạn";
    return {
      title: pick([
        "💰 Ting! Tiền về!",
        "Camio mang tiền về cho bạn đây! 🧡",
        "Ting ting! Ví vừa vui lên một chút 😎",
        "Hoàn tiền thành công! 🎉",
        "Một khoản hoàn mới vừa cập bến 💸",
      ]),
      body: pick([
        `+${p.amount} vào ví, rút được rồi. Quá đẹp! 🎉`,
        `${don} giúp bạn nhận lại ${p.amount}. Vào ví xem nhé!`,
        `Ví vừa tăng ${p.amount}. Camio báo cáo hết! 🫡`,
        `Ting! Bạn vừa nhận ${p.amount} 🧡 Rút về ngân hàng được rồi.`,
      ]),
    };
  },

  missionClaimSent(p: { title: string; amount: string }): CamioNotice {
    return {
      title: pick(["Camio đã nhận yêu cầu thưởng 🫡", "Đã ghi nhận! Chờ duyệt chút nha ⏳"]),
      body: `Nhiệm vụ "${p.title}" đang chờ duyệt — thưởng ${p.amount}. Có kết quả Camio báo ngay.`,
    };
  },

  missionApproved(p: { title: string; amount: string }): CamioNotice {
    return {
      title: pick(["🎉 Nhiệm vụ xong, thưởng về!", "Ting! Thưởng nhiệm vụ đã vào ví 💰"]),
      body: `+${p.amount} từ nhiệm vụ "${p.title}". Vào ví xem nhé!`,
    };
  },

  missionRejected(p: { title: string }): CamioNotice {
    return {
      title: pick(["Hmm… nhiệm vụ chưa được duyệt 🥲", "Lần này chưa qua rồi 🥲"]),
      body: `Nhiệm vụ "${p.title}" chưa đạt điều kiện. Thấy chưa đúng thì nhắn đội hỗ trợ, Camio kiểm tra lại cho.`,
    };
  },

  /** Đội CSKH vừa trả lời yêu cầu hỗ trợ (qua Slack). */
  supportReply(p: { preview: string }): CamioNotice {
    const preview = p.preview.trim().replace(/\s+/g, " ");
    const short = preview.length > 120 ? `${preview.slice(0, 119)}…` : preview;
    return {
      title: pick(["Đội hỗ trợ vừa nhắn bạn 📩", "Có phản hồi từ đội hỗ trợ rồi!", "Camio báo: CSKH đã trả lời 🧡"]),
      body: short || "Bấm để đọc phản hồi nha 🧡",
    };
  },

  /** Admin duyệt hồ sơ đăng ký KOL/KOC. */
  kolApproved(): CamioNotice {
    return {
      title: pick(["🎉 Chào mừng đối tác KOL/KOC!", "Hồ sơ KOL/KOC đã được duyệt 🧡"]),
      body: "Bạn đã trở thành đối tác đặc biệt của ShopTik — hưởng hoa hồng cao hơn và được đổi mã giới thiệu. Vào mục Giới thiệu để bắt đầu!",
    };
  },

  kolRejected(p: { reason?: string | undefined }): CamioNotice {
    return {
      title: pick(["Hồ sơ KOL/KOC chưa được duyệt 🥲", "Lần này hồ sơ chưa qua 🥲"]),
      body: p.reason
        ? `Lý do: ${p.reason}. Bạn có thể nộp lại hồ sơ sau khi chỉnh sửa.`
        : "Hồ sơ chưa đạt. Kiểm tra lại ảnh CCCD/video rồi nộp lại giúp mình nhé.",
    };
  },

  /** Admin duyệt mã giới thiệu tự chọn của đối tác/KOL. */
  referralCodeApproved(p: { code: string }): CamioNotice {
    return {
      title: pick(["✅ Mã giới thiệu mới đã được duyệt!", "Camio báo: mã mới của bạn on sóng rồi 🧡"]),
      body: `Mã giới thiệu của bạn giờ là "${p.code}". Dữ liệu giới thiệu cũ vẫn giữ nguyên, link cũ vẫn quy về bạn.`,
    };
  },

  referralCodeRejected(p: { code: string }): CamioNotice {
    return {
      title: pick(["Mã giới thiệu chưa được duyệt 🥲", "Lần này mã chưa qua rồi 🥲"]),
      body: `Mã "${p.code}" chưa được chấp nhận. Bạn vẫn giữ quyền đổi — nhắn đội hỗ trợ nếu cần Camio giải thích thêm nha.`,
    };
  },

  withdrawalApproved(p: { amount: string }): CamioNotice {
    return {
      title: pick(["Lệnh rút đã duyệt! 🫡", "Tiền đang về ngân hàng 🏦"]),
      body: `${p.amount} đang trên đường về tài khoản ngân hàng của bạn. Sắp nhận được rồi!`,
    };
  },
};
