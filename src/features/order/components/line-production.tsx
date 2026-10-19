import { Progress } from "@/components/ui/progress";

import { PRODUCTION_STATE_LABEL } from "../labels";
import type { OrderLine } from "../types";

/**
 * Where printing a line stands. Only a line printed to the customer's design has progress
 * (BE `production` is null for stock goods, and NOT_REQUIRED says the same), so those show nothing.
 */
export function LineProduction({ line }: { line: OrderLine }) {
  const production = line.production;
  if (!production || production.state === "NOT_REQUIRED") return null;
  const total = line.quantity;
  const done = Math.min(production.goodQuantity, total);
  const showBar = production.state === "IN_PROGRESS" || production.state === "DONE";

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-ink-secondary text-xs">
        <span className="text-ink-primary font-medium">
          {PRODUCTION_STATE_LABEL[production.state]}
        </span>
        {showBar ? (
          <span className="tabular-nums">
            {" "}
            · {done}/{total} sản phẩm đạt
          </span>
        ) : null}
      </p>
      {showBar ? (
        <Progress
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label={`Tiến độ sản xuất ${line.sku}`}
          value={Math.round((done / total) * 100)}
          className="h-1.5"
        />
      ) : null}
    </div>
  );
}
