import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { layVi } from '@/api/account';
import { layNganHang, taoLenhRut, xacNhanRut } from '@/api/bank';
import { ErrorBox, Field, InfoBox, PrimaryButton } from '@/components/form';
import { FormScreen } from '@/components/FormScreen';
import { vnd } from '@/lib/format';
import { colors, radius, spacing } from '@/theme/tokens';

/**
 * Rút tiền — chọn tài khoản nhận, nhập số tiền, xác nhận bằng OTP email.
 *
 * Chỉ rút được từ số dư KHẢ DỤNG. Số dư CHỜ là tiền hoàn của đơn đã xong nhưng
 * còn trong thời gian giữ; cho rút phần đó là trả tiền trước khi sàn chốt, sàn
 * hủy đơn thì âm ví.
 */
export default function WithdrawScreen() {
  const qc = useQueryClient();
  const { data: vi } = useQuery({ queryKey: ['wallet'], queryFn: layVi });
  const { data: nh } = useQuery({ queryKey: ['banks'], queryFn: layNganHang });

  const [chon, setChon] = useState<string | null>(null);
  const [soTien, setSoTien] = useState('');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [ma, setMa] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [tin, setTin] = useState<string | null>(null);

  const khaDung = vi?.balances.available ?? 0;
  const daXacMinh = (nh?.data ?? []).filter((b) => b.status === 'VERIFIED');
  const so = Number(soTien.replace(/\D/g, '')) || 0;

  async function tao() {
    setLoi(null);
    if (!chon) {
      setLoi('Chọn tài khoản nhận tiền.');
      return;
    }
    if (so > khaDung) {
      setLoi(`Số dư khả dụng chỉ có ${vnd(khaDung)}.`);
      return;
    }
    setDangGui(true);
    try {
      const r = await taoLenhRut({ bankAccountId: chon, amountVnd: so });
      setIntentId(r.intentId);
      setTin(r.message);
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : 'Không tạo được lệnh rút.');
    } finally {
      setDangGui(false);
    }
  }

  async function xacNhan() {
    if (!intentId) return;
    setLoi(null);
    setDangGui(true);
    try {
      const r = await xacNhanRut(intentId, ma.trim());
      await qc.invalidateQueries({ queryKey: ['wallet'] });
      await qc.invalidateQueries({ queryKey: ['withdrawals'] });
      setTin(r.message);
      router.back();
    } catch (e) {
      setLoi(e instanceof Error && e.message ? e.message : 'Mã chưa đúng.');
    } finally {
      setDangGui(false);
    }
  }

  if (intentId) {
    return (
      <FormScreen title="Xác nhận rút" subtitle="Nhập mã 6 số vừa gửi tới email của bạn.">
        <ErrorBox message={loi} />
        <InfoBox message={tin} />
        <Field
          label="Mã xác nhận"
          icon="key-outline"
          value={ma}
          onChangeText={setMa}
          placeholder="6 số"
          inputMode="numeric"
          maxLength={6}
        />
        <PrimaryButton
          label={`Rút ${vnd(so)}`}
          onPress={xacNhan}
          loading={dangGui}
          disabled={ma.trim().length !== 6}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen title="Rút tiền" subtitle="Tiền về tài khoản ngân hàng đã xác minh của bạn.">
      <ErrorBox message={loi} />

      <View style={styles.balance}>
        <Text style={styles.balanceLabel}>Khả dụng — rút được</Text>
        <Text style={styles.balanceValue}>{vnd(khaDung)}</Text>
      </View>

      <Text style={styles.h2}>Tài khoản nhận</Text>
      {daXacMinh.length === 0 ? (
        <Pressable onPress={() => router.replace('/bank')} style={styles.addBank}>
          <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
          <Text style={styles.addBankText}>Chưa có tài khoản đã xác minh — thêm ngay</Text>
        </Pressable>
      ) : (
        <View style={{ gap: 8, marginBottom: spacing.lg }}>
          {daXacMinh.map((b) => (
            <Pressable
              key={b.id}
              onPress={() => setChon(b.id)}
              style={[styles.bankItem, chon === b.id && styles.bankItemActive]}>
              <Ionicons
                name={chon === b.id ? 'radio-button-on' : 'radio-button-off'}
                size={19}
                color={chon === b.id ? colors.brand : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.bankTitle}>
                  {b.bank_code} ···{b.account_last4}
                </Text>
                <Text style={styles.bankMeta}>{b.account_name_masked}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Field
        label="Số tiền muốn rút"
        icon="cash-outline"
        value={soTien}
        onChangeText={(t) => setSoTien(t.replace(/\D/g, ''))}
        placeholder="Ví dụ 100000"
        inputMode="numeric"
        hint={so > 0 ? `Bạn sẽ rút ${vnd(so)}` : undefined}
      />

      <PrimaryButton
        label="Gửi mã xác nhận"
        onPress={tao}
        loading={dangGui}
        disabled={!chon || so <= 0}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  h2: { fontSize: 15, fontWeight: '900', color: colors.text, marginBottom: 12 },
  balance: {
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    marginBottom: spacing.lg,
  },
  balanceLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  balanceValue: { fontSize: 28, fontWeight: '900', color: '#fff', letterSpacing: -1, marginTop: 4 },

  bankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  bankItemActive: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  bankTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  bankMeta: { fontSize: 11.5, color: colors.muted, marginTop: 2 },

  addBank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSoft,
    marginBottom: spacing.lg,
  },
  addBankText: { fontSize: 13, fontWeight: '700', color: colors.brand, flex: 1 },
});
