import { LegalDoc } from '@/components/LegalDoc';

/** Quyền riêng tư / Privacy Policy — song ngữ, tái hiện nội dung web (5 mục). */
export default function PrivacyScreen() {
  return (
    <LegalDoc
      vi={{
        title: 'Quyền riêng tư',
        updated: 'Cập nhật: 25/08/2026',
        intro:
          'ShopTik tôn trọng quyền riêng tư của bạn và chỉ thu thập dữ liệu cần thiết để cung cấp dịch vụ hoàn tiền minh bạch.',
        sections: [
          {
            h: '1. Dữ liệu chúng tôi xử lý',
            p: 'Email, tên hiển thị, mã giới thiệu, lịch sử mua qua liên kết, số dư và giao dịch ví, thông tin tài khoản ngân hàng nhận tiền, và dữ liệu kỹ thuật tối thiểu (thiết bị, thời điểm đăng nhập) để bảo mật.',
          },
          {
            h: '2. Bảo vệ dữ liệu nhạy cảm',
            p: 'Mật khẩu được băm một chiều, số tài khoản ngân hàng được mã hóa, mã OTP không lưu ở dạng rõ. Chúng tôi không bao giờ hỏi mật khẩu/PIN/OTP của ngân hàng.',
          },
          {
            h: '3. Chia sẻ dữ liệu',
            p: 'Chỉ chia sẻ mã đối chiếu đơn với sàn/đối tác affiliate để ghi nhận hoàn tiền. Không bán dữ liệu cá nhân cho bên thứ ba vì mục đích quảng cáo.',
          },
          {
            h: '4. Quyền của bạn',
            p: 'Bạn có thể xem, sửa hoặc yêu cầu xóa tài khoản bất cứ lúc nào trong mục Tài khoản. Một số dữ liệu đối soát (bút toán, đơn hàng) được giữ lại theo quy định kế toán ngay cả sau khi xóa tài khoản.',
          },
          {
            h: '5. Liên hệ',
            p: 'Mọi thắc mắc về dữ liệu, vui lòng liên hệ qua mục Hỗ trợ trong ứng dụng.',
          },
        ],
      }}
      en={{
        title: 'Privacy Policy',
        updated: 'Updated: Aug 25, 2026',
        intro:
          'ShopTik respects your privacy and collects only the data needed to provide a transparent cashback service.',
        sections: [
          {
            h: '1. Data we process',
            p: 'Email, display name, referral code, purchase history via affiliate links, wallet balance and transactions, your payout bank account, and minimal technical data (device, sign-in time) for security.',
          },
          {
            h: '2. Protecting sensitive data',
            p: 'Passwords are one-way hashed, bank account numbers are encrypted, and OTP codes are never stored in plain text. We never ask for your bank password, PIN or OTP.',
          },
          {
            h: '3. Data sharing',
            p: 'We only share order reference codes with e-commerce platforms/affiliate partners to confirm your cashback. We do not sell personal data to third parties for advertising.',
          },
          {
            h: '4. Your rights',
            p: 'You can view, edit, or request deletion of your account at any time under the Account section. Some reconciliation data (ledger entries, orders) is retained for accounting compliance even after account deletion.',
          },
          {
            h: '5. Contact',
            p: 'For any data questions, please reach us through the in-app Support section.',
          },
        ],
      }}
    />
  );
}
