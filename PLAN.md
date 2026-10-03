# English Words Trainer — архитектура и план реализации

Документ для исполнителя (LLM-агента). Читай целиком перед началом. Реализуй по этапам из раздела 9, после каждого этапа проверяй критерии приёмки.

## 1. Что строим

Веб-сервис для заучивания английских слов и выражений.

- **Преподаватель** (один, с логином) создаёт уроки: название, тема, описание, уровень. В урок добавляет слова/выражения по одному или списком сразу (массовое добавление); для каждого сервис проверяет слово по словарю, подтягивает транскрипцию, аудио, предлагает перевод и список картинок из бесплатных фотобанков, преподаватель выбирает одну. Затем выбирает набор и порядок упражнений, добавляет учеников (по именам) и получает уникальную ссылку для каждого. Видит результаты каждого ученика.
- **Ученик** (без регистрации) открывает свою ссылку, проходит упражнения. Прогресс и ответы сохраняются на сервере.

Упражнения v1 (коды в БД стабильны, названия в UI можно менять):

| Код | Название в UI | Механика | Требования к уроку |
|---|---|---|---|
| `memorize` | Запомни | Карточка: картинка, слово, транскрипция, перевод, кнопка «Прослушать», кнопка «Дальше» | — |
| `pick_word` | Что на картинке? | Показана картинка, нужно выбрать слово из 4 вариантов | ≥ 2 слов |
| `pick_image` | Найди слово | Показано слово (аудио автоматически и по кнопке), нужно выбрать картинку из 4 | ≥ 2 слов |
| `match_pairs` | Найди пары | Игра «мемори»: карточки рубашкой вверх, пары «картинка ↔ слово» | ≥ 3 слов |
| `pick_translation` | Выбери перевод | Показано английское слово (с аудио), выбрать перевод из 4 | ≥ 2 слов, у всех слов заполнен перевод |
| `spell` | Собери слово | Картинка + перевод, из перемешанных букв собрать слово | — |
| `dictation` | Напиши на слух | Звучит слово, ученик вводит его с клавиатуры | — |
| `pronounce` | Произнеси | Ученик видит слово и картинку, произносит в микрофон, браузер распознаёт речь | Браузер с поддержкой SpeechRecognition, иначе упражнение пропускается |

## 2. Принятые решения

- **Фронтенд**: React 18 + TypeScript + Vite + Tailwind CSS, хостинг на GitHub Pages.
- **Бэкенд**: Supabase (бесплатный тариф): Postgres, Auth, Storage, Edge Functions. Своего сервера нет.
- **Один преподаватель**: вход по email+паролю через Supabase Auth. После создания аккаунта регистрация отключается в настройках Supabase (Auth → Sign In / Providers → Allow new users to sign up = off). Схему всё равно пишем с `owner_id`, чтобы позже легко перейти к нескольким преподавателям.
- **Ученики**: преподаватель вводит имена; на каждую пару «урок × ученик» создаётся назначение (assignment) со случайным токеном. Ссылка: `https://<user>.github.io/<repo>/#/s/<token>`.
- **Картинки**: Pixabay (бесплатный API-ключ) + Openverse (работает без ключа). Запросы идут через Edge Function, чтобы ключ не попал во фронтенд. Выбранная картинка **копируется в Supabase Storage**: правила Pixabay запрещают постоянный хотлинк, а внешние ссылки со временем ломаются.
- **Проверка слова**: Free Dictionary API `https://api.dictionaryapi.dev/api/v2/entries/en/{word}` (без ключа): транскрипция, аудио mp3, определения. Для выражений часто отвечает 404 — это **предупреждение, а не блокировка**. Подсказки «возможно, вы имели в виду» берём из Datamuse `https://api.datamuse.com/sug?s={word}`.
- **Озвучка**: аудио из словаря, если оно есть; иначе Web Speech API (`speechSynthesis`, голос `en-US` или `en-GB`). Это бесплатно и работает для любых выражений.
- **Подсказка перевода**: MyMemory `https://api.mymemory.translated.net/get?q={term}&langpair=en|ru` (без ключа, анонимно ~5000 символов в день; с параметром `de=<email>` лимит выше). Перевод — только предложение, преподаватель может исправить. Если из браузера мешает CORS, проксировать через Edge Function `translate`.
- **Распознавание речи** (упражнение «Произнеси»): Web Speech API `SpeechRecognition` / `webkitSpeechRecognition`. Работает в Chrome и Edge (десктоп и Android), в Safari частично; в Firefox нет. Chrome отправляет звук на серверы Google — упомянуть это в README и в подсказке перед первым включением микрофона.

