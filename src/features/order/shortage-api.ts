import { api } from "@/lib/api/client";
import {
  chooseShortageInputSchema,
  shortageCardSchema,
  type ChooseShortageInput,
  type ShortageCard,
} from "@/lib/domain/shortage";

// BE ShortageCardController: /api/v1/orders/me/{orderId}/shortage-cards (sales-orders:READ / UPDATE, scope OWN).

const base = (orderId: string) => `/orders/me/${encodeURIComponent(orderId)}/shortage-cards`;

/**
 * GET .../shortage-cards/live - the card still waiting on this order (`Sent` or `Answered`, 17 §5.6), or null when
 * there is none: the BE answers `data: null`, and the order page then leaves the block out.
 */
export async function getLiveShortageCard(
  orderId: string,
  signal?: AbortSignal,
): Promise<ShortageCard | null> {
  const { data } = await api.get<unknown>(`${base(orderId)}/live`, signal ? { signal } : {});
  return data === null || data === undefined ? null : shortageCardSchema.parse(data);
}

/**
 * POST .../shortage-cards/{cardId}/choice - the customer's one choice on the card (17 §4.14 step 57; the same
 * operation as the chat card's `CHOOSE`). 409 SHORTAGE_CARD_STATE_CONFLICT when the card changed meanwhile.
 */
export async function chooseShortageOption(
  orderId: string,
  cardId: string,
  input: ChooseShortageInput,
): Promise<ShortageCard> {
  const { option, version, note } = chooseShortageInputSchema.parse(input);
  const { data } = await api.post<unknown>(
    `${base(orderId)}/${encodeURIComponent(cardId)}/choice`,
    {
      option,
      version,
      ...(note ? { note } : {}),
    },
  );
  return shortageCardSchema.parse(data);
}
