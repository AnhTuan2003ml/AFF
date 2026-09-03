import { formatVnd } from "../lib/format.js";
import type {
  UserPolicyDocument,
  UserPolicyFacts,
  UserPolicySection,
} from "./user-policy.js";

/**
 * Điều khoản sử dụng và Chính sách quyền riêng tư — cùng khuôn với
 * Chính sách người dùng (buildUserPolicy): dữ liệu có cấu trúc, song ngữ, con số
 * lấy từ business_config (không viết cứng). Nội dung theo bản 1.0 (25/08/2026).
 */
export const TERMS_DOC_VERSION = "2026.08.25";
export const PRIVACY_DOC_VERSION = "2026.08.25";

const TERMS_PATH = "/dieu-khoan";
const PRIVACY_PATH = "/quyen-rieng-tu";

function sec(
  id: string,
  heading: string,
  paragraphs: string[],
  items: string[] = [],
): UserPolicySection {
  return { id, heading, paragraphs, items };
}

function docUrl(appOrigin: string, path: string): string {
  return `${appOrigin.replace(/\/+$/, "")}${path}`;
}

// ─────────────────────────── ĐIỀU KHOẢN SỬ DỤNG ───────────────────────────

export function buildTerms(
  facts: UserPolicyFacts,
  lang: string = "vi",
): UserPolicyDocument {
  if (lang === "en") return buildTermsEn(facts);
  const app = facts.appName;
  const threshold = facts.smallOrderThresholdVnd.toLocaleString("vi-VN");
  const attributionDays = facts.affiliateAttributionDays;
  const minWithdraw = formatVnd(facts.minWithdrawAmountVnd);

  return {
    version: TERMS_DOC_VERSION,
    title: "Điều khoản sử dụng",
    url: docUrl(facts.appOrigin, TERMS_PATH),
    lead:
      `Điều khoản này quy định các điều kiện áp dụng khi bạn đăng ký, truy cập và ` +
      `sử dụng ${app}. ${app} là nền tảng hoàn tiền mua sắm qua liên kết Affiliate ` +
      "và không phải là bên bán hàng. Hãy đọc kỹ Điều khoản sử dụng, Chính sách " +
      "người dùng và Chính sách quyền riêng tư trước khi dùng dịch vụ.",
    sections: [
      sec("pham-vi", "1. Phạm vi và bản chất dịch vụ", [
        `${app} cung cấp liên kết Affiliate để bạn truy cập Shopee, TikTok Shop, ` +
          `Lazada hoặc các sàn được ${app} công bố hỗ trợ.`,
        `${app} ghi nhận lượt truy cập, theo dõi dữ liệu Affiliate trong phạm vi ` +
          "khả năng kỹ thuật, hiển thị dữ liệu đơn do sàn cung cấp và tính khoản " +
          "hoàn theo Chính sách người dùng.",
        `${app} không bán hàng và không trực tiếp cung cấp sản phẩm. ${app} không ` +
          "kiểm soát giá bán, voucher, chất lượng sản phẩm, vận chuyển, đổi trả, " +
          "bảo hành hay quyết định cuối cùng của sàn đối với đơn hàng.",
        "Việc ghi nhận đơn, attribution và hoa hồng phụ thuộc vào cơ chế kỹ thuật, " +
          "dữ liệu và quyết định đối soát của sàn.",
      ]),
      sec(
        "thuat-ngu",
        "2. Giải thích thuật ngữ",
        [],
        [
          `"Sàn" là Shopee, TikTok Shop, Lazada hoặc nền tảng thương mại điện tử ` +
            `khác được ${app} công bố hỗ trợ.`,
          `"Liên kết ${app}" là đường dẫn Affiliate do ${app} tạo và gắn mã theo ` +
            "dõi tương ứng với tài khoản người dùng.",
          `"Click-ID" là mã định danh hệ thống tạo cho một lượt truy cập hợp lệ qua ` +
            `liên kết ${app}.`,
          `"Phiên mua" bắt đầu từ một Click-ID hợp lệ và kết thúc khi đơn được sàn ` +
            "ghi nhận attribution, Click-ID hết hạn, attribution bị thay thế bởi " +
            "nguồn khác, hoặc phiên không còn đáp ứng cơ chế theo dõi của sàn.",
          `"Đơn hợp lệ" là đơn được sàn ghi nhận attribution của ${app}, đáp ứng ` +
            "điều kiện nhận hoa hồng và không bị hủy, hoàn, trả, loại khỏi chương " +
            "trình hoặc điều chỉnh về mức không còn hoa hồng hợp lệ.",
          `"Hoa hồng thực nhận" là khoản hoa hồng Affiliate cuối cùng được sàn xác ` +
            `nhận cho ${app} sau mọi điều chỉnh, hủy, hoàn trả, khấu trừ.`,
          `"Giá trị đơn" là giá trị hàng hóa dùng để xác định ngưỡng áp dụng tỷ lệ ` +
            "hoàn. Trừ khi chương trình quy định khác, phí vận chuyển, thuế, phí " +
            "dịch vụ và các khoản không tạo hoa hồng không được tính vào.",
        ],
      ),
      sec(
        "tai-khoan",
        "3. Điều kiện sử dụng tài khoản",
        [],
        [
          `Mỗi cá nhân chỉ được sử dụng một tài khoản ${app}.`,
          "Tài khoản đăng ký bằng email đang hoạt động và phải được xác minh bằng " +
            "mã OTP 6 số gửi tới email đăng ký.",
          `Họ tên trên tài khoản phải phù hợp với chủ tài khoản ngân hàng dùng để ` +
            `nhận tiền. ${app} có thể yêu cầu xác minh danh tính hoặc quyền sở hữu ` +
            "tài khoản ngân hàng khi cần.",
          "Không mua bán, cho thuê, cho mượn, chuyển nhượng hoặc chia sẻ quyền sử " +
            "dụng tài khoản.",
          `Bạn tự chịu trách nhiệm bảo mật mật khẩu, OTP và thiết bị. ${app} không ` +
            "yêu cầu mật khẩu, mã PIN hay OTP ngân hàng của bạn.",
          "Nhiều người dùng chung thiết bị/mạng không tự động bị xem là gian lận; " +
            "nhưng nếu có nhiều tín hiệu cho thấy các tài khoản cùng người kiểm soát " +
            `hoặc thao túng, ${app} có thể yêu cầu xác minh bổ sung.`,
        ],
      ),
      sec(
        "ghi-nhan-don",
        "4. Ghi nhận đơn hàng và attribution",
        [
          `Để được xem xét hoàn tiền, hãy truy cập sản phẩm/sàn qua liên kết ${app} ` +
            "hợp lệ và mua theo luồng mở ra từ liên kết đó.",
        ],
        [
          "Không dùng thêm liên kết Affiliate khác, tiện ích trình duyệt hay công cụ " +
            "thay đổi attribution trong cùng phiên mua.",
          `Nếu bạn truy cập một liên kết Affiliate khác và sàn ghi nhận nguồn đó ` +
            `thay cho ${app}, đơn có thể không được tính hoàn tiền.`,
          `Nếu sàn không ghi nhận attribution của ${app} hoặc không trả hoa hồng, ` +
            `${app} không có khoản hoa hồng để phân phối và tiền hoàn của đơn đó có ` +
            "thể bằng 0.",
          "Ảnh chụp màn hình, mã đơn hay lịch sử trình duyệt không tự động chứng " +
            "minh attribution đã được sàn xác nhận. Dữ liệu attribution và đối soát " +
            "cuối cùng của sàn là căn cứ chính.",
          "Đơn thêm vào giỏ từ trước, mua trong livestream, mua qua liên kết bên thứ " +
            `ba hoặc luồng khác có thể không được ghi nhận nếu sàn không gắn ` +
            `attribution ${app}.`,
          `Một Click-ID có thời hạn đối soát tối đa ${attributionDays} ngày kể từ ` +
            "khi phát sinh, trừ khi sàn áp dụng thời hạn ngắn hơn.",
        ],
      ),
      sec(
        "tien-hoan",
        "5. Tiền hoàn và hoa hồng",
        [],
        [
          `Với đơn hợp lệ, bạn nhận ${facts.buyerCashbackPercent}% khoản hoa hồng ` +
            `thực nhận của ${app}.`,
          `Với đơn giá trị từ ${threshold}₫ trở xuống, bạn nhận ` +
            `${facts.smallOrderBuyerPercent}% khoản hoa hồng thực nhận, trừ khi ` +
            "chương trình công bố tỷ lệ khác trước khi giao dịch phát sinh.",
          "Công thức: Tiền hoàn = Hoa hồng thực nhận × Tỷ lệ hoàn. Tỷ lệ hoàn tính " +
            "trên hoa hồng thực nhận, không phải trực tiếp trên giá trị đơn.",
          "Số tiền hiển thị trước khi mua là DỰ KIẾN. Khoản thực tế có thể thay đổi " +
            "do tỷ lệ hoa hồng của sàn, voucher/khuyến mãi, điều kiện sản phẩm, hoàn/" +
            "hủy một phần, hoặc điều chỉnh khác từ sàn.",
          "Tiền hoàn tính đến đơn vị đồng và làm tròn xuống.",
          "Đơn nhiều sản phẩm có mức hoa hồng khác nhau được tính theo từng sản phẩm/" +
            "dòng hàng mà sàn cung cấp dữ liệu hợp lệ rồi cộng lại; nếu sàn chỉ cung " +
            "cấp dữ liệu cấp đơn thì dùng dữ liệu cấp đơn.",
          "Nếu đơn bị hủy/trả/hoàn một phần, chỉ điều chỉnh phần hoa hồng tương ứng " +
            "theo dữ liệu cuối cùng của sàn.",
          'Trạng thái "Hoàn thành" không bảo đảm hoa hồng không thể bị sàn điều ' +
            "chỉnh về sau.",
          `Nếu sàn truy hồi/giảm hoa hồng của đơn đã ghi nhận, ${app} có quyền điều ` +
            "chỉnh hoặc đảo khoản hoàn. Nếu số dư không đủ, tài khoản có thể phát " +
            "sinh số dư âm; khoản thiếu có thể được khấu trừ từ khoản hoàn/thưởng sau " +
            "hoặc được yêu cầu hoàn trả.",
        ],
      ),
      sec(
        "so-du-rut",
        "6. Số dư và rút tiền",
        [],
        [
          "Số dư có thể gồm số dư chờ, số dư khả dụng và các khoản điều chỉnh hoặc " +
            "đảo bút toán.",
          "Mỗi giao dịch tài chính được lưu kèm mã giao dịch, thời gian, loại giao " +
            "dịch, số tiền, đơn liên quan (nếu có) và trạng thái.",
          `Số tiền rút tối thiểu là ${minWithdraw} mỗi yêu cầu, trừ khi ${app} công ` +
            "bố ngưỡng khác.",
          "Tiền chỉ chuyển về tài khoản ngân hàng chính chủ đã xác minh; thông tin " +
            "chủ tài khoản phải phù hợp với thông tin xác minh của bạn.",
          `Bạn tự kiểm tra chính xác thông tin ngân hàng trước khi xác nhận. ${app} ` +
            "không chịu trách nhiệm khi bạn cung cấp sai thông tin, trừ khi lỗi từ " +
            `hệ thống ${app}.`,
          `Mọi yêu cầu rút có thể được kiểm tra để phát hiện gian lận/sai lệch/tuân ` +
            `thủ; trong thời gian kiểm tra ${app} có thể tạm dừng xử lý.`,
          "Số dư khả dụng cho phép tạo yêu cầu rút nhưng không đồng nghĩa tiền được " +
            "chuyển ngay.",
          `Nếu yêu cầu rút bị từ chối, ${app} cập nhật trạng thái và cung cấp lý do ` +
            "phù hợp, trừ thông tin có thể làm lộ cơ chế bảo mật/chống gian lận.",
        ],
      ),
      sec(
        "gioi-thieu",
        "7. Giới thiệu, nhiệm vụ và thưởng",
        [],
        [
          "Bạn có thể mời người dùng mới bằng mã giới thiệu riêng.",
          "Thưởng giới thiệu và thưởng nhiệm vụ chỉ được ghi nhận khi đủ điều kiện " +
            "chương trình và giao dịch liên quan đã được sàn xác nhận.",
          "Không dùng nhiều tài khoản do cùng một người kiểm soát để tạo thưởng, tự " +
            "giới thiệu, tạo tài khoản ảo, mua bán tài khoản hoặc dùng công cụ tự " +
            "động tạo lượt giới thiệu giả/hàng loạt.",
          `${app} có thể kết hợp nhiều tín hiệu để xác định tài khoản liên quan ` +
            "(thông tin xác minh, thiết bị, phương thức thanh toán, tài khoản ngân " +
            "hàng, hành vi truy cập, mẫu giao dịch). Một tín hiệu đơn lẻ không nhất " +
            "thiết là căn cứ kết luận gian lận.",
        ],
      ),
      sec(
        "hanh-vi-cam",
        "8. Hành vi không được phép",
        [
          "Bạn không được thực hiện hành vi làm sai lệch dữ liệu Affiliate, đơn " +
            "hàng, lượt giới thiệu hoặc khoản thưởng, bao gồm nhưng không giới hạn:",
        ],
        [
          "tạo đơn giả hoặc giao dịch không nhằm mua hàng thực;",
          "đặt rồi hủy hoặc hoàn hàng loạt để tạo hoa hồng;",
          "thông đồng với người bán tạo hoa hồng không hợp lệ;",
          "giao dịch nhằm tạo lợi ích hoàn tiền không chính đáng;",
          "giả mạo lượt click, chuyển đổi hoặc attribution; can thiệp Click-ID hoặc " +
            "tham số theo dõi;",
          "dùng phần mềm, script, API, extension, macro, emulator, bot hoặc dịch vụ " +
            "tự động/bán tự động để thao túng hệ thống;",
          "dùng trái phép danh tính, email hoặc tài khoản ngân hàng của người khác;",
          "cố ý khai thác, lặp lại hoặc che giấu lỗi hệ thống để nhận lợi ích không " +
            "chính đáng;",
          "hành vi khác nhằm làm sai lệch đối soát hoặc nhận tiền/thưởng không có " +
            "quyền hưởng.",
          `Dùng công cụ tự động không mặc nhiên bị coi là vi phạm nếu không dùng để ` +
            `thao túng dữ liệu, attribution, giao dịch, giới thiệu, thưởng hoặc đối ` +
            `soát; ${app} có thể yêu cầu giải trình nếu tạo ra tín hiệu rủi ro.`,
        ],
      ),
      sec(
        "xac-minh",
        "9. Xác minh và phòng chống gian lận",
        [],
        [
          `${app} có thể dùng dữ liệu và tín hiệu cần thiết để phát hiện gian lận: ` +
            "dữ liệu thiết bị, phiên truy cập, hành vi click, mẫu giao dịch, thông " +
            "tin thanh toán và dữ liệu liên quan theo Chính sách quyền riêng tư.",
          `${app} không nhất thiết công khai toàn bộ quy tắc, ngưỡng hoặc tín hiệu ` +
            "chống gian lận nếu việc công khai giúp né tránh hệ thống.",
          `Khi cần, ${app} có thể yêu cầu tài liệu/thông tin hợp lý để xác nhận ` +
            "quyền sở hữu tài khoản, tài khoản ngân hàng hoặc giao dịch.",
          "Thời gian xác minh có thể thay đổi và kéo dài khi cần đối soát với sàn, " +
            "ngân hàng hoặc bên thứ ba.",
          "Việc tạm dừng tài khoản/giao dịch để xác minh không tự động đồng nghĩa " +
            "người dùng đã bị kết luận gian lận.",
        ],
      ),
      sec(
        "xu-ly-vi-pham",
        "10. Biện pháp xử lý vi phạm",
        [
          `Tùy tính chất và mức độ vi phạm, ${app} có thể: từ chối ghi nhận đơn/` +
            "thưởng; điều chỉnh hoặc thu hồi khoản hoàn; tạm dừng yêu cầu rút; yêu " +
            "cầu xác minh; tạm khóa tài khoản; chấm dứt tài khoản; yêu cầu hoàn trả " +
            "khoản đã nhận không hợp lệ.",
        ],
        [
          `${app} có thể áp dụng một hoặc nhiều biện pháp dựa trên dữ liệu và mức độ ` +
            "rủi ro; việc áp dụng không làm mất quyền điều chỉnh khoản phát sinh do " +
            "sai lệch dữ liệu hoặc hoa hồng bị sàn truy hồi.",
          "Khi cần bảo vệ hệ thống hoặc người dùng, có thể áp dụng biện pháp tạm " +
            "thời trước khi hoàn tất xác minh.",
        ],
      ),
      sec(
        "cham-dut",
        "11. Tạm ngừng, chấm dứt và đóng tài khoản",
        [],
        [
          `Bạn có thể ngừng sử dụng dịch vụ hoặc yêu cầu đóng tài khoản theo quy ` +
            `trình ${app} công bố.`,
          `${app} có thể tạm ngừng/chấm dứt tài khoản khi phát hiện hoặc có cơ sở ` +
            "hợp lý để nghi ngờ vi phạm Điều khoản, Chính sách người dùng, chương " +
            "trình áp dụng hoặc quy định pháp luật.",
          "Đóng tài khoản không làm mất nghĩa vụ đã phát sinh trước đó, gồm nghĩa vụ " +
            "hoàn trả khoản nhận không hợp lệ hoặc xử lý số dư âm nếu có.",
          "Các khoản đang chờ đối soát khi đóng tài khoản có thể tiếp tục được xử lý " +
            `theo dữ liệu cuối cùng của sàn trong phạm vi ${app} còn khả năng đối soát.`,
        ],
      ),
      sec(
        "trach-nhiem-nguoi-dung",
        "12. Trách nhiệm của người dùng",
        [],
        [
          `Bạn chịu trách nhiệm về tính chính xác của thông tin cung cấp cho ${app}.`,
          "Bạn chịu trách nhiệm bảo mật tài khoản, mật khẩu, OTP đăng nhập và thiết " +
            "bị sử dụng.",
          "Sử dụng dịch vụ đúng mục đích, không can thiệp hệ thống và không tạo " +
            "khoản hoàn/thưởng/lợi ích không chính đáng.",
          "Tự kiểm tra điều kiện của từng chương trình hoàn tiền, giới thiệu hoặc " +
            "nhiệm vụ trước khi tham gia.",
          "Không dùng dịch vụ để vi phạm pháp luật hoặc xâm phạm quyền, lợi ích hợp " +
            "pháp của bên khác.",
        ],
      ),
      sec("trach-nhiem", "13. Trách nhiệm và giới hạn dịch vụ của ShopTik", [
        `${app} có trách nhiệm: cung cấp thông tin tỷ lệ hoàn theo từng chương ` +
          "trình; ghi nhận và đối soát dữ liệu trong phạm vi khả năng kỹ thuật; " +
          "hiển thị trạng thái giao dịch; tiếp nhận và xử lý yêu cầu rút, khiếu nại " +
          "theo quy trình; bảo vệ dữ liệu người dùng theo Chính sách quyền riêng tư.",
        `${app} không chịu trách nhiệm đối với: lỗi/gián đoạn/thay đổi từ hệ thống ` +
          "của sàn; việc sàn không ghi nhận attribution; việc sàn thay đổi/điều " +
          "chỉnh hoa hồng; giá bán, voucher, chất lượng sản phẩm, giao hàng, đổi " +
          `trả, bảo hành; sự cố ngân hàng không thuộc hệ thống ${app}; thông tin ` +
          `sai do người dùng cung cấp; và sự kiện ngoài khả năng kiểm soát hợp lý ` +
          `của ${app}.`,
        `${app} có thể tạm thời hạn chế một số chức năng khi cần bảo trì, xử lý sự ` +
          "cố, đối soát dữ liệu hoặc bảo vệ hệ thống. Dịch vụ của sàn, ngân hàng " +
          "hoặc bên thứ ba có thể thay đổi/gián đoạn và ảnh hưởng đến việc ghi nhận " +
          "đơn, đối soát hoặc rút tiền.",
      ]),
      sec("so-huu-tri-tue", "14. Sở hữu trí tuệ", [
        `Trừ nội dung thuộc bên thứ ba, giao diện, thương hiệu, thiết kế, phần mềm, ` +
          `cơ sở dữ liệu và các thành phần do ${app} cung cấp thuộc quyền sở hữu ` +
          `hoặc quyền sử dụng hợp pháp của ${app}.`,
        `Bạn không được sao chép, sửa đổi, phân phối, khai thác hoặc sử dụng các ` +
          `thành phần của ${app} ngoài phạm vi được cho phép. Thương hiệu và nội ` +
          "dung của Shopee, TikTok Shop, Lazada hoặc bên thứ ba thuộc quyền của chủ " +
          "sở hữu tương ứng.",
      ]),
      sec("du-lieu", "15. Dữ liệu cá nhân", [
        `${app} xử lý dữ liệu cần thiết cho xác thực tài khoản, ghi nhận đơn, tính ` +
          "và thanh toán tiền hoàn, chống gian lận, hỗ trợ người dùng và tuân thủ " +
          "nghĩa vụ pháp lý.",
        "Việc thu thập, sử dụng, chia sẻ, lưu giữ, bảo vệ và xử lý yêu cầu về dữ " +
          `liệu cá nhân thực hiện theo Chính sách quyền riêng tư của ${app}. Dữ ` +
          "liệu giao dịch, kế toán, kiểm toán hoặc dữ liệu phải lưu theo quy định " +
          "pháp luật có thể được lưu giữ kể cả sau khi tài khoản bị đóng.",
      ]),
      sec(
        "khieu-nai",
        "16. Khiếu nại và giải quyết tranh chấp",
        [],
        [
          `Bạn có thể gửi khiếu nại theo kênh hỗ trợ của ${app} kèm thông tin cần ` +
            "thiết để kiểm tra.",
          "Khiếu nại về đơn hàng được xử lý theo thời hạn và căn cứ tại Chính sách " +
            "người dùng hoặc chương trình cụ thể.",
          `Nếu dữ liệu ${app} khác dữ liệu đối soát cuối cùng của sàn, dữ liệu cuối ` +
            "cùng do sàn xác nhận về attribution và hoa hồng được ưu tiên, trừ khi " +
            `${app} xác định có lỗi từ hệ thống của mình.`,
          "Không yêu cầu hoàn tiền/bồi hoàn nhiều lần cho cùng một giao dịch và " +
            "cùng một khoản thiệt hại nếu đã được giải quyết hợp lệ từ nguồn khác.",
        ],
      ),
      sec(
        "thay-doi",
        "17. Thay đổi điều khoản",
        [],
        [
          `${app} có thể cập nhật Điều khoản khi có thay đổi về cơ chế Affiliate, ` +
            "hệ thống, sản phẩm dịch vụ hoặc quy định pháp luật.",
          "Mỗi phiên bản có số phiên bản và ngày hiệu lực.",
          "Thay đổi đáng kể ảnh hưởng quyền lợi/nghĩa vụ sẽ được thông báo trước và, " +
            "khi phù hợp, yêu cầu bạn xem xét hoặc chấp thuận trước khi tiếp tục.",
          "Điều kiện liên quan đến đơn đã phát sinh áp dụng theo phiên bản có hiệu " +
            "lực tại thời điểm đơn phát sinh, trừ khi pháp luật yêu cầu khác.",
          "Các quy định về chống gian lận, bảo mật, nghĩa vụ pháp lý hoặc xử lý sai " +
            "lệch dữ liệu có thể áp dụng với hành vi phát sinh trước ngày cập nhật " +
            "trong phạm vi pháp luật cho phép.",
        ],
      ),
      sec(
        "thu-tu-uu-tien",
        "18. Thứ tự ưu tiên và tài liệu liên quan",
        [],
        [
          `Điều khoản này được đọc cùng Chính sách người dùng và Chính sách quyền ` +
            `riêng tư của ${app}.`,
          "Nếu chương trình hoàn tiền/giới thiệu/nhiệm vụ cụ thể có điều kiện riêng " +
            "được công bố rõ trước khi tham gia, điều kiện của chương trình đó được " +
            "áp dụng.",
          "Với điều kiện ghi nhận đơn, attribution và hoa hồng, dữ liệu đối soát " +
            "cuối cùng của sàn được ưu tiên theo Chính sách người dùng, trừ khi " +
            `${app} xác định có lỗi từ hệ thống của mình.`,
          "Chính sách quyền riêng tư điều chỉnh riêng việc xử lý dữ liệu cá nhân.",
          "Nếu một điều khoản vô hiệu hoặc không thể thi hành, các điều khoản còn " +
            "lại vẫn có hiệu lực trong phạm vi pháp luật cho phép.",
        ],
      ),
      sec("hieu-luc", "19. Hiệu lực", [
        `Điều khoản này có hiệu lực từ 25/08/2026 và được công bố tại trang Điều ` +
          `khoản sử dụng chính thức của ${app}.`,
        "Bạn nên đọc đồng thời Chính sách người dùng và Chính sách quyền riêng tư " +
          `(liên kết ở chân trang). ${app} có thể cập nhật đường dẫn, thông tin ` +
          "liên hệ hoặc thông tin vận hành khi cần.",
      ]),
    ],
  };
}

