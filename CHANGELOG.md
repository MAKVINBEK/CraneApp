# Changelog

Все заметные изменения в этом сервисе должны быть задокументированы в этом файле.
Изменения в документе приводятся в порядке убывания даты: последние изменения размещаются в начале, более ранние — ниже.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## Не выпущено

## 2026-06-09

### Добавлено

- В `client/mobile/domain/entities/Message.js` добавлены поля и логика для статусов прочтения и времени редактирования сообщений.
- В `client/mobile/react/components/Chats/ChatThreadPage.jsx` добавлены индикаторы статуса сообщений и ленивая загрузка длинной истории чата.
- В `client/mobile/react/components/Settings/SettingsPage.jsx` добавлена загрузка изображения профиля.
- Добавлены endpoints для получения статусов прочтения, массового обновления статусов сообщений и получения профиля пользователя:
  `server/gateway/routes/chatReadRoutes.js`,
  `server/gateway/routes/messageReadRoutes.js` и
  `server/gateway/routes/userProfileRoutes.js`.

### Изменено

- Интерфейс настроек переработан в стиле glassmorphism.
- В `server/gateway/apiGateway.js` подключён Helmet со строгой Content Security Policy и CORS для доверенных origin.
- В `server/gateway/middleware/authMiddleware.js` усилена проверка токенов, добавлен rate limiting и улучшена обработка ошибок.

### Примечание

Изменения были подготовлены и отправлены в ветку `rem`. Обновление улучшает работу с сообщениями, пользовательский интерфейс и безопасность backend.

## 2026-04-18

### Добавлено

- Создан `client/mobile/app/config.js` с API endpoints, WebSocket URL для development/production и feature flags.
- В `package.json` добавлена зависимость `sharp@^0.33.2` для обработки изображений.
- В `.env.example` добавлены `ADMIN_PASSWORD` и примеры `ALLOWED_ORIGINS`.

### Исправлено

- Из `server/services/auth-service/authService.js`, `server/gateway/apiGateway.js` и `server/gateway/authMiddleware.js` удалены небезопасные fallback-значения JWT secret. При отсутствии `JWT_SECRET` сервер теперь сообщает об ошибке.
- В `database/seed.js` убран жёстко заданный пароль администратора. Пароль берётся из `ADMIN_PASSWORD`; fallback заменён на `ChangeMe123!`.
- В `client/mobile/utils/encryption.js` функции base64-кодирования переименованы в `encodeLocalStorage` и `decodeLocalStorage`. Legacy aliases сохранены для совместимости, добавлено предупреждение о том, что base64 не является шифрованием.
- В `server/gateway/apiGateway.js` wildcard CORS заменён на настройку через `ALLOWED_ORIGINS`. Значение по умолчанию — `http://localhost:3000`.
