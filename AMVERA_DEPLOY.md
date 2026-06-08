# Деплой CraneApp на Amvera

## 1. Регистрация и создание проекта

1. Зайди на [amvera.ru](https://amvera.ru) → зарегистрируйся
2. Нажми **«Создать проект»** → тип: **«Приложение»**
3. Название: `craneapp` (или любое другое)
4. Окружение: выбери **«Dockerfile»** (проект уже содержит `Dockerfile`)
5. Создай проект — Amvera выдаст тебе git-адрес вида:
   ```
   https://git.amvera.ru/<username>/craneapp
   ```

## 2. Добавление PostgreSQL

1. В панели Amvera открой проект → вкладка **«Сервисы»** или **«Базы данных»**
2. Нажми **«Добавить сервис»** → **PostgreSQL**
3. После создания скопируй строку подключения — она выглядит так:
   ```
   postgresql://user:password@host:5432/dbname
   ```
   Это и будет значение переменной `DATABASE_URL`.

   > Альтернатива: можно оставить Railway PostgreSQL и просто перенести только само приложение на Amvera.

## 3. Переменные окружения

В панели Amvera → твой проект → вкладка **«Переменные»** — добавь все переменные:

| Переменная | Значение | Описание |
|---|---|---|
| `NODE_ENV` | `production` | Режим запуска |
| `PORT` | `3000` | Порт (Amvera проставит сам, но лучше указать) |
| `DATABASE_URL` | `postgresql://...` | Строка подключения к PostgreSQL |
| `JWT_SECRET` | случайная строка (≥32 символа) | Секрет для JWT-токенов |
| `ALLOWED_ORIGINS` | `https://craneapp.amvera.io` | Разрешённые домены для CORS (твой домен на Amvera) |
| `METERED_API_KEY` | твой ключ Metered | TURN-сервер для звонков |
| `METERED_DOMAIN` | твой домен Metered | TURN-сервер для звонков |

Сгенерировать JWT_SECRET можно командой в терминале:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 4. Подключение git-репозитория

В терминале проекта (папка `c:\craneapp`) добавь remote Amvera:

```bash
git remote add amvera https://git.amvera.ru/<твой_логин>/craneapp
```

Убедись, что все изменения закоммичены:
```bash
git status
git add -A
git commit -m "feat: add amvera.yaml for deployment"
```

## 5. Деплой

Запушь ветку `Calls` (или `main`) на Amvera:

```bash
# Ветка Calls (текущая)
git push amvera Calls:main

# Или если деплоишь из main
git push amvera main
```

Amvera спросит логин/пароль — введи данные от аккаунта amvera.ru.

После пуша Amvera автоматически:
1. Найдёт `Dockerfile` (т.к. в `amvera.yaml` указан `environment: dockerfile`)
2. Соберёт образ
3. Запустит контейнер
4. Назначит URL вида `https://craneapp.amvera.io`

## 6. Проверка деплоя

Открой логи в панели Amvera. Должно появиться:
```
✅ Database connected: ...
✅ Database tables initialized
🚀 CraneApp server started on port 3000
```

Проверь health endpoint:
```
https://craneapp.amvera.io/api/v2/health
```
Должен вернуть `{ "status": "ok" }`.

## 7. Обновления

Каждый раз, когда нужно задеплоить новую версию:

```bash
git add -A
git commit -m "описание изменений"
git push amvera Calls:main
```

Amvera пересоберёт и перезапустит приложение автоматически.

## Важные замечания

- **`uploads/`** — папка для загружаемых файлов. В `amvera.yaml` указан `persistenceMount: /app/uploads`, поэтому файлы сохраняются между деплоями.
- **HTTPS** — Amvera выдаёт SSL-сертификат автоматически для домена `*.amvera.io`.
- **WebSocket** — работает на том же порту, Amvera поддерживает WS-соединения из коробки.
- **Свой домен** — в панели Amvera → «Домены» можно привязать собственный домен и обновить `ALLOWED_ORIGINS`.
