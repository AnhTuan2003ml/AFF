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

/**
 * Bản tiếng Anh của giọng Camio — cùng nhóm, cùng số câu và cùng thứ tự với
 * CAMIO_VOICE để `camioAt(index)` chọn đúng câu tương ứng khi đổi ngôn ngữ.
 * Giữ nguyên emoji và biến {amount}.
 */
export const CAMIO_VOICE_EN: Record<CamioGroup, readonly string[]> = {
  greet: [
    "👋 Camio here! How much can we get back today?",
    "Hi there! 🧡 Got a link for Camio to check?",
    "Camio's in! Let's hunt some cashback 💸",
    "You're here! Camio's been waiting 👀",
    "Shopping today? Swing by ShopTik first!",
    "Good day! Shop smart with Camio ☀️",
    "Camio reporting for duty! 🫡 Where's the link?",
    "Hey, hold on! 👀 Check cashback first.",
    "Camio's here — don't leave a single đồng of cashback behind.",
    "Shop all you want, leave the cashback to Camio. 🧡",
  ],
  welcome: [
    "You're here! Camio's been waiting 👀",
    "Back again! Let's hunt more cashback.",
    "Camio saved your spot 🫡",
    "Hi there! 🧡 Let's hunt some cashback.",
  ],
  noLink: [
    "🔗 Paste a link here and Camio will check it!",
    "Got a product link? Show Camio 👀",
    "Don't check out yet! Paste the link first.",
    "Where's the link? Camio's waiting 🧡",
    "Copy link → paste here → see cashback. Easy!",
    "Found something you like? Bring the link here.",
    "Want to buy something? Let Camio check cashback first.",
    "One little link could save you a few đồng 😎",
  ],
  checking: [
    "🔍 Camio's scanning the link…",
    "Give Camio a sec!",
    "Finding the best cashback for you…",
    "Camio's checking the commission 👀",
    "Let me see what this link's got…",
    "Working out how much you can get back 💰",
    "Camio's on it… almost done!",
    "Don't go anywhere, Camio's counting your cashback.",
  ],
  found: [
    "🎉 There's cashback!",
    "Bingo! Camio found cashback for you 🧡",
    "Nice link! Cashback's available.",
    "Found it! 💰 Don't buy directly yet.",
    "This one has cashback! Awesome 😎",
    "Camio caught the commission! 🎯",
    "Camio approves! 🫡 Cashback's on.",
    "Found it! Now let's make a buy link.",
  ],
  foundAmount: [
    "🎉 You could get around {amount} back.",
    "Camio found {amount} cashback for you!",
    "Buy this and you'd get about {amount} back 💰",
    "Hold on! {amount} is waiting for you.",
    "Save an extra {amount}? Camio says yes! 😎",
  ],
  noCashback: [
    "Hmm… no cashback on this link yet 🥲",
    "Camio checked — no deal for this link right now.",
    "This link doesn't support cashback. Try another!",
    "Couldn't catch a single đồng from this one 😭",
    "Camio couldn't find a matching cashback rate.",
    "Don't worry, try another link 🧡",
  ],
  pendingAmount: [
    "There's cashback, but the platform hasn't sent the amount. Camio'll update later 👀",
    "Cashback rate updating — buying via ShopTik still counts!",
  ],
  badLink: [
    "🤔 Camio couldn't read this link.",
    "Looks like the link's incomplete, check again!",
    "Camio needs the full product link 🔗",
    "This link looks odd… send it again?",
    "Oops! Camio didn't recognize the link.",
    "Copy the product link again and give it to Camio!",
  ],
  linkReady: [
    "✅ Done! You can go shopping now.",
    "Link's ready. Let's shop! 🛒",
    "Camio's all done! 🫡",
    "Success! Remember to buy via this link.",
    "Your cashback link is ready 🧡",
    "Camio paved the way, just go shopping!",
    "One deal sealed! 😎",
  ],
  orderSeen: [
    "🎯 Caught your order!",
    "Camio spotted your order 👀",
    "Your order's been recorded 🧡",
    "Got a signal from your order!",
    "Camio's tracking this order for you.",
    "Order's in the system. Now wait for cashback!",
  ],
  cashback: [
    "💰 Ting! Money's in!",
    "Camio brought your money back! 🧡",
    "New cashback! Come take a look 👀",
    "Ting ting! Your wallet just got happier 😎",
    "Cashback successful! 🎉",
    "Camio's got good news: the money's in!",
    "A fresh cashback just landed 💸",
    "Your ShopTik wallet just moved… upward! 📈",
  ],
  cashbackAmount: [
    "💰 {amount} just landed!",
    "Ting! You just got {amount} 🧡",
    "Camio just brought back {amount} for you!",
    "+{amount} to your wallet. Beautiful! 🎉",
    "Wallet's up {amount}. Camio reporting in! 🫡",
  ],
  pending: [
    "⏳ Money's on its way.",
    "Order recorded, Camio's keeping watch!",
    "Easy now, the cashback's awaiting confirmation.",
    "Camio's got an eye on this order 👀",
    "Not in the wallet just yet, but Camio's close on it!",
    "Order's good! Now just wait for the system to confirm.",
  ],
  manyCashback: [
    "🔥 Big cashback hunt today!",
    "Camio's starting to respect you 😎",
    "This is what strategic shopping looks like.",
    "The wallet looks happy today 👀",
    "You shop, Camio collects cashback. Great teamwork!",
  ],
  comeback: [
    "Camio missed you 👀",
    "Long time no see! Been shopping lately?",
    "Camio's still here 🧡",
    "Drop by ShopTik and see what's new!",
    "👀 Bought anything lately and forgot Camio?",
    "Don't tell Camio you bought it directly… 😭",
    "Back again! Let's hunt more cashback.",
    "Camio saved your spot 🫡",
  ],
  remind: [
    "⚠️ Hold on! Did you check cashback?",
    "Buy it, sure, but grab the cashback! 🧡",
    "One second to paste a link saves regret later.",
    "Before you hit Buy, drop by Camio!",
    "Don't leave cashback on the table 👀",
    "New habit: Copy link → ShopTik → Buy.",
    "Gentle reminder from Camio: check the link before checkout!",
  ],
  stats: [
    "📊 Camio helped you get back {amount} this month.",
    "You've reclaimed {amount} on things you were buying anyway.",
    "Total cashback this month: {amount} 💰",
    "Camio reports: you saved {amount} this month.",
    "All those small amounts add up to {amount}!",
    "Total loot: {amount} 🏆",
  ],
  emptyOrders: [
    "🛒 This cart's feeling a little lonely…",
    "No loot yet. Let's go hunting!",
    "Camio doesn't see any orders yet 👀",
    "Your first order's waiting for you!",
    "Paste a link and let's get started 🧡",
  ],
  emptyWallet: [
    "💰 Your wallet's waiting for its first đồng.",
    "No cashback yet… just for now 😎",
    "Camio's waiting to earn your first cashback.",
    "Start with a link!",
    "Wallet's a bit empty. Let's hunt cashback!",
  ],
  emptyNotif: [
    "Nothing new yet. Camio's still watching 👀",
    "All quiet… Camio'll ping you the moment an order lands 🧡",
  ],
  error: [
    "😵 Camio just tripped a little…",
    "Oops! Something went wrong.",
    "Camio couldn't finish that. Try again!",
    "System's a bit busy, give Camio a moment.",
    "Camio lost signal for a second 📡",
    "Give it another try for Camio!",
  ],
  random: [
    "Shop a little smarter every day. 🧡",
    "Small money is still money! 💰",
    "If you're buying anyway, check the cashback.",
    "Camio won't stop you shopping. Camio just wants you to shop smarter 😎",
    "Don't buy less. Buy smarter.",
    "One link, one more chance to save.",
    "Deal hunting's one thing. Cashback hunting's Camio's job.",
    "Buy your favorites, take the cashback too.",
    "Camio's on duty 24/7, just don't forget to paste the link 👀",
    "Shopping's fun, cashback's even better.",
  ],
  signature: [
    "Buy anywhere, just get the cashback.",
    "Hold on! Let Camio check first.",
    "You shop, Camio hunts cashback.",
    "Got a link? Give it to Camio!",
    "Bought without cashback? Camio feels the loss!",
  ],
  fabHover: [
    "Got a link? Give it to Camio!",
    "Need help? Message Camio 🧡",
    "Hold on! Let Camio check first.",
    "Camio's here, ask anything 👀",
  ],
  logoutStay: [
    "Stay a while? Camio's still guarding your cashback 👀",
    "Leaving already? 🥲 Come back soon.",
  ],
  supportIntro: [
    "Anything tricky, just message us — the support team replies right here 🧡",
    "Ask anything — Camio and the support team are here 🫡",
  ],
};

