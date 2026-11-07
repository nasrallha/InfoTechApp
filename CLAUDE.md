@AGENTS.md

# InfoTech ERP / POS (firstapp)

> ملف التعليمات لـ Claude Code: بيتقري أوتوماتيك في كل جلسة.
> السطر الأول `@AGENTS.md` لازم يفضل زي ما هو (`next dev` بيكتبه).

## The owner and how to work with him
- Owner: Mohamed. **Always reply in Arabic (Egyptian dialect is fine in chat).** Never switch to English.
- **UI text inside the apps must be formal Arabic (فصحى)**, never colloquial.
  - Translations live in `messages/ar.json` and `messages/en.json` (next-intl); every new string goes in both.
- Terminal / CLI scripts: prompts and output in **English only**. Give Windows commands for **CMD**, not PowerShell.
- Apply changes **directly to the project files**; don't hand him code to paste.
- **Discuss bigger features first**: propose the design and ask before building. Small fixes: just do them.
- For setup/deployment steps (server, DNS…), go **one step at a time** and wait for his result.
- He develops on Windows; everything must also run on Linux (the production VPS).
- When done, summarize briefly what changed and what he must run (migrations, restart…).

## Stack
- Next.js 16 (App Router, Turbopack, `cacheComponents`).
  - Read `node_modules/next/dist/docs/` before using unfamiliar APIs, since this Next has breaking changes.
- React 19, antd 6, next-intl (ar / en, RTL), Prisma 7 + MySQL/MariaDB (mariadb adapter).
  - The Prisma extension converts Decimals to plain numbers.
- Multi-company:
  - One database per client company. `runWithCompany` / AsyncLocalStorage picks the DB.
  - The subscription copy lives in the `subscription` table inside each company DB, written by the control panel.
- Control panel = separate project: `G:\projects\nextjs\infotech-cpanal`, with its own CLAUDE.md.
  - It reads `lib/module-catalog.js`, `lib/permissions.js` and `messages/*.json` from **this** project at runtime.

## Code structure (follow the existing pattern)
- `validations/*.schema.js` (Zod) → `services/*.service.js` (Prisma, `import "server-only"`) → `actions/*.actions.js` (`"use server"`, `runAction(schema, input, handler, { permission, refresh })`).
- Pages: `app/[locale]/(dashboard)/.../page.jsx` (server component, `getPageAccess("perm")`) + client view in `components/...`.
- Errors: `throw new AppError("Code", details, { field: "Code" })`. Translate the code in `Alerts`, and show it with `showActionError(res, tAlerts, locale)`.
- Permissions: `lib/permissions.js`.
- Activity modules: `lib/module-catalog.js` (serials, warrantyClaims, technicians, maintenanceContracts, followUps, vehicles, bookings, variants…).
  - Server: `hasModule` / `assertModule` (`lib/modules.js`). Client: `useModule(key)`.
- Transactions: `runTx` (`lib/transaction.js`) retries on deadlock.
- Comments in code are in Arabic (match the existing style).

## Database / migrations
- **Migrations are handwritten SQL** in `prisma/migrations/<timestamp>_<name>/migration.sql`; update `prisma/schema.prisma` to match. Never `migrate reset`, and never wipe data.
- Data-safe migrations only: add columns with defaults, backfill with UPDATE, and use `INSERT IGNORE` for seed rows.
- After a migration, he runs `npm run db:deploy` (this project and the panel if it changed), then «تحديث القواعد» in the control panel to apply it to every company DB.
- Don't touch `.env` (it holds ZATCA keys). Never change `ZATCA_MASTER_KEY`.

## UI rules (always)
- **Compact modals**: short fields side by side (Ar + En name in one row, phone + rates in one row).
  - Hints go in `tooltip` (❔ next to the label) instead of `extra` lines.
  - Use `mask={{ closable: false }}`, not `maskClosable` (deprecated).
- **Screens use the full width.** Settings and forms put cards and fields in columns.
  - For stacked settings cards, use the `.settings-masonry` class (globals.css).
  - Never a narrow column that keeps growing downward.
- **No browser autocomplete anywhere** (names, phones, tax no., address, CR, emails, passwords).
  - `components/common/useNoAutofill.js` (in AntdProvider) handles inputs after hydration. Also set `autoComplete="off"` on forms, and `new-password` on passwords.
  - Only the app's own suggestions (e.g. vehicle type) are allowed.
- **Every search field runs on Enter** (Input.Search `onSearch` / `onPressEnter`), and keeps the button too.
- Font: IBM Plex Sans Arabic (`var(--font-main)`).
- **Colors: never hardcode hex.** All colors live in `lib/theme.js`.
  - JSX: `import { C } from "@/lib/theme"` → `C.danger`. CSS: `var(--c-danger)`. Tailwind: `bg-(--c-danger)`. Charts: `CHART_COLORS`.
  - Need a new color? Add it to `lib/theme.js` first. (Print documents and product variant colors are excluded.)
- Icons: `@ant-design/icons` only. Icon-only buttons need `aria-label` + `title`.
- Lists joined in text: `listSep(locale)` from `lib/list-sep.js`, never a hardcoded «، ».
- Quantities: `qtyText` from `lib/unit-qty.js` (whole numbers without zeros, fractions with 3 decimals).

## Business rules worth knowing
- Business day: `system_settings.dayStartHour` (`lib/business-day.js`). Reports and shifts use business days; VAT/ZATCA use real dates.
- Units:
  - `units.allowDecimals` is checked server-side by `assertUnitQty` in every document.
  - Pack conversion (ceramics m² ↔ carton): `lineConversion` / `LineConversion`.
- Sizes and colors (`variants` module): every size is a normal product linked by `modelId`. See `services/variant.service.js`.
- ZATCA: the local .NET gateway starts only if a company has an active zatcaUnit (`lib/zatca-gateway-boot.js`).

## Checks before finishing
- Make sure the changed files build and lint (`npx eslint <files>`), and fix warnings.
- Re-read the diff. Don't reformat unrelated code.
- More background per activity: the claude.ai Project «ERP System» docs (activity-*.md, sales.md, zatca.md…).
