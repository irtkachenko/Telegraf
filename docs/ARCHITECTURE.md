# Архітектурні принципи Telegraf

## Core Rules

1. **Один файл = одна відповідальність**
   - Компоненти не більше 200 рядків
   - Хуки не більше 150 рядків
   - Сервіси не більше 100 рядків на функцію

2. **Явне краще ніж неявне**
   - Ніяких `export *` — тільки явний експорт
   - Ніяких типів-аліасів для зворотної сумісності
   - Ніяких "utility" файлів-звалищ

3. **Іменування**
   - Файли: kebab-case (`use-messages.ts`, `message-bubble.tsx`)
   - Функції: camelCase (`getMessages`, `sendMessage`)
   - Типи/Інтерфейси: PascalCase (`AppUser`, `MessagePayload`)
   - Коментарі: тільки ENGLISH, тільки якщо код неочевидний

4. **Структура компонента**
   ```tsx
   // 1. Imports
   // 2. Types/Interfaces (локальні)
   // 3. Sub-components (приватні)
   // 4. Main component
   // 5. Export
   ```

5. **Структура хука**
   ```ts
   // 1. Imports
   // 2. Types
   // 3. Utils (приватні)
   // 4. Hook function
   // 5. Export
   ```

6. **Обробка помилок**
   - Сервіси: `throw`
   - Хуки: `handleError` + `throw`
   - Компоненти: `try/catch` з тостом
   - Жодних `console.warn` в production-коді