function buildTermsEn(facts: UserPolicyFacts): UserPolicyDocument {
  const app = facts.appName;
  const threshold = facts.smallOrderThresholdVnd.toLocaleString("vi-VN");
  const attributionDays = facts.affiliateAttributionDays;
  const minWithdraw = formatVnd(facts.minWithdrawAmountVnd);

  return {
    version: TERMS_DOC_VERSION,
    title: "Terms of Use",
    url: docUrl(facts.appOrigin, TERMS_PATH),
    lead:
      `These Terms set the conditions that apply when you register, access and use ` +
      `${app}. ${app} is a cashback platform via affiliate links and is not the ` +
      "seller. Please read the Terms of Use, User Policy and Privacy Policy before " +
      "using the service.",
    sections: [
      sec("pham-vi", "1. Scope and nature of the service", [
        `${app} provides affiliate links for you to reach Shopee, TikTok Shop, ` +
          `Lazada or platforms ${app} announces support for.`,
        `${app} records visits, tracks affiliate data within technical capability, ` +
          "displays order data provided by the platform, and computes cashback per " +
          "the User Policy.",
        `${app} does not sell or directly provide products. ${app} does not control ` +
          "pricing, vouchers, product quality, shipping, returns, warranty or the " +
          "platform's final decision on an order.",
        "Order tracking, attribution and commission depend on the platform's " +
          "technical mechanism, data and reconciliation decisions.",
      ]),
      sec(
        "thuat-ngu",
        "2. Definitions",
        [],
        [
          `"Platform" means Shopee, TikTok Shop, Lazada or another e-commerce ` +
            `platform ${app} announces support for.`,
          `"${app} link" is an affiliate URL created by ${app} carrying a tracking ` +
            "code tied to your account.",
          `"Click-ID" is an identifier the system creates for a valid visit through ` +
            `a ${app} link.`,
          `"Purchase session" starts from a valid Click-ID and ends when the order ` +
            "is attributed, the Click-ID expires, attribution is replaced by another " +
            "source, or the session no longer meets the platform's tracking.",
          `"Valid order" is an order attributed to ${app}, meeting the platform's ` +
            "commission conditions, not cancelled, refunded, returned, removed from " +
            "the program, or adjusted below a valid commission.",
          `"Actual commission" is the final affiliate commission the platform ` +
            `confirms for ${app} after all adjustments, cancellations, refunds and ` +
            "deductions.",
          `"Order value" is the goods value used to determine the cashback-rate ` +
            "threshold. Unless a program states otherwise, shipping, taxes, service " +
            "fees and non-commissionable amounts are excluded.",
        ],
      ),
      sec(
        "tai-khoan",
        "3. Account conditions",
        [],
        [
          `Each person may use only one ${app} account.`,
          "Accounts register with an active email and must be verified by a 6-digit " +
            "OTP sent to that email.",
          `Your account name must match the holder of the bank account used to ` +
            `receive money. ${app} may require identity or bank-ownership ` +
            "verification when needed.",
          "Do not sell, rent, lend, transfer or share account access.",
          `You are responsible for keeping your password, OTP and device secure. ` +
            `${app} never asks for your password, PIN or bank OTP.`,
          "Multiple people sharing a device/network are not automatically deemed " +
            "fraud; but if several signals indicate accounts under the same control " +
            `or manipulation, ${app} may require additional verification.`,
        ],
      ),
      sec(
        "ghi-nhan-don",
        "4. Order tracking and attribution",
        [
          `To be eligible for cashback, reach the product/platform through a valid ` +
            `${app} link and buy in the flow opened from that link.`,
        ],
        [
          "Do not use another affiliate link, browser extension or attribution-" +
            "changing tool within the same purchase session.",
          `If you visit another affiliate link and the platform credits that source ` +
            `instead of ${app}, the order may not qualify.`,
          `If the platform does not attribute the order to ${app} or pay ` +
            `commission, ${app} has no commission to share and the order's cashback ` +
            "may be 0.",
          "Screenshots, order codes or browser history do not automatically prove " +
            "attribution. The platform's attribution and final reconciliation data " +
            "is the primary basis.",
          "Orders added to cart earlier, bought during a livestream, via a third-" +
            `party link or another flow may not be tracked if the platform does not ` +
            `attribute them to ${app}.`,
          `A Click-ID is valid for reconciliation for up to ${attributionDays} days ` +
            "from creation, unless the platform applies a shorter period.",
        ],
      ),
      sec(
        "tien-hoan",
        "5. Cashback and commission",
        [],
        [
          `For a valid order, you receive ${facts.buyerCashbackPercent}% of ${app}'s ` +
            "actual commission.",
          `For orders worth ${threshold}₫ or less, you receive ` +
            `${facts.smallOrderBuyerPercent}% of the actual commission, unless a ` +
            "program announces a different rate before the transaction.",
          "Formula: Cashback = Actual commission × Cashback rate. The rate applies " +
            "to the actual commission, not directly to the order value.",
          "The amount shown before purchase is an ESTIMATE. The actual amount may " +
            "change due to the platform's commission rate, vouchers/promotions, " +
            "product conditions, partial refunds/cancellations, or other platform " +
            "adjustments.",
          "Cashback is computed in whole đồng and rounded down.",
          "For multi-item orders with different rates, cashback is computed per " +
            "item/line where the platform provides valid data, then summed; if only " +
            "order-level data is provided, that is used.",
          "For partial cancellations/returns/refunds, only the affected commission " +
            "is adjusted per the platform's final data.",
          '"Completed" status does not guarantee the commission cannot be adjusted ' +
            "later by the platform.",
          `If the platform claws back/reduces commission on a recorded order, ${app} ` +
            "may adjust or reverse the cashback. If the balance is insufficient, the " +
            "account may go negative; the shortfall may be deducted from later " +
            "cashback/rewards or requested for repayment.",
        ],
      ),
      sec(
        "so-du-rut",
        "6. Balance and withdrawals",
        [],
        [
          "Your balance may include pending balance, available balance, and " +
            "adjustments or reversing entries.",
          "Each financial transaction is stored with a transaction code, time, " +
            "type, amount, related order (if any) and status.",
          `The minimum withdrawal is ${minWithdraw} per request, unless ${app} ` +
            "announces a different threshold.",
          "Money is only transferred to your own verified bank account; the holder's " +
            "details must match your verified information.",
          `You must check bank details carefully before confirming. ${app} is not ` +
            `liable for incorrect details you provide, unless the error is from ` +
            `${app}'s system.`,
          `Every request may be checked for fraud/mismatch/compliance; during the ` +
            `check ${app} may pause processing.`,
          "Available balance lets you create a request but does not mean immediate " +
            "transfer.",
          `If a request is refused, ${app} updates the status and provides a ` +
            "suitable reason, except information that could reveal security/anti-" +
            "fraud mechanisms.",
        ],
      ),
      sec(
        "gioi-thieu",
        "7. Referrals, missions and rewards",
        [],
        [
          "You can invite new users with your personal referral code.",
          "Referral and mission rewards are only recorded when program conditions " +
            "are met and the related transaction is confirmed by the platform.",
          "Do not use multiple accounts under the same control to generate rewards, " +
            "self-refer, create fake accounts, trade accounts, or use automated " +
            "tools to generate fake/mass referrals.",
          `${app} may combine multiple signals to identify related accounts ` +
            "(verification info, device, payment method, bank account, access " +
            "behavior, transaction patterns). A single signal is not necessarily " +
            "conclusive of fraud.",
        ],
      ),
      sec(
        "hanh-vi-cam",
        "8. Prohibited behavior",
        [
          "You must not act to distort affiliate data, orders, referrals or " +
            "rewards, including but not limited to:",
        ],
        [
          "creating fake orders or transactions not intended as real purchases;",
          "placing then mass-cancelling or returning to generate commission;",
          "colluding with sellers to create invalid commission;",
          "transacting to gain undue cashback benefits;",
          "faking clicks, conversions or attribution; tampering with the Click-ID " +
            "or tracking parameters;",
          "using software, scripts, APIs, extensions, macros, emulators, bots or " +
            "automated/semi-automated services to manipulate the system;",
          "using another person's identity, email or bank account without " +
            "authorization;",
          "deliberately exploiting, repeating or hiding system bugs for undue " +
            "benefit;",
          "any other act to distort reconciliation or obtain money/rewards you are " +
            "not entitled to.",
          "Using automation is not inherently a violation if it is not used to " +
            "manipulate data, attribution, transactions, referrals, rewards or " +
            `reconciliation; ${app} may request an explanation if it creates risk ` +
            "signals.",
        ],
      ),
      sec(
        "xac-minh",
        "9. Verification and fraud prevention",
        [],
        [
          `${app} may use necessary data and signals to detect fraud: device data, ` +
            "access sessions, click behavior, transaction patterns, payment info and " +
            "related data per the Privacy Policy.",
          `${app} need not disclose all rules, thresholds or anti-fraud signals if ` +
            "disclosure would help evade the system.",
          `When needed, ${app} may request reasonable documents/information to ` +
            "confirm ownership of the account, bank account or transaction.",
          "Verification time may vary and be prolonged when reconciliation with the " +
            "platform, bank or a third party is required.",
          "Suspending an account/transaction for verification does not automatically " +
            "mean the user was found to commit fraud.",
        ],
      ),
      sec(
        "xu-ly-vi-pham",
        "10. Handling violations",
        [
          `Depending on the nature and severity, ${app} may: refuse to record ` +
            "orders/rewards; adjust or claw back cashback; pause withdrawals; require " +
            "verification; suspend the account; terminate the account; request " +
            "repayment of amounts received invalidly.",
        ],
        [
          `${app} may apply one or more measures based on data and risk; doing so ` +
            "does not waive the right to adjust amounts arising from data distortion " +
            "or commission clawed back by the platform.",
          "Where needed to protect the system or users, temporary measures may apply " +
            "before verification is complete.",
        ],
      ),
      sec(
        "cham-dut",
        "11. Suspension, termination and account closure",
        [],
        [
          `You may stop using the service or request account closure per ${app}'s ` +
            "published process.",
          `${app} may suspend/terminate an account upon detecting or having ` +
            "reasonable grounds to suspect a violation of the Terms, User Policy, " +
            "an applicable program or the law.",
          "Closing an account does not waive obligations arising beforehand, " +
            "including repaying amounts received invalidly or resolving a negative " +
            "balance.",
          "Amounts pending reconciliation at closure may continue to be processed " +
            `per the platform's final data while ${app} can still reconcile.`,
        ],
      ),
      sec(
        "trach-nhiem-nguoi-dung",
        "12. User responsibilities",
        [],
        [
          `You are responsible for the accuracy of information you provide ${app}.`,
          "You are responsible for keeping your account, password, login OTP and " +
            "device secure.",
          "Use the service for its intended purpose, do not interfere with the " +
            "system, and do not create undue cashback/rewards/benefits.",
          "Check each cashback, referral or mission program's conditions before " +
            "joining.",
          "Do not use the service to break the law or infringe others' rights.",
        ],
      ),
      sec("trach-nhiem", "13. ShopTik's responsibilities and service limits", [
        `${app} is responsible for: providing cashback-rate information per program; ` +
          "recording and reconciling data within technical capability; displaying " +
          "transaction status; receiving and processing withdrawals and complaints; " +
          "protecting user data per the Privacy Policy.",
        `${app} is not responsible for: errors/interruptions/changes from the ` +
          "platform's system; the platform not attributing an order; the platform " +
          "changing/adjusting commission; pricing, vouchers, product quality, " +
          `delivery, returns or warranty; bank incidents outside ${app}'s system; ` +
          `incorrect information provided by the user; and events beyond ${app}'s ` +
          "reasonable control.",
        `${app} may temporarily limit some functions for maintenance, incident ` +
          "handling, reconciliation or protection. Services of platforms, banks or " +
          "third parties may change/interrupt and affect order tracking, " +
          "reconciliation or withdrawals.",
      ]),
      sec("so-huu-tri-tue", "14. Intellectual property", [
        `Except third-party content, the interface, brand, design, software, ` +
          `databases and components provided by ${app} belong to or are lawfully ` +
          `used by ${app}.`,
        `You must not copy, modify, distribute, exploit or use ${app}'s components ` +
          "beyond what is permitted. Trademarks and content of Shopee, TikTok Shop, " +
          "Lazada or third parties belong to their respective owners.",
      ]),
      sec("du-lieu", "15. Personal data", [
        `${app} processes data needed for account authentication, order tracking, ` +
          "cashback calculation and payment, fraud prevention, user support and " +
          "legal compliance.",
        `Collection, use, sharing, retention, protection and handling of personal-` +
          `data requests follow ${app}'s Privacy Policy. Transaction, accounting, ` +
          "audit or legally-required data may be retained even after the account is " +
          "closed.",
      ]),
      sec(
        "khieu-nai",
        "16. Complaints and dispute resolution",
        [],
        [
          `You may submit complaints through ${app}'s support channel with the ` +
            "information needed to check.",
          "Order complaints are handled per the deadlines and bases in the User " +
            "Policy or specific program.",
          `If ${app}'s data differs from the platform's final reconciliation, the ` +
            "platform's final confirmed attribution and commission data prevails, " +
            `unless ${app} determines the error is from its own system.`,
          "Do not request refunds/reimbursement multiple times for the same " +
            "transaction and the same loss if validly resolved from another source.",
        ],
      ),
      sec(
        "thay-doi",
        "17. Changes to the Terms",
        [],
        [
          `${app} may update the Terms when affiliate mechanics, systems, products/` +
            "services or laws change.",
          "Each version has a version number and effective date.",
          "Significant changes to benefits/obligations will be announced in advance " +
            "and, where appropriate, require your review or acceptance before you " +
            "continue.",
          "Conditions related to orders already placed follow the version in effect " +
            "at the time of the order, unless the law requires otherwise.",
          "Rules on fraud prevention, security, legal obligations or data-distortion " +
            "handling may apply to conduct before the update, to the extent the law " +
            "permits.",
        ],
      ),
      sec(
        "thu-tu-uu-tien",
        "18. Priority and related documents",
        [],
        [
          `These Terms are read together with ${app}'s User Policy and Privacy Policy.`,
          "If a specific cashback/referral/mission program has its own conditions " +
            "clearly announced before you join, that program's conditions apply.",
          "For order tracking, attribution and commission, the platform's final " +
            `reconciliation data prevails per the User Policy, unless ${app} ` +
            "determines the error is from its own system.",
          "The Privacy Policy separately governs personal-data processing.",
          "If a clause is void or unenforceable, the remaining clauses stay in " +
            "effect to the extent the law permits.",
        ],
      ),
      sec("hieu-luc", "19. Effect", [
        `These Terms are effective from 25/08/2026 and published on ${app}'s ` +
          "official Terms of Use page.",
        "You should also read the User Policy and Privacy Policy (links in the " +
          `footer). ${app} may update links, contact details or operational ` +
          "information as needed.",
      ]),
    ],
  };
}

