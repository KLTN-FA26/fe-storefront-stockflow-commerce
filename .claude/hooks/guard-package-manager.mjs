#!/usr/bin/env node

import { readFileSync } from "node:fs";

const CMD_START = String.raw`(?:^|[\n;|&(){]|&&|\|\||\$\()\s*`;

const BLOCKED = [
  {
    pattern: new RegExp(CMD_START + String.raw`npm\s+(install|i|add|ci)\b`),
    suggest: "pnpm install hoặc pnpm add <pkg>",
  },
  {
    pattern: new RegExp(
      CMD_START + String.raw`npm\s+(run\s+)?(dev|build|lint|test|typecheck|validate|format|coverage)\b`,
    ),
    suggest: "pnpm run <script>",
  },
  {
    pattern: new RegExp(CMD_START + String.raw`yarn\b`),
    suggest: "pnpm — project uses pnpm-lock.yaml and packageManager pnpm@10.9.0",
  },
  {
    pattern: new RegExp(CMD_START + String.raw`bun\s+(install|add|run)\b`),
    suggest: "pnpm — project uses pnpm-lock.yaml and packageManager pnpm@10.9.0",
  },
];

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }

  const command = input?.tool_input?.command;
  if (typeof command !== "string" || command.length === 0) process.exit(0);

  const hit = BLOCKED.find((rule) => rule.pattern.test(command));
  if (!hit) process.exit(0);

  process.stderr.write(
    `Blocked: wrong package manager.\n\n${command}\n\nUse ${hit.suggest}.\n`,
  );
  process.exit(2);
}

main();
