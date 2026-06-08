FROM node:20-alpine

# Нативные зависимости для bcrypt и sharp
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

# Копируем package.json первым для кэширования слоя
COPY package.json ./

# Устанавливаем зависимости
RUN npm install --omit=dev

# Копируем весь проект
COPY . .

# Railway подставит PORT автоматически
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "--max-old-space-size=512", "server/gateway/apiGateway.js"]
