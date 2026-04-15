const { GoogleGenerativeAI } = require("@google/generative-ai");
const appConfig = require("../../config.json");

function parseModelJson(rawText) {
  const cleanedText = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const parsed = JSON.parse(cleanedText);
  const hasRequiredFields =
    typeof parsed.mermaid_code === "string" &&
    typeof parsed.sql_query === "string" &&
    typeof parsed.explanation === "string";

  if (!hasRequiredFields) {
    throw new Error("Ответ модели не содержит обязательные поля JSON.");
  }

  return parsed;
}

/**
 * Mermaid erDiagram не допускает запятые внутри объявления типа: decimal(10, 2) даёт
 * ошибку парсера (ожидается имя атрибута, получена запятая). Упрощаем типы в скобках.
 * Точные precision/scale остаются в sql_query.
 */
function sanitizeMermaidErCode(code) {
  if (typeof code !== "string") {
    return code;
  }
  return code
    .replace(/\b(decimal|numeric)\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "$1")
    .replace(/\b(double|float)\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "$1");
}

function buildSystemPrompt() {
  return [
    "Ты - архитектор БД и SQL-аналитик.",
    "Твоя задача: на основе пользовательского запроса предложить структуру БД и SQL.",
    "Верни ТОЛЬКО валидный JSON без markdown, комментариев и дополнительного текста.",
    "Структура JSON строго такая:",
    "{",
    '  "mermaid_code": "ER-диаграмма в синтаксисе Mermaid (erDiagram ...)",',
    '  "sql_query": "Готовый SQL-запрос",',
    '  "explanation": "Краткое объяснение на русском языке"',
    "}",
    "Требования:",
    "1) mermaid_code должен начинаться с erDiagram.",
    "2) В блоках сущностей { ... } каждый атрибут — ОТДЕЛЬНОЙ строкой: СНАЧАЛА тип, ПОТОМ имя поля (латиница snake_case).",
    "   Образец блока (переносы строк обязательны между атрибутами):",
    "   ORDER {",
    "     string order_id",
    "     date order_date",
    "     decimal total_amount",
    "   }",
    "   Запрещено: SQL-стиль «имя_поля тип(10, 2)», несколько полей в одной строке, скобки и запятые в типах (decimal(10,2) ломает парсер Mermaid).",
    "   Для диаграммы используй простые типы без параметров: string, int, bigint, float, decimal, date, datetime, bool.",
    "   Точные типы с длиной/precision укажи ТОЛЬКО в sql_query (CREATE TABLE и т.д.).",
    "3) sql_query должен быть синтаксически корректным SQL.",
    "4) explanation - коротко и понятно на русском.",
    "5) Никакого текста вне JSON."
  ].join("\n");
}

exports.handler = async (event) => {
  // ДОБАВЛЕНЫ ЗАГОЛОВКИ CORS ДЛЯ РАБОТЫ МЕЖДУ ПОРТАМИ 8888 И 8080
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*", // Разрешаем запросы ототовсюду
    "Access-Control-Allow-Headers": "Content-Type, x-access-code",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };

  try {
    // Обработка предварительного запроса браузера (Preflight request)
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: "Method Not Allowed" })
      };
    }

    if (!process.env.GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Не задан GEMINI_API_KEY." })
      };
    }

    const payload = JSON.parse(event.body || "{}");
    const requestHeaders = event.headers || {};
    const accessCodeFromHeader = String(requestHeaders["x-access-code"] || "").trim();
    const accessCodeFromBody = String(payload.accessCode || "").trim();
    const providedAccessCode = accessCodeFromHeader || accessCodeFromBody;
    const expectedAccessCode = String(process.env.ACCESS_CODE || "").trim();
    const prompt = String(payload.prompt || "").trim();
    const model = String(payload.model || appConfig.models[0]).trim();
    const temperature = Number.parseFloat(payload.temperature ?? appConfig.defaultTemperature);

    if (!providedAccessCode || providedAccessCode !== expectedAccessCode) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Unauthorized: неверный код доступа." })
      };
    }

    if (!prompt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Поле prompt обязательно." })
      };
    }

    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const generativeModel = ai.getGenerativeModel({
      model,
      systemInstruction: buildSystemPrompt(),
      generationConfig: {
        temperature: Number.isFinite(temperature) ? temperature : appConfig.defaultTemperature
      }
    });

    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    const responseText = result.response.text();
    const parsed = parseModelJson(responseText);
    if (typeof parsed.mermaid_code === "string") {
      parsed.mermaid_code = sanitizeMermaidErCode(parsed.mermaid_code);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(parsed)
    };
  } catch (error) {
    console.error("Ошибка Gemini:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Ошибка генерации.",
        details: error.message
      })
    };
  }
};