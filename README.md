# Слова

Тренажёр английских слов для одного преподавателя и его учеников.

Преподаватель создаёт урок, добавляет слова по одному или списком, выбирает картинку, включает упражнения и получает отдельную ссылку на каждого ученика. Ученик проходит урок без регистрации. Преподаватель видит, как каждый справился.

## Упражнения

- **Запомни** — карточка: картинка, написание, транскрипция, перевод, звук
- **Что на картинке?** — выбрать слово по картинке
- **Найди слово** — выбрать картинку по слову
- **Найди пары** — «мемори»
- **Выбери перевод**
- **Собери слово** — из букв, пробелы и дефисы уже стоят на местах
- **Напиши на слух**
- **Произнеси** — распознавание речи в Chrome и Edge, в остальных браузерах упражнение можно пропустить

Ошибочное слово возвращается в конец упражнения, пока ученик не ответит верно. В отчёте считается первая попытка.

## Стек

- React, TypeScript, Vite, Tailwind — статический сайт на GitHub Pages
- Supabase: Postgres, Auth, Storage, Edge Functions
- Картинки: Pixabay и Openverse, выбранный файл копируется в Storage
- Словарь: [dictionaryapi.dev](https://dictionaryapi.dev/), подсказки — Datamuse, перевод — MyMemory
- Озвучка: mp3 из словаря или голос браузера

Anon key попадает в браузер специально. Данные защищает Row Level Security: ученик не читает таблицы, а вызывает функции `get_assignment`, `submit_answer` и `complete_exercise` по своему токену.

## Локальный запуск

Нужны Node.js 22 и [OrbStack](https://orbstack.dev) (или Docker). OrbStack отдаёт обычный `docker`, им пользуется Supabase CLI.

```bash
npm install
npx supabase start
```

Команда напечатает `API URL` и `anon key`. Создайте `.env.local`:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=anon-key-из-вывода-supabase-start
```

Ключ Pixabay (необязательно, без него останется Openverse):

```bash
npx supabase secrets set PIXABAY_KEY=ваш-ключ
```

Бесплатный ключ: [pixabay.com/api/docs](https://pixabay.com/api/docs/).

Функции картинок и перевода:

```bash
npx supabase functions serve --env-file supabase/.env.local
```

Учительский аккаунт (локально регистрация открыта):

```bash
curl -X POST 'http://127.0.0.1:54321/auth/v1/signup' \
  -H "apikey: ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"teacher@example.com","password":"password-password"}'
```

```bash
npm run dev
```

Сайт откроется на `http://localhost:5173/english-words-trainer/`.

## Публикация

1. Создайте проект на [supabase.com](https://supabase.com) (бесплатный тариф засыпает через 7 дней без запросов — для этого есть workflow `keepalive`).
2. Поставьте [Supabase CLI](https://supabase.com/docs/guides/cli), затем:

```bash
npx supabase link --project-ref YOUR_REF
npx supabase db push
npx supabase functions deploy image-search image-save translate
npx supabase secrets set PIXABAY_KEY=ваш-ключ
```

3. Authentication → Users: создайте преподавателя. Потом выключите **Allow new users to sign up**.
4. Authentication → URL Configuration: добавьте `https://<user>.github.io/english-words-trainer/` и `http://localhost:5173`.
5. В репозитории GitHub: Settings → Secrets and variables → Actions → Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

6. Settings → Pages → Source: **GitHub Actions**. Пуш в `main` собирает сайт и публикует его.

Если репозиторий называется иначе, поменяйте `VITE_BASE_PATH` в `.github/workflows/deploy.yml`. Для своего домена поставьте `VITE_BASE_PATH=/`.

## Картинки и лицензии

У карточки «Запомни» под картинкой указаны автор и лицензия. У Openverse это часто CC BY: имя автора нужно оставить. Файлы хранятся у вас в Storage, а не ссылкой на Pixabay: так разрешают их правила, и картинка не пропадёт.

## Скрипты

```bash
npm run dev      # локальный сайт
npm test         # логика упражнений
npm run lint
npm run build
```
