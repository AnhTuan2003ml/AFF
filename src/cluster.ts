import cluster from "node:cluster";
import { availableParallelism } from "node:os";

/**
 * Điểm khởi động chạy NHIỀU worker (Node đơn luồng cho JS → một tiến trình chỉ
 * dùng ~1 CPU core). Primary fork N worker cùng lắng nghe một cổng (cluster tự
 * chia đều kết nối), tận dụng hết core để chịu tải cao hơn.
 *
 * Số worker: WEB_CONCURRENCY nếu đặt, mặc định min(số core, 4). Lưu ý mỗi worker
 * giữ pool DB riêng → tổng kết nối = worker × DATABASE_POOL_MAX phải nhỏ hơn
 * max_connections của Postgres. Đồng bộ nền chỉ chạy ở worker id 1 (xem
 * server.ts) nên không bị trùng.
 */
const cores = availableParallelism();
const desired = Number(process.env.WEB_CONCURRENCY);
const workers =
  Number.isFinite(desired) && desired > 0
    ? Math.floor(desired)
    : Math.max(1, Math.min(cores, 4));

if (cluster.isPrimary && workers > 1) {
  // eslint-disable-next-line no-console
  console.log(`[cluster] primary ${process.pid} → mở ${workers} worker (core: ${cores})`);
  for (let i = 0; i < workers; i += 1) cluster.fork();
  cluster.on("exit", (worker, code, signal) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[cluster] worker ${worker.process.pid} thoát (${signal || code}) → mở lại`,
    );
    cluster.fork();
  });
} else {
  await import("./server.js");
}
