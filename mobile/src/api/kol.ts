import { apiFetch, apiUpload } from './client';

export interface KolSection {
  label: string;
  paragraphs: string[];
}

export interface KolTerms {
  version: number;
  sections: KolSection[];
}

/** Điều khoản thỏa thuận để hiển thị ở bước 1. */
export function layDieuKhoanKol() {
  return apiFetch<KolTerms>('/api/v1/kol/terms');
}

/** Trạng thái hồ sơ KOL/KOC hiện tại: null | PENDING | APPROVED | REJECTED. */
export function layTrangThaiKol() {
  return apiFetch<{ status: string | null }>('/api/v1/kol/status');
}

export interface HoSoKolInput {
  fullName: string;
  birthDate?: string;
  cccdNumber: string;
  cccdIssueDate?: string;
  cccdIssuePlace?: string;
  address?: string;
  phone: string;
  email?: string;
  taxCode?: string;
  bankAccount?: string;
  bankHolder?: string;
  bankName?: string;
  socialLinks?: string;
}

export interface TepKyc {
  uri: string;
  name: string;
  type: string;
}

/** Nộp hồ sơ + 3 tệp KYC (2 mặt CCCD + video khuôn mặt) qua multipart. */
export function guiHoSoKol(
  info: HoSoKolInput,
  tep: { cccdFront: TepKyc; cccdBack: TepKyc; faceVideo: TepKyc },
) {
  const form = new FormData();
  Object.entries(info).forEach(([k, v]) => {
    if (v != null && v !== '') form.append(k, String(v));
  });
  // React Native FormData nhận { uri, name, type } cho phần tệp.
  form.append('cccdFront', tep.cccdFront as unknown as Blob);
  form.append('cccdBack', tep.cccdBack as unknown as Blob);
  form.append('faceVideo', tep.faceVideo as unknown as Blob);
  return apiUpload<{ ok: boolean }>('/api/v1/kol/apply', form);
}
