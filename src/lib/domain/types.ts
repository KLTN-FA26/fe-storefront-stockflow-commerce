export type SemanticTone = "positive" | "info" | "warning" | "danger" | "neutral" | "muted" | "special";

export type StatusDomain =
  | "product"
  | "sku"
  | "proposal"
  | "po"
  | "receipt"
  | "qc"
  | "invoice"
  | "putaway"
  | "stock"
  | "location"
  | "pick"
  | "allocation"
  | "pack"
  | "shipment"
  | "to"
  | "move"
  | "design"
  | "preflight"
  | "catalog"
  | "cart"
  | "order"
  | "payment"
  | "conversation"
  | "rma"
  | "customer";

export type Currency = "VND" | "USD" | "CNY";

export type RoleName =
  | "System Admin"
  | "Procurement Staff"
  | "Warehouse Staff"
  | "Warehouse Manager"
  | "Inventory Planner"
  | "QC Staff"
  | "Accountant"
  | "E-commerce Admin"
  | "Sales Staff"
  | "Order Coordinator";
