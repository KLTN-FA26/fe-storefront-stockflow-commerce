import type { z } from "zod";

import type {
  acceptQuoteInputSchema,
  chatAttachmentDtoSchema,
  chatContextDtoSchema,
  chatConversationDtoSchema,
  chatConversationPageDtoSchema,
  chatDownloadLinkDtoSchema,
  chatMessageDtoSchema,
  chatMessagePageDtoSchema,
  chatReadMarkerDtoSchema,
  chatUnreadDtoSchema,
  openConversationInputSchema,
  quotePricingDtoSchema,
  rateInputSchema,
  requestChangesInputSchema,
  sendTextInputSchema,
} from "./schemas";

export type ChatContext = z.infer<typeof chatContextDtoSchema>;
export type ChatAttachment = z.infer<typeof chatAttachmentDtoSchema>;
export type ChatMessage = z.infer<typeof chatMessageDtoSchema>;
export type ChatCard = NonNullable<ChatMessage["card"]>;
export type ChatConversation = z.infer<typeof chatConversationDtoSchema>;
export type ChatConversationPage = z.infer<typeof chatConversationPageDtoSchema>;
export type ChatMessagePage = z.infer<typeof chatMessagePageDtoSchema>;
export type ChatReadMarker = z.infer<typeof chatReadMarkerDtoSchema>;
export type ChatUnread = z.infer<typeof chatUnreadDtoSchema>;
export type ChatDownloadLink = z.infer<typeof chatDownloadLinkDtoSchema>;
export type QuotePricing = z.infer<typeof quotePricingDtoSchema>;

export type OpenConversationInput = z.input<typeof openConversationInputSchema>;
export type SendTextInput = z.input<typeof sendTextInputSchema>;
export type AcceptQuoteInput = z.input<typeof acceptQuoteInputSchema>;
export type RequestChangesInput = z.input<typeof requestChangesInputSchema>;
export type RateInput = z.input<typeof rateInputSchema>;

export interface SendAttachmentInput {
  file: File;
  caption?: string | undefined;
  clientMessageId: string;
}

export interface ChatListParams {
  /** 1-based, as the UI counts; the wire is 0-based. */
  page: number;
  size: number;
}

export type CardActionBody =
  | ({ action: "ACCEPT" } & AcceptQuoteInput)
  | ({ action: "REQUEST_CHANGES" } & RequestChangesInput)
  | ({ action: "RATE" } & RateInput);
