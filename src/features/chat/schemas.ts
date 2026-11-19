/**
 * The customer's sales chat (kltn-docs 16, WF-02 E1): BE views and request bodies.
 *
 * Wire shapes come from BE `chat/internal/service/ChatConversationView`, `ChatMessageView`,
 * `ChatMessagePage`, `ChatReadMarkerView` and `ChatRequests` (develop). The BE omits null fields
 * (`non_null`), so every field it may leave out is `.nullish()`. Enums stay strings: a status or a
 * card kind the FE does not know yet renders a neutral fallback instead of breaking the thread.
 */

import { z } from "zod";

import { pageResponseSchema } from "@/lib/api/page-response";

import { cardViewOf } from "./card-payloads";

const id = z.string().min(1);
const instant = z.string().min(1);

/** BE ConversationContext row; `label` and `status` only on the detail (C3), not on list rows. */
export const chatContextDtoSchema = z.object({
  id,
  kind: z.string(),
  refId: id,
  primary: z.boolean().nullish(),
  label: z.string().nullish(),
  status: z.string().nullish(),
  attachedAt: instant.nullish(),
});

export const chatAttachmentDtoSchema = z.object({
  id,
  fileName: z.string().nullish(),
  contentType: z.string().nullish(),
  sizeBytes: z.number().nullish(),
});

/** BE ChatMessageView.Card. Buttons are `customerActions` only; `staffActions` is never read. */
const chatCardDtoSchema = z
  .object({
    kind: z.string(),
    state: z.string(),
    payload: z.record(z.string(), z.unknown()).nullish(),
    updatedAt: instant.nullish(),
    customerActions: z.array(z.string()).nullish(),
  })
  .transform((card) => ({
    kind: card.kind,
    state: card.state,
    updatedAt: card.updatedAt ?? null,
    customerActions: card.customerActions ?? [],
    view: cardViewOf(card.kind, card.payload),
  }));

export const chatMessageDtoSchema = z.object({
  id,
  conversationId: id.nullish(),
  seq: z.number().int(),
  kind: z.string(),
  visibility: z.string().nullish(),
  senderType: z.string().nullish(),
  senderId: z.string().nullish(),
  senderName: z.string().nullish(),
  body: z.string().nullish(),
  clientMessageId: z.string().nullish(),
  card: chatCardDtoSchema.nullish(),
  attachments: z
    .array(chatAttachmentDtoSchema)
    .nullish()
    .transform((list) => list ?? []),
  sentAt: instant,
  editedAt: instant.nullish(),
  deleted: z.boolean().nullish(),
});

type ParsedMessage = z.infer<typeof chatMessageDtoSchema>;

/**
 * 16 BR-07: an internal note never reaches the customer. The BE filters them in SQL (plan B.4);
 * this drops one anyway, at the boundary, so no screen ever holds one.
 */
export const isCustomerVisible = (message: Pick<ParsedMessage, "kind" | "visibility">) =>
  message.kind !== "INTERNAL_NOTE" && message.visibility !== "STAFF";

export const chatConversationDtoSchema = z
  .object({
    id,
    subject: z.string().nullish(),
    status: z.string(),
    assignedAgentId: z.string().nullish(),
    assignedAgentName: z.string().nullish(),
    agentOnline: z.boolean().nullish(),
    firstResponseDueAt: instant.nullish(),
    firstRespondedAt: instant.nullish(),
    reopenUntil: instant.nullish(),
    continuedFromId: z.string().nullish(),
    createdAt: instant.nullish(),
    lastMessageAt: instant.nullish(),
    lastSeq: z.number().int().nullish(),
    unread: z.number().int().nullish(),
    lastMessage: chatMessageDtoSchema.nullish(),
    contexts: z
      .array(chatContextDtoSchema)
      .nullish()
      .transform((list) => list ?? []),
    withinBusinessHours: z.boolean().nullish(),
    expectedResponseAt: instant.nullish(),
    resolvedAt: instant.nullish(),
    canRate: z.boolean().nullish(),
    csatScore: z.number().int().nullish(),
    csatSubmittedAt: instant.nullish(),
  })
  .transform((conversation) => ({
    ...conversation,
    lastMessage:
      conversation.lastMessage && isCustomerVisible(conversation.lastMessage)
        ? conversation.lastMessage
        : null,
  }));

export const chatConversationPageDtoSchema = pageResponseSchema(chatConversationDtoSchema);

/** BE ChatMessagePage: `before` pages come newest first, `since` pages oldest first. */
export const chatMessagePageDtoSchema = z
  .object({
    items: z.array(chatMessageDtoSchema),
    nextBefore: z.number().int().nullish(),
    nextSince: z.number().int().nullish(),
    lastSeq: z.number().int().nullish(),
  })
  .transform((page) => ({ ...page, items: page.items.filter(isCustomerVisible) }));

export const chatReadMarkerDtoSchema = z.object({
  conversationId: z.string().nullish(),
  seq: z.number().int(),
  at: instant.nullish(),
});

/** C14 `ChatMessageRepository.UnreadTotal`. */
export const chatUnreadDtoSchema = z.object({
  conversations: z.number().int().nonnegative(),
  messages: z.number().int().nonnegative(),
});

export const chatDownloadLinkDtoSchema = z.object({
  url: z.string().min(1),
  expiresAt: instant.nullish(),
});

