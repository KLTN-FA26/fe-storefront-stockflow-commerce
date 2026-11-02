import type { z } from "zod";
import type { inboxListParams, inboxPageDto, notificationDto } from "./schemas";

export type NotificationItem = z.infer<typeof notificationDto>;
export type InboxPage = z.infer<typeof inboxPageDto>;
export type InboxListParams = z.infer<typeof inboxListParams>;
