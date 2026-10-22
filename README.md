# StockFlow Storefront

Customer-facing storefront UI for StockFlowCommerce modules 12–18. The app covers catalog browsing, product design/preflight, cart, checkout, payment, sales chat, order tracking, and customer account flows.

## Stack

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS v4
- shadcn/ui + Radix primitives
- TanStack Query
- axios
- zod + react-hook-form
- zustand
- nuqs
- Vitest + Testing Library + MSW

## Setup

Install dependencies:

```bash
pnpm install
```

Create local environment config from `.env.example`:

```bash
cp .env.example .env.local
```

Expected local variables:

```env
API_URL=http://localhost:8080/api
USE_MOCK=true
```

`API_URL` is used by `next.config.ts` to rewrite `/api/:path*` to the backend. `USE_MOCK=true` enables the server-side mock adapter path.

## Scripts

Start dev server:

```bash
pnpm run dev
```

Typecheck:

```bash
pnpm run typecheck
```

Lint:

```bash
pnpm run lint
```

Run tests:

```bash
pnpm run test
```

Build:

```bash
pnpm run build
```

Run the full validation chain:

```bash
pnpm run validate
```

## CI & quality checks

Workflows live in `.github/workflows/`; every pull request runs them.

| Check      | Workflow    | Required to merge | What it does                                                                                                                                                             |
| ---------- | ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validate` | `ci.yml`    | **yes**           | typecheck, lint, test, build (`pnpm install --frozen-lockfile` first)                                                                                                    |
| `sonar`    | `sonar.yml` | no                | SonarQube Cloud analysis with vitest coverage (`pnpm run test:coverage` writes `coverage/lcov.info`). Warning-only for the first week. **Skipped until Sonar is set up** |

Run the same checks locally before pushing: `pnpm run validate`.

**Setting up SonarQube Cloud** (repository admin, once):

1. Import the repository in SonarQube Cloud (organization `kltn-fa26`). The project key must be
   `KLTN-FA26_fe-storefront-stockflow-commerce`, which is what `sonar-project.properties` expects.
2. Repository secret `SONAR_TOKEN`: the project's analysis token.
3. Repository variable `SONAR_ORGANIZATION`: `kltn-fa26`.
4. Turn off "Automatic Analysis" for the project in SonarQube Cloud, otherwise it conflicts with the
   CI analysis.

Until both exist the job prints a notice and does nothing, and the PR stays green. The quality gate
is not awaited, so Sonar never blocks a merge.

**Dependabot** (`.github/dependabot.yml`) opens pull requests against `dev` every Monday at
08:00 Vietnam time for npm (pnpm) and GitHub Actions. Minor and patch updates are grouped into one
pull request per ecosystem, majors are separate, at most 5 open at a time, titled `chore(deps): ...`
and labelled `dependencies`.

## Design rules

Read these before changing UI:

- `src/_design/FRONTEND-AI-RULES.md`
- `src/_design/PRODUCTION-FRONTEND-RULES.md`
- `.claude/rules/design-tokens.md`
- `.claude/rules/mode-b-storefront.md`

This app is storefront-only Mode B with Ink + Blue tokens. Use token classes such as `bg-bg-surface`, `text-ink-primary`, `border-border-default`, and `bg-accent`. Do not introduce back-office/admin styling or one-off colors.

## Project rules

- Use `pnpm` only.
- Prefer shadcn/Radix primitives for interactive UI.
- Compose storefront UI from `components/storefront/*` and `components/shared/*` before adding new components.
- Do not import `src/lib/mock-data.ts` outside `src/lib/api/mock-adapter.ts`.
- Do not hardcode hex colors in app/component/feature code.
- Keep `components/ui/*` primitive-level; product-specific composition belongs outside it.

## Mock and API behavior

The frontend calls `/api/*`. Next.js rewrites those requests to `API_URL`.

When `USE_MOCK=true`, the API client uses the mock adapter. Mock data remains behind the adapter so pages/components do not depend on demo fixtures directly.