/* ── Request bodies (ChatRequests) ──────────────────────────────────────── */

/** C5/C12: 1..4000 characters after trimming (BE "A message is at most 4000 characters"). */
export const CHAT_TEXT_MAX = 4000;
/** C10 RATE / C11: comment at most 2000 characters. */
export const CHAT_COMMENT_MAX = 2000;
/** C10 REQUEST_CHANGES: the quote's feedback is 1–2000 characters (plan A.1 change-request). */
export const QUOTE_FEEDBACK_MAX = 2000;

/** The documents a customer may open a conversation about (BE ContextKind, the customer's subset). */
export const CHAT_CONTEXT_KINDS = [
  "PRODUCT",
  "CUSTOMER_SKU",
  "DESIGN",
  "DESIGN_PROJECT",
  "QUOTE",
  "ORDER",
  "CONTRACT",
] as const;
export const chatContextKindSchema = z.enum(CHAT_CONTEXT_KINDS);

/** BE DB CHECK `ck_message_client_id`: `^[A-Za-z0-9._:-]{1,64}$`. */
export const clientMessageIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,64}$/);

export const chatTextSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập nội dung tin nhắn.")
  .max(CHAT_TEXT_MAX, `Tin nhắn tối đa ${CHAT_TEXT_MAX} ký tự.`);

/** C1. 16 BR-02: the customer names a document only here, as kind + id together or neither. */
export const openConversationInputSchema = z
  .object({
    subject: z.string().trim().max(300).optional(),
    contextKind: chatContextKindSchema.optional(),
    contextId: z.string().trim().min(1).optional(),
    text: chatTextSchema.optional(),
    clientMessageId: clientMessageIdSchema.optional(),
  })
  .refine((input) => (input.contextKind === undefined) === (input.contextId === undefined), {
    message: "Ngữ cảnh cần cả loại chứng từ và mã chứng từ.",
    path: ["contextId"],
  });

export const sendTextInputSchema = z.object({
  text: chatTextSchema,
  clientMessageId: clientMessageIdSchema,
});

/** C10 ACCEPT: cartons per quote LINE id (`payload.lines[].id`); lines not named keep the proposal. */
/**
 * The pricing of a quote, read from `GET /quotes/{id}` (BE QuoteResponse) when the QUOTE card's acceptance dialog
 * opens: the card payload (B.7.3) has no MOQ, tiers, tax rate or fees, so without it the dialog could not show
 * the MOQ or a total until the BE refused (WF-02 audit, item 4). Only what the preview needs; the quote page
 * parses the whole response.
 */
export const quotePricingDtoSchema = z.object({
  id,
  lines: z.array(
    z.object({
      id,
      lineNo: z.number().int(),
      sku: z.string(),
      cartons: z.number().int().nullish(),
      unitsPerCarton: z.number().int().nullish(),
      moq: z.number().int().nullish(),
      tiers: z
        .array(z.object({ minQuantity: z.number().int().positive(), unitPrice: z.number() }))
        .nullish()
        .transform((tiers) => tiers ?? []),
      taxRate: z.number().nullish(),
    }),
  ),
  fees: z
    .array(
      z.object({
        amount: z.number().nullish(),
        tax: z.number().nullish(),
        taxRate: z.number().nullish(),
      }),
    )
    .nullish()
    .transform((fees) => fees ?? []),
});

export const acceptQuoteInputSchema = z.object({
  version: z.number().int().nonnegative(),
  cartons: z.record(
    z.string(),
    z.number().int("Số thùng phải là số nguyên.").min(1, "Số thùng tối thiểu là 1."),
  ),
});

/** C10 REQUEST_CHANGES: the note is required (BE refusal.chat.changesNote). */
export const requestChangesInputSchema = z.object({
  version: z.number().int().nonnegative(),
  note: z
    .string()
    .trim()
    .min(1, "Vui lòng ghi rõ nội dung cần sửa.")
    .max(QUOTE_FEEDBACK_MAX, `Ghi chú tối đa ${QUOTE_FEEDBACK_MAX} ký tự.`),
});

/** C11 / C10 RATE: 1–5 stars, an optional comment. */
export const rateInputSchema = z.object({
  score: z.number().int().min(1, "Vui lòng chọn số sao.").max(5),
  comment: z
    .string()
    .trim()
    .max(CHAT_COMMENT_MAX, `Nhận xét tối đa ${CHAT_COMMENT_MAX} ký tự.`)
    .optional(),
});

/* ── Attachments (plan B.8, BE FileCategory.CHAT_ATTACHMENT) ─────────────── */

export const CHAT_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export const CHAT_FILE_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_FILE_ACCEPT = CHAT_FILE_TYPES.join(",");

/** Why a file cannot be sent, checked before upload; null when it can. The BE checks again. */
export function chatFileProblem(file: Pick<File, "type" | "size">): string | null {
  if (!(CHAT_FILE_TYPES as readonly string[]).includes(file.type)) {
    return "Chỉ gửi được ảnh JPEG, PNG, WebP hoặc file PDF.";
  }
  if (file.size === 0) return "File rỗng, vui lòng chọn file khác.";
  if (file.size > CHAT_FILE_MAX_BYTES) return "File vượt quá 20 MB, vui lòng chọn file nhỏ hơn.";
  return null;
}
