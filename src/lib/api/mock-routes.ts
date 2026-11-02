/**
 * Mock routes — register all mock API handlers.
 *
 * Each handler reads from mock-data.ts and returns paginated/filtered results.
 * Called once by activateMockAdapter() → registerAllMockRoutes().
 *
 * **Only mock-adapter.ts may import mock-data.ts.**
 */

import { MOCK_DATA, registerMockRoute, paginate } from "./mock-adapter";
import { registerAuthMockRoutes } from "./mock-auth";
import { registerCatalogMockRoutes } from "./mock-catalog";
import { MOCK_CUSTOMER_ID, registerCustomerAddressMockRoutes } from "./mock-customer-addresses";
import { MOCK_DESIGN_USER_ID, registerDesignMockRoutes } from "./mock-design";
import { createMockCatalog, seedMockCatalog } from "./mock-fixtures/catalog";
import {
  createMockAddressBook,
  seedMockAddresses,
  type MockAddress,
} from "./mock-fixtures/customer-addresses";
import { createMockDesignStudio } from "./mock-fixtures/designs";
import { createMockOrderBook, seedMockOrders, type MockOrderDeps } from "./mock-fixtures/orders";
import { registerMyPermissionsMockRoute } from "./mock-my-permissions";
import { registerNotificationMockRoutes } from "./mock-notifications";
import { registerOrderMockRoutes } from "./mock-orders";

export function mockPasswordResponse(body: unknown) {
  const request = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const fieldErrors = [];
  if (typeof request.currentPassword !== "string" || request.currentPassword.trim() === "") {
    fieldErrors.push({
      field: "currentPassword",
      message: "currentPassword is required",
      code: "NotBlank",
    });
  }
  if (typeof request.newPassword !== "string" || request.newPassword.trim() === "") {
    fieldErrors.push({
      field: "newPassword",
      message: "newPassword is required",
      code: "NotBlank",
    });
  } else if (
    request.newPassword.length < 10 ||
    request.newPassword.length > 72 ||
    !/[A-Z]/.test(request.newPassword) ||
    !/[a-z]/.test(request.newPassword) ||
    !/\d/.test(request.newPassword)
  ) {
    fieldErrors.push({
      field: "newPassword",
      message: "newPassword must contain upper-case, lower-case and digit characters",
      code: "Pattern",
    });
  }
  if (fieldErrors.length > 0) {
    return {
      status: 400,
      data: {
        success: false,
        errorCode: "VALIDATION_FAILED",
        message: "Dữ liệu không hợp lệ",
        fieldErrors,
        correlationId: "mock-password-validation",
        timestamp: new Date().toISOString(),
      },
      headers: {},
    };
  }
  if (request.currentPassword !== "CurrentPass123") {
    return {
      status: 400,
      data: {
        success: false,
        errorCode: "INVALID_CURRENT_PASSWORD",
        message: "Mật khẩu hiện tại không đúng",
        correlationId: "mock-password-current",
        timestamp: new Date().toISOString(),
      },
      headers: {},
    };
  }
  if (request.newPassword === request.currentPassword) {
    return {
      status: 400,
      data: {
        success: false,
        errorCode: "PASSWORD_UNCHANGED",
        message: "Mật khẩu mới phải khác mật khẩu hiện tại",
        correlationId: "mock-password-unchanged",
        timestamp: new Date().toISOString(),
      },
      headers: {},
    };
  }
  return {
    status: 200,
    data: {
      success: true,
      data: { revokedSessions: request.logoutOtherDevices ? 2 : 0 },
      timestamp: new Date().toISOString(),
    },
    headers: {},
  };
}