## 3. Архитектура

```
┌────────────────────────── GitHub Pages (статический SPA) ─────────────────────────┐
│  /#/login            вход преподавателя                                           │
│  /#/lessons          список уроков                                                │
│  /#/lessons/:id      редактор урока (мета, слова, упражнения)                     │
│  /#/lessons/:id/publish   ученики и ссылки                                        │
│  /#/lessons/:id/results   результаты; /#/assignments/:id детально по ученику      │
│  /#/s/:token         плеер ученика (без логина)                                   │
└───────────────┬───────────────────────────────┬───────────────────────────────────┘
                │ supabase-js (anon key + JWT)  │ fetch
                ▼                               ▼
┌──────────────── Supabase ─────────────────┐   ┌─── Публичные API ─────────────────┐
│ Postgres + RLS                            │   │ dictionaryapi.dev (из браузера)   │
│   таблицы: только для преподавателя       │   │ api.datamuse.com  (из браузера)   │
│   RPC SECURITY DEFINER: для учеников      │   └───────────────────────────────────┘
│ Storage: bucket lesson-images (public)    │
│ Edge Functions:                           │──► Pixabay API (ключ в секретах)
│   image-search, image-save                │──► Openverse API
│ Auth: email+password, signup выключен     │
└───────────────────────────────────────────┘
```

Ключевые принципы безопасности:

1. Anon key Supabase публичен по задумке и попадает в бандл. Безопасность держится **только на RLS**.
2. Все таблицы закрыты RLS: доступ только у `authenticated`, и только к строкам, где `owner_id = auth.uid()`.
3. Ученик **не имеет прямого доступа к таблицам**. Он вызывает только RPC-функции, которые принимают токен, сами проверяют его и возвращают или записывают ровно то, что нужно.
4. Токен: не меньше 128 бит случайности (`encode(gen_random_bytes(16), 'hex')` или base64url). Никаких последовательных id в ссылках.

### Роутинг на GitHub Pages

Используй `HashRouter`: GitHub Pages не умеет SPA-fallback, и прямой заход на `/s/abc` даст 404. В `vite.config.ts` выстави `base: '/<repo-name>/'`.

## 4. Модель данных (Supabase Postgres)

Положи в `supabase/migrations/0001_init.sql`. Ниже набросок, его можно уточнять.

