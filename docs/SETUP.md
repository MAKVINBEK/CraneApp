# Как запустить CraneApp

## Требования

- Node.js 18+
- Docker Desktop
- Git

Для разработки backend v2 без Docker также нужны Go и Rust/Cargo, но основной
локальный запуск ниже рассчитан на Docker Compose.

## Шаги

1. Клонируйте репозиторий:

   ```bash
   git clone https://github.com/mikle89609199136-ui/CraneApp.git
   ```

2. Перейдите в директорию проекта:

   ```bash
   cd CraneApp
   ```

3. Установите зависимости:

   ```bash
   npm install
   ```

4. Создайте локальный файл окружения:

   ```bash
   cp .env.example .env
   ```

5. Заполните `.env` значениями из `.env.example`.

   Для локального Docker Compose обычно достаточно проверить эти переменные:

   ```env
   JWT_SECRET=change-me-local-jwt-secret
   CRYPTO_SIGNING_SECRET=change-me-local-signing-secret-32chars
   CRYPTO_ENCRYPTION_SECRET=change-me-local-encryption-secret-32
   ALLOWED_ORIGINS=http://localhost:8080,http://localhost:3000,http://localhost:5173
   ```

   `CRYPTO_SIGNING_SECRET` и `CRYPTO_ENCRYPTION_SECRET` должны быть не короче
   32 символов.

6. Запустите проект:

   ```bash
   docker compose -f infrastructure/docker/docker-compose.v2.yml up --build
   ```

7. Откройте приложение:

   ```text
   http://localhost:8080
   ```

## Проверки

Go-тесты backend v2:

```bash
cd backend-v2
GOCACHE=/tmp/crane-go-cache go test ./...
```

React-сборка:

```bash
npm run build:react
```

## Troubleshooting

### Docker daemon не запущен

Ошибка:

```text
failed to connect to the docker API
```

Решение: запустите Docker Desktop и повторите команду `docker compose`.

### Порт уже занят

Ошибка:

```text
bind: address already in use
```

Решение: остановите процесс на занятом порту или измените порт в compose/env.
Чаще всего используются `8080`, `5433`, `6380`, `5005`, `9000`, `9001`.

### Не заполнены crypto secrets

Ошибка:

```text
CRYPTO_SIGNING_SECRET is required
```

Решение: заполните `CRYPTO_SIGNING_SECRET` и `CRYPTO_ENCRYPTION_SECRET` в `.env`.
Оба значения должны быть не короче 32 символов.

### `npm install` падает из-за `.npmrc`

Ошибка:

```text
config prefix cannot be changed from project config
```

Решение: убедитесь, что в project `.npmrc` нет строки `prefix=...`. Такой prefix
нужно хранить в пользовательском npm config, а не в репозитории.

### Go cache недоступен

Ошибка:

```text
go: failed to trim cache
```

Решение: задайте cache-директорию внутри временной папки:

```bash
GOCACHE=/tmp/crane-go-cache go test ./...
```

### Frontend открылся, но API не отвечает

Проверьте, что Docker Compose stack поднялся без ошибок и gateway доступен:

```bash
curl -I http://localhost:8080
```

Если запущен только Vite dev server, frontend будет доступен, но API-запросы
будут падать без backend gateway.

