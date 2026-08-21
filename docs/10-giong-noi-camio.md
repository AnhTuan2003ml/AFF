# Camio – trợ lý hoàn tiền của ShopTik 🧡 — bộ thoại & giọng điệu

**Tính cách:** nhanh nhẹn · thân thiện · tinh nghịch vừa phải · thông minh · thích
giúp người dùng tiết kiệm. **Xưng hô:** Camio – bạn. **Nguyên tắc:** câu ngắn,
dễ đọc trên mobile, ưu tiên 3–12 từ.

Camio là một người bạn săn hoàn tiền, **không phải nhân viên CSKH**.

| Camio nên nói | Camio không nói |
| --- | --- |
| "Có link? Đưa Camio!" | "Kính chào quý khách." |
| "Ting! Tiền về 🧡" | "Yêu cầu của quý khách đang được xử lý." |
| "Khoan mua, kiểm tra hoàn trước đã." | "Giao dịch Affiliate đã được ghi nhận thành công." |
| "Camio đang theo dõi đơn cho bạn 👀" | |

## Mã nguồn — một nguồn thoại mỗi nền tảng

| Nền tảng | File | Dùng ở |
| --- | --- | --- |
| Server (thông báo trong app + push) | `src/services/camio-voice.ts` | `createNotification` trong mission / order-import / cashback-release / backoffice |
| Web | `public/camio-voice.js` → `window.CamioVoice.pick("nhom", {bien})` | `blob-mascot.js`, `blob-fab.js`, `blob-welcome.js`, `blob-logout.js`, `blob-notify.js`, `purchase.js`, `views/app/**` |
| App di động | `mobile/src/lib/camio-voice.ts` → `camio('nhom', {bien})` | màn Home, Đơn, Ví, Thông báo, Hỗ trợ, FAB, Welcome |

Thêm/sửa câu: sửa **cả ba file** cho cùng nhóm (tên nhóm giống nhau) và cập nhật
tài liệu này. Không viết chuỗi thoại rời trong màn hình/nghiệp vụ.

## Công thức để tự sinh thêm

`[Phản ứng] + [Thông tin chính] + [Hành động tiếp theo]`

- "Ting! 🎉 + Bạn vừa được hoàn 35.000đ + Vào ví xem nhé!"
- "Hmm 🤔 + Link này chưa hỗ trợ hoàn + Thử link khác nha!"

Giới hạn: toast 3–8 từ · tooltip Camio 5–15 từ · push 5–18 từ · chat Camio 1–2
câu. Không dùng thuật ngữ Affiliate nếu không cần; ưu tiên "hoàn tiền", "tiền
hoàn", "đơn hàng", "link sản phẩm". **Không cam kết tiền chắc chắn về** khi đơn
mới ở trạng thái dự kiến/chờ xác nhận.

## Câu signature (lặp lại xuyên suốt thương hiệu)

1. "Mua đâu cũng được, nhớ hoàn là được."
2. "Khoan mua! Để Camio kiểm tra đã."
3. "Bạn shopping, Camio săn hoàn."
4. "Có link? Đưa Camio!"
5. "Mua rồi mà không hoàn? Camio tiếc giùm đó!"

## Bộ thoại theo tình huống (tên nhóm trong mã)

### 1. Chào khi mở app — `greet`
👋 Camio đây! Hôm nay mình hoàn được bao nhiêu nhỉ? · Chào bạn! 🧡 Có link nào cho
Camio kiểm tra không? · Camio có mặt! Đi săn hoàn tiền thôi 💸 · Bạn đến rồi!
Camio chờ nãy giờ đó 👀 · Hôm nay mua gì? Nhớ qua ShopTik trước nha! · Chào ngày
mới! Mua sắm thông minh cùng Camio nhé ☀️ · Camio trực chiến! 🫡 Link đâu, đưa
mình xem nào. · Ê, khoan mua! 👀 Kiểm tra hoàn tiền trước đã. · Có Camio ở đây,
đừng để phí một đồng hoàn nào nhé. · Shop thì cứ shop, hoàn tiền để Camio lo. 🧡

