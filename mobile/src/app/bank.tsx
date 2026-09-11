import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { layNganHang, themNganHang, xacNhanNganHang } from '@/api/bank';
import { useT } from '@/i18n';
import { ErrorBox, Field, InfoBox, PrimaryButton } from '@/components/form';
import { FormScreen } from '@/components/FormScreen';
import { ngay } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Tài khoản ngân hàng nhận tiền.
 *
 * Thêm tài khoản đi qua OTP email vì đây là đích đến của tiền: ai chiếm được
 * phiên mà đổi được số tài khoản là rút sạch ví. Backend giới hạn 5 lượt/giờ.
 */
export default function BankScreen() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: ['banks'], queryFn: layNganHang });

  const [maNH, setMaNH] = useState('');
  const [soTK, setSoTK] = useState('');
  const [tenTK, setTenTK] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [ma, setMa] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [tin, setTin] = useState<string | null>(null);
  // Nút con mắt: id các tài khoản đang hiện số đầy đủ.
  const [hienSo, setHienSo] = useState<Record<string, boolean>>({});
  // Xác nhận thông tin thanh toán chính xác trước khi gửi.
  const [xacNhanDung, setXacNhanDung] = useState(false);

  function nhomSo(so: string) {
    return so.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
  }

  async function them() {
    setLoi(null);
    setDangGui(true);
    try {
      const r = await themNganHang({
        bankCode: maNH.trim().toUpperCase(),
        accountNumber: soTK.trim(),
        accountName: tenTK.trim(),
      });
      setRequestId(r.requestId);
      setTin(r.message);
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : t('Không thêm được tài khoản.', "Couldn't add the account."));
    } finally {
      setDangGui(false);
    }
  }

  async function xacNhan() {
    if (!requestId) return;
    setLoi(null);
    setDangGui(true);
    try {
      await xacNhanNganHang(requestId, ma.trim());
      await qc.invalidateQueries({ queryKey: ['banks'] });
      setRequestId(null);
      setMa('');
      setSoTK('');
      setTenTK('');
      setXacNhanDung(false);
      setTin(t('Đã xác minh tài khoản ngân hàng.', 'Bank account verified.'));
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : t('Mã chưa đúng.', 'Incorrect code.'));
    } finally {
      setDangGui(false);
    }
  }

  return (
    <FormScreen
      title={t('Ngân hàng', 'Bank')}
      subtitle={t(
        'Tài khoản nhận tiền phải là chính chủ, trùng họ tên với hồ sơ ShopTik.',
        'The receiving account must be your own and match the name on your ShopTik profile.',
      )}>
      <ErrorBox message={loi} />
      <InfoBox message={tin} />

      {/* Danh sách đã có */}
      {!isPending && (data?.data.length ?? 0) > 0 && (
        <View style={styles.list}>
          {data!.data.map((b) => (
            <View key={b.id} style={styles.item}>
              <View style={styles.itemIcon}>
                <Ionicons name="card-outline" size={17} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>
                  {b.bank_code}{' '}
                  {hienSo[b.id] && b.account_number_full
                    ? nhomSo(b.account_number_full)
                    : `···${b.account_last4}`}
                </Text>
                <Text style={styles.itemMeta}>
                  {b.account_name_masked} ·{' '}
                  {b.verified_at ? `${t('xác minh', 'verified')} ${ngay(b.verified_at)}` : t('chưa xác minh', 'not verified')}
                </Text>
              </View>
              {b.account_number_full ? (
                <Pressable
                  onPress={() => setHienSo((s) => ({ ...s, [b.id]: !s[b.id] }))}
                  hitSlop={8}
                  style={styles.mat}
                  accessibilityRole="button"
                  accessibilityLabel={
                    hienSo[b.id]
                      ? t('Ẩn số tài khoản', 'Hide account number')
                      : t('Hiện số tài khoản', 'Show account number')
                  }>
                  <Ionicons
                    name={hienSo[b.id] ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={colors.muted}
                  />
                </Pressable>
              ) : null}
              {b.status === 'VERIFIED' && (
                <Ionicons name="checkmark-circle" size={19} color={colors.success} />
              )}
            </View>
          ))}
        </View>
      )}

      {requestId ? (
        <>
          <Field
            label={t('Mã xác nhận trong email', 'Verification code in email')}
            icon="key-outline"
            value={ma}
            onChangeText={setMa}
            placeholder={t('6 số', '6 digits')}
            inputMode="numeric"
            maxLength={6}
          />
          <PrimaryButton
            label={t('Xác nhận tài khoản', 'Confirm account')}
            onPress={xacNhan}
            loading={dangGui}
            disabled={ma.trim().length !== 6}
          />
          <Pressable onPress={() => setRequestId(null)} style={styles.huy} hitSlop={8}>
            <Text style={styles.huyText}>{t('Nhập lại thông tin', 'Re-enter details')}</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.h2}>{t('Thêm tài khoản mới', 'Add new account')}</Text>
          <Field
            label={t('Mã ngân hàng', 'Bank code')}
            icon="business-outline"
            value={maNH}
            onChangeText={setMaNH}
            placeholder="VCB, TCB, MB…"
            autoCapitalize="characters"
            hint={
              data?.supportedBanks?.length
                ? `${t('Hỗ trợ', 'Supported')}: ${data.supportedBanks.map((b) => b.code).slice(0, 8).join(', ')}…`
                : undefined
            }
          />
          <Field
            label={t('Số tài khoản', 'Account number')}
            icon="keypad-outline"
            value={soTK}
            onChangeText={setSoTK}
            placeholder={t('Chỉ gồm chữ số', 'Digits only')}
            inputMode="numeric"
          />
          <Field
            label={t('Tên chủ tài khoản', 'Account holder name')}
            icon="person-outline"
            value={tenTK}
            onChangeText={setTenTK}
            placeholder="NGUYEN VAN A"
            autoCapitalize="characters"
          />
          <Text style={styles.mienTru}>
            {t(
              'ShopTik không chịu bất cứ trách nhiệm nào nếu bạn điền sai thông tin thanh toán. Vui lòng kiểm tra kỹ số tài khoản và tên chủ tài khoản trước khi gửi.',
              'ShopTik takes no responsibility if you enter the wrong payment details. Please double-check the account number and holder name before submitting.',
            )}
          </Text>
          <Pressable
            onPress={() => setXacNhanDung((v) => !v)}
            style={styles.check}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: xacNhanDung }}>
            <Ionicons
              name={xacNhanDung ? 'checkbox' : 'square-outline'}
              size={20}
              color={xacNhanDung ? colors.brand : colors.muted}
            />
            <Text style={styles.checkText}>
              {t(
                'Tôi xác nhận thông tin thanh toán tôi điền là hoàn toàn chính xác.',
                'I confirm the payment details I entered are entirely correct.',
              )}
            </Text>
          </Pressable>
          <PrimaryButton
            label={t('Gửi mã xác nhận', 'Send verification code')}
            onPress={them}
            loading={dangGui}
            disabled={
              maNH.trim().length < 2 ||
              soTK.trim().length < 6 ||
              tenTK.trim().length < 3 ||
              !xacNhanDung
            }
          />
        </>
      )}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 12 },
  list: { gap: 8, marginBottom: spacing.lg },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  itemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  itemMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },
  mat: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  mienTru: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.muted,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    padding: 10,
    marginBottom: 12,
  },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 14 },
  checkText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.text },
  huy: { alignSelf: 'center', marginTop: 14, padding: 6 },
  huyText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
