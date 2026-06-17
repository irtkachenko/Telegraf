# Telegraf

## 1. What This Project Is

Telegraf is a realtime 1:1 messaging web application built on Next.js App Router and Supabase.

__Telegraf (Realtime Chat)__

- __Стек:__ TypeScript, Next.js (App Router), React, Node.js, Supabase (Postgres, Auth, Storage, Realtime), Tailwind CSS v4, TanStack Query, Zustand, Radix UI, Framer Motion, Vercel.
- __Результат:__ Розробив вебчат із миттєвим обміном повідомленнями, realtime typing indicators та online presence. Спроектував PostgreSQL базу даних на Supabase з RLS-політиками, rate limiting та тригерами. Налаштував приватний storage bucket із Signed URLs для медіафайлів. Інтегрував Google OAuth через Supabase Auth. Реалізував клієнтське кешування (TanStack Query + Zustand), віртуалізований список повідомлень (react-virtuoso) та компресію зображень на клієнті. Задеплоїв на Vercel.

Core capabilities:
- Google OAuth login via Supabase Auth
- Chat list + chat detail with realtime message updates
- Message create/edit/delete + read markers
- Typing indicator + online presence
- File attachments via Supabase Storage (private bucket + signed URLs)

## 2. High-Level Architecture

Client layers:
1. `components/` -> view/UI and user interaction
2. `hooks/` -> app workflows (queries, mutations, realtime orchestration)
3. `services/` -> thin API access layer over Supabase client
4. `store/` -> global client state (presence/storage caches)

Server/infra layers:
1. Next.js route handlers (`src/app/api/...`) for server-side config endpoints
2. Supabase SQL migrations in `supabase/migrations/`
3. Supabase RPC + RLS policies enforcing DB-side access logic

Routing model:
- `src/proxy.ts` acts as middleware/proxy gate for auth-based redirects
- Public routes: `/`, `/auth/*`
- Protected routes: `/chat`, `/chat/[id]`

## 3. Request/State Flows

Auth flow:
1. User clicks sign-in (`handleSignIn`)
2. Supabase OAuth redirect
3. `/auth/callback` exchanges auth code for session
4. Proxy redirects authenticated users to `/chat`

Chat/messages flow:
1. Hooks read via `services/chat/*`
2. Data cached by React Query (`['chats']`, `['chat', id]`, `['messages', id]`)
3. Realtime channel (`useChatsRealtime`) patches caches on INSERT/UPDATE/DELETE

Presence flow:
1. `useGlobalRealtime` subscribes once user is authenticated
2. `usePresenceStore` maintains singleton realtime presence channel
3. Heartbeat and reconnect strategy handle transient disconnects

Attachment flow:
1. Client validates files (`useStorageLimits`)
2. Files uploaded to private `attachments` bucket
3. Signed URLs are generated and cached in Zustand store
4. Message stores attachment metadata in `messages.attachments`

## 4. Directory Guide

- `src/app/` -> App Router pages and route handlers
- `src/components/` -> UI components by feature
- `src/hooks/` -> data/realtime/business hooks
- `src/services/` -> Supabase calls grouped by domain
- `src/lib/` -> shared utilities and adapters
- `src/store/` -> Zustand stores
- `src/types/` -> app and generated DB types
- `src/config/` -> static configuration files
- `src/shared/` -> shared error handling and utilities
- `src/utils/` -> file validation utilities
- `supabase/migrations/` -> schema, policies, RPCs, rate limits
- `scripts/` -> helper scripts for DB migrations and type generation
- `docs/` -> additional design/implementation notes

## 5. Environment Variables

Copy `.env.example` to `.env.local` and set at minimum:

```env
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Optional (server-only):

```env
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Notes:
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client.
- `NEXT_PUBLIC_*` variables are bundled for browser runtime.

## 6. Local Development

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm run dev
```

Build production bundle:

```bash
npm run build
npm run start
```

## 7. Package Scripts

- `npm run dev` -> Next dev server (with webpack)
- `npm run build` -> production build
- `npm run start` -> run production server
- `npm run lint` -> ESLint for `src`
- `npm run format` -> format `src` via Biome
- `npm run check` -> Biome check (with write) + ESLint
- `npm run generate-types` -> regenerate `src/types/supabase.ts`
- `npm run push-migrations` -> link Supabase project + push migrations
- `npm run verify` -> lint + typecheck + production build

## 8. Database Workflow

Migrations:
- SQL files are in `supabase/migrations/`.
- Apply with `npm run push-migrations`.

Type generation:
- `npm run generate-types` writes generated schema types to `src/types/supabase.ts`.
- Run this after schema/RPC changes.

## 9. Quality and Validation Commands

Recommended before merge:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm audit --prod
```

## 10. Docker

Development (hot reload):

```bash
docker-compose up -d --build
```

Stop dev stack:

```bash
docker-compose down
```

Production-like local run:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Stop prod stack:

```bash
docker compose -f docker-compose.prod.yml down
```

## 11. Live Demo

The project is deployed on Vercel and accessible at:
https://telegraf-five-zeta.vercel.app/