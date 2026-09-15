#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const FORMATTABLE = /\.(ts|tsx|css|mjs|json|md)$/i;
const LINTABLE = /\.(ts|tsx)$/i;
const SKIP = /(node_modules|\.next|coverage|pnpm-lock\.yaml|tsconfig\.tsbuildinfo)/i;

function run(args, cwd) {
  const result = spawnSync("pnpm", ["exec", ...args], {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    timeout: 30_000,
  });

  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim(),
  };
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }

  const filePath = input?.tool_input?.file_path;
  const projectDir = input?.cwd ?? process.cwd();

  if (typeof filePath !== "string") process.exit(0);
  if (SKIP.test(filePath)) process.exit(0);
  if (!FORMATTABLE.test(filePath)) process.exit(0);

  const relative = path.relative(projectDir, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) process.exit(0);

  run(["prettier", "--write", filePath], projectDir);

  if (LINTABLE.test(filePath)) {
    const lint = run(["eslint", "--fix", "--max-warnings", "0", filePath], projectDir);
    if (!lint.ok && lint.output) {
      process.stdout.write(
        `eslint still has issues in ${relative}:\n${lint.output}\n\nFix before continuing.\n`,
      );
    }
  }

  process.exit(0);
}

main();
