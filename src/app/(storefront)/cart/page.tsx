import { CartScreen } from "@/features/cart";

import { PageShell } from "@/components/storefront/layout";

export default function CartPage() {
  return (
    <PageShell
      title="Giỏ hàng"
      subtitle="Kiểm tra số lượng, giá riêng và tồn kho trước khi đặt hàng."
    >
      <CartScreen />
    </PageShell>
  );
}
