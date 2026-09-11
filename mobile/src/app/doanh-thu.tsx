import { CanDangNhap } from '@/components/CanDangNhap';
import { FormScreen } from '@/components/FormScreen';
import { IncomeChartCard } from '@/components/IncomeChartCard';
import { useSession } from '@/hooks/useSession';
import { useT } from '@/i18n';

/**
 * Báo cáo doanh thu — thu nhập từ 3 nguồn: hoa hồng đơn của chính mình, từ
 * người mình giới thiệu, và từ link chia sẻ. Tách khỏi màn Giới thiệu (chỉ còn
 * danh sách thành viên).
 */
export default function RevenueScreen() {
  const t = useT();
  const { user } = useSession();
  return (
    <FormScreen
      title={t('Doanh thu', 'Revenue')}
      subtitle={t(
        'Thu nhập từ 3 nguồn: đơn của bạn, người bạn giới thiệu và link chia sẻ.',
        'Income from 3 sources: your orders, people you referred, and share links.',
      )}>
      {user ? (
        <IncomeChartCard />
      ) : (
        <CanDangNhap mo_ta={t('Đăng nhập để xem báo cáo doanh thu của bạn.', 'Log in to view your revenue report.')} />
      )}
    </FormScreen>
  );
}
