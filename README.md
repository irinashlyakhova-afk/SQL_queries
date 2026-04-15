# AI SQL Architect

Веб-приложение на статическом фронтенде и **Netlify Functions**: по текстовому описанию задачи вызывается **Google Gemini**, возвращаются **ER-диаграмма (Mermaid `erDiagram`)**, **SQL** и краткое **пояснение** на русском.

## Возможности

- Ввод запроса на естественном языке, выбор модели Gemini и температуры сэмплирования.
- Проверка **кода доступа** на сервере (переменная окружения).
- Уведомления об ошибках и успехе, индикация загрузки на кнопке.
- Локальная разработка через **Netlify CLI** (единый порт для статики и функций).

## Стек

- HTML / CSS / JavaScript (модуль `public/app.js`)
- Mermaid 10 (CDN) для отрисовки диаграмм
- Netlify Functions (`netlify/functions/generate.js`)
- SDK `@google/generative-ai`

## Структура репозитория

| Путь | Назначение |
|------|------------|
| `public/` | Статика сайта (`index.html`, `app.js`, `styles.css`) |
| `netlify/functions/generate.js` | Серверная функция: Gemini, нормализация `mermaid_code` |
| `netlify.toml` | Сборка: `publish`, функции, `dev.framework` |
| `config.json` | Список моделей и температура по умолчанию (подключается в функции; для UI см. ниже) |

Чтобы интерфейс подтягивал те же настройки с `/config.json`, положите копию `config.json` в каталог `public/` или настройте копирование на этапе сборки.

## Переменные окружения

Создайте файл `.env` в корне (не коммитьте его в git). Образец — `.env.example`.

| Переменная | Описание |
|------------|----------|
| `GEMINI_API_KEY` | API-ключ Google AI Studio / Gemini |
| `ACCESS_CODE` | Секретный код, который пользователь вводит в форме |

В панели Netlify задайте те же переменные для production.

## Установка и локальный запуск

Требуется **Node.js** (LTS).

```bash
npm install
npm run dev
```

Откройте в браузере адрес, который выведет **Netlify Dev** (обычно `http://localhost:8888`). Статика и маршрут `/.netlify/functions/generate` работают на одном хосте.

Дополнительно (без полного `netlify dev`):

- `npm run dev:frontend` — только статика через `serve`
- `npm run dev:functions` — только локальные функции

## Деплой на Netlify

1. Подключите репозиторий к Netlify.
2. Команда сборки: `npm run build` (для текущего проекта — заглушка; публикуется содержимое `public/`).
3. Укажите `GEMINI_API_KEY` и `ACCESS_CODE` в настройках сайта.
4. Убедитесь, что в `netlify.toml` заданы `publish = "public"` и `functions = "netlify/functions"`.