```sql
create extension if not exists pgcrypto;

create type exercise_type as enum (
  'memorize', 'pick_word', 'pick_image', 'match_pairs',
  'pick_translation', 'spell', 'dictation', 'pronounce'
);
create type lesson_status as enum ('draft', 'published', 'archived');

create table lessons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null,
  topic text,
  description text,
  level text,                      -- A1..C2, свободный текст
  status lesson_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table lesson_items (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  position int not null,
  term text not null,              -- слово или выражение
  translation text,                -- перевод (опционально, вводит преподаватель)
  phonetic text,                   -- из словаря
  audio_url text,                  -- из словаря, может быть null
  image_path text,                 -- путь в Storage bucket lesson-images
  image_source text,               -- 'pixabay' | 'openverse' | 'upload'
  image_source_url text,           -- страница-источник
  image_author text,
  image_license text,              -- для атрибуции CC
  created_at timestamptz not null default now()
);

create table lesson_exercises (
  lesson_id uuid not null references lessons(id) on delete cascade,
  type exercise_type not null,
  position int not null,
  settings jsonb not null default '{}',   -- например {"options": 4}
  primary key (lesson_id, type)
);

create table students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null,
  note text,
  created_at timestamptz not null default now()
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  revoked boolean not null default false,
  opened_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create table attempts (
  id bigint generated always as identity primary key,
  assignment_id uuid not null references assignments(id) on delete cascade,
  exercise exercise_type not null,
  item_id uuid not null references lesson_items(id) on delete cascade,
  chosen_item_id uuid references lesson_items(id) on delete cascade, -- для упражнений с выбором и match_pairs
  answer_text text,                -- для spell, dictation, pronounce (распознанный текст)
  is_correct boolean,              -- null для memorize и для пропуска
  skipped boolean not null default false,  -- pronounce: «не получается» или браузер не поддерживает
  duration_ms int,
  created_at timestamptz not null default now()
);

create table exercise_progress (
  assignment_id uuid not null references assignments(id) on delete cascade,
  exercise exercise_type not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unsupported boolean not null default false, -- pronounce: браузер не умеет распознавать речь
  primary key (assignment_id, exercise)
);

-- нормализация текстового ответа: одна функция используется и в RPC, и (зеркально) во фронтенде
create function normalize_answer(t text) returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(
           lower(translate(coalesce(t, ''), '’‘`´', '''''''''')),
           '[.!?]+\s*$', ''),
           '\s+', ' ', 'g'))
$$;
```

Правило сравнения текстовых ответов: `normalize_answer(answer) = normalize_answer(term)`. Регистр, лишние пробелы и вид апострофа не важны; знаки препинания на конце (`.`, `!`, `?`) отбрасываются. Опечатки считаются ошибкой (подсказку «почти верно» показывает только фронтенд, см. раздел 6).

RLS (для каждой таблицы `enable row level security`):

- `lessons`, `students`: `using (owner_id = auth.uid()) with check (owner_id = auth.uid())`.
- `lesson_items`, `lesson_exercises`, `assignments`: доступ через `exists (select 1 from lessons l where l.id = lesson_id and l.owner_id = auth.uid())`.
- `attempts`, `exercise_progress`: только `select` для преподавателя через join assignments → lessons. Вставка — только через RPC.
- Для роли `anon` **никаких политик на таблицах** нет.

### RPC для ученика (`security definer`, `set search_path = public`, `grant execute ... to anon`)

1. `get_assignment(p_token text) returns jsonb`
   - Находит назначение по токену, где `revoked = false`; иначе бросает ошибку `invalid_token`.
   - Если `opened_at is null`, проставляет `now()`.
   - Возвращает: `{ student_name, lesson: {title, topic, description}, items: [{id, term, phonetic, audio_url, image_url, translation}], exercises: [{type, position, settings}], progress: [{exercise, completed_at}] }`. `image_url` — публичный URL из Storage.
   - Не возвращает `owner_id` и любые чужие данные.
2. `submit_answer(p_token text, p_exercise exercise_type, p_item_id uuid, p_chosen_item_id uuid default null, p_answer_text text default null, p_skipped boolean default false, p_duration_ms int default null) returns boolean`
   - Проверяет токен, что упражнение включено в урок и что `p_item_id` / `p_chosen_item_id` принадлежат уроку этого назначения.
   - `is_correct` считает **сервер**:
     - `memorize` или `p_skipped = true` → null;
     - `pick_word`, `pick_image`, `pick_translation`, `match_pairs` → `p_item_id = p_chosen_item_id`;
     - `spell`, `dictation`, `pronounce` → `normalize_answer(p_answer_text) = normalize_answer(term)`.
   - Вставляет строку в `attempts`, возвращает `is_correct`.
3. `complete_exercise(p_token text, p_exercise exercise_type, p_unsupported boolean default false) returns void`
   - Upsert в `exercise_progress` с `completed_at = now()`. Если все упражнения урока завершены (неподдерживаемое `pronounce` тоже считается завершённым), проставляет `assignments.completed_at`.

Защита от спама: ограничение в RPC (например, не больше 2000 attempts на назначение).

### Представление для отчёта преподавателя

`assignment_results` (view с `security_invoker = true`, чтобы работала RLS): на каждое назначение и упражнение —
количество слов, количество верных с первой попытки, общее число попыток, число пропусков, суммарное время, статус (`not_opened` / `in_progress` / `completed` / `unsupported`).
«С первой попытки» = для пары (assignment, exercise, item) самая ранняя попытка имеет `is_correct = true`.
Для `match_pairs` «первая попытка» не имеет смысла (в мемори ошибки при поиске неизбежны), поэтому для него метрика — «ходов на пару» = все попытки / число пар (идеал 1.0).

## 5. Edge Functions (Deno, `supabase/functions/`)

Обе функции требуют JWT преподавателя (`verify_jwt = true`, это поведение по умолчанию) и отвечают с CORS-заголовками для домена GitHub Pages и `localhost:5173`.

### `image-search`

- Вход: `{ query: string, page?: number }`.
- Параллельно запрашивает:
  - Pixabay: `https://pixabay.com/api/?key=$PIXABAY_KEY&q={query}&image_type=photo&safesearch=true&per_page=20&page={page}`. Также стоит пробовать `image_type=illustration` или `all`: для абстрактных слов иллюстрации подходят лучше.
  - Openverse: `https://api.openverse.org/v1/images/?q={query}&page_size=20&mature=false&page={page}`. Без ключа работает с жёсткими лимитами; при желании можно зарегистрировать OAuth-клиент и хранить credentials в секретах.
- Нормализует в единый формат и перемешивает источники через один:
  ```ts
  type ImageCandidate = {
    source: 'pixabay' | 'openverse';
    id: string;
    thumbUrl: string;
    fullUrl: string;      // средний размер, не оригинал на 20 МБ
    pageUrl: string;
    author?: string;
    license?: string;     // 'Pixabay License' | 'cc-by' | ...
    width?: number; height?: number;
  };
  ```
- Если один источник упал, отдаёт результаты второго и поле `warnings`.

### `image-save`

- Вход: `{ lessonId, itemId, candidate: ImageCandidate }`.
- Проверяет, что урок принадлежит вызывающему пользователю.
- Скачивает `fullUrl` (лимит 5 МБ, content-type `image/*`), кладёт в bucket `lesson-images` по пути `{lessonId}/{itemId}-{random}.{ext}`, обновляет поля `image_*` в `lesson_items`.
- Возвращает публичный URL.

Ручная загрузка своей картинки (`image_source = 'upload'`) идёт напрямую из браузера в Storage. Нужна политика Storage: insert/update/delete для `authenticated`, read для всех (bucket public).

Секреты: `supabase secrets set PIXABAY_KEY=...`.

Pixabay просит кэшировать результаты поиска на 24 часа, а массовое добавление создаёт пачку запросов. Поэтому в `image-search` добавь кэш: таблица `image_search_cache (query text primary key, results jsonb, created_at timestamptz)`, запись старше 24 часов считается устаревшей. Таблица доступна только service role (RLS включена, политик нет).

## 6. Фронтенд

### Стек и библиотеки

- `react`, `react-dom`, `react-router-dom` (HashRouter)
- `@supabase/supabase-js`
- `@tanstack/react-query` — загрузка и кэш данных
- `tailwindcss`; компоненты можно брать из shadcn/ui
- `@dnd-kit/core` + `@dnd-kit/sortable` — порядок слов и упражнений
- `zod` — валидация форм и ответов API
- `vitest` + `@testing-library/react` — тесты логики упражнений

### Структура

```
/
├─ src/
│  ├─ main.tsx, App.tsx, router.tsx
│  ├─ lib/
│  │  ├─ supabase.ts          клиент из import.meta.env
│  │  ├─ dictionary.ts        dictionaryapi.dev + datamuse
│  │  ├─ translate.ts         подсказка перевода (MyMemory)
│  │  ├─ speech.ts            playTerm(term, audioUrl?) с фолбэком на speechSynthesis
│  │  ├─ recognition.ts       обёртка над SpeechRecognition: isSupported(), listen() → string[]
│  │  ├─ answers.ts           normalizeAnswer (зеркало SQL), levenshtein, isAlmost
│  │  ├─ bulkParse.ts         разбор текста массового добавления
│  │  ├─ pool.ts              запуск промисов с ограничением параллельности
│  │  ├─ shuffle.ts           seeded shuffle
│  │  └─ links.ts             buildStudentLink(token)
│  ├─ api/                    хуки react-query: lessons, items, exercises, students, assignments, results
│  ├─ features/
│  │  ├─ auth/                LoginPage, RequireAuth
│  │  ├─ lessons/             LessonsListPage, LessonEditorPage, LessonMetaForm
│  │  ├─ items/               ItemsList, ItemEditor, WordCheck, ImagePickerDialog, BulkAddDialog, BulkReviewTable
│  │  ├─ exercises/           ExercisesConfig
│  │  ├─ publish/             PublishPage (ученики, ссылки, копирование)
│  │  ├─ results/             ResultsPage (матрица), AssignmentDetailPage
│  │  └─ player/              StudentPlayer, ExerciseShell (очередь, прогресс-бар, отправка ответов),
│  │                           exercises/: Memorize, PickWord, PickImage, MatchPairs, PickTranslation,
│  │                           Spell, Dictation, Pronounce; Finish
│  └─ components/             общие UI-компоненты
├─ supabase/
│  ├─ migrations/0001_init.sql
│  ├─ functions/image-search/index.ts
│  ├─ functions/image-save/index.ts
│  └─ config.toml
├─ .github/workflows/deploy.yml
├─ .env.example               VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
└─ README.md
```

UI преподавателя и ученика — на русском, учебный контент — на английском. Тексты держи в одном файле `src/i18n/ru.ts`, чтобы потом можно было добавить другие языки.

### Экраны преподавателя

1. **Список уроков**: карточки (название, тема, число слов, статус, «N из M учеников завершили»), кнопки «Создать урок» и «Дублировать».
2. **Редактор урока**, три секции:
   - *Описание*: название (обязательно), тема, уровень, описание.
   - *Слова*: поле ввода и кнопка «Добавить». По добавлению:
     1. `WordCheck` вызывает dictionaryapi.dev и показывает транскрипцию, кнопку прослушивания и первое определение. При 404 — жёлтое предупреждение «Не найдено в словаре» и подсказки из Datamuse (клик подставляет слово).
     2. Сразу открывается `ImagePickerDialog` с запросом = слово. Сетка превью; поле для изменения запроса (для выражений полезно искать по смыслу, например «happy» вместо «over the moon»); кнопка «Ещё»; вкладка «Загрузить свою». Клик по превью → `image-save` → картинка в карточке слова.
     3. Поле «Перевод», предзаполненное подсказкой из MyMemory (помечено как «автоперевод», можно исправить).
     Список слов можно сортировать перетаскиванием, редактировать и удалять. Слово без картинки помечено, и опубликовать урок с ним нельзя.
   - *Массовое добавление* — кнопка «Добавить списком» рядом с полем ввода, открывает `BulkAddDialog`:
     1. **Ввод**: textarea, одна запись на строку. Поддерживаемые форматы строки: `apple`, `apple - яблоко`, `apple — яблоко`, `apple ; яблоко`, `apple<TAB>яблоко` (вставка двух колонок из Excel или Google Sheets). Разделитель ищется по первому вхождению ` - `, ` — `, `;` или табуляции; дефис внутри слова (`well-known`) разделителем не считается. Пустые строки и строки-дубликаты (с учётом `normalizeAnswer`, в том числе уже существующие в уроке) отбрасываются с пометкой. Ограничение — 50 строк за раз.
     2. **Обработка**: для каждой строки параллельно (не больше 3 одновременно, через `pool.ts`) — словарь, перевод (если не задан во вводе), `image-search`. Таблица `BulkReviewTable` заполняется по мере готовности, у каждой строки индикатор статуса.
     3. **Проверка** — строка таблицы: слово (редактируемое; при изменении поиск запускается заново), транскрипция с кнопкой прослушивания, предупреждение «не найдено в словаре» с подсказками Datamuse, перевод (редактируемый), лента из 6 превью картинок с **автоматически выбранной первой**, кнопка «Ещё» открывает полный `ImagePickerDialog`, кнопка удаления строки.
     4. **Сохранение**: «Добавить N слов» вставляет все строки в `lesson_items` одним запросом (в конец списка), затем вызывает `image-save` для выбранных картинок (тоже не больше 3 параллельно) с общим прогресс-баром. Ошибка на отдельной строке не отменяет остальные: такие строки остаются в таблице с кнопкой «Повторить».
   - *Упражнения*: список всех восьми упражнений с чекбоксами и порядком перетаскиванием. По умолчанию включены и идут в порядке: Запомни → Что на картинке? → Найди слово → Найди пары → Выбери перевод → Собери слово → Напиши на слух. «Произнеси» по умолчанию выключено (поддерживается не всеми браузерами), рядом подсказка об этом. Если требования к уроку не выполнены (см. таблицу в разделе 1), чекбокс неактивен, рядом причина («Заполните перевод у 2 слов»). Если слов меньше 4, вариантов в упражнениях с выбором показывается столько, сколько слов.
   - Настройки упражнений в `lesson_exercises.settings`: `pick_*` — `{options: 4}`; `match_pairs` — `{pairsPerRound: 6}`; `spell` — `{extraLetters: 0, showTranslation: true}`; `dictation` — `{showImageAfter: true}`; `pronounce` — `{maxTries: 3}`. В UI v1 достаточно значений по умолчанию; редактор настроек можно сделать сворачиваемым блоком «Дополнительно».
3. **Публикация**: поле «Имена учеников» (по одному на строку, можно выбрать из уже существующих учеников) → «Создать ссылки». Таблица: имя, ссылка, «Копировать», «Отозвать». Кнопка «Скопировать все» копирует текст вида `Имя — ссылка` построчно. При первой публикации статус урока становится `published`.
   - **Опубликованный урок нельзя менять по составу слов**: иначе результаты потеряют смысл. Правка опечаток и картинок разрешена; добавление и удаление слов — только через «Дублировать урок».
4. **Результаты**: матрица «ученики × упражнения». В ячейке статус (не открыл / в процессе / завершил) и % верных с первой попытки, цвет по порогам (≥90 зелёный, ≥60 жёлтый, ниже красный). Кнопка «Обновить» плюс автообновление раз в 30 секунд.
   Для «Найди пары» в ячейке вместо процента показывается «ходов на пару» (≤1.5 зелёный, ≤2.5 жёлтый). Для «Произнеси» при неподдерживаемом браузере — серая ячейка «браузер не поддерживает».
5. **Детально по ученику**: время открытия и завершения; по каждому упражнению — список слов: с первой попытки или нет, число ошибок, что именно отвечал ошибочно: в упражнениях с выбором «путает *apple* с *peach*», в текстовых — введённый или распознанный текст («писал *banan*, *bananna*»), пропуски в «Произнеси».

### Плеер ученика (`/#/s/:token`)

- Загружает `get_assignment`. При ошибке токена — экран «Ссылка недействительна, обратитесь к преподавателю».
- Приветствие: «Привет, {имя}! Урок: {title}», список упражнений с отметками о прохождении, кнопка «Начать» или «Продолжить» с первого незавершённого.
- Порядок слов в упражнении перемешивается детерминированно (seed = token + exercise), чтобы после перезагрузки страницы порядок сохранялся. Индекс текущего вопроса хранится в `localStorage` по ключу токена.
- **memorize**: по одной карточке; аудио проигрывается при показе и по кнопке; «Дальше». На каждую карточку `submit_answer` с `chosen_item_id = null`. В конце `complete_exercise`.
- Все упражнения, кроме memorize и match_pairs, используют общий `ExerciseShell`: очередь слов, прогресс-бар, отправка ответа, показ результата, кнопка «Дальше». **Слово, на котором ошиблись, возвращается в конец очереди**, пока не будет отвечено верно. Отчёт преподавателю считает первую попытку. Ответ показывается как верный или неверный по ответу сервера; если сеть недоступна — по локальной проверке, а ответ уходит в очередь отправки.
- **pick_word** («Что на картинке?»): картинка и 4 кнопки со словами (правильное + 3 случайных дистрактора из урока, перемешаны). После ответа: зелёная или красная подсветка, правильный вариант подсвечивается всегда, проигрывается слово, кнопка «Дальше».
- **pick_image** («Найди слово»): слово крупно, аудио автоматически и по кнопке, сетка 2×2 картинок. Механика та же.
- **pick_translation** («Выбери перевод»): английское слово крупно и аудио, 4 кнопки с русскими переводами. Механика та же.
- **match_pairs** («Найди пары»): слова делятся на раунды по `pairsPerRound` (по умолчанию 6; последний раунд не меньше 3 пар — остаток добавить к предыдущему). В раунде 2×N карточек рубашкой вверх: на половине картинки, на половине слова, перемешаны. Ученик открывает две карточки: если пара совпала — обе остаются открытыми, звучит слово; если нет — через 1 секунду закрываются. Каждая открытая пара «картинка + слово» — одна попытка: `item_id` = item картинки, `chosen_item_id` = item слова. Две картинки или два слова — не попытка, просто закрываются. Сетка адаптивная: 3 колонки на телефоне, 4 на десктопе.
- **spell** («Собери слово»): картинка, перевод (если `showTranslation`) и кнопка аудио. Под ними пустые ячейки по числу букв; пробелы, дефисы и апострофы показаны как фиксированные разделители, их собирать не нужно. Ниже — перемешанные плитки с буквами (плюс `extraLetters` лишних). Клик по плитке ставит букву в первую свободную ячейку, клик по заполненной ячейке возвращает букву обратно. Когда все ячейки заполнены — кнопка «Проверить». При ошибке показать правильное написание с подсветкой неверных позиций.
- **dictation** («Напиши на слух»): аудио проигрывается автоматически, кнопки «Прослушать ещё» и «Медленно» (`speechSynthesis` с `rate = 0.7`). Поле ввода с `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"`, «Проверить» по Enter. При ошибке показать правильный вариант; если `isAlmost` (расстояние Левенштейна 1 для слов от 5 символов) — текст «Почти! Одна опечатка», но ответ всё равно считается неверным и слово вернётся в очередь. После ответа показывается картинка (`showImageAfter`).
- **pronounce** («Произнеси»): при входе проверить `recognition.isSupported()`; если нет — экран «Ваш браузер не умеет распознавать речь, откройте ссылку в Chrome», кнопки «Пропустить упражнение» (`complete_exercise(..., p_unsupported => true)`) и «Скопировать ссылку». Если поддерживается: перед первым использованием — объяснение и запрос доступа к микрофону. Карточка: картинка, слово, кнопка «Послушать образец», большая кнопка микрофона. Распознавание `lang = 'en-US'`, `maxAlternatives = 5`, `interimResults = false`. Если хоть одна альтернатива совпадает с термином после `normalizeAnswer` — отправить её как `answer_text` (верно); иначе отправить лучшую альтернативу (неверно), показать «Я услышал: …». После `maxTries` неудачных попыток — кнопка «Пропустить слово» (`p_skipped = true`); пропущенное слово в очередь не возвращается. Отказ в доступе к микрофону — то же поведение, что и неподдерживаемый браузер.
- Финиш: «Отлично! Верно с первой попытки: X из Y» (для пар — «Нашёл все пары за N ходов»), кнопка «Повторить ошибки» (локальный режим без отправки на сервер) и «К списку упражнений».
- Интерфейс в первую очередь для телефона: крупные кнопки, картинки `object-cover` в квадратах, без горизонтального скролла.
- Предзагружать картинки следующего вопроса.

### Логика, которую нужно покрыть юнит-тестами

- `buildQuestion(items, targetId, optionsCount, rng)`: правильный вариант всегда есть, дубликатов нет, работает при числе слов меньше `optionsCount`.
- Очередь с возвратом ошибок: упражнение заканчивается только когда все слова отвечены верно.
- Seeded shuffle детерминирован.
- `playTerm`: при отсутствии `audioUrl` или ошибке воспроизведения вызывает `speechSynthesis`.
- `normalizeAnswer` даёт те же результаты, что SQL-функция `normalize_answer` (общий набор тестовых строк: регистр, пробелы, `’` против `'`, точка на конце).
- `levenshtein` и `isAlmost`.
- `buildLetterTiles(term, extraLetters, rng)`: множество букв в плитках совпадает с буквами термина (плюс лишние), разделители не попадают в плитки, для фраз сохраняются позиции разделителей.
- `splitIntoRounds(items, pairsPerRound)`: нет раунда меньше 3 пар (если всего слов не меньше 3), все слова распределены ровно один раз.
- `parseBulkInput(text, existingTerms)`: все форматы строк, `well-known` не разрезается, дубликаты и пустые строки отбрасываются, лимит в 50 строк.
- `pool(tasks, limit)`: одновременно выполняется не больше `limit` задач, порядок результатов совпадает с порядком задач.

## 7. Деплой

### Supabase

1. Создать проект на supabase.com (free).
2. `supabase link`, `supabase db push` (миграции), `supabase functions deploy image-search image-save`, `supabase secrets set PIXABAY_KEY=...`.
3. Создать bucket `lesson-images` (public) с политиками (можно в миграции).
4. Auth: создать пользователя-преподавателя, затем отключить signup. В URL Configuration добавить Site URL `https://<user>.github.io/<repo>/` и `http://localhost:5173`.
5. **Важно**: бесплатный проект Supabase ставится на паузу после 7 дней без активности. Добавить GitHub Action по расписанию (раз в 3 дня), который делает лёгкий запрос к REST API, или описать это в README.

### GitHub Pages

`.github/workflows/deploy.yml`: на push в `main` выполняются `npm ci` → `npm run test` → `npm run build` (с `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` из GitHub Actions Variables) → `actions/upload-pages-artifact` (`dist`) → `actions/deploy-pages`. В настройках репозитория: Pages → Source = GitHub Actions.

### README

Описание, скриншоты, пошаговая настройка Supabase и Pages, переменные окружения, как получить ключ Pixabay, атрибуция картинок (Openverse CC-BY требует указывать автора: показывай мелким текстом под картинкой в режиме «Запомни»).

## 8. Нефункциональные требования

- TypeScript strict, ESLint + Prettier.
- Никаких секретов в репозитории, кроме anon key через env. `.env` в `.gitignore`.
- Обработка ошибок сети: тосты для преподавателя; для ученика — повтор отправки ответа (очередь неотправленных ответов в `localStorage`, досылаются при восстановлении сети).
- Доступность: кнопки с `aria-label`, управление с клавиатуры в плеере (1–4 для выбора варианта, Enter — «Дальше» или «Проверить», в «Собери слово» можно печатать буквы с клавиатуры, Backspace убирает последнюю).
- Lighthouse mobile ≥ 90 для плеера.

## 9. Этапы реализации

Каждый этап — отдельный коммит или PR. Не переходи к следующему, пока не выполнены критерии.

| # | Этап | Критерии приёмки |
|---|---|---|
| 0 | Скелет: Vite + React + TS + Tailwind, HashRouter, ESLint, Vitest, workflow деплоя | Пустая страница открывается на GitHub Pages; `npm test` проходит в CI |
| 1 | Supabase: миграция (таблицы, RLS, RPC, view, bucket), клиент, логин преподавателя | Вход и выход работают; `RequireAuth` защищает страницы; anon-запрос к любой таблице возвращает пусто или ошибку |
| 2 | CRUD уроков и слов (пока без картинок и словаря) | Создание, редактирование, удаление, сортировка слов; данные переживают перезагрузку |
| 3 | Словарь, перевод и озвучка: `dictionary.ts`, `translate.ts`, `speech.ts`, `WordCheck` | Для «apple» видна транскрипция, играет аудио, предложен перевод «яблоко»; для «look forward to» — предупреждение и озвучка через speechSynthesis |
| 4 | Картинки: Edge Functions `image-search` (с кэшем) и `image-save`, `ImagePickerDialog`, загрузка своей картинки | Поиск выдаёт результаты из обоих источников; повторный запрос берётся из кэша; выбранная картинка лежит в Storage и отображается |
| 5 | Массовое добавление: `bulkParse.ts`, `pool.ts`, `BulkAddDialog`, `BulkReviewTable` | Вставка 10 строк в смешанных форматах (включая две колонки из таблицы) даёт 10 строк с транскрипцией, переводом и выбранной картинкой; после «Добавить» все слова с картинками в уроке; ошибка одной строки не ломает остальные |
| 6 | Конфигурация упражнений (все 8) | Набор и порядок сохраняются; неактивные чекбоксы с понятной причиной; «Произнеси» по умолчанию выключено |
| 7 | Публикация: ученики, назначения, ссылки, копирование, отзыв | Для 3 имён созданы 3 разные ссылки; отозванная ссылка показывает экран ошибки |
| 8 | Плеер, часть 1: `ExerciseShell`, очередь ошибок, отправка ответов с офлайн-очередью, восстановление прогресса; упражнения Запомни, Что на картинке?, Найди слово, Выбери перевод | Полное прохождение в мобильной эмуляции; после перезагрузки продолжается с того же места; в `attempts` корректные данные |
| 9 | Плеер, часть 2: Найди пары, Собери слово, Напиши на слух | Пары работают на 3, 7 и 13 словах (проверка раундов); фраза «a piece of cake» собирается с фиксированными пробелами; опечатка в диктанте даёт «Почти!» и возврат слова в очередь |
| 10 | Плеер, часть 3: Произнеси | В Chrome распознаётся «apple»; в Firefox показан экран «не поддерживается», пропуск засчитывается как завершение; отказ в микрофоне обрабатывается так же |
| 11 | Результаты: матрица и детальная страница для всех упражнений | Цифры совпадают с ручным подсчётом по `attempts`; для пар — «ходов на пару»; в детализации видны введённые и распознанные ответы |
| 12 | Полировка: пустые состояния, загрузки, ошибки, адаптив, README, keep-alive Action | Ручной сквозной сценарий из раздела 10 проходит без ошибок |

## 10. Сквозной сценарий для проверки

1. Преподаватель входит и создаёт урок «Fruits», тема «Food», уровень A1.
2. Добавляет apple вручную, затем через «Добавить списком» вставляет:
   ```
   banana - банан
   orange
   grape	виноград
   a piece of cake ; проще простого
   well-known
   apple
   ```
   Проверяет: `apple` отброшен как дубликат, `well-known` не разрезан, у `orange` подставлен автоперевод. Для «a piece of cake» меняет картинку через «Ещё» или загружает свою. Сохраняет.
3. Включает все восемь упражнений.
4. Публикует для «Маша» и «Петя», копирует ссылки.
5. В инкогнито в Chrome открывает ссылку Маши и проходит всё, специально ошибившись в «Что на картинке?», сделав опечатку в «Напиши на слух» и пропустив одно слово в «Произнеси».
6. Ссылку Пети открывает в Firefox, проходит «Запомни» и доходит до «Произнеси» — видит экран «не поддерживается».
7. На странице результатов: Маша — завершила, ошибки, введённые тексты и пропуск видны в детальном отчёте; Петя — в процессе, у «Произнеси» статус «браузер не поддерживает»; проценты и «ходов на пару» корректны.