// ────────────────────── CHÍNH SÁCH QUYỀN RIÊNG TƯ ──────────────────────

export function buildPrivacyPolicy(
  facts: UserPolicyFacts,
  lang: string = "vi",
): UserPolicyDocument {
  if (lang === "en") return buildPrivacyEn(facts);
  const app = facts.appName;
  const attributionDays = facts.affiliateAttributionDays;

  return {
    version: PRIVACY_DOC_VERSION,
    title: "Chính sách quyền riêng tư",
    url: docUrl(facts.appOrigin, PRIVACY_PATH),
    lead:
      `${app} tôn trọng quyền riêng tư của người dùng và áp dụng biện pháp phù hợp ` +
      "để bảo vệ dữ liệu xử lý khi cung cấp dịch vụ. Chính sách này giải thích các " +
      "nhóm dữ liệu có thể xử lý, mục đích, phạm vi chia sẻ, thời gian lưu giữ, " +
      "biện pháp bảo vệ và cách bạn thực hiện các quyền với dữ liệu của mình. Đọc " +
      "cùng Điều khoản sử dụng và Chính sách người dùng.",
    sections: [
      sec(
        "pham-vi",
        "1. Phạm vi và nguyên tắc",
        [],
        [
          `Áp dụng cho dữ liệu ${app} xử lý khi bạn đăng ký, đăng nhập, dùng liên ` +
            "kết Affiliate, giao dịch, nhận tiền hoàn, rút tiền, tham gia giới " +
            "thiệu/nhiệm vụ, gửi yêu cầu hỗ trợ hoặc tương tác với hệ thống.",
          `${app} chỉ xử lý dữ liệu phù hợp với mục đích cung cấp dịch vụ, xác thực ` +
            "tài khoản, ghi nhận và đối soát đơn, tính và thanh toán tiền hoàn, " +
            "phòng chống gian lận, hỗ trợ người dùng và thực hiện nghĩa vụ pháp lý.",
          `${app} không yêu cầu mật khẩu, mã PIN hoặc OTP ngân hàng để rút tiền.`,
          "Phạm vi dữ liệu thực tế có thể thay đổi tùy chức năng bạn sử dụng và cách " +
            "tích hợp với sàn, ngân hàng hoặc nhà cung cấp dịch vụ.",
        ],
      ),
      sec(
        "nhom-du-lieu",
        "2. Các nhóm dữ liệu được xử lý",
        [
          "Chỉ dữ liệu thực tế cần cho chức năng tương ứng mới được xử lý — không " +
            "nên hiểu là hệ thống luôn thu thập toàn bộ các loại nêu dưới đây:",
        ],
        [
          "Dữ liệu tài khoản: email đăng ký, họ tên, trạng thái xác minh, thông tin " +
            "đăng nhập và phiên đăng nhập cần thiết cho bảo mật.",
          "Dữ liệu giao dịch Affiliate: liên kết sử dụng, Click-ID và tracking, " +
            "thời điểm/thông tin phiên mua cần cho attribution, mã đơn/giao dịch của " +
            "sàn, trạng thái đơn, dữ liệu sản phẩm/dòng hàng cần để đối soát, hoa " +
            "hồng và các khoản điều chỉnh.",
          "Dữ liệu số dư và thanh toán: lịch sử số dư và bút toán, mã giao dịch, " +
            "thời gian/loại/số tiền/đơn liên quan, thông tin tài khoản ngân hàng " +
            "nhận tiền (chủ tài khoản, số tài khoản, trạng thái xác minh) và lịch sử " +
            "yêu cầu rút.",
          "Dữ liệu hỗ trợ: nội dung yêu cầu/khiếu nại, mã đơn và tài liệu bạn cung " +
            "cấp để kiểm tra, thông tin liên hệ cần để phản hồi.",
          "Dữ liệu bảo mật/chống gian lận: tín hiệu về thiết bị, phiên truy cập, " +
            "hành vi click, mẫu giao dịch, thông tin thanh toán và dữ liệu liên quan " +
            "để phát hiện bất thường, bảo vệ tài khoản và ngăn gian lận.",
          "Dữ liệu kỹ thuật: thông tin trình duyệt, hệ điều hành, địa chỉ IP, định " +
            "danh phiên hoặc dữ liệu tương tự nếu hệ thống thực tế có sử dụng để vận " +
            "hành, bảo mật, khắc phục sự cố và kiểm tra tracking.",
        ],
      ),
      sec(
        "muc-dich",
        "3. Mục đích xử lý dữ liệu",
        [],
        [
          "Xác thực và quản lý tài khoản: tạo/duy trì tài khoản, gửi OTP xác minh " +
            "email, bảo vệ tài khoản, xác minh thông tin khi cần.",
          "Ghi nhận và đối soát đơn: tạo/quản lý Click-ID, ghi nhận phiên mua, kiểm " +
            "tra attribution, tiếp nhận dữ liệu đơn từ sàn, đối soát trạng thái và " +
            "hoa hồng.",
          "Tính và thanh toán tiền hoàn: tính theo hoa hồng thực nhận, cập nhật số " +
            "dư, ghi bút toán cộng/trừ/điều chỉnh, xử lý yêu cầu rút, kiểm tra thông " +
            "tin ngân hàng.",
          "Phòng chống gian lận và bảo mật: phát hiện tài khoản/giao dịch bất " +
            "thường, phát hiện thao túng click/attribution/giao dịch/giới thiệu/" +
            "thưởng, kiểm tra nhiều tín hiệu, bảo vệ hệ thống, người dùng và dữ liệu.",
          "Hỗ trợ và xử lý khiếu nại: kiểm tra đơn, xử lý yêu cầu rút, giải quyết " +
            "khiếu nại, liên hệ khi cần thêm thông tin.",
          "Tuân thủ nghĩa vụ pháp lý: lưu giữ dữ liệu giao dịch/kế toán/kiểm toán " +
            "khi có nghĩa vụ, đáp ứng yêu cầu hợp pháp của cơ quan có thẩm quyền, " +
            "bảo vệ quyền và lợi ích hợp pháp của các bên.",
        ],
      ),
      sec(
        "click-tracking",
        "4. Dữ liệu click, tracking và phiên mua",
        [],
        [
          `Khi bạn truy cập sàn qua liên kết ${app}, hệ thống có thể tạo Click-ID ` +
            "và ghi nhận thông tin cần thiết để xác định nguồn truy cập.",
          `${app} có thể xử lý dữ liệu phiên mua để xác định đơn còn liên kết với ` +
            "Click-ID và attribution hay không.",
          "Đóng/mở lại ứng dụng, đổi trình duyệt/thiết bị, xóa dữ liệu theo dõi, " +
            "đăng nhập lại hoặc thao tác tương tự có thể làm mất attribution tùy cơ " +
            "chế của sàn.",
          `Một Click-ID có thời hạn đối soát tối đa ${attributionDays} ngày kể từ ` +
            "khi phát sinh, trừ khi sàn áp dụng thời hạn ngắn hơn.",
          "Nếu hệ thống dùng cookie, local storage, session identifier hoặc công " +
            "nghệ tương tự để duy trì tracking, các công nghệ này chỉ được dùng " +
            "trong phạm vi cần thiết cho chức năng tương ứng.",
        ],
      ),
      sec(
        "du-lieu-san",
        "5. Dữ liệu đơn hàng và dữ liệu từ sàn",
        [],
        [
          `${app} có thể nhận dữ liệu đơn hàng, attribution, trạng thái đơn, hoa ` +
            "hồng và các khoản điều chỉnh từ sàn hoặc đối tác cung cấp dữ liệu.",
          "Dữ liệu này dùng để hiển thị lịch sử đơn, xác định đơn hợp lệ, tính tiền " +
            "hoàn và đối soát.",
          "Dữ liệu đối soát cuối cùng của sàn về attribution và hoa hồng là căn cứ " +
            "chính để xác định khoản hoàn theo Chính sách người dùng.",
          `${app} không kiểm soát và không chịu trách nhiệm về việc sàn thay đổi, ` +
            "hủy, hoàn hoặc điều chỉnh dữ liệu đơn hàng và hoa hồng.",
        ],
      ),
      sec(
        "du-lieu-ngan-hang",
        "6. Dữ liệu tài khoản ngân hàng và rút tiền",
        [],
        [
          `Khi bạn yêu cầu rút tiền, ${app} có thể xử lý thông tin cần thiết để xác ` +
            "minh tài khoản ngân hàng chính chủ và thực hiện chuyển tiền.",
          "Thông tin có thể gồm họ tên chủ tài khoản, số tài khoản, ngân hàng nhận " +
            "tiền, trạng thái xác minh và lịch sử yêu cầu rút trong phạm vi cần thiết.",
          `${app} không yêu cầu mật khẩu ngân hàng, mã PIN hoặc OTP ngân hàng của bạn.`,
          "Thông tin ngân hàng được bảo vệ bằng mã hóa và kiểm soát truy cập phù hợp.",
        ],
      ),
      sec(
        "chong-gian-lan",
        "7. Dữ liệu phòng chống gian lận",
        [],
        [
          `${app} có thể xử lý các tín hiệu cần thiết để phát hiện và ngăn gian ` +
            "lận: tín hiệu thiết bị, phiên truy cập, hành vi click, mẫu giao dịch, " +
            "thông tin thanh toán và dữ liệu liên quan.",
          "Các tín hiệu có thể được dùng kết hợp để đánh giá rủi ro; một tín hiệu " +
            "đơn lẻ không nhất thiết là căn cứ kết luận gian lận.",
          `Khi cần, ${app} có thể yêu cầu thông tin/tài liệu hợp lý để xác nhận ` +
            "quyền sở hữu tài khoản, tài khoản ngân hàng hoặc giao dịch.",
          `${app} không công khai toàn bộ quy tắc, ngưỡng hoặc tín hiệu chống gian ` +
            "lận nếu việc công khai giúp né tránh hệ thống.",
        ],
      ),
      sec(
        "chia-se",
        "8. Chia sẻ dữ liệu và bên nhận dữ liệu",
        [
          `${app} chỉ chia sẻ dữ liệu trong phạm vi cần thiết cho mục đích tương ` +
            "ứng. Không chia sẻ toàn bộ dữ liệu tài khoản chỉ vì một chức năng cần " +
            "một phần. Các nhóm bên nhận có thể gồm:",
        ],
        [
          "sàn thương mại điện tử hoặc mạng lưới Affiliate để ghi nhận và đối soát " +
            "giao dịch;",
          "nhà cung cấp email để gửi OTP và thông báo dịch vụ;",
          "ngân hàng, đơn vị/nhà cung cấp dịch vụ thanh toán để xử lý yêu cầu rút;",
          "nhà cung cấp hạ tầng kỹ thuật, bảo mật, lưu trữ hoặc hỗ trợ vận hành nếu " +
            "cần thiết;",
          "cơ quan nhà nước hoặc bên có thẩm quyền khi có nghĩa vụ hoặc căn cứ hợp " +
            "pháp để cung cấp.",
          `Khi dùng nhà cung cấp xử lý dữ liệu thay mặt ${app}, ${app} áp dụng biện ` +
            "pháp phù hợp để yêu cầu bên đó bảo vệ dữ liệu và chỉ xử lý theo phạm vi " +
            "được giao. Nếu cần chuyển/ xử lý dữ liệu qua hạ tầng ở nước ngoài, việc " +
            "xử lý theo cơ chế và yêu cầu pháp luật áp dụng.",
        ],
      ),
      sec(
        "luu-giu",
        "9. Lưu giữ dữ liệu",
        [],
        [
          `${app} lưu giữ dữ liệu trong thời gian cần thiết cho mục đích thu thập ` +
            "và xử lý.",
          "Dữ liệu giao dịch, số dư, rút tiền, kế toán, kiểm toán, khiếu nại và dữ " +
            "liệu liên quan có thể được lưu lâu hơn khi cần để đối soát, giải quyết " +
            "tranh chấp, phòng chống gian lận hoặc thực hiện nghĩa vụ pháp lý.",
          "Khi không còn nhu cầu và không có nghĩa vụ/căn cứ hợp pháp để tiếp tục " +
            "lưu, dữ liệu có thể được xóa, ẩn danh hoặc xử lý theo cơ chế phù hợp.",
          "Việc đóng/xóa tài khoản không nhất thiết làm dữ liệu giao dịch, kế toán, " +
            "kiểm toán hoặc dữ liệu phải lưu theo quy định bị xóa ngay.",
        ],
      ),
      sec(
        "bao-mat",
        "10. Bảo mật dữ liệu",
        [],
        [
          `${app} áp dụng biện pháp kỹ thuật và tổ chức phù hợp để bảo vệ dữ liệu ` +
            "khỏi truy cập, sử dụng, thay đổi, tiết lộ hoặc phá hủy trái phép.",
          "Mật khẩu được bảo vệ bằng cơ chế băm phù hợp.",
          "Dữ liệu ngân hàng được mã hóa và hiển thị ở dạng hạn chế khi cần.",
          "OTP dùng cho xác thực và không lưu ở dạng rõ ngoài thời gian cần thiết.",
          "Quyền truy cập dữ liệu nội bộ được giới hạn theo nhu cầu công việc và " +
            "quyền hạn được cấp.",
          "Không biện pháp nào bảo đảm an toàn tuyệt đối. Bạn cũng có trách nhiệm " +
            "bảo mật mật khẩu, OTP đăng nhập và thiết bị của mình.",
        ],
      ),
      sec(
        "quyen-nguoi-dung",
        "11. Quyền của người dùng đối với dữ liệu",
        [
          "Tùy trường hợp và phạm vi pháp luật áp dụng, bạn có thể yêu cầu:",
        ],
        [
          "biết và tiếp cận thông tin về dữ liệu của mình được xử lý;",
          "chỉnh sửa dữ liệu không chính xác;",
          "xóa dữ liệu khi có căn cứ phù hợp;",
          "hạn chế hoặc phản đối một số hoạt động xử lý khi pháp luật cho phép;",
          "thực hiện các quyền khác đối với dữ liệu cá nhân theo quy định áp dụng.",
          "Một số yêu cầu có thể bị giới hạn hoặc từ chối khi ảnh hưởng đến nghĩa vụ " +
            "lưu giữ, quyền lợi hợp pháp của ShopTik, quyền của bên khác, an toàn hệ " +
            "thống, phòng chống gian lận hoặc nghĩa vụ pháp lý.",
        ],
      ),
      sec(
        "gui-yeu-cau",
        "12. Cách gửi yêu cầu về dữ liệu",
        [],
        [
          `Bạn có thể gửi yêu cầu liên quan đến dữ liệu qua kênh hỗ trợ chính thức ` +
            `của ${app}.`,
          `Để bảo vệ dữ liệu, ${app} có thể yêu cầu xác minh danh tính hoặc quyền ` +
            "kiểm soát tài khoản trước khi xử lý.",
          `${app} có thể yêu cầu thêm thông tin nếu chưa đủ để xác định phạm vi dữ ` +
            "liệu hoặc quyền của người yêu cầu.",
          `Yêu cầu được xử lý trong thời gian phù hợp; nếu cần thêm thời gian, ` +
            `${app} có thể thông báo cho bạn. Không gửi mật khẩu, OTP ngân hàng hoặc ` +
            "thông tin bảo mật nhạy cảm qua các kênh không an toàn.",
        ],
      ),
      sec("su-co", "13. Sự cố và an toàn dữ liệu", [
        `Nếu phát hiện sự cố ảnh hưởng đến dữ liệu, ${app} sẽ đánh giá phạm vi và ` +
          "mức độ, áp dụng biện pháp khắc phục và thực hiện thông báo/xử lý theo yêu " +
          "cầu pháp luật áp dụng.",
        "Bạn cần thông báo sớm nếu phát hiện dấu hiệu tài khoản bị truy cập trái " +
          "phép hoặc dữ liệu bị dùng bất thường.",
      ]),
      sec("tre-em", "14. Dữ liệu của trẻ em", [
        `${app} không chủ động thiết kế dịch vụ để thu thập dữ liệu của trẻ em ` +
          "ngoài phạm vi cần thiết cho việc cung cấp dịch vụ và theo quy định áp " +
          "dụng.",
        `Nếu ${app} phát hiện dữ liệu được cung cấp trái điều kiện sử dụng hoặc quy ` +
          "định áp dụng, có thể áp dụng biện pháp xử lý phù hợp.",
      ]),
      sec("ben-thu-ba", "15. Liên kết và dịch vụ bên thứ ba", [
        `${app} có thể liên kết tới Shopee, TikTok Shop, Lazada hoặc dịch vụ của ` +
          "bên thứ ba. Khi bạn chuyển sang dịch vụ bên thứ ba, việc xử lý dữ liệu " +
          "trên đó theo chính sách của bên thứ ba tương ứng.",
        `${app} không kiểm soát toàn bộ hoạt động xử lý dữ liệu của các sàn, ngân ` +
          "hàng hoặc nhà cung cấp bên ngoài.",
      ]),
      sec(
        "thay-doi",
        "16. Thay đổi chính sách quyền riêng tư",
        [],
        [
          `${app} có thể cập nhật Chính sách quyền riêng tư khi thay đổi hệ thống, ` +
            "chức năng, nhà cung cấp, cơ chế Affiliate hoặc yêu cầu pháp lý.",
          "Mỗi phiên bản có số phiên bản và ngày hiệu lực.",
          "Nếu thay đổi đáng kể ảnh hưởng đến cách dữ liệu được xử lý hoặc quyền của " +
            `bạn, ${app} sẽ thông báo theo phương thức phù hợp và thực hiện các bước ` +
            "cần thiết theo quy định áp dụng.",
        ],
      ),
      sec(
        "tai-lieu-lien-quan",
        "17. Mối quan hệ với các tài liệu khác",
        [],
        [
          `Chính sách này được đọc cùng Chính sách người dùng và Điều khoản sử dụng ` +
            `${app}, cùng các điều kiện riêng của chương trình hoàn tiền/giới thiệu/` +
            "nhiệm vụ nếu có.",
          "Chính sách này điều chỉnh riêng các vấn đề về dữ liệu cá nhân.",
          "Điều kiện ghi nhận đơn, attribution, hoa hồng, tiền hoàn và xử lý số dư " +
            "được quy định tại Chính sách người dùng và Điều khoản sử dụng.",
        ],
      ),
      sec("hieu-luc", "18. Hiệu lực và thông tin liên quan", [
        `Chính sách quyền riêng tư này có hiệu lực từ 25/08/2026 và được công bố tại ` +
          `trang chính thức của ${app}.`,
        "Bạn nên đọc đồng thời Chính sách người dùng và Điều khoản sử dụng (liên kết " +
          `ở chân trang). ${app} có thể cập nhật đường dẫn, thông tin liên hệ hoặc ` +
          "thông tin vận hành khi cần.",
      ]),
    ],
  };
}