### 2. Chưa dán link — `noLink`
🔗 Dán link vào đây, Camio kiểm tra cho! · Có link sản phẩm chưa? Đưa Camio xem
nào 👀 · Đừng thanh toán vội! Dán link trước nha. · Link đâu rồi? Camio đang chờ
đây 🧡 · Copy link → dán vào đây → xem hoàn tiền. Dễ thôi! · Thấy món ưng rồi à?
Mang link về đây nào. · Có món muốn mua? Camio kiểm tra hoàn tiền trước cho. ·
Một chiếc link có thể cứu vài đồng đó nha 😎

### 3. Đang kiểm tra link — `checking`
🔍 Camio đang soi link… · Chờ Camio một xíu nhé! · Đang tìm mức hoàn tốt cho bạn…
· Camio đang kiểm tra hoa hồng 👀 · Để mình xem link này có gì hay… · Đang tính
xem bạn có thể nhận lại bao nhiêu 💰 · Camio đang xử lý… sắp xong rồi! · Đừng đi
đâu nhé, Camio đang tính tiền hoàn.

### 4. Link hợp lệ / có hoàn tiền — `found`, có số tiền — `foundAmount`
🎉 Có hoàn tiền rồi! · Bingo! Camio tìm thấy tiền hoàn cho bạn 🧡 · Link ngon! Có
thể nhận hoàn đó. · Thấy rồi nhé! 💰 Đừng mua trực tiếp vội. · Món này có hoàn!
Quá ổn 😎 · Camio bắt được hoa hồng rồi! 🎯 · Tin vui: Link này có thể hoàn tiền.
· Camio duyệt! 🫡 Có hoàn tiền. · Tìm thấy rồi! Giờ tạo link mua thôi.

Có số: 🎉 Bạn có thể nhận khoảng {amount}. · Camio tìm thấy {amount} tiền hoàn cho
bạn! · Mua món này, dự kiến nhận lại {amount} 💰 · Khoan thanh toán! Có {amount}
đang chờ bạn đó. · Tiết kiệm thêm {amount}? Camio nói có! 😎

### 5. Không có hoàn tiền — `noCashback` (không để người dùng nghĩ ShopTik lỗi)
Hmm… link này chưa có hoàn tiền rồi 🥲 · Camio kiểm tra rồi, hiện chưa có ưu đãi
cho link này. · Link này chưa hỗ trợ hoàn tiền. Thử món khác nhé! · Chưa săn
được đồng nào từ link này rồi 😭 · Camio chưa tìm thấy mức hoàn phù hợp. · Đừng
buồn, thử một link khác nhé 🧡

Sàn chưa báo số (`pendingAmount`): Có hoàn đó, nhưng sàn chưa báo số. Camio cập
nhật sau nhé 👀 · Mức hoàn đang cập nhật — mua qua ShopTik vẫn được ghi nhận nha!

### 6. Link sai / không nhận diện — `badLink`
🤔 Camio chưa đọc được link này. · Hình như link bị thiếu rồi, kiểm tra lại nhé! ·
Camio cần link sản phẩm đầy đủ nha 🔗 · Link này hơi lạ… gửi lại cho mình thử
nhé. · Oops! Camio chưa nhận diện được link. · Copy lại link sản phẩm rồi đưa
Camio nhé!

### 7. Tạo link mua thành công — `linkReady`
✅ Xong! Giờ bạn có thể đi mua rồi. · Link đã sẵn sàng. Shopping thôi! 🛒 · Camio
xử lý xong rồi! 🫡 · Thành công! Nhớ mua qua link này nhé. · Link hoàn tiền đã
sẵn sàng 🧡 · Camio mở đường rồi, bạn chỉ việc shopping! · Xong một kèo! 😎

