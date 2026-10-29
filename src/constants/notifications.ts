/** In-app inbox for the signed-in customer (BE SCRUM-147 / PR #102). */
export const NOTIFICATION_API = {
  inbox: "/notifications/me",
  unreadCount: "/notifications/me/unread-count",
  markRead: (id: string) => `/notifications/me/${encodeURIComponent(id)}/read`,
  markAllRead: "/notifications/me/read-all",
} as const;

export const NOTIFICATION_SEVERITIES = ["INFO", "WARN", "CRITICAL"] as const;

export const NOTIFICATION_CONFIG = {
  pageSize: 10,
  pollIntervalMs: 30_000,
} as const;

export const NOTIFICATION_LABELS = {
  title: "Thông báo",
  badge: (count: number) => `${count} thông báo chưa đọc`,
  markAllRead: "Đánh dấu tất cả đã đọc",
  all: "Tất cả",
  unreadOnly: "Chưa đọc",
  loading: "Đang tải thông báo…",
  empty: "Bạn chưa có thông báo nào.",
  emptyUnread: "Bạn đã đọc hết thông báo.",
  error: "Không tải được thông báo.",
  updateError: "Không cập nhật được thông báo.",
  retry: "Thử lại",
  previous: "Mới hơn",
  next: "Cũ hơn",
  page: (page: number, total: number) => `Trang ${page}/${total}`,
  severity: { INFO: "Thông tin", WARN: "Cảnh báo", CRITICAL: "Khẩn cấp" },
} as const;
