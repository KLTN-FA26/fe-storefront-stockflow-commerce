/** @type {import("lint-staged").Config} */
export default {
  "*.{ts,tsx}": ["eslint --fix --max-warnings 0", "prettier --write"],
  "*.{json,md,css,mjs}": ["prettier --write"],
};