### 8. Ghi nhận đơn — `orderSeen` (server: `orderApproved`)
🎯 Bắt được đơn rồi! · Camio thấy đơn của bạn rồi nha 👀 · Đơn hàng đã được ghi
nhận 🧡 · Có tín hiệu từ đơn hàng rồi! · Camio đang theo dõi đơn này cho bạn. ·
Đơn đã về hệ thống. Giờ chờ tiền hoàn thôi!

### 9. Có tiền hoàn — `cashback`, có số — `cashbackAmount` (server: `cashbackReleased`)
Nhóm tạo dopamine mạnh nhất. 💰 Ting! Tiền về! · Camio mang tiền về cho bạn đây!
🧡 · Có tiền hoàn mới! Vào xem nào 👀 · Ting ting! Ví vừa vui lên một chút 😎 ·
Hoàn tiền thành công! 🎉 · Camio báo tin vui: tiền đã về! · Shopping xong còn
được nhận lại tiền. Quá ổn! · Một khoản hoàn mới vừa cập bến 💸 · Nhiệm vụ hoàn
thành! Tiền của bạn đây 🫡 · Ví ShopTik vừa có biến… biến động tăng! 📈

Có số: 💰 {amount} vừa được hoàn! · Ting! Bạn vừa nhận {amount} 🧡 · Camio vừa
mang về {amount} cho bạn! · +{amount} vào ví. Quá đẹp! 🎉 · Đơn này giúp bạn nhận
lại {amount}. · Ví vừa tăng {amount}. Camio báo cáo hết! 🫡

### 10. Tiền đang chờ xác nhận — `pending`
⏳ Tiền đang trên đường về. · Đơn đã ghi nhận, Camio đang theo dõi nhé! · Bình
tĩnh nha, khoản hoàn đang chờ xác nhận. · Camio giữ mắt trên đơn này rồi 👀 ·
Chưa về ví ngay đâu, nhưng Camio đang theo sát! · Đơn ổn! Giờ chờ hệ thống xác
nhận thôi.

### 11. Nhiều tiền hoàn — `manyCashback`
🔥 Hôm nay săn hoàn dữ vậy! · Camio bắt đầu nể bạn rồi đó 😎 · Shopping có chiến
thuật là đây. · Ví hôm nay nhìn vui ghê 👀 · Bạn mua sắm, Camio nhặt tiền hoàn.
Hợp tác tốt! · Cứ đà này Camio sắp thất nghiệp vì bạn quá chuyên nghiệp 😂

### 12. Lâu không mở app — `comeback`
Nhẹ nhàng: Camio nhớ bạn rồi đó 👀 · Lâu rồi không gặp! Dạo này có shopping
không? · Camio vẫn ở đây nha 🧡 · Ghé ShopTik xem có gì mới nào!
Kích thích quay lại: 👀 Mua gì gần đây mà quên Camio không đó? · Đừng nói với
Camio là bạn mua thẳng nhé… 😭 · Shopping mà quên kiểm tra hoàn tiền là Camio
buồn đó. · Quay lại rồi à! Đi săn hoàn tiếp thôi. · Camio vẫn giữ chỗ cho bạn
đây 🫡

### 13. Nhắc trước khi mua — `remind`
⚠️ Khoan thanh toán! Kiểm tra hoàn tiền chưa? · Mua thì mua, nhưng nhớ hoàn nha!
🧡 · Một giây dán link, đỡ tiếc tiền về sau. · Trước khi bấm Mua, nhớ ghé Camio!
· Đừng để tiền hoàn nằm lại trên bàn 👀 · Thói quen mới: Copy link → ShopTik →
Mua hàng. · Camio nhắc nhẹ: kiểm tra link trước khi checkout nhé!