// Ngôn ngữ hiện tại cho giọng Camio. LanguageProvider gọi setCamioLang khi đổi
// ngôn ngữ; camio()/camioAt() đọc biến này để chọn bộ câu VI hay EN. Component
// tiêu thụ useLang/useT sẽ re-render khi đổi ngôn ngữ nên câu cập nhật theo.
let _lang: 'vi' | 'en' = 'vi';

export function setCamioLang(l: 'vi' | 'en'): void {
  _lang = l === 'en' ? 'en' : 'vi';
}

function dict(): Record<CamioGroup, readonly string[]> {
  return _lang === 'en' ? CAMIO_VOICE_EN : CAMIO_VOICE;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
  );
}

/** Lấy NGẪU NHIÊN một câu trong nhóm (theo ngôn ngữ hiện tại), điền {bien}. */
export function camio(group: CamioGroup, vars?: Record<string, string | number>): string {
  const list = dict()[group];
  return fill(list[Math.floor(Math.random() * list.length)]!, vars);
}

/** Lấy câu theo CHỈ SỐ — ổn định giữa các lần render (dùng với useMemo/useRef). */
export function camioAt(
  group: CamioGroup,
  index: number,
  vars?: Record<string, string | number>,
): string {
  const list = dict()[group];
  const i = ((index % list.length) + list.length) % list.length;
  return fill(list[i]!, vars);
}

/** Chỉ số ngẫu nhiên một lần — dùng `useRef(camioSeed())` để câu không đổi khi re-render. */
export function camioSeed(): number {
  return Math.floor(Math.random() * 1000);
}
