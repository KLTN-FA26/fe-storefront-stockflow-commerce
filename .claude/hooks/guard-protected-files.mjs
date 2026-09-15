#!/usr/bin/env node

import { readFileSync } from "node:fs";

const PROTECTED = [
  {
    pattern: /src[\\/]lib[\\/]mock-data\.ts$/i,
    reason:
      "mock-data.ts is the source for demo/API field names. Add routes in src/lib/api/mock-adapter.ts instead of editing mock-data directly.",
  },
  {
    pattern: /src[\\/]_design[\\/].*RULES\.md$/i,
    reason:
      "src/_design/*RULES.md files are project design/production rules. Edit them only when the user explicitly asks.",
  },
  {
    pattern: /(^|[\\/])\.env($|\.local$|\..*\.local$)/i,
    reason: "Environment files can contain secrets. Edit .env.example for documented variables.",
  },
];

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0);
  }

  const filePath = input?.tool_input?.file_path ?? input?.tool_input?.notebook_path;
  if (typeof filePath !== "string" || filePath.length === 0) process.exit(0);

  const hit = PROTECTED.find((rule) => rule.pattern.test(filePath));
  if (!hit) process.exit(0);

  process.stderr.write(`Blocked: ${filePath}\n\n${hit.reason}\n`);
  process.exit(2);
}

main();
