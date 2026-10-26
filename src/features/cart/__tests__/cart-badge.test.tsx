import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/lib/auth/auth-store";
import { useCartStore } from "@/lib/store/use-cart-store";
import { resetCart, signIn, signOut } from "@/test/render";

import { CartBadge } from "../components/cart-badge";

const add = (sku: string) => useCartStore.getState().add({ sku, slug: sku, title: sku }, 1);

beforeEach(() => resetCart());
afterEach(() => {
  signOut();
  resetCart();
});

describe("CartBadge", () => {
  it("shows nothing for an empty cart and the number of lines otherwise", () => {
    const { container, rerender } = render(<CartBadge />);
    expect(container).toBeEmptyDOMElement();

    add("CUP-1");
    add("CUP-2");
    rerender(<CartBadge />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/dòng sản phẩm trong giỏ/)).toBeInTheDocument();
  });

  it("empties the cart another account left behind once a different account signs in", () => {
    add("CUP-1");
    signIn(); // user-1 adopts the lines added before sign-in
    const { rerender } = render(<CartBadge />);
    expect(useCartStore.getState()).toMatchObject({ ownerId: "user-1" });
    expect(useCartStore.getState().lines).toHaveLength(1);

    useAuthStore.setState({
      user: { userId: "user-2", fullName: "B", email: "b@example.vn", roles: [], warehouseIds: [] },
    });
    rerender(<CartBadge />);
    expect(useCartStore.getState()).toMatchObject({ ownerId: "user-2", lines: [] });
  });

  it("binds the cart to the customer profile, not the login account, when both are known", () => {
    useAuthStore.setState({
      user: {
        userId: "login-1",
        customerId: "customer-9",
        fullName: "A",
        email: "a@x.vn",
        roles: [],
        warehouseIds: [],
      },
    });
    render(<CartBadge />);
    expect(useCartStore.getState().ownerId).toBe("customer-9");
  });
});
