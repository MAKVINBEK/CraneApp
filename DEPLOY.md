# Railway Deploy Guide

## Переменные окружения (обязательные)

Добавь в Railway → Variables:

```
NODE_ENV=production
JWT_SECRET=<случайная строка 64+ символа>
DATABASE_URL=<автоматически от Railway PostgreSQL>
```

## Опциональные переменные

```
PORT=3000                    # Railway подставит сам
BCRYPT_ROUNDS=12
```

## Шаги деплоя

1. Убедись что в Railway добавлен сервис PostgreSQL
2. DATABASE_URL подтянется автоматически
3. Добавь JWT_SECRET (обязательно!)
4. `railway up` или push в GitHub (если настроен auto-deploy)

## Проверка после деплоя

- `GET /api/health` — должен вернуть `{"status":"healthy",...}`
- `GET /api/v2/health` — то же самое
