/**
 * Giọng nói của Camio — trợ lý hoàn tiền của ShopTik — cho APP di động.
 *
 * Bản đối xứng của public/camio-voice.js (web) và src/services/camio-voice.ts
 * (server: thông báo/push). Mọi câu linh vật nói trong app lấy từ đây bằng
 * `camio('nhom', { bien })` — KHÔNG viết chuỗi rời trong màn hình. Bộ thoại đầy
 * đủ + nguyên tắc giọng điệu: docs/10-giong-noi-camio.md.
 *
 * Nguyên tắc: câu ngắn (toast 3–8 từ, tooltip 5–15 từ), xưng "Camio – bạn",
 * không thuật ngữ kỹ thuật, không hứa tiền chắc chắn về khi đơn còn chờ.
 */

export const CAMIO_VOICE = {
  greet: [
    '👋 Camio đây! Hôm nay mình hoàn được bao nhiêu nhỉ?',
    'Chào bạn! 🧡 Có link nào cho Camio kiểm tra không?',
    'Camio có mặt! Đi săn hoàn tiền thôi 💸',
    'Bạn đến rồi! Camio chờ nãy giờ đó 👀',
    'Hôm nay mua gì? Nhớ qua ShopTik trước nha!',
    'Chào ngày mới! Mua sắm thông minh cùng Camio nhé ☀️',
    'Camio trực chiến! 🫡 Link đâu, đưa mình xem nào.',
    'Ê, khoan mua! 👀 Kiểm tra hoàn tiền trước đã.',
    'Có Camio ở đây, đừng để phí một đồng hoàn nào nhé.',
    'Shop thì cứ shop, hoàn tiền để Camio lo. 🧡',
  ],
  welcome: [
    'Bạn đến rồi! Camio chờ nãy giờ đó 👀',
    'Quay lại rồi à! Đi săn hoàn tiếp thôi.',
    'Camio vẫn giữ chỗ cho bạn đây 🫡',
    'Chào bạn! 🧡 Đi săn hoàn tiền thôi.',
  ],
  noLink: [
    '🔗 Dán link vào đây, Camio kiểm tra cho!',
    'Có link sản phẩm chưa? Đưa Camio xem nào 👀',
    'Đừng thanh toán vội! Dán link trước nha.',
    'Link đâu rồi? Camio đang chờ đây 🧡',
    'Copy link → dán vào đây → xem hoàn tiền. Dễ thôi!',
    'Thấy món ưng rồi à? Mang link về đây nào.',
    'Có món muốn mua? Camio kiểm tra hoàn tiền trước cho.',
    'Một chiếc link có thể cứu vài đồng đó nha 😎',
  ],
  checking: [
    '🔍 Camio đang soi link…',
    'Chờ Camio một xíu nhé!',
    'Đang tìm mức hoàn tốt cho bạn…',
    'Camio đang kiểm tra hoa hồng 👀',
    'Để mình xem link này có gì hay…',
    'Đang tính xem bạn có thể nhận lại bao nhiêu 💰',
    'Camio đang xử lý… sắp xong rồi!',
    'Đừng đi đâu nhé, Camio đang tính tiền hoàn.',
  ],
  found: [
    '🎉 Có hoàn tiền rồi!',
    'Bingo! Camio tìm thấy tiền hoàn cho bạn 🧡',
    'Link ngon! Có thể nhận hoàn đó.',
    'Thấy rồi nhé! 💰 Đừng mua trực tiếp vội.',
    'Món này có hoàn! Quá ổn 😎',
    'Camio bắt được hoa hồng rồi! 🎯',
    'Camio duyệt! 🫡 Có hoàn tiền.',
    'Tìm thấy rồi! Giờ tạo link mua thôi.',
  ],
  foundAmount: [
    '🎉 Bạn có thể nhận khoảng {amount}.',
    'Camio tìm thấy {amount} tiền hoàn cho bạn!',
    'Mua món này, dự kiến nhận lại {amount} 💰',
    'Khoan thanh toán! Có {amount} đang chờ bạn đó.',
    'Tiết kiệm thêm {amount}? Camio nói có! 😎',
  ],
  noCashback: [
    'Hmm… link này chưa có hoàn tiền rồi 🥲',
    'Camio kiểm tra rồi, hiện chưa có ưu đãi cho link này.',
    'Link này chưa hỗ trợ hoàn tiền. Thử món khác nhé!',
    'Chưa săn được đồng nào từ link này rồi 😭',
    'Camio chưa tìm thấy mức hoàn phù hợp.',
    'Đừng buồn, thử một link khác nhé 🧡',
  ],
  pendingAmount: [
    'Có hoàn đó, nhưng sàn chưa báo số. Camio cập nhật sau nhé 👀',
    'Mức hoàn đang cập nhật — mua qua ShopTik vẫn được ghi nhận nha!',
  ],
  badLink: [
    '🤔 Camio chưa đọc được link này.',
    'Hình như link bị thiếu rồi, kiểm tra lại nhé!',
    'Camio cần link sản phẩm đầy đủ nha 🔗',
    'Link này hơi lạ… gửi lại cho mình thử nhé.',
    'Oops! Camio chưa nhận diện được link.',
    'Copy lại link sản phẩm rồi đưa Camio nhé!',
  ],
  linkReady: [
    '✅ Xong! Giờ bạn có thể đi mua rồi.',
    'Link đã sẵn sàng. Shopping thôi! 🛒',
    'Camio xử lý xong rồi! 🫡',
    'Thành công! Nhớ mua qua link này nhé.',
    'Link hoàn tiền đã sẵn sàng 🧡',
    'Camio mở đường rồi, bạn chỉ việc shopping!',
    'Xong một kèo! 😎',
  ],
  orderSeen: [
    '🎯 Bắt được đơn rồi!',
    'Camio thấy đơn của bạn rồi nha 👀',
    'Đơn hàng đã được ghi nhận 🧡',
    'Có tín hiệu từ đơn hàng rồi!',
    'Camio đang theo dõi đơn này cho bạn.',
    'Đơn đã về hệ thống. Giờ chờ tiền hoàn thôi!',
  ],
  cashback: [
    '💰 Ting! Tiền về!',
    'Camio mang tiền về cho bạn đây! 🧡',
    'Có tiền hoàn mới! Vào xem nào 👀',
    'Ting ting! Ví vừa vui lên một chút 😎',
    'Hoàn tiền thành công! 🎉',
    'Camio báo tin vui: tiền đã về!',
    'Một khoản hoàn mới vừa cập bến 💸',
    'Ví ShopTik vừa có biến… biến động tăng! 📈',
  ],
  cashbackAmount: [
    '💰 {amount} vừa được hoàn!',
    'Ting! Bạn vừa nhận {amount} 🧡',
    'Camio vừa mang về {amount} cho bạn!',
    '+{amount} vào ví. Quá đẹp! 🎉',
    'Ví vừa tăng {amount}. Camio báo cáo hết! 🫡',
  ],
  pending: [
    '⏳ Tiền đang trên đường về.',
    'Đơn đã ghi nhận, Camio đang theo dõi nhé!',
    'Bình tĩnh nha, khoản hoàn đang chờ xác nhận.',
    'Camio giữ mắt trên đơn này rồi 👀',
    'Chưa về ví ngay đâu, nhưng Camio đang theo sát!',
    'Đơn ổn! Giờ chờ hệ thống xác nhận thôi.',
  ],
  manyCashback: [
    '🔥 Hôm nay săn hoàn dữ vậy!',
    'Camio bắt đầu nể bạn rồi đó 😎',
    'Shopping có chiến thuật là đây.',
    'Ví hôm nay nhìn vui ghê 👀',
    'Bạn mua sắm, Camio nhặt tiền hoàn. Hợp tác tốt!',
  ],
  comeback: [
    'Camio nhớ bạn rồi đó 👀',
    'Lâu rồi không gặp! Dạo này có shopping không?',
    'Camio vẫn ở đây nha 🧡',
    'Ghé ShopTik xem có gì mới nào!',
    '👀 Mua gì gần đây mà quên Camio không đó?',
    'Đừng nói với Camio là bạn mua thẳng nhé… 😭',
    'Quay lại rồi à! Đi săn hoàn tiếp thôi.',
    'Camio vẫn giữ chỗ cho bạn đây 🫡',
  ],
  remind: [
    '⚠️ Khoan thanh toán! Kiểm tra hoàn tiền chưa?',
    'Mua thì mua, nhưng nhớ hoàn nha! 🧡',
    'Một giây dán link, đỡ tiếc tiền về sau.',
    'Trước khi bấm Mua, nhớ ghé Camio!',
    'Đừng để tiền hoàn nằm lại trên bàn 👀',
    'Thói quen mới: Copy link → ShopTik → Mua hàng.',
    'Camio nhắc nhẹ: kiểm tra link trước khi checkout nhé!',
  ],
  stats: [
    '📊 Tháng này Camio đã giúp bạn hoàn {amount}.',
    'Bạn đã lấy lại {amount} từ những món vốn định mua.',
    'Tổng tiền hoàn tháng này: {amount} 💰',
    'Camio báo cáo: tháng này bạn đã tiết kiệm {amount}.',
    'Từng khoản nhỏ cộng lại thành {amount} rồi đó!',
    'Tổng chiến lợi phẩm: {amount} 🏆',
  ],
  emptyOrders: [
    '🛒 Chiếc giỏ này đang hơi cô đơn…',
    'Chưa có chiến lợi phẩm. Đi săn thôi!',
    'Camio chưa thấy đơn nào 👀',
    'Đơn đầu tiên đang chờ bạn đó!',
    'Dán một chiếc link và bắt đầu thôi 🧡',
  ],
  emptyWallet: [
    '💰 Ví đang chờ đồng đầu tiên.',
    'Chưa có tiền hoàn… tạm thời thôi 😎',
    'Camio đang chờ cơ hội kiếm khoản hoàn đầu tiên cho bạn.',
    'Bắt đầu bằng một link nhé!',
    'Ví hơi trống. Đi săn hoàn thôi!',
  ],
  emptyNotif: ['Chưa có gì mới. Camio vẫn canh đây 👀', 'Yên ắng quá… có đơn là Camio báo liền 🧡'],
  error: [
    '😵 Camio vừa vấp một chút…',
    'Oops! Có gì đó chưa ổn.',
    'Camio xử lý chưa thành công. Thử lại nhé!',
    'Hệ thống đang hơi bận, chờ Camio một chút nha.',
    'Camio vừa mất tín hiệu trong giây lát 📡',
    'Thử lại giúp Camio nhé!',
  ],
  random: [
    'Mua thông minh hơn một chút mỗi ngày. 🧡',
    'Tiền nhỏ cũng là tiền nha! 💰',
    'Đã định mua thì nhớ kiểm tra hoàn.',
    'Camio không cản bạn shopping. Camio chỉ muốn bạn shopping lời hơn 😎',
    'Đừng mua ít hơn. Hãy mua thông minh hơn.',
    'Một chiếc link, thêm một cơ hội tiết kiệm.',
    'Săn deal là một chuyện. Săn hoàn là chuyện của Camio.',
    'Món yêu thích vẫn mua, tiền hoàn vẫn lấy.',
    'Camio trực 24/7, chỉ sợ bạn quên dán link thôi 👀',
    'Shopping vui, nhận hoàn còn vui hơn.',
  ],
  signature: [
    'Mua đâu cũng được, nhớ hoàn là được.',
    'Khoan mua! Để Camio kiểm tra đã.',
    'Bạn shopping, Camio săn hoàn.',
    'Có link? Đưa Camio!',
    'Mua rồi mà không hoàn? Camio tiếc giùm đó!',
  ],
  fabHover: [
    'Có link? Đưa Camio!',
    'Cần giúp gì, nhắn Camio nha 🧡',
    'Khoan mua! Để Camio kiểm tra đã.',
    'Camio trực đây, hỏi gì cũng được 👀',
  ],
  logoutStay: ['Ở lại nhé? Camio vẫn canh hoàn cho bạn 👀', 'Đi thật hả? 🥲 Nhớ quay lại nha.'],
  supportIntro: [
    'Có gì khó cứ nhắn, đội hỗ trợ trả lời ngay tại đây 🧡',
    'Hỏi gì cũng được — Camio và đội hỗ trợ trực đây 🫡',
  ],
} as const;

export type CamioGroup = keyof typeof CAMIO_VOICE;

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
  );
}

/** Lấy NGẪU NHIÊN một câu trong nhóm, điền {bien}. */
export function camio(group: CamioGroup, vars?: Record<string, string | number>): string {
  const list = CAMIO_VOICE[group];
  return fill(list[Math.floor(Math.random() * list.length)]!, vars);
}

/** Lấy câu theo CHỈ SỐ — ổn định giữa các lần render (dùng với useMemo/useRef). */
export function camioAt(
  group: CamioGroup,
  index: number,
  vars?: Record<string, string | number>,
): string {
  const list = CAMIO_VOICE[group];
  const i = ((index % list.length) + list.length) % list.length;
  return fill(list[i]!, vars);
}

/** Chỉ số ngẫu nhiên một lần — dùng `useRef(camioSeed())` để câu không đổi khi re-render. */
export function camioSeed(): number {
  return Math.floor(Math.random() * 1000);
}
