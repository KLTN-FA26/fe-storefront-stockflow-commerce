"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";

import { formatDate, formatDateTime } from "@/lib/format/date";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { SampleCardPayload } from "../../card-payloads";
import { closedCardMeta, sampleStatusMeta } from "../../labels";
import { QUOTE_FEEDBACK_MAX, requestReprintInputSchema } from "../../schemas";
import { sampleCardTitle } from "../../thread-facts";
import type { ChatCard } from "../../types";
import { CardDialog } from "./card-dialog";
import { CardFrame, Fact, Facts } from "./card-frame";
import { useCardActionState } from "./use-card-action";

interface SampleApprovalCardProps {
  conversationId: string;
  messageId: string;
  card: ChatCard;
  payload: SampleCardPayload;
  /** The customer may act here (chat-conversations:UPDATE). */
  canAct: boolean;
}

type ReprintForm = z.infer<typeof requestReprintInputSchema>;

/**
 * SAMPLE_APPROVAL card (plan B.7.9): APPROVE, or REQUEST_REPRINT with a note, while WAITING. Approving releases mass
 * printing, which cannot be undone, so it is confirmed first (SF-UX-25); the card is named after the goods, not the
 * internal production order.
 */
export function SampleApprovalCard({
  conversationId,
  messageId,
  card,
  payload,
  canAct,
}: SampleApprovalCardProps) {
  const [reprintOpen, setReprintOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const { title, named } = sampleCardTitle(payload);
  const round = payload.roundNo ? ` lần ${payload.roundNo}` : "";
  const action = useCardActionState(conversationId, messageId);
  const canApprove = canAct && card.customerActions.includes("APPROVE");
  const canReprint = canAct && card.customerActions.includes("REQUEST_REPRINT");
  const { register, handleSubmit, reset, formState } = useForm<ReprintForm>({
    resolver: zodResolver(requestReprintInputSchema),
    defaultValues: { note: "" },
  });
  useEffect(() => {
    if (reprintOpen) reset({ note: "" });
  }, [reprintOpen, reset]);
  const noteError = formState.errors.note?.message;
  const noteId = `reprint-note-${messageId}`;

  return (
    <CardFrame
      eyebrow="Duyệt mẫu in"
      title={title}
      titleMono={!named}
      status={closedCardMeta(card.state) ?? sampleStatusMeta(payload.status)}
      footer={
        canApprove || canReprint ? (
          <>
            {canApprove ? (
              <Button
                type="button"
                disabled={action.pending}
                className="min-h-11 rounded-[var(--r-md)] px-4"
                onClick={() => setApproveOpen(true)}
              >
                {action.pending ? "Đang gửi..." : "Duyệt mẫu"}
              </Button>
            ) : null}
            {canReprint ? (
              <Button
                type="button"
                variant="outline"
                disabled={action.pending}
                className="min-h-11 rounded-[var(--r-md)] px-4"
                onClick={() => setReprintOpen(true)}
              >
                In lại mẫu
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <Facts>
        {payload.physicalSampleSentOn ? (
          <Fact label="Mẫu thật gửi ngày" numeric>
            {formatDate(payload.physicalSampleSentOn)}
          </Fact>
        ) : null}
        {payload.media.length > 0 ? (
          <Fact label="Ảnh, video mẫu" numeric>
            {payload.media.length}
          </Fact>
        ) : null}
        {payload.answeredAt ? (
          <Fact label="Bạn trả lời lúc" numeric>
            {formatDateTime(payload.answeredAt)}
          </Fact>
        ) : null}
      </Facts>
      {canApprove ? (
        <p className="text-ink-secondary">
          Duyệt mẫu để Sale cho sản xuất, hoặc yêu cầu in lại kèm ghi chú.
        </p>
      ) : null}
      {action.error && !reprintOpen ? (
        <p role="alert" className="text-danger">
          {action.error}
        </p>
      ) : null}
      <ConfirmDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={`Duyệt mẫu${round}?`}
        description="Sau khi duyệt sẽ in hàng loạt theo mẫu này, không đổi thiết kế được."
        confirmLabel="Duyệt mẫu"
        cancelLabel="Xem lại"
        variant="default"
        onConfirm={() => action.submit({ action: "APPROVE" })}
      />
      <CardDialog
        open={reprintOpen}
        onOpenChange={(open) => {
          setReprintOpen(open);
          if (!open) action.clear();
        }}
        title="Yêu cầu in lại mẫu"
        description="Sale sẽ in lại mẫu theo ghi chú của bạn và gửi lại trong cuộc trò chuyện này."
        confirm="Gửi yêu cầu in lại"
        pending={action.pending}
        error={action.error}
        onSubmit={handleSubmit((values) =>
          action.submit({ action: "REQUEST_REPRINT", note: values.note }, () =>
            setReprintOpen(false),
          ),
        )}
      >
        <div className="space-y-1.5">
          <Label htmlFor={noteId} className="text-sm font-medium">
            Điểm cần in lại (bắt buộc)
          </Label>
          <Textarea
            id={noteId}
            rows={4}
            maxLength={QUOTE_FEEDBACK_MAX}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? `${noteId}-error` : undefined}
            {...register("note")}
          />
          {noteError ? (
            <p id={`${noteId}-error`} role="alert" className="text-danger text-sm">
              {noteError}
            </p>
          ) : null}
        </div>
      </CardDialog>
    </CardFrame>
  );
}
