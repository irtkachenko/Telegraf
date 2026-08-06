# Send Push Notification Edge Function

Ця Edge Function відправляє push-сповіщення при нових повідомленнях.

## Файли:
- `index.ts` — код функції
- `deno.json` — конфігурація залежностей

## Встановлення та деплой:

### 1. Встанови Supabase CLI (якщо ще не встановлено):
```bash
npm install -g supabase
```

### 2. Залогінься в Supabase:
```bash
supabase login
```

### 3. Деплой Edge Function:
```bash
supabase functions deploy send-push-notification
```

### 4. Налаштуй секрети (змінні середовища):
```bash
supabase secrets set NEXT_PUBLIC_VAPID_PUBLIC_KEY=твій_public_key
supabase secrets set VAPID_PRIVATE_KEY=твій_private_key
supabase secrets set NEXT_PUBLIC_SITE_URL=https://твій-домен.com
```

### 5. Застосовуй міграцію БД:
```bash
supabase db push
# або
supabase migration up
```

## Перевірка роботи:

1. Відкрий додаток в PWA режимі
2. Натисни кнопку "Увімкнути сповіщення"
3. Закрий додаток
4. Надішли нове повідомлення з іншого аккаунта
5. Перевір чи прийшло пуш-сповіщення

## Важливо:
- Переконайся що VAPID ключі згенеровані: `npx web-push generate-vapid-keys`
- Переконайся що в `.env.local` є:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
- Додаток повинен бути встановлено як PWA (standalone режим)

## Логи:
Для перегляду логів Edge Function:
```bash
supabase functions logs send-push-notification --tail