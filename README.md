# Messaging Platform — Monorepo Guide

> A learning-oriented reference for how this project is structured, why we use pnpm and Turborepo, and how each config file wires everything together.

---

## Table of Contents

1. [Repository Structure](#repository-structure)
2. [What is pnpm?](#1-what-is-pnpm)
3. [What is Turborepo?](#2-what-is-turborepo)
4. [How the pieces connect](#how-the-pieces-connect)

---

## Repository Structure

```
messaging-platform/              ← monorepo root
├── package.json                 ← root manifest (pnpm + turbo scripts live here)
├── pnpm-workspace.yaml          ← tells pnpm which folders are "packages"
├── turbo.json                   ← tells Turborepo how to run tasks
├── .nvmrc                       ← pin Node version to 24
│
├── apps/
│   ├── web/                     ← Next.js 16 frontend
│   │   ├── package.json         ←   name: "web"
│   │   └── next.config.ts
│   │
│   └── api/                     ← NestJS 11 backend
│       ├── package.json         ←   name: "api"
│       └── nest-cli.json
│
└── packages/
    └── shared/                  ← shared TypeScript types / utils
        ├── package.json         ←   name: "@repo/shared"
        └── src/index.ts         ←   exports ConversationType, PublicUser, etc.
```

Both `apps/web` and `apps/api` depend on `@repo/shared`:

```json
// apps/web/package.json  AND  apps/api/package.json
"@repo/shared": "workspace:*"
```

`workspace:*` is a pnpm protocol that means _"use the local copy of this package inside this repo, whatever version it currently is."_

---

## 1. What is pnpm?

### The short answer

`pnpm` is a package manager — like `npm` or `yarn` — but it solves two big problems with npm:

| Problem with npm                                                  | How pnpm fixes it                                          |
| ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Every project downloads its own copy of every package             | pnpm stores packages **once globally** and hard-links them |
| `node_modules` balloons to hundreds of MB per project             | Much smaller because packages are shared                   |
| Phantom dependencies (you can import packages you didn't declare) | Strict isolation — you can only use what you declared      |

### How pnpm stores packages

```
Your disk (global store, shared across ALL your projects)
~/.pnpm-store/
  └── react@19.2.4/          ← stored ONCE, ever
  └── next@16.2.9/
  └── ...

messaging-platform/node_modules/
  └── react  →  (hard link to ~/.pnpm-store/react@19.2.4)  ← NOT a copy!
```

A **hard link** means both paths point to the same bytes on disk. So even if you have 10 projects all using React 19, your disk only stores it once.

### The Workspace feature

`pnpm` has built-in support for **workspaces** — multiple packages living in the same git repository. This is what makes a monorepo work.

#### Your `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"      ← apps/web and apps/api are packages
  - "packages/*"  ← packages/shared is a package

allowBuilds:
  unrs-resolver: true   ← allow native build for this dep
  sharp: true           ← allow native build for image processing
```

This file tells pnpm: _"treat every folder under `apps/` and `packages/` as a workspace package."_

When you run `pnpm install` from the root, pnpm:

1. Reads `pnpm-workspace.yaml`
2. Discovers `web`, `api`, and `@repo/shared`
3. Installs all their dependencies into the right places
4. Creates symlinks so `apps/web/node_modules/@repo/shared` points to `packages/shared` on your local disk — no publishing to npm needed

#### Your root `package.json`

```json
{
  "name": "messaging-platform",
  "packageManager": "pnpm@11.6.0",   ← locks the exact pnpm version
  "engines": { "node": ">=24" },      ← enforces Node 24+ (matches .nvmrc)
  "devDependencies": {
    "turbo": "^2.9.18"               ← turbo installed at root, available to all
  }
}
```

The `"packageManager"` field is a Corepack feature — if someone runs `npm install` by mistake, Node.js will warn them to use pnpm instead.

### Common pnpm commands in a workspace

```bash
# Install all deps for the whole monorepo (run from root)
pnpm install

# Add a dependency to a specific app
pnpm --filter web add axios
pnpm --filter api add @nestjs/jwt

# Add a dev dependency to the root
pnpm add -D some-tool -w

# Run a script in a specific package
pnpm --filter web dev
pnpm --filter api build
```

---

## 2. What is Turborepo?

### The problem it solves

You have three packages: `shared`, `web`, and `api`. If you change `shared`, you need to rebuild it before `web` and `api` can use the update. In a plain pnpm workspace you'd have to manually figure out the order and run commands one by one.

Turborepo solves this by:

1. Understanding the **dependency graph** between your packages
2. Running tasks in the **correct order** automatically
3. **Caching** task outputs so it never rebuilds something that hasn't changed

### The dependency graph in your project

```
        @repo/shared
        /           \
      build         build
      /               \
   apps/web         apps/api
   (Next.js)        (NestJS)
```

`web` and `api` both import from `@repo/shared`, so `shared` must be built first.

### Your `turbo.json` explained line by line

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },

    "dev": {
      "dependsOn": ["^build"],
      "cache": false,
      "persistent": true
    },

    "lint": {},

    "type-check": {}
  }
}
```

#### `"build"` task

```json
"build": {
  "dependsOn": ["^build"],    ← the ^ means "dependencies first"
  "outputs": ["dist/**", ".next/**"]
}
```

- `"^build"` — the caret (`^`) means _"before building me, build all my workspace dependencies."_  
  So when you run `turbo build` on `apps/api`, Turborepo sees that `api` depends on `@repo/shared`, so it runs `shared`'s build script first automatically.
- `outputs` — tells Turbo what folders to **cache**. If none of the source files changed, Turbo restores `dist/` and `.next/` from cache instead of re-running the build.

```
First run:
  shared → build (takes 3s)  →  cached ✓
  api    → build (takes 8s)  →  cached ✓
  web    → build (takes 12s) →  cached ✓

Second run (nothing changed):
  shared → cache hit! (0ms)
  api    → cache hit! (0ms)
  web    → cache hit! (0ms)
  Total: ~50ms instead of 23 seconds
```

#### `"dev"` task

```json
"dev": {
  "dependsOn": ["^build"],  ← build shared first, then start dev servers
  "cache": false,           ← don't cache dev servers (they run continuously)
  "persistent": true        ← this task runs forever (a watch process)
}
```

When you run `pnpm dev` from the root:

1. Turbo builds `@repo/shared` (because `^build`)
2. Turbo starts `next dev` in `apps/web` and `nest start --watch` in `apps/api` **in parallel**
3. Both dev servers run simultaneously — you get HMR on the frontend and auto-reload on the backend from a single terminal command

#### `"lint"` task

```json
"lint": {}
```

No `dependsOn` — lint jobs have no ordering requirement, so Turbo runs all of them in **parallel** immediately.

### How your root scripts use Turbo

```json
// root package.json
"scripts": {
  "dev":   "turbo run dev",    ← runs dev task across all packages
  "build": "turbo run build",  ← runs build task across all packages
  "lint":  "turbo run lint"    ← runs lint task across all packages
}
```

When you type `pnpm dev`:

- pnpm runs `turbo run dev` at the root
- Turborepo reads `turbo.json`, resolves the dependency graph
- Builds `@repo/shared` first
- Then starts `web` and `api` dev servers in parallel

### The `.turbo/` cache directory

```
messaging-platform/.turbo/
└── cache/
    └── 859f6c5c39de39f3.tar.zst   ← compressed cache of a previous build output
```

This is Turbo's local cache. The hash in the filename is derived from your source files + environment. If the hash matches, Turbo skips re-running that task entirely. You should commit `.gitignore` entries for this (it's already in your `.gitignore`).

---

## How the pieces connect

Here is the full picture of what happens when you run `pnpm dev`:

```
pnpm dev
  │
  └─► turbo run dev
          │
          │  reads turbo.json
          │  resolves workspace graph from pnpm-workspace.yaml
          │
          ├─► @repo/shared  →  pnpm run build  (tsc → dist/)
          │        ↓  (finished)
          │
          ├─► apps/web      →  pnpm run dev    (next dev)      ─┐ run in
          └─► apps/api      →  pnpm run dev    (nest start --watch) ─┘ parallel
```

And for `pnpm build` (e.g., for production):

```
pnpm build
  │
  └─► turbo run build
          │
          ├─► @repo/shared  →  tsc  →  packages/shared/dist/
          │        ↓ (outputs cached to .turbo/cache/)
          │
          ├─► apps/web      →  next build  →  apps/web/.next/
          └─► apps/api      →  nest build  →  apps/api/dist/
```

---

## Quick Reference

| Command                                | What it does                                         |
| -------------------------------------- | ---------------------------------------------------- |
| `pnpm install`                         | Install all deps across all packages                 |
| `pnpm dev`                             | Build shared, then start all dev servers in parallel |
| `pnpm build`                           | Build all packages in dependency order               |
| `pnpm lint`                            | Lint all packages in parallel                        |
| `pnpm --filter web add <pkg>`          | Add a package only to `apps/web`                     |
| `pnpm --filter api add <pkg>`          | Add a package only to `apps/api`                     |
| `pnpm --filter @repo/shared add <pkg>` | Add a package only to `packages/shared`              |

---

## Key files at a glance

| File                           | Purpose                                                 |
| ------------------------------ | ------------------------------------------------------- |
| `pnpm-workspace.yaml`          | Declares which folders are workspace packages           |
| `turbo.json`                   | Defines tasks, their dependencies, and caching rules    |
| `package.json` (root)          | Pins pnpm version, holds root-level devDeps and scripts |
| `apps/web/package.json`        | Next.js app, declares `@repo/shared` as a dep           |
| `apps/api/package.json`        | NestJS app, declares `@repo/shared` as a dep            |
| `packages/shared/package.json` | Shared types package, name `@repo/shared`               |
| `.nvmrc`                       | Pins Node.js to version 24                              |
