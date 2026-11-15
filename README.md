# Hookahton

Личный список задач с регистрацией по email. У каждой задачи есть название, описание, время создания и отметка о выполнении.

## Запуск

Нужен Docker с Compose. Из корня репозитория:

```sh
docker compose up --build
```

Откройте http://localhost:8080. Порт можно задать в `.env`. Compose применяет миграцию при запуске и хранит данные PostgreSQL в Docker-томе. Конфигурация с HTTP и демонстрационными настройками базы предназначена для локального запуска.

- `backend/` — Node.js **22.x**, TypeScript, Prisma и PostgreSQL.
- `frontend/` — Node.js **22.x** для сборки, React, TypeScript, Vite и Tailwind CSS.

Проверка API в запущенном Docker:

```sh
docker compose exec backend npm test
```
