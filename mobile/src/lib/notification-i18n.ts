/**
 * Dịch nội dung THÔNG BÁO (do server sinh ở src/services/camio-voice.ts và lưu
 * tiếng Việt trong DB) sang tiếng Anh khi hiển thị. Tiêu đề là chuỗi cố định →
 * map trực tiếp; nội dung có chèn dữ liệu (mã đơn, số tiền, tên sàn…) → khớp mẫu
 * bằng regex và giữ nguyên phần dữ liệu. Không khớp thì trả nguyên văn (vd nội
 * dung phản hồi hỗ trợ do người thật viết, hay lý do do admin nhập).
 */
import { localizeMissionTitle } from './mission-i18n';

// Tiêu đề + các nội dung cố định (không chèn dữ liệu) → bản EN.
const EXACT: Record<string, string> = {
  // orderApproved titles
  '🎯 Bắt được đơn rồi!': '🎯 Caught your order!',
  'Camio thấy đơn của bạn rồi nha 👀': 'Camio spotted your order 👀',
  'Có tín hiệu từ đơn hàng rồi!': 'Got a signal from your order!',
  'Đơn đã về hệ thống 🧡': "Order's in the system 🧡",
  // cashbackReleased titles
  '💰 Ting! Tiền về!': "💰 Ting! Money's in!",
  'Camio mang tiền về cho bạn đây! 🧡': 'Camio brought your money back! 🧡',
  'Ting ting! Ví vừa vui lên một chút 😎': "Ting ting! Your wallet just got happier 😎",
  'Hoàn tiền thành công! 🎉': 'Cashback successful! 🎉',
  'Một khoản hoàn mới vừa cập bến 💸': 'A fresh cashback just landed 💸',
  // missionClaimSent titles
  'Camio đã nhận yêu cầu thưởng 🫡': 'Camio got your reward request 🫡',
  'Đã ghi nhận! Chờ duyệt chút nha ⏳': 'Recorded! Hang tight for approval ⏳',
  // missionApproved titles
  '🎉 Nhiệm vụ xong, thưởng về!': "🎉 Mission done, reward's in!",
  'Ting! Thưởng nhiệm vụ đã vào ví 💰': "Ting! Mission reward's in your wallet 💰",
  // missionRejected titles
  'Hmm… nhiệm vụ chưa được duyệt 🥲': "Hmm… the mission wasn't approved 🥲",
  'Lần này chưa qua rồi 🥲': "Didn't make it this time 🥲",
  // supportReply titles + fallback body
  'Đội hỗ trợ vừa nhắn bạn 📩': 'The support team just messaged you 📩',
  'Có phản hồi từ đội hỗ trợ rồi!': "You've got a reply from support!",
  'Camio báo: CSKH đã trả lời 🧡': "Camio's update: support replied 🧡",
  'Bấm để đọc phản hồi nha 🧡': 'Tap to read the reply 🧡',
  // kolApproved titles + body
  '🎉 Chào mừng đối tác KOL/KOC!': '🎉 Welcome, KOL/KOC partner!',
  'Hồ sơ KOL/KOC đã được duyệt 🧡': 'Your KOL/KOC application is approved 🧡',
  'Bạn đã trở thành đối tác đặc biệt của ShopTik — hưởng hoa hồng cao hơn và được đổi mã giới thiệu. Vào mục Giới thiệu để bắt đầu!':
    "You're now a special ShopTik partner — higher commission and a custom referral code. Head to Referrals to get started!",
  // kolRejected titles + fixed body
  'Hồ sơ KOL/KOC chưa được duyệt 🥲': "Your KOL/KOC application wasn't approved 🥲",
  'Lần này hồ sơ chưa qua 🥲': "The application didn't pass this time 🥲",
  'Hồ sơ chưa đạt. Kiểm tra lại ảnh CCCD/video rồi nộp lại giúp mình nhé.':
    "The application didn't pass. Please recheck your ID photo/video and resubmit.",
  // referralCodeApproved titles
  '✅ Mã giới thiệu mới đã được duyệt!': '✅ Your new referral code is approved!',
  'Camio báo: mã mới của bạn on sóng rồi 🧡': "Camio's update: your new code is live 🧡",
  // referralCodeRejected titles
  'Mã giới thiệu chưa được duyệt 🥲': "Referral code wasn't approved 🥲",
  'Lần này mã chưa qua rồi 🥲': "The code didn't pass this time 🥲",
  // withdrawalApproved titles
  'Lệnh rút đã duyệt! 🫡': 'Withdrawal approved! 🫡',
  'Tiền đang về ngân hàng 🏦': "Money's heading to your bank 🏦",
};

