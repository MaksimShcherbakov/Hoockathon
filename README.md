# Todo List

Личный список задач с регистрацией и входом по email и паролю. Задачи можно создавать, редактировать, отмечать выполненными и удалять. Каждая задача содержит заголовок, описание и время создания.

## Запуск

Требуется Docker с Compose. Из корня репозитория:

```sh
docker compose up --build
```

Откройте [localhost:8000](http://localhost:8000) и зарегистрируйтесь. Миграции базы применяются при старте. Данные хранятся в Docker-томе.

Если порт занят, запустите `APP_PORT=8001 docker compose up --build` и откройте [localhost:8001](http://localhost:8001).

## Стек

- `backend/` — TypeScript, Node.js 24 LTS (от 24.11), PostgreSQL 16 и Prisma.
- `frontend/` — отдельный проект на React, TypeScript, Vite и Tailwind CSS.

Нужная версия Node.js уже есть в Docker-образах. Значения в `.env` предназначены для локальной базы.

## Проверка

На запущенном стеке:

```sh
docker compose exec -e TEST_BASE_URL=http://frontend backend npm test
```
