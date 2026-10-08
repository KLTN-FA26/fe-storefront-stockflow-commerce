import { createMutation } from "@/lib/api/query-factory";
import { cancelMyOrder } from "./api";
import { orderKeys } from "./queries";

export const useCancelMyOrder = createMutation(cancelMyOrder, {
  invalidate: [orderKeys.all],
  successMessage: "Đã huỷ đơn hàng thành công",
});
