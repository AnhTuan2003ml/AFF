import { apiFetch } from './client';

/**
 * Điểm danh, nhiệm vụ, giới thiệu và khám phá — ánh xạ với
 * src/routes/api/features.ts.
 *
 * Nhánh này dùng `requireApiUser` nên trả 401 khi hết hạn, khác nhánh `/app/*`
 * của web vốn chuyển hướng 302 sang trang đăng nhập. Nhờ vậy `client.ts` bắt
 * được 401 và tự làm mới token thay vì đá người dùng ra ngoài.
 */

/** Khớp CheckinStatus ở src/services/checkin.ts. */
export interface CheckinState {
  totalDays: number;
  streak: number;
  checkedInToday: boolean;
  justCheckedIn: boolean;
  /** Ngày đã điểm danh gần đây (YYYY-MM-DD) để vẽ lịch. */
  dates: string[];
  today: string;
}

/** Khớp MissionDefinition / MissionProgressView / MissionGroupOverview. */
export interface MissionDefinition {
  id: string;
  type: string;
  title: string;
  description: string;
  threshold: number;
  rewardAmountVnd: number;
  status: 'ACTIVE' | 'INACTIVE';
  sortOrder: number;
}

export interface MissionItem {
  definition: MissionDefinition;
  progress: number;
  claimStatus: string | null;
  claimable: boolean;
  tickPercent: number;
}

export interface MissionGroup {
  maxThreshold: number;
  currentProgress: number;
  fillPercent: number;
  items: MissionItem[];
}

export type MissionOverview = Record<
  'REFERRAL_MILESTONE' | 'PURCHASE_MILESTONE',
  MissionGroup
>;

export interface Referral {
  fullName: string;
  status: string;
  createdAt: string;
  approvedOrders: number;
  earnedVnd: number;
}

export interface DiscoverProduct {
  item_id: string;
  name: string;
  image_url: string | null;
  price_vnd: string | null;
  commission_rate_bps: number | null;
  shop_name: string | null;
  product_url: string;
  sales_count: string | null;
}

export function layDiemDanh() {
  return apiFetch<CheckinState>('/api/v1/checkin');
}

export function diemDanh() {
  return apiFetch<CheckinState>('/api/v1/checkin', { method: 'POST' });
}

export function layNhiemVu() {
  return apiFetch<MissionOverview>('/api/v1/missions');
}

export function nhanThuong(missionDefinitionId: string) {
  return apiFetch<{ status: string }>('/api/v1/missions/claim', {
    method: 'POST',
    body: { missionDefinitionId },
  });
}

export function layGioiThieu() {
  return apiFetch<{
    referralCode: string | null;
    totalEarnedVnd: number;
    data: Referral[];
  }>('/api/v1/referrals');
}

/** Không cần đăng nhập — khách xem sản phẩm đang hoàn tiền được. */
export function layKhamPha(list: 'best' | 'recommend' | 'exclusive' = 'best', page = 1) {
  return apiFetch<{
    list: string;
    page: number;
    knownPages: number;
    data: DiscoverProduct[];
  }>(`/api/v1/discover?list=${list}&page=${page}`, { auth: false });
}

/* ---------------------------- Bảng xếp hạng --------------------------- */

export interface TopBuyer {
  name: string;
  count: number;
  avatarUrl: string | null;
}
export interface TopProduct {
  name: string;
  imageUrl: string | null;
  count: number;
}
export interface Leaderboard {
  topBuyers: TopBuyer[];
  topProducts: TopProduct[];
  monthLabel: string;
}

/** Công khai — hiện cả khi chưa đăng nhập, giống web. */
export function layBangXepHang() {
  return apiFetch<Leaderboard>('/api/v1/leaderboard', { auth: false });
}

/* -------------------- Sản phẩm bạn quan tâm -------------------------- */

export interface InterestedProduct {
  name: string;
  imageUrl: string | null;
  productUrl: string | null;
}

/** Sản phẩm đã bấm Mua ngay nhưng chưa thành đơn — của riêng người dùng. */
export function layQuanTam() {
  return apiFetch<{ data: InterestedProduct[] }>('/api/v1/interested');
}
