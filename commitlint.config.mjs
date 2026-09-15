/** @type {import("@commitlint/types").UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [
      2,
      "always",
      [
        "home",
        "catalog",
        "product",
        "design",
        "cart",
        "checkout",
        "payment",
        "chat",
        "order",
        "account",
        "customer",
        "shell",
        "shared",
        "ui",
        "api",
        "auth",
        "config",
        "rules",
        "deps",
        "ci",
      ],
    ],
  },
};

export default config;
