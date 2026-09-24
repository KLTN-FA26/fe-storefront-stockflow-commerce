/**
 * Mock routes — register all mock API handlers.
 *
 * Each handler reads from mock-data.ts and returns paginated/filtered results.
 * Called once by activateMockAdapter() → registerAllMockRoutes().
 *
 * **Only mock-adapter.ts may import mock-data.ts.**
 */

import { MOCK_DATA, registerMockRoute, paginate } from "./mock-adapter";

export function registerAllMockRoutes(): void {
  /* ====================================================================
   * Module 01 — Products / SKUs / Categories / Suppliers
   * ==================================================================*/

  // GET /products
  registerMockRoute("GET", "/products", async (config) => {
    const { products } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const q = params.get("q")?.toLowerCase();
    const status = params.getAll("status");

    let filtered = [...products];
    if (q)
      filtered = filtered.filter(
        (p) => p.name.toLowerCase().includes(q) || p.productId.toLowerCase().includes(q),
      );
    if (status.length) filtered = filtered.filter((p) => status.includes(p.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  // GET /products/:id
  registerMockRoute("GET", "/products/:id", async (config) => {
    const { products } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const product = products.find((p) => p.productId === id);
    if (!product) return { status: 404, data: { message: "Product not found" }, headers: {} };
    return { status: 200, data: product, headers: {} };
  });

  // GET /skus
  registerMockRoute("GET", "/skus", async (config) => {
    const { skus } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const q = params.get("q")?.toLowerCase();

    let filtered = [...skus];
    if (q)
      filtered = filtered.filter(
        (s) =>
          s.skuId.toLowerCase().includes(q) ||
          s.variantLabel.toLowerCase().includes(q) ||
          s.barcode.toLowerCase().includes(q),
      );

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  // GET /skus/:id
  registerMockRoute("GET", "/skus/:id", async (config) => {
    const { skus } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const sku = skus.find((s) => s.skuId === id);
    if (!sku) return { status: 404, data: { message: "SKU not found" }, headers: {} };
    return { status: 200, data: sku, headers: {} };
  });

  // GET /categories
  registerMockRoute("GET", "/categories", async () => {
    const { categories } = MOCK_DATA;
    return { status: 200, data: { items: categories, total: categories.length }, headers: {} };
  });

  // GET /suppliers
  registerMockRoute("GET", "/suppliers", async (config) => {
    const { suppliers } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const q = params.get("q")?.toLowerCase();

    let filtered = [...suppliers];
    if (q)
      filtered = filtered.filter(
        (s) => s.name.toLowerCase().includes(q) || s.supplierId.toLowerCase().includes(q),
      );

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  // GET /suppliers/:id
  registerMockRoute("GET", "/suppliers/:id", async (config) => {
    const { suppliers } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const supplier = suppliers.find((s) => s.supplierId === id);
    if (!supplier) return { status: 404, data: { message: "Supplier not found" }, headers: {} };
    return { status: 200, data: supplier, headers: {} };
  });

  /* ====================================================================
   * Module 02 — Purchase Orders / Replenishment
   * ==================================================================*/

  // GET /purchase-orders
  registerMockRoute("GET", "/purchase-orders", async (config) => {
    const { purchaseOrders } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const q = params.get("q")?.toLowerCase();
    const status = params.getAll("status");

    let filtered = [...purchaseOrders];
    if (q)
      filtered = filtered.filter(
        (po) => po.poNumber.toLowerCase().includes(q) || po.poId.toLowerCase().includes(q),
      );
    if (status.length) filtered = filtered.filter((po) => status.includes(po.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  // GET /purchase-orders/:id
  registerMockRoute("GET", "/purchase-orders/:id", async (config) => {
    const { purchaseOrders } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const po = purchaseOrders.find((p) => p.poId === id || p.poNumber === id);
    if (!po) return { status: 404, data: { message: "PO not found" }, headers: {} };
    return { status: 200, data: po, headers: {} };
  });

  // GET /replenishment-proposals
  registerMockRoute("GET", "/replenishment-proposals", async (config) => {
    const { replenishmentProposals } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;

    return { status: 200, data: paginate(replenishmentProposals, page, pageSize), headers: {} };
  });

  /* ====================================================================
   * Module 03 — Receipts / Lots
   * ==================================================================*/

  // GET /receipts
  registerMockRoute("GET", "/receipts", async (config) => {
    const { receipts } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...receipts];
    if (status.length) filtered = filtered.filter((r) => status.includes(r.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  // GET /receipts/:id
  registerMockRoute("GET", "/receipts/:id", async (config) => {
    const { receipts } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const receipt = receipts.find((r) => r.receiptId === id);
    if (!receipt) return { status: 404, data: { message: "Receipt not found" }, headers: {} };
    return { status: 200, data: receipt, headers: {} };
  });

  // GET /lots
  registerMockRoute("GET", "/lots", async (config) => {
    const { lots } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;

    return { status: 200, data: paginate(lots, page, pageSize), headers: {} };
  });

  /* ====================================================================
   * Module 04 — Invoices
   * ==================================================================*/

  registerMockRoute("GET", "/invoices", async (config) => {
    const { invoices } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...invoices];
    if (status.length) filtered = filtered.filter((i) => status.includes(i.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/invoices/:id", async (config) => {
    const { invoices } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const invoice = invoices.find((i) => i.invoiceId === id);
    if (!invoice) return { status: 404, data: { message: "Invoice not found" }, headers: {} };
    return { status: 200, data: invoice, headers: {} };
  });

  /* ====================================================================
   * Module 05 — Putaway Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/putaway-tasks", async (config) => {
    const { putawayTasks } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...putawayTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/putaway-tasks/:id", async (config) => {
    const { putawayTasks } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = putawayTasks.find((t) => t.taskId === id);
    if (!task) return { status: 404, data: { message: "Putaway task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Module 06 — Warehouses / Zones / Locations / Slotting
   * ==================================================================*/

  registerMockRoute("GET", "/warehouses", async () => {
    const { warehouses } = MOCK_DATA;
    return { status: 200, data: { items: warehouses, total: warehouses.length }, headers: {} };
  });

  registerMockRoute("GET", "/warehouses/:id", async (config) => {
    const { warehouses } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const wh = warehouses.find((w) => w.warehouseId === id);
    if (!wh) return { status: 404, data: { message: "Warehouse not found" }, headers: {} };
    return { status: 200, data: wh, headers: {} };
  });

  registerMockRoute("GET", "/zones", async () => {
    const { zones } = MOCK_DATA;
    return { status: 200, data: { items: zones, total: zones.length }, headers: {} };
  });

  registerMockRoute("GET", "/locations", async (config) => {
    const { locations } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 50;

    return { status: 200, data: paginate(locations, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/slotting-suggestions", async () => {
    const { slottingSuggestions } = MOCK_DATA;
    return {
      status: 200,
      data: { items: slottingSuggestions, total: slottingSuggestions.length },
      headers: {},
    };
  });

  registerMockRoute("GET", "/warehouse-kpis", async () => {
    const { warehouseKpis } = MOCK_DATA;
    return {
      status: 200,
      data: { items: warehouseKpis, total: warehouseKpis.length },
      headers: {},
    };
  });

  /* ====================================================================
   * Module 07 — Pick Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/pick-tasks", async (config) => {
    const { pickTasks } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...pickTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/pick-tasks/:id", async (config) => {
    const { pickTasks } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = pickTasks.find((t) => t.pickId === id);
    if (!task) return { status: 404, data: { message: "Pick task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Module 08 — Packing Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/packing-tasks", async (config) => {
    const { packingTasks } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...packingTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/packing-tasks/:id", async (config) => {
    const { packingTasks } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = packingTasks.find((t) => t.taskId === id);
    if (!task) return { status: 404, data: { message: "Packing task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Module 09 — Shipments / Carriers
   * ==================================================================*/

  registerMockRoute("GET", "/shipments", async (config) => {
    const { shipments } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...shipments];
    if (status.length) filtered = filtered.filter((s) => status.includes(s.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/shipments/:id", async (config) => {
    const { shipments } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const shipment = shipments.find((s) => s.shipmentId === id);
    if (!shipment) return { status: 404, data: { message: "Shipment not found" }, headers: {} };
    return { status: 200, data: shipment, headers: {} };
  });

  registerMockRoute("GET", "/carriers", async () => {
    const { carriers } = MOCK_DATA;
    return { status: 200, data: { items: carriers, total: carriers.length }, headers: {} };
  });

  /* ====================================================================
   * Module 10 — Transfer Orders
   * ==================================================================*/

  registerMockRoute("GET", "/transfer-orders", async (config) => {
    const { transferOrders } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...transferOrders];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/transfer-orders/:id", async (config) => {
    const { transferOrders } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const transfer = transferOrders.find((t) => t.transferOrderId === id);
    if (!transfer) return { status: 404, data: { message: "Transfer not found" }, headers: {} };
    return { status: 200, data: transfer, headers: {} };
  });

  /* ====================================================================
   * Module 11 — Move Tasks
   * ==================================================================*/

  registerMockRoute("GET", "/move-tasks", async (config) => {
    const { moveTasks } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...moveTasks];
    if (status.length) filtered = filtered.filter((t) => status.includes(t.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  registerMockRoute("GET", "/move-tasks/:id", async (config) => {
    const { moveTasks } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const task = moveTasks.find((t) => t.moveTaskId === id);
    if (!task) return { status: 404, data: { message: "Move task not found" }, headers: {} };
    return { status: 200, data: task, headers: {} };
  });

  /* ====================================================================
   * Module 14 — Orders
   * ==================================================================*/

  registerMockRoute("GET", "/orders", async (config) => {
    const { orders } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Number(params.get("page")) || 1;
    const pageSize = Number(params.get("pageSize")) || 15;
    const status = params.getAll("status");

    let filtered = [...orders];
    if (status.length) filtered = filtered.filter((o) => status.includes(o.status));

    return { status: 200, data: paginate(filtered, page, pageSize), headers: {} };
  });

  // ── /orders/me MUST be registered BEFORE /orders/:id to avoid :id matching "me" ──

  const paginateMyOrders = (
    items: typeof MOCK_DATA.orders,
    page: number,
    size: number,
  ): {
    items: typeof MOCK_DATA.orders;
    page: number;
    size: number;
    totalElements: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  } => {
    const start = page * size;
    const sliced = items.slice(start, start + size);
    return {
      items: sliced,
      page,
      size,
      totalElements: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / size)),
      hasNext: start + size < items.length,
      hasPrevious: page > 0,
    };
  };

  // GET /orders/me — BE 0-indexed pagination. DEMO_CUSTOMER_ID = "CUS-0005".
  registerMockRoute("GET", "/orders/me", async (config) => {
    const { orders } = MOCK_DATA;
    const params = new URLSearchParams(config.url?.split("?")[1] ?? "");
    const page = Math.max(0, Number(params.get("page")) || 0); // BE 0-indexed
    const size = Number(params.get("size")) || 10;

    const mine = orders.filter((o) => o.customerId === "CUS-0005");
    return { status: 200, data: paginateMyOrders(mine, page, size), headers: {} };
  });

  registerMockRoute("GET", "/orders/:id", async (config) => {
    const { orders } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const order = orders.find((o) => o.orderId === id);
    // Cùng 404 cho đơn không tồn tại lẫn đơn của khách khác — không leak ownership.
    if (!order || order.customerId !== "CUS-0005") {
      return { status: 404, data: { message: "Order not found" }, headers: {} };
    }
    return { status: 200, data: order, headers: {} };
  });

  // POST /orders/:id/cancellation — 404 nếu không phải đơn của khách (cùng shape với GET 404),
  // 409 nếu trạng thái không cho phép huỷ, thành công thì set status = "Cancelled".
  registerMockRoute("POST", "/orders/:id/cancellation", async (config) => {
    const { orders } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const order = orders.find((o) => o.orderId === id);
    if (!order || order.customerId !== "CUS-0005") {
      return { status: 404, data: { message: "Order not found" }, headers: {} };
    }
    if (
      order.status === "Shipped" ||
      order.status === "In Transit" ||
      order.status === "Delivered" ||
      order.status === "Completed" ||
      order.status === "Cancelled"
    ) {
      return {
        status: 409,
        data: { code: "CONFLICT", message: "Đơn hàng không thể huỷ ở trạng thái hiện tại" },
        headers: {},
      };
    }
    order.status = "Cancelled";
    return { status: 200, data: { success: true }, headers: {} };
  });

  /* ====================================================================
   * Module 18 — Customer Address (Storefront)
   * ==================================================================*/

  // Legacy alias — kept for backward compat. Previously hard-coded `data: []`.
  // Now mirrors GET /v1/customers/:id/addresses so created addresses are visible.
  registerMockRoute("GET", "/customers/me/addresses", async () => {
    const { customers } = MOCK_DATA;
    const customer = customers?.find((c) => c.customerId === "CUS-0010");
    if (!customer)
      return {
        status: 404,
        data: { message: "Customer CUS-0010 not found in mock data" },
        headers: {},
      };
    return {
      status: 200,
      data: (customer.addresses as unknown as unknown[]).map(
         
        toDto as unknown as (v: unknown) => unknown,
      ),
      headers: {},
    };
  });

  registerMockRoute("POST", "/customers/me/addresses", async (config) => {
    const { customers } = MOCK_DATA;
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    const customer = customers.find((c) => c.customerId === "CUS-0010");
    if (!customer) return { status: 404, data: { message: "Not found" }, headers: {} };

    if (body.isDefault) {
      customer.addresses.forEach((a) => {
        a.isDefaultShipping = false;
        a.isDefaultBilling = false;
      });
    }

    const newAddress = {
      addressId: `ADDR-${Date.now()}`,
      customerId: "CUS-0010",
      label: "Nhà riêng",
      recipientName: body.recipientName,
      phone: body.recipientPhone,
      address: {
        street: body.line1,
        ward: body.ward,
        district: body.city,
        province: body.province,
        postalCode: body.postalCode,
        country: body.country,
      },
      isDefaultShipping: body.isDefault,
      isDefaultBilling: body.isDefault,
    };
    customer.addresses.push(newAddress);
    return { status: 201, data: body, headers: {} };
  });

  registerMockRoute("PUT", "/customers/me/addresses/:id", async (config) => {
    const { customers } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    const customer = customers.find((c) => c.customerId === "CUS-0010");
    if (!customer) return { status: 404, data: { message: "Not found" }, headers: {} };

    const index = customer.addresses.findIndex((a) => a.addressId === id);
    if (index === -1) return { status: 404, data: { message: "Address not found" }, headers: {} };

    if (body.isDefault) {
      customer.addresses.forEach((a) => {
        a.isDefaultShipping = false;
        a.isDefaultBilling = false;
      });
    }

    const targetAddress = customer.addresses[index]!;
    customer.addresses[index] = {
      addressId: targetAddress.addressId,
      customerId: targetAddress.customerId,
      label: targetAddress.label,
      recipientName: body.recipientName,
      phone: body.recipientPhone,
      address: {
        street: body.line1,
        ward: body.ward,
        district: body.city,
        province: body.province,
        postalCode: body.postalCode,
        country: body.country,
      },
      isDefaultShipping: body.isDefault || targetAddress.isDefaultShipping,
      isDefaultBilling: body.isDefault || targetAddress.isDefaultBilling,
    };
    return { status: 200, data: body, headers: {} };
  });

  registerMockRoute("DELETE", "/customers/me/addresses/:id", async (config) => {
    const { customers } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const customer = customers.find((c) => c.customerId === "CUS-0010");
    if (!customer) return { status: 404, data: { message: "Not found" }, headers: {} };

    const index = customer.addresses.findIndex((a) => a.addressId === id);
    if (index === -1) return { status: 404, data: { message: "Address not found" }, headers: {} };

    const targetAddress = customer.addresses[index]!;
    if (targetAddress.isDefaultShipping) {
      return { status: 400, data: { message: "Không thể xoá địa chỉ mặc định" }, headers: {} };
    }

    customer.addresses.splice(index, 1);
    return { status: 200, data: { success: true }, headers: {} };
  });

  registerMockRoute("PATCH", "/customers/me/addresses/:id/default", async (config) => {
    const { customers } = MOCK_DATA;
    const { id } = (config as Record<string, unknown>)._mockParams as Record<string, string>;
    const customer = customers.find((c) => c.customerId === "CUS-0010");
    if (!customer) return { status: 404, data: { message: "Not found" }, headers: {} };

    const address = customer.addresses.find((a) => a.addressId === id);
    if (!address) return { status: 404, data: { message: "Address not found" }, headers: {} };

    customer.addresses.forEach((a) => {
      a.isDefaultShipping = false;
      a.isDefaultBilling = false;
    });
    address.isDefaultShipping = true;
    address.isDefaultBilling = true;
    return { status: 200, data: { success: true }, headers: {} };
  });

  /* ── Alias for real BE contract /v1/customers/{id}/addresses (FE api.ts) ──
   * When USE_MOCK=true the new FE layer calls /v1/customers/me + /v1/customers/{id}/addresses.
   * These handlers mirror the legacy /customers/me/addresses handlers above but use
   * the new DTO shape so the BE contract works under mock too. They intentionally
   * return raw data (no envelope) — envelope.ts fallback handles both shapes,
   * and real BE will return ApiResponse envelope which is also handled.
   */
  // Province → code for provinces.open-api.vn (v2). BE thật phải lưu mã này,
  // mock tạm map theo tên để FE edit vẫn fetch đủ wards qua API ngoài.
  const PROVINCE_CODE_BY_NAME: Record<string, string> = {
    "TP. Hồ Chí Minh": "79",
    "Hà Nội": "01",
    "Bình Dương": "74",
    "Đà Nẵng": "48",
    "Cần Thơ": "92",
    "Hải Phòng": "31",
    "Khánh Hòa": "56",
    // fallback cho mock province lạ (VD Guangdong) — giữ HCM để không 404
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function toDto(a: any) {
    // Map legacy mock shape → CustomerAddressResponse DTO expected by FE.
    // BE thật trả provinceCode/wardCode số (open-api), mock chỉ có tên nên map tỉnh
    // qua bảng trên; ward tạm hash để qua zod, edit sẽ được inject vào effectiveWards
    // kèm full list fetch từ /p/{provinceCode}?depth=2.
    const wardCode = `W-${a.address.ward.replace(/\W+/g, "").slice(0, 8).toUpperCase() || "WARD"}`;
    const provCode = PROVINCE_CODE_BY_NAME[a.address.province] ?? "79";
    return {
      addressId: a.addressId,
      customerId: a.customerId,
      type: "SHIPPING" as const,
      recipientName: a.recipientName,
      phone: a.phone,
      line1: a.address.street,
      line2: a.address.district ?? null,
      wardCode,
      wardName: a.address.ward,
      provinceCode: provCode,
      provinceName: a.address.province,
      countryCode: a.address.country ?? "VN",
      postalCode: a.address.postalCode ?? null,
      defaultAddress: !!a.isDefaultShipping,
      version: 0,
    };
  }

  registerMockRoute("GET", "/v1/customers/me", async () => {
    const c = MOCK_DATA.customers.find((x) => x.customerId === "CUS-0010");
    if (!c) return { status: 404, data: { message: "Not found" }, headers: {} };
    return {
      status: 200,
      data: {
        customerId: c.customerId,
        userId: "00000000-0000-4000-a000-000000000010",
        fullName: c.fullName,
        email: c.email,
        phone: c.phone ?? null,
        segmentId: null,
        status: c.status,
        version: 0,
        createdAt: c.createdAt,
      },
      headers: {},
    };
  });

  registerMockRoute("GET", "/v1/customers/:customerId/addresses", async (config) => {
    const { customerId } = (config as Record<string, unknown>)._mockParams as Record<
      string,
      string
    >;
    const cid = customerId === "me" ? "CUS-0010" : customerId;
    const c = MOCK_DATA.customers.find((x) => x.customerId === cid);
    if (!c) return { status: 404, data: { message: "Customer not found" }, headers: {} };
    return {
      status: 200,
      data: (c.addresses as unknown as unknown[]).map(toDto as unknown as (v: unknown) => unknown),
      headers: {},
    };
  });

  registerMockRoute("POST", "/v1/customers/:customerId/addresses", async (config) => {
    const { customerId } = (config as Record<string, unknown>)._mockParams as Record<
      string,
      string
    >;
    const cid = customerId === "me" ? "CUS-0010" : customerId;
    const c = MOCK_DATA.customers.find((x) => x.customerId === cid);
    if (!c) return { status: 404, data: { message: "Not found" }, headers: {} };
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    if (body.defaultAddress)
      c.addresses.forEach((a) => {
        a.isDefaultShipping = false;
        a.isDefaultBilling = false;
      });
    const created = {
      addressId: `ADDR-${Date.now()}`,
      customerId: (typeof cid !== "undefined" ? cid : customerId)!,
      label: "Nhà riêng",
      recipientName: body.recipientName,
      phone: body.phone,
      address: {
        street: body.line1,
        ward: body.wardName,
        district: body.line2 ?? "",
        province: body.provinceName,
        postalCode: body.postalCode ?? "",
        country: body.countryCode ?? "VN",
      },
      isDefaultShipping: !!body.defaultAddress,
      isDefaultBilling: !!body.defaultAddress,
    };
    (c.addresses as unknown as typeof c.addresses).push(
      created as unknown as (typeof c.addresses)[number],
    );
    return {
      status: 201,
      data: (toDto as unknown as (v: unknown) => unknown)(created),
      headers: {},
    };
  });

  registerMockRoute("PUT", "/v1/customers/:customerId/addresses/:addressId", async (config) => {
    const { customerId, addressId } = (config as Record<string, unknown>)._mockParams as Record<
      string,
      string
    >;
    const cid = customerId === "me" ? "CUS-0010" : customerId;
    const c = MOCK_DATA.customers.find((x) => x.customerId === cid);
    if (!c) return { status: 404, data: { message: "Not found" }, headers: {} };
    const idx = c.addresses.findIndex((a) => a.addressId === addressId);
    if (idx === -1) return { status: 404, data: { message: "Address not found" }, headers: {} };
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    if (body.defaultAddress)
      c.addresses.forEach((a) => {
        a.isDefaultShipping = false;
        a.isDefaultBilling = false;
      });
    const prev = c.addresses[idx]!;
    c.addresses[idx] = {
      addressId: prev.addressId,
      customerId: prev.customerId,
      label: prev.label,
      recipientName: body.recipientName ?? prev.recipientName,
      phone: body.phone ?? prev.phone,
      address: {
        street: body.line1 ?? prev.address.street,
        ward: body.wardName ?? prev.address.ward,
        district: body.line2 ?? prev.address.district,
        province: body.provinceName ?? prev.address.province,
        postalCode: body.postalCode ?? prev.address.postalCode,
        country: body.countryCode ?? prev.address.country,
      },
      isDefaultShipping: body.defaultAddress ?? prev.isDefaultShipping,
      isDefaultBilling: body.defaultAddress ?? prev.isDefaultBilling,
    };
    return {
      status: 200,
      data: (toDto as unknown as (v: unknown) => unknown)(c.addresses[idx]!),
      headers: {},
    };
  });

  registerMockRoute("DELETE", "/v1/customers/:customerId/addresses/:addressId", async (config) => {
    const { customerId, addressId } = (config as Record<string, unknown>)._mockParams as Record<
      string,
      string
    >;
    const cid = customerId === "me" ? "CUS-0010" : customerId;
    const c = MOCK_DATA.customers.find((x) => x.customerId === cid);
    if (!c) return { status: 404, data: { message: "Not found" }, headers: {} };
    const idx = c.addresses.findIndex((a) => a.addressId === addressId);
    if (idx === -1) return { status: 404, data: { message: "Address not found" }, headers: {} };
    if (c.addresses[idx]!.isDefaultShipping)
      return { status: 400, data: { message: "Không thể xoá địa chỉ mặc định" }, headers: {} };
    c.addresses.splice(idx, 1);
    return { status: 204, data: null, headers: {} };
  });

  registerMockRoute(
    "POST",
    "/v1/customers/:customerId/addresses/:addressId/default",
    async (config) => {
      const { customerId, addressId } = (config as Record<string, unknown>)._mockParams as Record<
        string,
        string
      >;
      const cid = customerId === "me" ? "CUS-0010" : customerId;
    const c = MOCK_DATA.customers.find((x) => x.customerId === cid);
      if (!c) return { status: 404, data: { message: "Not found" }, headers: {} };
      const addr = c.addresses.find((a) => a.addressId === addressId);
      if (!addr) return { status: 404, data: { message: "Address not found" }, headers: {} };
      c.addresses.forEach((a) => {
        a.isDefaultShipping = false;
        a.isDefaultBilling = false;
      });
      addr.isDefaultShipping = true;
      addr.isDefaultBilling = true;
      return {
        status: 200,
        data: (toDto as unknown as (v: unknown) => unknown)(addr),
        headers: {},
      };
    },
  );

  /* ====================================================================
   * Staff Users (for admin user management)
   * ==================================================================*/

  registerMockRoute("GET", "/staff-users", async () => {
    const { staffUsers } = MOCK_DATA;
    return { status: 200, data: { items: staffUsers, total: staffUsers.length }, headers: {} };
  });

  /* ====================================================================
   * Auth routes (handled by auth-api.ts, registered here for completeness)
   * ==================================================================*/

  registerMockRoute("POST", "/auth/login", async (config) => {
    const { staffUsers } = MOCK_DATA;
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    const user = staffUsers.find((u) => u.userId === body?.userId || u.email === body?.email);

    if (!user) {
      return { status: 401, data: { message: "Email hoặc mật khẩu không đúng" }, headers: {} };
    }

    return {
      status: 200,
      data: {
        accessToken: `mock-access-${user.userId}-${Date.now()}`,
        refreshToken: `mock-refresh-${user.userId}-${Date.now()}`,
        user: {
          userId: user.userId,
          fullName: user.fullName,
          email: user.email,
          roles: user.roles,
          warehouseIds: user.warehouseIds,
        },
      },
      headers: {},
    };
  });

  registerMockRoute("POST", "/auth/refresh", async () => {
    return {
      status: 200,
      data: {
        accessToken: `mock-access-refreshed-${Date.now()}`,
        refreshToken: `mock-refresh-refreshed-${Date.now()}`,
      },
      headers: {},
    };
  });

  registerMockRoute("POST", "/auth/logout", async () => {
    return { status: 200, data: { message: "Logged out" }, headers: {} };
  });
}
