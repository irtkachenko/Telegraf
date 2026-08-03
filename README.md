# 💬 Telegraf — Realtime 1:1 Messenger

![Next.js](https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=nextdotjs)
![React](https://img.shields.io/badge/React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?style=for-the-badge&logo=vercel)

Telegraf is a high-performance, real-time 1:1 web messaging application built with **Next.js (App Router)** and **Supabase**. It features instant message delivery, real-time presence, typing indicators, client-side image compression, and secure private attachment storage.

🔗 **Live Demo:** [https://telegraf-navy.vercel.app/](https://telegraf-navy.vercel.app/)

---

## 📸 Preview

<!-- Replace with your actual app screenshot or GIF -->
![Telegraf Banner](https://raw.githubusercontent.com/username/repository/main/public/preview.png)

---

## 🌟 Key Features & Highlights

- 🔐 **Authentication:** Google OAuth powered by Supabase Auth with server-side proxy route protection.
- ⚡ **Realtime Messaging:** Instant message creation, editing, deletion, and read receipts with minimal latency.
- 🟢 **Presence & Typing:** Realtime online/offline presence indicators and active typing feedback.
- 📎 **Media & Attachments:** Private Supabase Storage bucket with client-side image compression (`browser-image-compression`) and secure Signed URLs.
- 🚀 **Performance:** Virtualized message list using `react-virtuoso` for smooth handling of extensive chat histories.
- 🔒 **Database Security:** Custom PostgreSQL schema with Row Level Security (RLS) policies, rate limiting, and database triggers.

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| **Framework & UI** | Next.js 16 (App Router), React 19, Tailwind CSS v4, Radix UI, Framer Motion |
| **Backend & DB** | Supabase (PostgreSQL, Auth, Storage, Realtime Engine) |
| **State & Data Fetching** | TanStack Query v5, Zustand |
| **Form & Validation** | Zod |
| **Virtualization & Media** | react-virtuoso, browser-image-compression, linkify-react |
| **Tooling & Quality** | Biome, ESLint, TypeScript 5, Docker |

---

## 🏗️ High-Level Architecture

### Client Layer Architecture
1. `components/` — UI presentation layers and interactive elements.
2. `hooks/` — Application workflows, TanStack queries, mutations, and realtime channel listeners.
3. `services/` — Thin data-access layer interacting with the Supabase client.
4. `store/` — Zustand global client state (presence cache, storage limits).

### Server & Infrastructure Layer
1. **Route Handlers** (`src/app/api/...`) for server-side config and proxy gate routing (`src/proxy.ts`).
2. **Supabase Database** migrations in `supabase/migrations/` containing RLS policies, functions, and triggers.

### Routing Model
- **Public Routes:** `/`, `/auth/*`
- **Protected Routes:** `/chat`, `/chat/[id]` (guarded via `src/proxy.ts`)

---

## 🔄 State & Data Flows

<details>
<summary><b>1. Authentication Flow</b></summary>

1. User triggers Google OAuth sign-in.
2. Supabase redirects through OAuth provider.
3. `/auth/callback` exchanges the auth code for a session token.
4. Middleware proxy gates redirect authenticated users to `/chat`.
</details>

<details>
<summary><b>2. Realtime Chat & Messages Flow</b></summary>

1. Hooks fetch data via `services/chat/*`.
2. Cache managed by React Query (`['chats']`, `['chat', id]`, `['messages', id]`).
3. `useChatsRealtime` channel listens to DB events (`INSERT`/`UPDATE`/`DELETE`) and dynamically updates caches.
</details>

<details>
<summary><b>3. Attachments & Media Flow</b></summary>

1. Client validates file limits (`useStorageLimits`).
2. Files compressed on client side and uploaded to private `attachments` bucket.
3. Temporary Signed URLs are generated and stored in the Zustand store cache.
4. Attachment metadata is saved alongside the message payload.
</details>

---

## 📁 Directory Structure

```text
Telegraf/
├── docs/                 # Architectural and design documentation
├── scripts/              # DB migration and type generator scripts
├── src/
│   ├── app/              # Next.js App Router (pages & API routes)
│   ├── components/       # UI components grouped by feature
│   ├── config/           # App configuration files
│   ├── hooks/            # Custom hooks for state, RPC, and realtime
│   ├── lib/              # Utility adapters and shared libs
│   ├── services/         # Supabase API services
│   ├── shared/           # Cross-cutting error handlers and helpers
│   ├── store/            # Zustand state management
│   ├── types/            # Generated DB schema and app types
│   └── utils/            # Validation & formatting utilities
└── supabase/
    └── migrations/       # PostgreSQL schema, RLS policies & RPCs
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`

### 2. Environment Setup
Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your configuration:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Server-only (Do NOT expose to client)
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

### 3. Installation & Run

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm run start
```

---

## 📜 Available Scripts

| Script | Command / Description |
|---|---|
| `npm run dev` | Starts Next.js dev server with Webpack |
| `npm run build` | Builds production bundle |
| `npm run verify` | Runs linting, TypeScript typecheck (`tsc`), and production build |
| `npm run format` | Formats codebase using Biome |
| `npm run check` | Runs Biome checks and ESLint |
| `npm run generate-types` | Regenerates Supabase TypeScript types in `src/types/supabase.ts` |
| `npm run push-migrations` | Links Supabase project and applies DB migrations |

---

## 🐳 Docker Support

<details>
<summary><b>Development Stack</b></summary>

```bash
# Start dev container (with hot reload)
docker-compose up -d --build

# Stop dev container
docker-compose down
```
</details>

<details>
<summary><b>Production Stack</b></summary>

```bash
# Start production-like container
docker compose -f docker-compose.prod.yml up -d --build

# Stop production container
docker compose -f docker-compose.prod.yml down
```
</details>
