/**
 * Whether the design API is served by the mock on this page, set by the mock adapter when it
 * activates (`activateMockAdapter`, `activateDesignMockAdapter`). The design code reads it for the
 * one request that carries a hint only the mock uses (`sku` on a product's customization); against
 * the real BE nothing extra is sent.
 */

let designMock = false;

export const setDesignMockMode = (on: boolean) => {
  designMock = on;
};
export const isDesignMockMode = () => designMock;
