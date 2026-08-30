import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { xoaTaiKhoan } from '@/api/bank';
import { LegalDoc } from '@/components/LegalDoc';
import { useSession } from '@/hooks/useSession';
import { colors, radius } from '@/theme/tokens';

/**
 * Xóa tài khoản / Delete Account — song ngữ. Bắt buộc có luồng này để lên App
 * Store / CH Play. Dùng lại `xoaTaiKhoan` (DELETE /me, xóa mềm) và xử lý trường
 * hợp còn số dư / lệnh rút giống profile.tsx.
 */
export default function DeleteAccountScreen() {
  const { dangXuat } = useSession();
  const [dangXL, setDangXL] = useState(false);

  async function xoa(forfeit: boolean, lang: 'vi' | 'en') {
    setDangXL(true);
    try {
      await xoaTaiKhoan(forfeit);
      await dangXuat();
      router.dismissAll();
      Alert.alert(
        lang === 'vi' ? 'Đã xóa tài khoản' : 'Account deleted',
        lang === 'vi' ? 'Tài khoản của bạn đã được xóa.' : 'Your account has been deleted.',
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (!forfeit && /số dư|lệnh rút|balance|withdraw/i.test(msg)) {
        Alert.alert(
          lang === 'vi' ? 'Còn số dư/lệnh rút' : 'Balance / withdrawal pending',
          lang === 'vi'
            ? `${msg}\n\nBạn vẫn muốn xóa và BỎ LẠI số dư?`
            : `${msg}\n\nDelete anyway and FORFEIT the remaining balance?`,
          [
            { text: lang === 'vi' ? 'Hủy' : 'Cancel', style: 'cancel' },
            {
              text: lang === 'vi' ? 'Xóa & bỏ số dư' : 'Delete & forfeit',
              style: 'destructive',
              onPress: () => void xoa(true, lang),
            },
          ],
        );
      } else {
        Alert.alert(
          lang === 'vi' ? 'Chưa xóa được' : 'Could not delete',
          msg || (lang === 'vi' ? 'Thử lại sau.' : 'Please try again later.'),
        );
      }
    } finally {
      setDangXL(false);
    }
  }

  function hoiXoa(lang: 'vi' | 'en') {
    Alert.alert(
      lang === 'vi' ? 'Xóa tài khoản?' : 'Delete account?',
      lang === 'vi'
        ? 'Hành động này không thể hoàn tác. Toàn bộ dữ liệu tài khoản sẽ bị ẩn danh và bạn sẽ bị đăng xuất.'
        : 'This cannot be undone. All account data will be anonymized and you will be signed out.',
      [
        { text: lang === 'vi' ? 'Hủy' : 'Cancel', style: 'cancel' },
        {
          text: lang === 'vi' ? 'Xóa tài khoản' : 'Delete account',
          style: 'destructive',
          onPress: () => void xoa(false, lang),
        },
      ],
    );
  }

  return (
    <LegalDoc
      vi={{
        title: 'Xóa tài khoản',
        intro: 'Bạn có thể xóa tài khoản bất cứ lúc nào. Vui lòng đọc kỹ trước khi thực hiện.',
        sections: [
          {
            h: '1. Điều gì xảy ra khi xóa',
            p: 'Tài khoản bị vô hiệu hóa và đăng xuất khỏi mọi thiết bị. Email, họ tên và thông tin ngân hàng của bạn được ẩn danh; email cũ được giải phóng để có thể đăng ký lại sau này.',
          },
          {
            h: '2. Dữ liệu được giữ lại',
            p: 'Vì lý do kế toán và đối soát, một số bút toán ví và đơn hàng đã phát sinh được giữ lại ở dạng ẩn danh, không còn gắn với danh tính của bạn.',
          },
          {
            h: '3. Số dư và lệnh rút',
            p: 'Nếu còn lệnh rút đang xử lý, bạn cần chờ hoàn tất trước khi xóa. Nếu ví còn số dư, bạn phải đồng ý BỎ LẠI số dư đó thì mới xóa được.',
          },
          {
            h: '4. Không thể hoàn tác',
            p: 'Sau khi xóa, thao tác không thể hoàn tác. Bạn sẽ cần tạo tài khoản mới nếu muốn dùng lại ShopTik.',
          },
        ],
      }}
      en={{
        title: 'Delete Account',
        intro: 'You can delete your account at any time. Please read carefully before proceeding.',
        sections: [
          {
            h: '1. What happens when you delete',
            p: 'Your account is disabled and signed out on all devices. Your email, name and bank details are anonymized; the old email is released so you can register again later.',
          },
          {
            h: '2. Data we retain',
            p: 'For accounting and reconciliation, some wallet ledger entries and past orders are kept in an anonymized form, no longer linked to your identity.',
          },
          {
            h: '3. Balance and withdrawals',
            p: 'If a withdrawal is being processed, you must wait for it to finish first. If your wallet still has a balance, you must agree to FORFEIT it before the account can be deleted.',
          },
          {
            h: '4. Cannot be undone',
            p: 'Once deleted, the action cannot be undone. You will need to create a new account to use ShopTik again.',
          },
        ],
      }}>
      {(lang) => (
        <Pressable
          onPress={() => hoiXoa(lang)}
          disabled={dangXL}
          style={({ pressed }) => [styles.danger, (pressed || dangXL) && { opacity: 0.85 }]}>
          {dangXL ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.dangerText}>
              {lang === 'vi' ? 'Xóa tài khoản của tôi' : 'Delete my account'}
            </Text>
          )}
        </Pressable>
      )}
    </LegalDoc>
  );
}

const styles = StyleSheet.create({
  danger: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
});
