import { LegalDoc } from '@/components/LegalDoc';

/** Tuyên bố miễn trừ / Disclaimer — song ngữ. */
export default function DisclaimerScreen() {
  return (
    <LegalDoc
      vi={{
        title: 'Tuyên bố miễn trừ',
        updated: 'Cập nhật: 25/08/2026',
        intro:
          'Vui lòng đọc kỹ để hiểu đúng vai trò của ShopTik trước khi sử dụng dịch vụ.',
        sections: [
          {
            h: '1. ShopTik là gì',
            p: 'ShopTik là nền tảng hoàn tiền qua tiếp thị liên kết (affiliate). Chúng tôi KHÔNG bán hàng, không giữ hàng, không giao hàng và không xử lý thanh toán mua hàng. Chúng tôi chỉ tạo liên kết affiliate và ghi nhận hoàn tiền khi đơn đủ điều kiện.',
          },
          {
            h: '2. Tiền hoàn phụ thuộc sàn',
            p: 'Việc ghi nhận đơn và số tiền hoàn do sàn (Shopee, TikTok Shop, Lazada) và mạng affiliate xác nhận. ShopTik chỉ cộng tiền sau khi sàn xác nhận đơn hợp lệ; đơn bị hủy/hoàn/không hợp lệ sẽ không được hoàn.',
          },
          {
            h: '3. Không đảm bảo tỷ lệ',
            p: 'Tỷ lệ hoàn tiền, ưu đãi và tình trạng sản phẩm có thể thay đổi bất kỳ lúc nào theo chính sách của sàn. Số tiền hiển thị khi xem trước chỉ là dự kiến, không phải cam kết.',
          },
          {
            h: '4. Trách nhiệm về sản phẩm',
            p: 'Chất lượng, bảo hành, đổi trả và mọi tranh chấp về sản phẩm thuộc trách nhiệm của người bán và sàn thương mại điện tử, không thuộc ShopTik.',
          },
          {
            h: '5. Không phải tư vấn tài chính',
            p: 'Thông tin trong ứng dụng chỉ nhằm hỗ trợ mua sắm hoàn tiền, không phải lời khuyên đầu tư hay tài chính.',
          },
        ],
      }}
      en={{
        title: 'Disclaimer',
        updated: 'Updated: Aug 25, 2026',
        intro: 'Please read carefully to understand ShopTik’s role before using the service.',
        sections: [
          {
            h: '1. What ShopTik is',
            p: 'ShopTik is an affiliate cashback platform. We do NOT sell, stock, ship goods, or process purchase payments. We only generate affiliate links and record cashback when an order qualifies.',
          },
          {
            h: '2. Cashback depends on the platform',
            p: 'Order tracking and cashback amounts are confirmed by the e-commerce platform (Shopee, TikTok Shop, Lazada) and affiliate network. ShopTik credits cashback only after the platform confirms a valid order; cancelled/returned/invalid orders are not eligible.',
          },
          {
            h: '3. No rate guarantee',
            p: 'Cashback rates, offers and product availability can change at any time per the platform’s policy. Amounts shown in preview are estimates, not commitments.',
          },
          {
            h: '4. Product responsibility',
            p: 'Product quality, warranty, returns and any disputes are the responsibility of the seller and the e-commerce platform, not ShopTik.',
          },
          {
            h: '5. Not financial advice',
            p: 'Information in the app is intended to support cashback shopping only and is not investment or financial advice.',
          },
        ],
      }}
    />
  );
}