// Nội dung có chèn dữ liệu → khớp regex, dựng lại bản EN từ nhóm bắt được.
const PATTERNS: { re: RegExp; en: (m: RegExpMatchArray) => string }[] = [
  // orderApproved
  {
    re: /^Đơn (.+) trên (.+) đã ghi nhận\. Dự kiến hoàn (.+) — đang chờ về ví\.$/,
    en: (m) => `Order ${m[1]} on ${m[2]} was recorded. Est. cashback ${m[3]} — pending in wallet.`,
  },
  {
    re: /^(.+) xác nhận đơn (.+)\. Khoản (.+) đang trên đường về, Camio theo sát 👀$/,
    en: (m) => `${m[1]} confirmed order ${m[2]}. ${m[3]} is on its way, Camio's watching 👀`,
  },
  {
    re: /^Đơn (.+) ổn rồi! (.+) tiền hoàn đang chờ xác nhận về ví\.$/,
    en: (m) => `Order ${m[1]} is good! ${m[2]} cashback awaiting wallet confirmation.`,
  },
  // cashbackReleased
  {
    re: /^\+(.+) vào ví, rút được rồi\. Quá đẹp! 🎉$/,
    en: (m) => `+${m[1]} to your wallet, ready to withdraw. Beautiful! 🎉`,
  },
  {
    re: /^Đơn của bạn giúp bạn nhận lại (.+)\. Vào ví xem nhé!$/,
    en: (m) => `Your order got you ${m[1]} back. Check your wallet!`,
  },
  {
    re: /^Đơn (.+) giúp bạn nhận lại (.+)\. Vào ví xem nhé!$/,
    en: (m) => `Order ${m[1]} got you ${m[2]} back. Check your wallet!`,
  },
  {
    re: /^Ví vừa tăng (.+)\. Camio báo cáo hết! 🫡$/,
    en: (m) => `Your wallet's up ${m[1]}. Camio reporting in! 🫡`,
  },
  {
    re: /^Ting! Bạn vừa nhận (.+) 🧡 Rút về ngân hàng được rồi\.$/,
    en: (m) => `Ting! You just got ${m[1]} 🧡 Ready to withdraw to your bank.`,
  },
  // missionClaimSent (title mốc dịch qua localizeMissionTitle)
  {
    re: /^Nhiệm vụ "(.+)" đang chờ duyệt — thưởng (.+)\. Có kết quả Camio báo ngay\.$/,
    en: (m) =>
      `Mission "${localizeMissionTitle(m[1]!, 'en')}" is pending approval — reward ${m[2]}. Camio'll tell you the moment there's news.`,
  },
  // missionApproved
  {
    re: /^\+(.+) từ nhiệm vụ "(.+)"\. Vào ví xem nhé!$/,
    en: (m) => `+${m[1]} from mission "${localizeMissionTitle(m[2]!, 'en')}". Check your wallet!`,
  },
  // missionRejected
  {
    re: /^Nhiệm vụ "(.+)" chưa đạt điều kiện\. Thấy chưa đúng thì nhắn đội hỗ trợ, Camio kiểm tra lại cho\.$/,
    en: (m) =>
      `Mission "${localizeMissionTitle(m[1]!, 'en')}" didn't meet the conditions. If that seems off, message support and Camio'll recheck.`,
  },
  // kolRejected (có lý do do admin nhập — giữ nguyên phần lý do)
  {
    re: /^Lý do: (.+)\. Bạn có thể nộp lại hồ sơ sau khi chỉnh sửa\.$/,
    en: (m) => `Reason: ${m[1]}. You can resubmit after making changes.`,
  },
  // referralCodeApproved
  {
    re: /^Mã giới thiệu của bạn giờ là "(.+)"\. Dữ liệu giới thiệu cũ vẫn giữ nguyên, link cũ vẫn quy về bạn\.$/,
    en: (m) =>
      `Your referral code is now "${m[1]}". Your old referral data stays, and old links still credit you.`,
  },
  // referralCodeRejected
  {
    re: /^Mã "(.+)" chưa được chấp nhận\. Bạn vẫn giữ quyền đổi — nhắn đội hỗ trợ nếu cần Camio giải thích thêm nha\.$/,
    en: (m) =>
      `Code "${m[1]}" wasn't accepted. You keep the right to change it — message support if you'd like Camio to explain.`,
  },
  // withdrawalApproved
  {
    re: /^(.+) đang trên đường về tài khoản ngân hàng của bạn\. Sắp nhận được rồi!$/,
    en: (m) => `${m[1]} is on its way to your bank account. Almost there!`,
  },
];

export function localizeNotification(text: string, lang: string): string {
  if (lang !== 'en' || !text) return text;
  const exact = EXACT[text];
  if (exact) return exact;
  for (const p of PATTERNS) {
    const m = text.match(p.re);
    if (m) return p.en(m);
  }
  return text;
}
