# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Local-first React 19 + TypeScript SPA built with Vite. State in Zustand, persistence via IndexedDB (`idb`), tree UI via `@headless-tree`, graph layout via ELK.js, PowerPoint export via `pptxgenjs`. Styling is Tailwind 3.

## Commands

- `npm run dev` — Vite dev server.
- `npm run build` — runs `tsc` first, then `vite build`. Type errors fail the build.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run lint` — ESLint with `--max-warnings 0`. Any warning fails lint; treat warnings as errors.
- `npm run test` — Vitest watch mode. Use `npm run test:run` for a single non-watching run.
- `npm run test:e2e` — Playwright. Spawns its own dev server on `127.0.0.1:5317` with `--strictPort`; do not run `npm run dev` in parallel.

## Architecture rules

- `src/domain/**` is pure business logic and is forbidden from importing `react`, `react-dom`, `zustand`, or anything from `src/features/` or `src/app/`. ESLint enforces this — do not work around it.
- `src/app/` owns React app shell, Zustand stores, and IndexedDB persistence/autosave.
- `src/features/` owns feature-level components and hooks.

## Testing notes

- Vitest runs in `jsdom`. `ResizeObserver` is mocked globally in `src/test/` setup — needed by the headless-tree renderer.
- E2E tests live in `tests/e2e/` and assume the Playwright-managed dev server on port `5317`.

## Style

- ESLint uses the modern flat config (`eslint.config.js`) with type-checked rules. `recommendedTypeChecked` is on, so changes that break inferred types will fail lint even if `tsc` is clean.
- Prettier is installed but has no config file — defaults apply.
- Tailwind brand colors are defined in `tailwind.config.ts`; design tokens are documented in `DESIGN.md`.

## PWA

`vite-plugin-pwa` registers a service worker at build time with a 4MB asset cache cap. When chunk sizes grow, update the `maximumFileSizeToCacheInBytes` in `vite.config.ts` rather than disabling PWA.