function buildPrivacyEn(facts: UserPolicyFacts): UserPolicyDocument {
  const app = facts.appName;
  const attributionDays = facts.affiliateAttributionDays;

  return {
    version: PRIVACY_DOC_VERSION,
    title: "Privacy Policy",
    url: docUrl(facts.appOrigin, PRIVACY_PATH),
    lead:
      `${app} respects users' privacy and applies suitable measures to protect the ` +
      "data processed while providing the service. This policy explains the data " +
      "categories that may be processed, purposes, sharing scope, retention, " +
      "protection measures, and how you exercise your data rights. Read it with the " +
      "Terms of Use and User Policy.",
    sections: [
      sec(
        "pham-vi",
        "1. Scope and principles",
        [],
        [
          `Applies to data ${app} processes when you register, sign in, use ` +
            "affiliate links, transact, receive cashback, withdraw, join referrals/" +
            "missions, submit support requests, or interact with the system.",
          `${app} only processes data suited to providing the service, account ` +
            "authentication, order tracking and reconciliation, cashback " +
            "calculation and payment, fraud prevention, user support and legal " +
            "compliance.",
          `${app} does not ask for your password, PIN or bank OTP to withdraw.`,
          "The actual data scope may vary by the functions you use and technical " +
            "integration with platforms, banks or service providers.",
        ],
      ),
      sec(
        "nhom-du-lieu",
        "2. Data categories processed",
        [
          "Only data actually needed for the corresponding function is processed — " +
            "the system does not always collect every category below:",
        ],
        [
          "Account data: registration email, name, verification status, login info " +
            "and sessions needed for security.",
          "Affiliate transaction data: links used, Click-ID and tracking, purchase-" +
            "session time/info needed for attribution, platform order/transaction " +
            "codes, order status, product/line data needed to reconcile, commission " +
            "and adjustments.",
          "Balance and payment data: balance and ledger history, transaction code, " +
            "time/type/amount/related order, payout bank account information " +
            "(holder, account number, verification status) and withdrawal history.",
          "Support data: request/complaint content, order codes and documents you " +
            "provide to check, and contact information needed to reply.",
          "Security/anti-fraud data: signals about device, access session, click " +
            "behavior, transaction patterns, payment info and related data to detect " +
            "anomalies, protect the account and prevent fraud.",
          "Technical data: browser, OS, IP address, session identifier or similar " +
            "data if the system actually uses them to operate, secure, troubleshoot " +
            "and check tracking.",
        ],
      ),
      sec(
        "muc-dich",
        "3. Purposes of processing",
        [],
        [
          "Authenticate and manage accounts: create/maintain accounts, send email " +
            "OTP, protect the account, verify information when needed.",
          "Track and reconcile orders: create/manage Click-IDs, record purchase " +
            "sessions, check attribution, receive order data from platforms, " +
            "reconcile status and commission.",
          "Calculate and pay cashback: compute from actual commission, update " +
            "balance, record credit/debit/adjustment entries, process withdrawals, " +
            "check bank information.",
          "Fraud prevention and security: detect abnormal accounts/transactions, " +
            "detect click/attribution/transaction/referral/reward manipulation, " +
            "check multiple signals, protect the system, users and data.",
          "Support and complaint handling: check orders, process withdrawals, " +
            "resolve complaints, contact you for more information.",
          "Legal compliance: retain transaction/accounting/audit data where " +
            "obligated, meet lawful requests from competent authorities, protect the " +
            "legitimate rights and interests of the parties.",
        ],
      ),
      sec(
        "click-tracking",
        "4. Click, tracking and purchase-session data",
        [],
        [
          `When you visit a platform through a ${app} link, the system may create a ` +
            "Click-ID and record information needed to identify the source.",
          `${app} may process purchase-session data to determine whether an order ` +
            "is still linked to the Click-ID and attribution.",
          "Closing/reopening the app, switching browser/device, clearing tracking " +
            "data, signing in again or similar actions may lose attribution " +
            "depending on the platform's mechanism.",
          `A Click-ID is valid for reconciliation for up to ${attributionDays} days ` +
            "from creation, unless the platform applies a shorter period.",
          "If the system uses cookies, local storage, session identifiers or similar " +
            "technologies to maintain tracking, they are used only as needed for the " +
            "corresponding function.",
        ],
      ),
      sec(
        "du-lieu-san",
        "5. Order data and data from platforms",
        [],
        [
          `${app} may receive order data, attribution, order status, commission and ` +
            "adjustments from platforms or data-providing partners.",
          "This data is used to display order history, determine valid orders, " +
            "compute cashback and reconcile.",
          "The platform's final reconciliation data on attribution and commission " +
            "is the primary basis for cashback per the User Policy.",
          `${app} does not control and is not responsible for the platform ` +
            "changing, cancelling, refunding or adjusting order and commission data.",
        ],
      ),
      sec(
        "du-lieu-ngan-hang",
        "6. Bank account data and withdrawals",
        [],
        [
          `When you request a withdrawal, ${app} may process the information needed ` +
            "to verify your own bank account and transfer money.",
          "This may include the account holder's name, account number, receiving " +
            "bank, verification status and withdrawal history as needed.",
          `${app} does not ask for your bank password, PIN or bank OTP.`,
          "Bank data is protected with suitable encryption and access controls.",
        ],
      ),
      sec(
        "chong-gian-lan",
        "7. Fraud-prevention data",
        [],
        [
          `${app} may process necessary signals to detect and prevent fraud: device ` +
            "signals, access sessions, click behavior, transaction patterns, payment " +
            "info and related data.",
          "Signals may be combined to assess account/transaction risk; a single " +
            "signal is not necessarily conclusive of fraud.",
          `When needed, ${app} may request reasonable information/documents to ` +
            "confirm ownership of the account, bank account or transaction.",
          `${app} does not disclose all rules, thresholds or anti-fraud signals if ` +
            "disclosure would help evade the system.",
        ],
      ),
      sec(
        "chia-se",
        "8. Data sharing and recipients",
        [
          `${app} shares data only as needed for the corresponding purpose, and does ` +
            "not share all account data just because one function needs part of it. " +
            "Recipient categories may include:",
        ],
        [
          "e-commerce platforms or affiliate networks to record and reconcile " +
            "transactions;",
          "email providers to send OTP and service notifications;",
          "banks, payment units/providers to process withdrawals;",
          "technical infrastructure, security, storage or operations-support " +
            "providers when needed;",
          "state agencies or authorities when there is an obligation or lawful " +
            "basis to provide.",
          `Where a provider processes data on ${app}'s behalf, ${app} applies ` +
            "suitable measures to require them to protect data and process only " +
            "within scope. If data must be transferred/processed via infrastructure " +
            "abroad, processing follows the applicable legal mechanism.",
        ],
      ),
      sec(
        "luu-giu",
        "9. Data retention",
        [],
        [
          `${app} retains data for the time needed for the purpose it was collected ` +
            "and processed.",
          "Transaction, balance, withdrawal, accounting, audit, complaint and " +
            "related data may be kept longer when needed to reconcile, resolve " +
            "disputes, prevent fraud or meet legal obligations.",
          "When no longer needed and there is no obligation/lawful basis to keep it, " +
            "data may be deleted, anonymized or processed suitably.",
          "Closing/deleting an account does not necessarily delete transaction, " +
            "accounting, audit or legally-required data immediately.",
        ],
      ),
      sec(
        "bao-mat",
        "10. Data security",
        [],
        [
          `${app} applies suitable technical and organizational measures to protect ` +
            "data from unauthorized access, use, change, disclosure or destruction.",
          "Passwords are protected with suitable hashing.",
          "Bank data is encrypted and shown in a limited form when needed.",
          "OTPs are used for authentication and not stored in plain text beyond the " +
            "time needed.",
          "Internal data access is limited to work needs and granted permissions.",
          "No measure guarantees absolute safety. You are also responsible for " +
            "keeping your password, login OTP and device secure.",
        ],
      ),
      sec(
        "quyen-nguoi-dung",
        "11. Your rights over your data",
        ["Depending on the case and applicable law, you may request to:"],
        [
          "know and access information about your data being processed;",
          "correct inaccurate data;",
          "delete data where there is a suitable basis;",
          "restrict or object to some processing where the law permits;",
          "exercise other personal-data rights under applicable law.",
          "Some requests may be limited or refused where they affect retention " +
            "obligations, ShopTik's legitimate interests, others' rights, system " +
            "safety, fraud prevention or legal obligations.",
        ],
      ),
      sec(
        "gui-yeu-cau",
        "12. How to submit data requests",
        [],
        [
          `You may submit data-related requests through ${app}'s official support ` +
            "channel.",
          `To protect data, ${app} may require identity or account-control ` +
            "verification before processing.",
          `${app} may request more information if a request is insufficient to ` +
            "determine the data scope or the requester's rights.",
          `Requests are handled within a suitable time; if more time is needed, ` +
            `${app} may notify you. Do not send passwords, bank OTPs or sensitive ` +
            "security information through insecure channels.",
        ],
      ),
      sec("su-co", "13. Incidents and data safety", [
        `If an incident affecting data is detected, ${app} will assess the scope and ` +
          "impact, apply remedies and notify/handle per applicable law.",
        "Notify us promptly if you detect signs of unauthorized account access or " +
          "abnormal data use.",
      ]),
      sec("tre-em", "14. Children's data", [
        `${app} does not actively design the service to collect children's data ` +
          "beyond what is needed to provide the service and per applicable law.",
        `If ${app} finds data provided against the terms or applicable law, it may ` +
          "apply suitable handling.",
      ]),
      sec("ben-thu-ba", "15. Links and third-party services", [
        `${app} may link to Shopee, TikTok Shop, Lazada or third-party services. ` +
          "When you move to a third-party service, data processing there is governed " +
          "by that third party's policy.",
        `${app} does not control all data processing by external platforms, banks or ` +
          "providers.",
      ]),
      sec(
        "thay-doi",
        "16. Changes to the Privacy Policy",
        [],
        [
          `${app} may update the Privacy Policy when systems, functions, providers, ` +
            "affiliate mechanics or legal requirements change.",
          "Each version has a version number and effective date.",
          "If a significant change affects how data is processed or your rights, " +
            `${app} will notify you suitably and take the necessary steps under ` +
            "applicable law.",
        ],
      ),
      sec(
        "tai-lieu-lien-quan",
        "17. Relationship with other documents",
        [],
        [
          `This policy is read together with ${app}'s User Policy and Terms of Use, ` +
            "and any specific cashback/referral/mission program conditions.",
          "This policy separately governs personal-data matters.",
          "Order tracking, attribution, commission, cashback and balance handling " +
            "are set in the User Policy and Terms of Use.",
        ],
      ),
      sec("hieu-luc", "18. Effect and related information", [
        `This Privacy Policy is effective from 25/08/2026 and published on ${app}'s ` +
          "official page.",
        "You should also read the User Policy and Terms of Use (links in the " +
          `footer). ${app} may update links, contact details or operational ` +
          "information as needed.",
      ]),
    ],
  };
}
