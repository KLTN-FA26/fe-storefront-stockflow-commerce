#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 15_000,
  });

  return result.status === 0 ? (result.stdout ?? "").trim() : "";
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }

  if (input?.stop_hook_active) process.exit(0);

  const projectDir = input?.cwd ?? process.cwd();
  const status = git(["status", "--porcelain", "--", "src"], projectDir);
  if (!status) process.exit(0);

  const changed = status
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  const codeChanged = changed.filter((file) => /\.(ts|tsx|css)$/i.test(file));
  if (codeChanged.length === 0) process.exit(0);

  const preview = codeChanged.slice(0, 8).join("\n  ");
  const more = codeChanged.length > 8 ? `\n  … and ${codeChanged.length - 8} more files` : "";

  process.stderr.write(
    `There are ${codeChanged.length} changed source files:\n  ${preview}${more}\n\n` +
      "Run verification before reporting the task as done:\n" +
      "  pnpm run typecheck\n  pnpm run lint\n  pnpm run test\n  pnpm run build\n" +
      "or pnpm run validate.\n",
  );
  process.exit(2);
}

main();