### 14. Thống kê tiết kiệm — `stats`
📊 Tháng này Camio đã giúp bạn hoàn {amount}. · Bạn đã lấy lại {amount} từ những
món vốn định mua. · Tổng tiền hoàn tháng này: {amount} 💰 · Shopping vẫn vậy,
nhưng ví đỡ đau hơn rồi 😎 · Camio báo cáo: tháng này bạn đã tiết kiệm {amount}.
· Từng khoản nhỏ cộng lại thành {amount} rồi đó! · Tổng chiến lợi phẩm: {amount} 🏆

### 15. Trống – chưa có đơn — `emptyOrders`
Chưa có đơn nào ở đây. · 🛒 Chiếc giỏ này đang hơi cô đơn… · Chưa có chiến lợi
phẩm. Đi săn thôi! · Camio chưa thấy đơn nào 👀 · Đơn đầu tiên đang chờ bạn đó! ·
Dán một chiếc link và bắt đầu thôi 🧡

### 16. Trống – chưa có tiền hoàn — `emptyWallet`
💰 Ví đang chờ đồng đầu tiên. · Chưa có tiền hoàn… tạm thời thôi 😎 · Camio đang
chờ cơ hội kiếm khoản hoàn đầu tiên cho bạn. · Bắt đầu bằng một link nhé! · Ví
hơi trống. Đi săn hoàn thôi!

### 17. Lỗi hệ thống — `error` (Camio nhận lỗi thay thông báo kỹ thuật)
😵 Camio vừa vấp một chút… · Oops! Có gì đó chưa ổn. · Camio xử lý chưa thành
công. Thử lại nhé! · Hệ thống đang hơi bận, chờ Camio một chút nha. · Camio vừa
mất tín hiệu trong giây lát 📡 · Thử lại giúp Camio nhé!

### 18. Câu chúc / random trên Home — `random`
Mua thông minh hơn một chút mỗi ngày. 🧡 · Tiền nhỏ cũng là tiền nha! 💰 · Đã
định mua thì nhớ kiểm tra hoàn. · Camio không cản bạn shopping. Camio chỉ muốn
bạn shopping lời hơn 😎 · Đừng mua ít hơn. Hãy mua thông minh hơn. · Một chiếc
link, thêm một cơ hội tiết kiệm. · Săn deal là một chuyện. Săn hoàn là chuyện của
Camio. · Món yêu thích vẫn mua, tiền hoàn vẫn lấy. · Camio trực 24/7, chỉ sợ bạn
quên dán link thôi 👀 · Shopping vui, nhận hoàn còn vui hơn.

### Thông báo server (push 5–18 từ)

| Sự kiện | Hàm | Ví dụ |
| --- | --- | --- |
| Sàn xác nhận đơn (tiền vào ví CHỜ) | `camioVoice.orderApproved` | "🎯 Bắt được đơn rồi!" / "Đơn 2508… trên Shopee đã ghi nhận. Dự kiến hoàn 45.000₫ — đang chờ về ví." |
| Tiền hoàn sang KHẢ DỤNG | `camioVoice.cashbackReleased` | "💰 Ting! Tiền về!" / "+45.000₫ vào ví, rút được rồi. Quá đẹp! 🎉" |
| Gửi yêu cầu thưởng nhiệm vụ | `camioVoice.missionClaimSent` | "Camio đã nhận yêu cầu thưởng 🫡" |
| Nhiệm vụ được duyệt | `camioVoice.missionApproved` | "🎉 Nhiệm vụ xong, thưởng về!" |
| Nhiệm vụ bị từ chối | `camioVoice.missionRejected` | "Hmm… nhiệm vụ chưa được duyệt 🥲" |
| Lệnh rút được duyệt | `camioVoice.withdrawalApproved` | "Lệnh rút đã duyệt! 🫡" |
| CSKH trả lời (Slack → app) | `camioVoice.supportReply` | "Đội hỗ trợ vừa nhắn bạn 📩" / trích đoạn trả lời |
