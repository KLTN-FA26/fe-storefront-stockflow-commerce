import { Badge } from "@/components/ui/badge";

interface AvailabilityBadgeProps {
  status: "in-stock" | "low-stock" | "out-of-stock";
  quantity?: number;
}

const labels = {
  "in-stock": "Còn hàng",
  "low-stock": "Sắp hết",
  "out-of-stock": "Hết hàng",
} as const;

const classNames = {
  "in-stock": "bg-positive/10 text-positive",
  "low-stock": "bg-warning/10 text-warning",
  "out-of-stock": "bg-danger/10 text-danger",
} as const;

export function AvailabilityBadge({ status, quantity }: AvailabilityBadgeProps) {
  return (
    <Badge className={`rounded-full border-0 ${classNames[status]}`}>
      {labels[status]}{typeof quantity === "number" ? ` · ${quantity}` : ""}
    </Badge>
  );
}
