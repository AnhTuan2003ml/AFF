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
  const threshold = facts.smallOrderThresholdVnd.toLocaleString("vi-VN");
  const attributionDays = facts.affiliateAttributionDays;
  const minWithdraw = formatVnd(facts.minWithdrawAmountVnd);
  const soDuCho =
    hold > 0
      ? "số dư chờ — các khoản chưa đủ điều kiện sử dụng hoặc rút, gồm tiền hoàn " +
        `của đơn Hoàn thành còn trong thời gian giữ ${hold} ngày kể từ khi sàn ` +
        "ghi nhận Hoàn thành (phòng khi sàn truy hồi hoa hồng do khách trả hàng)"
      : "số dư chờ — các khoản chưa đủ điều kiện sử dụng hoặc rút";

  return {
    version: USER_POLICY_VERSION,
    title: "Chính sách người dùng",
    url: `${facts.appOrigin.replace(/\/+$/, "")}${USER_POLICY_PATH}`,
    lead:
      `${app} là nền tảng hoàn tiền mua sắm qua liên kết Affiliate của Shopee, ` +
      "TikTok Shop và Lazada. Chính sách này giải thích cách đơn được ghi nhận, " +
      "cách tiền hoàn được tính và cập nhật vào ví, điều kiện rút tiền, chương " +
      "trình giới thiệu, cũng như các trường hợp có thể bị từ chối hoặc điều " +
      "chỉnh. Hãy đọc kỹ trước khi thực hiện giao dịch đầu tiên.",
    sections: [
      section(
        "gioi-thieu",
        "1. Giới thiệu về ShopTik",
        [
          `${app} cung cấp các liên kết Affiliate riêng cho người dùng. Khi bạn ` +
            "truy cập sàn qua liên kết hợp lệ và thực hiện giao dịch đáp ứng điều " +
            `kiện chương trình Affiliate, sàn có thể ghi nhận giao dịch và trả hoa ` +
            `hồng cho ${app}.`,
          `${app} phân phối lại một phần hoa hồng Affiliate thực tế nhận được cho ` +
            "người dùng theo tỷ lệ quy định tại chính sách hoặc chương trình tương ứng.",
          `${app} không bán hàng và không trực tiếp cung cấp sản phẩm. ${app} không ` +
            "kiểm soát giá bán, khuyến mãi, tình trạng hàng hóa, vận chuyển, đổi trả, " +
            "bảo hành hay quyết định cuối cùng của sàn đối với đơn hàng.",
        ],
      ),
      section(
        "thuat-ngu",
        "2. Giải thích thuật ngữ",
        [],
        [
          `"Sàn" là Shopee, TikTok Shop, Lazada hoặc nền tảng thương mại điện tử ` +
            `khác được ${app} công bố hỗ trợ.`,
          `"Liên kết ${app}" là đường dẫn Affiliate do ${app} tạo và gắn mã theo ` +
            "dõi tương ứng với tài khoản người dùng.",
          `"Click-ID" là mã định danh hệ thống tạo cho một lượt truy cập hợp lệ ` +
            `qua liên kết ${app}.`,
          `"Phiên mua" bắt đầu từ một Click-ID hợp lệ và kết thúc khi đơn được sàn ` +
            "ghi nhận attribution, Click-ID hết hạn, attribution bị thay thế bởi " +
            "nguồn khác, hoặc phiên không còn đáp ứng cơ chế theo dõi của sàn. Đóng/" +
            "mở lại ứng dụng, đổi trình duyệt hoặc thiết bị, xóa dữ liệu theo dõi " +
            "hoặc đăng nhập lại có thể làm mất attribution.",
          `"Đơn hợp lệ" là đơn được sàn ghi nhận attribution của ${app}, đáp ứng ` +
            "điều kiện nhận hoa hồng và không bị hủy, hoàn, trả, loại khỏi chương " +
            "trình hoặc điều chỉnh về mức không còn hoa hồng hợp lệ.",
          `"Hoa hồng thực nhận" là khoản hoa hồng Affiliate cuối cùng được sàn xác ` +
            `nhận cho ${app} sau mọi điều chỉnh, hủy, hoàn trả, khấu trừ. Dữ liệu ` +
            "đối soát/settlement cuối cùng của sàn là căn cứ chính.",
          `"Giá trị đơn" là giá trị hàng hóa dùng để xác định ngưỡng áp dụng tỷ lệ ` +
            "hoàn. Trừ khi chương trình quy định khác, phí vận chuyển, thuế, phí " +
            "dịch vụ và các khoản không tạo hoa hồng không được tính vào.",
        ],
      ),
      section(
        "tai-khoan",
        "3. Tài khoản người dùng",
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
      section(
        "ghi-nhan-don",
        "4. Điều kiện ghi nhận đơn hàng",
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
          "Ảnh chụp màn hình, mã đơn hay lịch sử trình duyệt không đồng nghĩa " +
            "attribution đã được sàn xác nhận. Dữ liệu attribution và đối soát cuối " +
            "cùng của sàn là căn cứ chính.",
          `Đơn thêm vào giỏ từ trước, mua trong livestream, mua qua liên kết bên thứ ` +
            `ba hoặc luồng khác có thể không được ghi nhận nếu sàn không gắn ` +
            `attribution ${app}.`,
          `Một Click-ID có thời hạn đối soát tối đa ${attributionDays} ngày kể từ ` +
            "khi phát sinh (trừ khi sàn áp dụng ngắn hơn). Quá hạn, hệ thống ngừng " +
            "chờ và không có nghĩa vụ truy xuất attribution của Click-ID đã hết hạn.",
        ],
      ),
      section(
        "tinh-tien",
        "5. Cách tính tiền hoàn",
        [],
        [
          `Với đơn hợp lệ, bạn nhận ${facts.buyerCashbackPercent}% khoản hoa hồng ` +
            `thực nhận của ${app}.`,
          `Với đơn giá trị từ ${threshold}₫ trở xuống, bạn nhận ` +
            `${facts.smallOrderBuyerPercent}% khoản hoa hồng thực nhận, trừ khi ` +
            "chương trình công bố tỷ lệ khác trước khi giao dịch phát sinh.",
          "Công thức: Tiền hoàn = Hoa hồng thực nhận × Tỷ lệ hoàn. Tỷ lệ hoàn tính " +
            "trên hoa hồng thực nhận, không phải phần trăm trực tiếp trên giá trị đơn.",
          "Số tiền hiển thị trước khi mua là DỰ KIẾN. Khoản thực tế có thể thay đổi " +
            "do tỷ lệ hoa hồng của sàn, voucher/khuyến mãi, điều kiện sản phẩm, hoàn/" +
            "hủy một phần, hoặc điều chỉnh khác từ sàn.",
          "Tiền hoàn tính đến đơn vị đồng và làm tròn xuống.",
          "Đơn nhiều sản phẩm có mức hoa hồng khác nhau được tính theo từng sản phẩm/" +
            "dòng hàng mà sàn cung cấp dữ liệu hợp lệ rồi cộng lại; nếu sàn chỉ cung " +
            "cấp dữ liệu cấp đơn thì dùng dữ liệu cấp đơn do sàn xác nhận.",
          `Nếu đơn bị hủy/trả/hoàn một phần, ${app} chỉ điều chỉnh phần hoa hồng ` +
            "tương ứng với phần bị ảnh hưởng theo dữ liệu cuối cùng của sàn.",
        ],
      ),
      section(
        "trang-thai",
        "6. Trạng thái đơn và đối soát",
        [
          `Sau khi hệ thống ghi nhận lượt truy cập, đơn có thể xuất hiện ở Lịch sử ` +
            'đơn với trạng thái "Chờ sàn xác nhận". Việc đơn xuất hiện không đồng ' +
            "nghĩa hoa hồng đã được sàn xác nhận.",
        ],
        [
          `Đang duyệt: sàn chưa cung cấp dữ liệu cuối cùng hoặc hoa hồng chưa chốt. ` +
            `${app} tiếp tục đối soát ở các lần cập nhật sau.`,
          `Hoàn thành: sàn đã cung cấp trạng thái đủ điều kiện để ${app} ghi nhận ` +
            "khoản hoàn theo dữ liệu tại thời điểm đó; không bảo đảm hoa hồng không " +
            "bị điều chỉnh về sau.",
          "Đã hủy: đơn bị hủy, trả hàng, hoàn tiền, bị từ chối hoa hồng hoặc bị sàn " +
            "loại khỏi chương trình Affiliate.",
          `Nếu sàn điều chỉnh hoa hồng của một đơn đã ghi nhận, ${app} có quyền cập ` +
            "nhật và điều chỉnh khoản hoàn tương ứng.",
          `Nếu khoản hoàn đã vào số dư khả dụng nhưng sau đó sàn truy hồi/giảm hoa ` +
            `hồng, ${app} có quyền đảo khoản. Nếu số dư không đủ, tài khoản có thể ` +
            "phát sinh số dư âm; khoản thiếu có thể được khấu trừ từ khoản hoàn/" +
            "thưởng phát sinh sau hoặc được yêu cầu hoàn trả theo thông báo.",
        ],
      ),
      section(
        "so-du",
        "7. Số dư và lịch sử giao dịch",
        [
          `Số dư trên ${app} có thể gồm: ${soDuCho}; số dư khả dụng — các khoản đủ ` +
            "điều kiện tạo yêu cầu rút; và các khoản điều chỉnh hoặc đảo bút toán " +
            "nếu phát sinh.",
          "Mỗi giao dịch tài chính được lưu kèm thông tin cần thiết để đối chiếu: " +
            "mã giao dịch, thời gian, loại giao dịch, số tiền, đơn liên quan (nếu " +
            "có) và trạng thái.",
          `${app} dùng hệ thống bút toán để ghi nhận các khoản cộng/trừ vào số dư. ` +
            `Bạn có thể kiểm tra lịch sử giao dịch trên giao diện ${app}.`,
        ],
      ),
      section(
        "rut-tien",
        "8. Rút tiền",
        [],
        [
          `Số tiền rút tối thiểu là ${minWithdraw} mỗi yêu cầu, trừ khi ${app} công ` +
            "bố ngưỡng khác.",
          "Tiền chỉ chuyển về tài khoản ngân hàng chính chủ đã được xác minh.",
          "Thông tin chủ tài khoản ngân hàng phải phù hợp với thông tin xác minh " +
            "của bạn.",
          `Bạn tự kiểm tra chính xác số tài khoản trước khi xác nhận yêu cầu rút. ` +
            `${app} không chịu trách nhiệm khi bạn cung cấp sai thông tin, trừ khi ` +
            `lỗi phát sinh từ hệ thống ${app}.`,
          `Mọi yêu cầu rút có thể được kiểm tra để phát hiện gian lận, sai lệch dữ ` +
            `liệu hoặc vấn đề tuân thủ; trong thời gian kiểm tra ${app} có thể tạm ` +
            "dừng xử lý.",
          "Số dư khả dụng cho phép tạo yêu cầu rút nhưng không đồng nghĩa tiền được " +
            "chuyển ngay; yêu cầu vẫn phải qua xác minh và kiểm tra rủi ro.",
          `Nếu yêu cầu rút bị từ chối, ${app} cập nhật trạng thái và cung cấp lý do ` +
            "phù hợp, trừ thông tin có thể làm lộ cơ chế bảo mật/chống gian lận.",
        ],
      ),
      section(
        "gioi-thieu-nhiem-vu",
        "9. Giới thiệu và nhiệm vụ",
        [],
        [
          "Bạn có thể mời người dùng mới bằng mã giới thiệu riêng.",
          "Thưởng giới thiệu và thưởng nhiệm vụ chỉ được ghi nhận khi đủ điều kiện " +
            "chương trình và đơn/giao dịch liên quan đã được sàn xác nhận.",
          "Không dùng nhiều tài khoản do cùng một người kiểm soát để tạo thưởng, tự " +
            "giới thiệu, tạo tài khoản ảo, mua bán tài khoản hoặc dùng công cụ tự " +
            "động tạo lượt giới thiệu giả/hàng loạt.",
          `${app} có thể kết hợp nhiều tín hiệu để xác định tài khoản liên quan ` +
            "(thông tin xác minh, thiết bị, phương thức thanh toán, tài khoản ngân " +
            "hàng, hành vi truy cập, mẫu giao dịch). Một tín hiệu đơn lẻ không nhất " +
            "thiết là căn cứ kết luận gian lận.",
        ],
      ),
      section(
        "hanh-vi-cam",
        "10. Hành vi không được phép",
        [
          "Bạn không được thực hiện các hành vi làm sai lệch dữ liệu Affiliate, đơn " +
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
          "hành vi khác nhằm làm sai lệch đối soát hoặc nhận tiền/thưởng mà bạn " +
            "không có quyền hưởng.",
          `Hậu quả vi phạm: tùy tính chất và mức độ, ${app} có thể từ chối ghi nhận ` +
            "đơn/thưởng, điều chỉnh hoặc thu hồi khoản hoàn, tạm dừng yêu cầu rút, " +
            "yêu cầu xác minh, tạm khóa hoặc chấm dứt tài khoản, và yêu cầu hoàn trả " +
            "khoản đã nhận không hợp lệ.",
        ],
      ),
      section(
        "xac-minh",
        "11. Xác minh và phòng chống gian lận",
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
      section(
        "khieu-nai",
        "12. Khiếu nại và hỗ trợ",
        [],
        [
          "Nếu đơn thực hiện qua đúng luồng mua nhưng sau 72 giờ chưa xuất hiện " +
            "trong Lịch sử đơn, hãy gửi yêu cầu hỗ trợ kèm mã đơn, thời điểm đặt " +
            "hàng và thông tin cần thiết.",
          "Mốc 72 giờ là thời điểm khuyến nghị để chủ động báo lỗi, không phải thời " +
            "hạn duy nhất để khiếu nại.",
          "Khiếu nại về một đơn phải gửi trong vòng 30 ngày kể từ ngày đặt hàng, " +
            "trừ khi chương trình công bố thời hạn khác.",
          `Gửi khiếu nại không đồng nghĩa đơn chắc chắn được ghi nhận. ${app} sẽ ` +
            "kiểm tra dữ liệu click, tracking, attribution, dữ liệu sàn và thông tin " +
            "liên quan.",
          `Nếu dữ liệu ${app} khác dữ liệu đối soát cuối cùng của sàn, dữ liệu cuối ` +
            "cùng do sàn xác nhận về attribution và hoa hồng được ưu tiên, trừ khi " +
            `${app} xác định có lỗi từ hệ thống của mình.`,
          "Không yêu cầu hoàn tiền/bồi hoàn nhiều lần cho cùng một giao dịch và " +
            "cùng một khoản thiệt hại nếu đã được giải quyết hợp lệ từ nguồn khác.",
          "Mọi liên hệ chính thức đi qua mục Hỗ trợ sau khi đăng nhập.",
        ],
      ),
      section(
        "trach-nhiem",
        "13. Trách nhiệm của ShopTik",
        [
          `${app} có trách nhiệm: cung cấp thông tin tỷ lệ hoàn theo từng chương ` +
            "trình; ghi nhận và đối soát dữ liệu trong phạm vi khả năng kỹ thuật; " +
            "hiển thị trạng thái giao dịch; tiếp nhận và xử lý yêu cầu rút, khiếu " +
            "nại theo quy trình; bảo vệ dữ liệu người dùng theo Chính sách quyền " +
            "riêng tư.",
          `${app} không chịu trách nhiệm đối với: lỗi/gián đoạn/thay đổi từ hệ thống ` +
            "của sàn; việc sàn không ghi nhận attribution; việc sàn thay đổi/điều " +
            "chỉnh hoa hồng; giá bán, voucher, chất lượng sản phẩm, giao hàng, đổi " +
            `trả, bảo hành; sự cố ngân hàng không thuộc hệ thống ${app}; thông tin ` +
            `sai do người dùng cung cấp; và các sự kiện ngoài khả năng kiểm soát ` +
            `hợp lý của ${app}.`,
        ],
      ),
      section(
        "du-lieu",
        "14. Dữ liệu cá nhân",
        [
          `${app} chỉ thu thập và xử lý dữ liệu cần thiết cho xác thực tài khoản, ` +
            "ghi nhận đơn, tính và thanh toán tiền hoàn, chống gian lận, hỗ trợ " +
            "người dùng và tuân thủ nghĩa vụ pháp lý.",
          "Mật khẩu được bảo vệ bằng cơ chế băm phù hợp; dữ liệu ngân hàng được mã " +
            "hóa; OTP không lưu ở dạng rõ ngoài thời gian cần thiết cho xác thực.",
          `Việc thu thập, sử dụng, chia sẻ, lưu giữ và xóa dữ liệu thực hiện theo ` +
            `Chính sách quyền riêng tư của ${app}.`,
          "Dữ liệu giao dịch, kế toán, kiểm toán hoặc dữ liệu phải lưu theo quy " +
            "định pháp luật có thể được lưu giữ theo thời hạn luật yêu cầu, kể cả " +
            "sau khi tài khoản bị xóa.",
        ],
      ),
      section(
        "thay-doi",
        "15. Thay đổi chính sách",
        [],
        [
          `${app} có thể cập nhật chính sách khi có thay đổi về cơ chế Affiliate, ` +
            "hệ thống, sản phẩm dịch vụ hoặc quy định pháp luật.",
          "Mỗi phiên bản chính sách có số phiên bản và ngày hiệu lực.",
          "Thay đổi ảnh hưởng quyền lợi sẽ được thông báo trước và áp dụng cho các " +
            "đơn phát sinh sau ngày phiên bản mới có hiệu lực, trừ khi pháp luật " +
            "yêu cầu khác.",
          "Đơn phát sinh trước ngày hiệu lực của phiên bản mới tiếp tục áp dụng " +
            "phiên bản có hiệu lực tại thời điểm đơn phát sinh với các điều kiện " +
            "ghi nhận và quyền lợi liên quan.",
          "Các quy định về chống gian lận, bảo mật, nghĩa vụ pháp lý hoặc xử lý sai " +
            "lệch dữ liệu có thể áp dụng với hành vi phát sinh trước ngày cập nhật " +
            "trong phạm vi pháp luật cho phép.",
        ],
      ),
      section(
        "mau-thuan",
        "16. Nguyên tắc xử lý khi có mâu thuẫn",
        [],
        [
          "Nếu chương trình hoàn tiền cụ thể có điều kiện riêng được công bố rõ " +
            "trước khi bạn tham gia, điều kiện của chương trình đó được áp dụng.",
          "Nếu số tiền dự kiến trên giao diện khác với hoa hồng thực tế được sàn " +
            "xác nhận, khoản hoàn cuối cùng tính theo hoa hồng thực nhận.",
          "Nếu một điều khoản vô hiệu hoặc không thể thi hành, các điều khoản còn " +
            "lại vẫn có hiệu lực trong phạm vi pháp luật cho phép.",
        ],
      ),
      section(
        "hieu-luc",
        "17. Hiệu lực và tài liệu liên quan",
        [
          `Chính sách này có hiệu lực từ 25/08/2026 và được công bố tại trang chính ` +
            `sách chính thức của ${app}.`,
          "Bạn nên đọc đồng thời Điều khoản sử dụng và Chính sách quyền riêng tư " +
            `(liên kết ở chân trang). ${app} có thể cập nhật đường dẫn, thông tin ` +
            "liên hệ hoặc thông tin vận hành khi cần.",
        ],
      ),
    ],
  };
}

