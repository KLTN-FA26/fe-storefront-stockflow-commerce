import { QRCodeSVG } from "qrcode.react";

/**
 * VietQR của đợt (kế hoạch E1, kltn-docs 16 §4.4 bước 9, BR-06): BE gửi sẵn chuỗi EMVCo/NAPAS (`vietQr`) có ngân
 * hàng, số tài khoản, số tiền còn phải trả và nội dung chuyển khoản — FE chỉ vẽ, không tự ghép chuỗi. Ứng dụng ngân
 * hàng quét là điền đủ, khách không phải gõ tay nên không sai nội dung để Kế toán đối chiếu.
 *
 * The plate stays white in both themes (a scanner needs dark on light), so its caption takes `ink-on-light`, a dark
 * that does not flip with the theme: `ink-secondary` turns light grey in the dark theme, 2.35:1 on white (SF-UX-38).
 */
export function VietQrCode({ payload }: { payload: string }) {
  return (
    <figure className="border-border-default flex flex-col items-center gap-2 rounded-[var(--r-md)] border bg-white p-3">
      <QRCodeSVG
        value={payload}
        size={176}
        level="M"
        marginSize={2}
        title="Mã VietQR chuyển khoản"
        role="img"
        aria-label="Mã VietQR chuyển khoản"
      />
      <figcaption className="text-ink-on-light max-w-[16rem] text-center text-xs">
        Quét bằng ứng dụng ngân hàng: tài khoản, số tiền và nội dung chuyển khoản được điền sẵn.
      </figcaption>
    </figure>
  );
}