export function registerAllMockRoutes(): void {
  /* ====================================================================
   * Module 18 — Customer profile (self-service)
   * ==================================================================*/

  let mockCustomerProfile = {
    customerId: MOCK_CUSTOMER_ID,
    userId: "USER-CUS-0010",
    fullName: "Nguyễn Hoài Nam",
    email: "nam.nguyen@example.vn",
    phone: "+84908111222",
    segmentId: null,
    status: "ACTIVE",
    version: 0,
    createdAt: "2026-01-10T02:00:00Z",
  };

  registerMockRoute("GET", "/customers/me", async () => ({
    status: 200,
    data: mockCustomerProfile,
    headers: {},
  }));

  registerMockRoute("PUT", "/customers/me", async (config) => {
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    if (body?.version !== mockCustomerProfile.version) {
      return {
        status: 409,
        data: {
          errorCode: "OPTIMISTIC_LOCK",
          message: "Thông tin đã được cập nhật ở nơi khác",
          correlationId: "mock-customer-conflict",
        },
        headers: {},
      };
    }

    mockCustomerProfile = {
      ...mockCustomerProfile,
      fullName: body.fullName,
      phone: body.phone,
      version: mockCustomerProfile.version + 1,
    };
    return { status: 200, data: mockCustomerProfile, headers: {} };
  });

  registerMockRoute("PUT", "/identity/auth/password", async (config) => {
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    return mockPasswordResponse(body);
  });

  // Module 18 — address book (BE-shaped fixture, see mock-customer-addresses.ts). Checkout reads
  // the same book, so an order is delivered to an address that really is in it.
  const addressBook = createMockAddressBook(MOCK_CUSTOMER_ID, seedMockAddresses(MOCK_CUSTOMER_ID));
  registerCustomerAddressMockRoutes(addressBook);

  // Module 13 — B2B catalogue (BE-shaped fixture, see mock-catalog.ts). Checkout prices and
  // reserves from the same stock, so an order moves what the catalogue shows.
  const catalog = createMockCatalog(seedMockCatalog());
  registerCatalogMockRoutes(catalog);

  // Module 12 — design studio (BE design workflow + the proposed endpoints, see mock-design.ts).
  // It asks the same catalogue which products are customizable, so a design can only start from a
  // product the PDP offers. The owner is a UUID user id: the profile's `userId` below is not one.
  registerDesignMockRoutes(
    createMockDesignStudio({
      userId: MOCK_DESIGN_USER_ID,
      customerId: MOCK_CUSTOMER_ID,
      catalogKindOf: (slug) => catalog.kindOf(slug),
    }),
  );

  // Modules 14/17 — checkout and customer order history (BE-shaped fixture, see mock-orders.ts).
  // The legacy GET /orders/:id (mock-data shapes) is gone: first match wins, and it swallowed /orders/me.
  const shippingAddresses = () =>
    (addressBook.list().data as { data: MockAddress[] }).data.filter(
      (address) => address.type === "SHIPPING",
    );
  const deps: MockOrderDeps = {
    catalog,
    // The demo customer buys on credit too, so the credit card and the checkout note can be tried.
    terms: {
      defaultTerm: "PREPAID",
      allowed: ["PREPAID", "DEPOSIT", "CREDIT"],
      depositPercent: 30,
      creditLimit: 20_000_000,
      creditTermDays: 30,
      exposure: 12_000_000,
    },
    shippingAddress: (addressId) => {
      const found = shippingAddresses().find((address) => address.addressId === addressId);
      // OrderResponse.Address: the order keeps the address text, not the book's ids.
      return found
        ? {
            recipientName: found.recipientName,
            phone: found.phone,
            line1: found.line1,
            ...(found.line2 ? { line2: found.line2 } : {}),
            wardCode: found.wardCode,
            wardName: found.wardName,
            provinceCode: found.provinceCode,
            provinceName: found.provinceName,
            countryCode: found.countryCode,
            ...(found.postalCode ? { postalCode: found.postalCode } : {}),
          }
        : undefined;
    },
    defaultShippingAddressId: () =>
      shippingAddresses().find((address) => address.defaultAddress)?.addressId,
  };
  registerOrderMockRoutes(
    deps,
    createMockOrderBook(MOCK_CUSTOMER_ID, seedMockOrders(MOCK_CUSTOMER_ID), deps),
  );
  registerMyPermissionsMockRoute();

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

  // Sign-in and /identity/me (BE-shaped, see mock-auth.ts); the legacy staff mock users may sign in
  // too, which the storefront must refuse.
  registerAuthMockRoutes(MOCK_DATA.staffUsers);
  registerNotificationMockRoutes();

  registerMockRoute("POST", "/identity/auth/logout", async () => {
    return { status: 200, data: { message: "Logged out" }, headers: {} };
  });
}