/** Bản tiếng Anh của chính sách người dùng — cùng cấu trúc, cùng số liệu. */
function buildUserPolicyEn(facts: UserPolicyFacts): UserPolicyDocument {
  const app = facts.appName;
  const hold = facts.cashbackHoldDays;
  const threshold = facts.smallOrderThresholdVnd.toLocaleString("vi-VN");
  const attributionDays = facts.affiliateAttributionDays;
  const minWithdraw = formatVnd(facts.minWithdrawAmountVnd);
  const pendingBalance =
    hold > 0
      ? "Pending balance — amounts not yet eligible to use or withdraw, including " +
        `cashback from Completed orders still within the ${hold}-day hold from when ` +
        "the platform records Completion (to cover commission clawbacks from returns)"
      : "Pending balance — amounts not yet eligible to use or withdraw";

  return {
    version: USER_POLICY_VERSION,
    title: "User Policy",
    url: `${facts.appOrigin.replace(/\/+$/, "")}${USER_POLICY_PATH}`,
    lead:
      `${app} is a cashback platform for shopping via Shopee, TikTok Shop and ` +
      "Lazada affiliate links. This policy explains how orders are tracked, how " +
      "cashback is calculated and credited to your wallet, withdrawal conditions, " +
      "the referral program, and cases where cashback may be refused or adjusted. " +
      "Please read it carefully before your first transaction.",
    sections: [
      section(
        "gioi-thieu",
        "1. About ShopTik",
        [
          `${app} provides personal affiliate links for users. When you visit a ` +
            "platform through a valid link and complete a transaction that meets the " +
            "affiliate program's conditions, the platform may record it and pay " +
            `commission to ${app}.`,
          `${app} shares back part of the actual affiliate commission it receives, ` +
            "at the rate set in the applicable policy or program.",
          `${app} does not sell or directly provide products. ${app} does not ` +
            "control pricing, promotions, stock, shipping, returns, warranty, or the " +
            "platform's final decision on an order.",
        ],
      ),
      section(
        "thuat-ngu",
        "2. Definitions",
        [],
        [
          `"Platform" means Shopee, TikTok Shop, Lazada, or another e-commerce ` +
            `platform ${app} announces support for.`,
          `"${app} link" is an affiliate URL created by ${app} carrying a tracking ` +
            "code tied to your account.",
          `"Click-ID" is an identifier the system creates for a valid visit through ` +
            `a ${app} link.`,
          `"Purchase session" starts from a valid Click-ID and ends when the order ` +
            "is attributed by the platform, the Click-ID expires, attribution is " +
            "replaced by another source, or the session no longer meets the " +
            "platform's tracking mechanism. Closing/reopening the app, switching " +
            "browser or device, clearing tracking data, or signing in again may lose " +
            "attribution.",
          `"Valid order" is an order attributed to ${app} by the platform, meeting ` +
            "the platform's commission conditions, not cancelled, refunded, returned, " +
            "removed from the program, or adjusted below a valid commission.",
          `"Actual commission" is the final affiliate commission the platform ` +
            `confirms for ${app} after all adjustments, cancellations, refunds and ` +
            "deductions. The platform's final reconciliation/settlement data is the " +
            "primary basis.",
          `"Order value" is the goods value used to determine the cashback-rate ` +
            "threshold. Unless a program states otherwise, shipping fees, taxes, " +
            "service fees and non-commissionable amounts are excluded.",
        ],
      ),
      section(
        "tai-khoan",
        "3. Your account",
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
      section(
        "ghi-nhan-don",
        "4. Order tracking conditions",
        [
          `To be eligible for cashback, reach the product/platform through a valid ` +
            `${app} link and buy in the flow opened from that link.`,
        ],
        [
          "Do not use another affiliate link, browser extension, or attribution-" +
            "changing tool within the same purchase session.",
          `If you visit another affiliate link and the platform credits that source ` +
            `instead of ${app}, the order may not qualify for cashback.`,
          `If the platform does not attribute the order to ${app} or pay ` +
            `commission, ${app} has no commission to share and the order's cashback ` +
            "may be 0.",
          "Screenshots, order codes or browser history do not mean the platform " +
            "confirmed attribution. The platform's attribution and final " +
            "reconciliation data is the primary basis.",
          "Orders added to cart earlier, bought during a livestream, via a third-" +
            `party link, or through another flow may not be tracked if the platform ` +
            `does not attribute them to ${app}.`,
          `A Click-ID is valid for reconciliation for up to ${attributionDays} days ` +
            "from creation (or shorter if the platform applies it). After that, the " +
            "system stops waiting and has no obligation to retrieve attribution for " +
            "an expired Click-ID.",
        ],
      ),
      section(
        "tinh-tien",
        "5. How cashback is calculated",
        [],
        [
          `For a valid order, you receive ${facts.buyerCashbackPercent}% of ${app}'s ` +
            "actual commission.",
          `For orders worth ${threshold}₫ or less, you receive ` +
            `${facts.smallOrderBuyerPercent}% of the actual commission, unless a ` +
            "program announces a different rate before the transaction.",
          "Formula: Cashback = Actual commission × Cashback rate. The rate applies " +
            "to the actual commission, not a direct percentage of the order value.",
          "The amount shown before purchase is an ESTIMATE. The actual amount may " +
            "change due to the platform's commission rate, vouchers/promotions, " +
            "product conditions, partial refunds/cancellations, or other platform " +
            "adjustments.",
          "Cashback is computed in whole đồng and rounded down.",
          "For multi-item orders with different commission rates, cashback is " +
            "computed per item/line where the platform provides valid data, then " +
            "summed; if the platform only provides order-level data, that is used.",
          `If an order is partially cancelled/returned/refunded, ${app} only adjusts ` +
            "the commission for the affected part per the platform's final data.",
        ],
      ),
      section(
        "trang-thai",
        "6. Order status and reconciliation",
        [
          "After a visit is recorded, the order may appear in Order History as " +
            '"Awaiting platform confirmation". Its appearance does not mean the ' +
            "commission is confirmed.",
        ],
        [
          `Under review: the platform hasn't provided final data or the commission ` +
            `isn't finalized. ${app} keeps reconciling on later updates.`,
          `Completed: the platform provided a status eligible for ${app} to record ` +
            "the cashback per data at that time; it does not guarantee the " +
            "commission won't be adjusted later.",
          "Cancelled: the order was cancelled, returned, refunded, had commission " +
            "refused, or was removed from the affiliate program.",
          `If the platform adjusts commission on a recorded order, ${app} may update ` +
            "and adjust the corresponding cashback.",
          "If cashback already moved to available balance but the platform later " +
            `claws back/reduces commission, ${app} may reverse the entry. If the ` +
            "balance is insufficient, the account may go negative; the shortfall may " +
            "be deducted from later cashback/rewards or requested for repayment.",
        ],
      ),
      section(
        "so-du",
        "7. Balance and transaction history",
        [
          `Your ${app} balance may include: ${pendingBalance}; available balance — ` +
            "amounts eligible to create a withdrawal request; and adjustments or " +
            "reversing entries if any.",
          "Each financial transaction is stored with the details needed to " +
            "reconcile: transaction code, time, type, amount, related order (if any) " +
            "and status.",
          `${app} uses double-entry bookkeeping to record credits/debits. You can ` +
            `review your transaction history in the ${app} interface.`,
        ],
      ),
      section(
        "rut-tien",
        "8. Withdrawals",
        [],
        [
          `The minimum withdrawal is ${minWithdraw} per request, unless ${app} ` +
            "announces a different threshold.",
          "Money is only transferred to your own verified bank account.",
          "The bank account holder's details must match your verified information.",
          `You must check the account number carefully before confirming. ${app} is ` +
            `not liable for incorrect details you provide, unless the error is from ` +
            `${app}'s system.`,
          `Every withdrawal request may be checked for fraud, data mismatch or ` +
            `compliance; during the check ${app} may pause processing.`,
          "Available balance lets you create a request but does not mean immediate " +
            "transfer; the request still goes through verification and risk checks.",
          `If a request is refused, ${app} updates the status and provides a ` +
            "suitable reason, except information that could reveal security/anti-" +
            "fraud mechanisms.",
        ],
      ),
      section(
        "gioi-thieu-nhiem-vu",
        "9. Referrals and missions",
        [],
        [
          "You can invite new users with your personal referral code.",
          "Referral and mission rewards are only recorded when the program " +
            "conditions are met and the related order/transaction is confirmed by " +
            "the platform.",
          "Do not use multiple accounts under the same control to generate rewards, " +
            "self-refer, create fake accounts, trade accounts, or use automated " +
            "tools to generate fake/mass referrals.",
          `${app} may combine multiple signals to identify related accounts ` +
            "(verification info, device, payment method, bank account, access " +
            "behavior, transaction patterns). A single signal is not necessarily " +
            "conclusive of fraud.",
        ],
      ),
      section(
        "hanh-vi-cam",
        "10. Prohibited behavior",
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
          `Consequences: depending on the nature and severity, ${app} may refuse to ` +
            "record orders/rewards, adjust or claw back cashback, pause withdrawals, " +
            "require verification, suspend or terminate the account, and request " +
            "repayment of amounts received invalidly.",
        ],
      ),
      section(
        "xac-minh",
        "11. Verification and fraud prevention",
        [],
        [
          `${app} may use necessary data and signals to detect fraud: device data, ` +
            "access sessions, click behavior, transaction patterns, payment " +
            "information and related data per the Privacy Policy.",
          `${app} need not disclose all rules, thresholds or anti-fraud signals if ` +
            "disclosure would help evade the system.",
          `When needed, ${app} may request reasonable documents/information to ` +
            "confirm ownership of the account, bank account or transaction.",
          "Verification time may vary and be prolonged when reconciliation with the " +
            "platform, bank or a third party is required.",
          "Suspending an account/transaction for verification does not automatically " +
            "mean the user has been found to commit fraud.",
        ],
      ),
      section(
        "khieu-nai",
        "12. Complaints and support",
        [],
        [
          "If an order made through the correct flow still hasn't appeared in Order " +
            "History after 72 hours, submit a support request with the order code, " +
            "purchase time and needed information.",
          "The 72-hour mark is a recommended time to proactively report, not the " +
            "only deadline to complain.",
          "A complaint about an order must be submitted within 30 days of the order " +
            "date, unless a program announces a different deadline.",
          `Submitting a complaint does not guarantee the order will be recorded. ` +
            `${app} will check click, tracking, attribution, platform data and ` +
            "related information.",
          `If ${app}'s data differs from the platform's final reconciliation, the ` +
            "platform's final confirmed attribution and commission data prevails, " +
            `unless ${app} determines the error is from its own system.`,
          "Do not request refunds/reimbursement multiple times for the same " +
            "transaction and the same loss if it has been validly resolved from " +
            "another source.",
          "All official contact goes through the Support section after signing in.",
        ],
      ),
      section(
        "trach-nhiem",
        "13. ShopTik's responsibilities",
        [
          `${app} is responsible for: providing cashback-rate information per ` +
            "program; recording and reconciling data within technical capability; " +
            "displaying transaction status; receiving and processing withdrawal " +
            "requests and complaints per procedure; protecting user data per the " +
            "Privacy Policy.",
          `${app} is not responsible for: errors/interruptions/changes from the ` +
            "platform's system; the platform not attributing an order; the platform " +
            "changing/adjusting commission; pricing, vouchers, product quality, " +
            `delivery, returns or warranty; bank incidents outside ${app}'s system; ` +
            "incorrect information provided by the user; and events beyond " +
            `${app}'s reasonable control.`,
        ],
      ),
      section(
        "du-lieu",
        "14. Personal data",
        [
          `${app} only collects and processes data needed for account ` +
            "authentication, order tracking, cashback calculation and payment, fraud " +
            "prevention, user support and legal compliance.",
          "Passwords are protected with suitable hashing; bank data is encrypted; " +
            "OTPs are not stored in plain text beyond the time needed for " +
            "verification.",
          `Collection, use, sharing, retention and deletion of data follow ${app}'s ` +
            "Privacy Policy.",
          "Transaction, accounting, audit or legally-required data may be retained " +
            "for the period the law requires, even after the account is deleted.",
        ],
      ),
      section(
        "thay-doi",
        "15. Policy changes",
        [],
        [
          `${app} may update this policy when there are changes to affiliate ` +
            "mechanics, systems, products/services or laws.",
          "Each policy version has a version number and effective date.",
          "Changes affecting user benefits will be announced in advance and apply " +
            "to orders placed after the new version's effective date, unless the law " +
            "requires otherwise.",
          "Orders placed before the new version's effective date continue under the " +
            "version in effect at the time of the order for related tracking " +
            "conditions and benefits.",
          "Rules on fraud prevention, security, legal obligations or handling of " +
            "data distortion may apply to conduct occurring before the update, to " +
            "the extent the law permits.",
        ],
      ),
      section(
        "mau-thuan",
        "16. Handling conflicts",
        [],
        [
          "If a specific cashback program has its own conditions clearly announced " +
            "before you join, that program's conditions apply.",
          "If the estimated amount in the interface differs from the platform's " +
            "confirmed actual commission, the final cashback follows the actual " +
            "commission.",
          "If a clause is void or unenforceable, the remaining clauses stay in " +
            "effect to the extent the law permits.",
        ],
      ),
      section(
        "hieu-luc",
        "17. Effect and related documents",
        [
          `This policy is effective from 25/08/2026 and published on ${app}'s ` +
            "official policy page.",
          "You should also read the Terms of Use and Privacy Policy (links in the " +
            `footer). ${app} may update links, contact details or operational ` +
            "information as needed.",
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
