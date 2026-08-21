import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { layNganHang, themNganHang, xacNhanNganHang } from '@/api/bank';
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
      setLoi(e instanceof Error && e.message ? e.message : 'Không thêm được tài khoản.');
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
      setTin('Đã xác minh tài khoản ngân hàng.');
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : 'Mã chưa đúng.');
    } finally {
      setDangGui(false);
    }
  }

  return (
    <FormScreen
      title="Ngân hàng"
      subtitle="Tài khoản nhận tiền phải là chính chủ, trùng họ tên với hồ sơ ShopTik.">
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
                  {b.bank_code} ···{b.account_last4}
                </Text>
                <Text style={styles.itemMeta}>
                  {b.account_name_masked} ·{' '}
                  {b.verified_at ? `xác minh ${ngay(b.verified_at)}` : 'chưa xác minh'}
                </Text>
              </View>
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
            label="Mã xác nhận trong email"
            icon="key-outline"
            value={ma}
            onChangeText={setMa}
            placeholder="6 số"
            inputMode="numeric"
            maxLength={6}
          />
          <PrimaryButton
            label="Xác nhận tài khoản"
            onPress={xacNhan}
            loading={dangGui}
            disabled={ma.trim().length !== 6}
          />
          <Pressable onPress={() => setRequestId(null)} style={styles.huy} hitSlop={8}>
            <Text style={styles.huyText}>Nhập lại thông tin</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.h2}>Thêm tài khoản mới</Text>
          <Field
            label="Mã ngân hàng"
            icon="business-outline"
            value={maNH}
            onChangeText={setMaNH}
            placeholder="VCB, TCB, MB…"
            autoCapitalize="characters"
            hint={
              data?.supportedBanks?.length
                ? `Hỗ trợ: ${data.supportedBanks.map((b) => b.code).slice(0, 8).join(', ')}…`
                : undefined
            }
          />
          <Field
            label="Số tài khoản"
            icon="keypad-outline"
            value={soTK}
            onChangeText={setSoTK}
            placeholder="Chỉ gồm chữ số"
            inputMode="numeric"
          />
          <Field
            label="Tên chủ tài khoản"
            icon="person-outline"
            value={tenTK}
            onChangeText={setTenTK}
            placeholder="NGUYEN VAN A"
            autoCapitalize="characters"
          />
          <PrimaryButton
            label="Gửi mã xác nhận"
            onPress={them}
            loading={dangGui}
            disabled={maNH.trim().length < 2 || soTK.trim().length < 6 || tenTK.trim().length < 3}
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
  huy: { alignSelf: 'center', marginTop: 14, padding: 6 },
  huyText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
});
