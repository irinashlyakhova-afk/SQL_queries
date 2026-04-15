const dom = {
  accessCodeInput: document.getElementById("access-code"),
  promptInput: document.getElementById("promptInput"),
  temperatureRange: document.getElementById("temperatureRange"),
  temperatureValue: document.getElementById("temperatureValue"),
  modelSelect: document.getElementById("modelSelect"),
  generateBtn: document.getElementById("generateBtn"),
  diagramContainer: document.getElementById("diagramContainer"),
  sqlOutput: document.getElementById("sqlOutput"),
  explanationOutput: document.getElementById("explanationOutput"),
  notification: document.getElementById("notification"),
  notificationText: document.querySelector("#notification .notification__text")
};

const DEFAULT_GENERATE_LABEL = "Сгенерировать";

let appConfig = {
  defaultTemperature: 0.3,
  models: ["gemini-2.5-flash", "gemini-2.5-pro"]
};

let notificationHideTimer = null;

/**
 * Скрывает всплывающее уведомление.
 */
function hideNotification() {
  if (notificationHideTimer) {
    clearTimeout(notificationHideTimer);
    notificationHideTimer = null;
  }
  dom.notification.classList.add("notification--hidden");
  dom.notification.setAttribute("aria-hidden", "true");
}

/**
 * Показывает всплывающее уведомление снизу справа.
 * @param {string} message - Текст сообщения.
 * @param {"error"|"success"} type - Тип: ошибка (красный) или успех (зелёный).
 */
function showNotification(message, type) {
  if (notificationHideTimer) {
    clearTimeout(notificationHideTimer);
    notificationHideTimer = null;
  }

  dom.notificationText.textContent = message;
  dom.notification.classList.remove(
    "notification--hidden",
    "notification--error",
    "notification--success"
  );
  dom.notification.classList.add(
    type === "success" ? "notification--success" : "notification--error"
  );
  dom.notification.setAttribute("aria-hidden", "false");

  const autoHideMs = type === "success" ? 3500 : 6000;
  notificationHideTimer = setTimeout(() => {
    hideNotification();
  }, autoHideMs);
}

/**
 * Загружает конфигурацию приложения из config.json.
 * Наличие отдельного конфига позволяет менять список моделей и температуру
 * без редактирования JavaScript-кода интерфейса.
 * Если файл недоступен, используется безопасный запасной конфиг по умолчанию.
 */
async function loadConfig() {
  try {
    const response = await fetch("/config.json");
    if (!response.ok) {
      throw new Error("Не удалось получить config.json");
    }
    appConfig = await response.json();
  } catch (error) {
    console.warn("Используется резервная конфигурация:", error.message);
  }
}

/**
 * Заполняет выпадающий список доступных моделей из конфигурации.
 * Функция также выставляет дефолтное значение температуры и
 * синхронизирует визуальный индикатор рядом со слайдером.
 */
function initializeControls() {
  dom.modelSelect.innerHTML = "";

  appConfig.models.forEach((modelName) => {
    const option = document.createElement("option");
    option.value = modelName;
    option.textContent = modelName;
    dom.modelSelect.appendChild(option);
  });

  dom.temperatureRange.min = "0.0";
  dom.temperatureRange.max = "1.0";
  dom.temperatureRange.step = "0.1";
  dom.temperatureRange.value = Number(appConfig.defaultTemperature).toFixed(1);
  updateTemperatureLabel(dom.temperatureRange.value);
}

/**
 * Обновляет текстовый индикатор температуры рядом со слайдером.
 * @param {number|string} value - Текущее значение слайдера температуры.
 */
function updateTemperatureLabel(value) {
  dom.temperatureValue.textContent = parseFloat(value).toFixed(1);
}

/**
 * Состояние загрузки кнопки: блокировка и текст «Генерирую...».
 * @param {boolean} isLoading - Флаг активного запроса.
 */
function setLoadingState(isLoading) {
  dom.generateBtn.disabled = isLoading;
  dom.generateBtn.textContent = isLoading ? "Генерирую..." : DEFAULT_GENERATE_LABEL;
  dom.generateBtn.classList.toggle("btn-premium--loading", isLoading);
}

/**
 * Убирает из erDiagram конструкции вида decimal(10, 2): запятая в скобках ломает парсер Mermaid.
 * Совпадает с логикой в netlify/functions/generate.js.
 */
function sanitizeMermaidErCode(code) {
  if (typeof code !== "string") {
    return code;
  }
  return code
    .replace(/\b(decimal|numeric)\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "$1")
    .replace(/\b(double|float)\s*\(\s*\d+\s*,\s*\d+\s*\)/gi, "$1");
}

/**
 * Выполняет рендер Mermaid-диаграммы в контейнере результата.
 * @param {string} mermaidCode - Mermaid-код ER-диаграммы.
 */
async function renderDiagram(mermaidCode) {
  const chartId = `erDiagram-${Date.now()}`;
  const safeCode = sanitizeMermaidErCode(mermaidCode);
  dom.diagramContainer.innerHTML = `<div class="mermaid" id="${chartId}">${safeCode}</div>`;
  await mermaid.run({
    querySelector: `#${chartId}`
  });
}

/**
 * Парсит тело ошибки ответа и возвращает строку для пользователя.
 * @param {string} rawText - Сырой текст ответа.
 */
function parseServerErrorMessage(rawText) {
  if (!rawText || !rawText.trim()) {
    return "Ошибка сервера";
  }
  try {
    const body = JSON.parse(rawText);
    const fromBody = body.details ?? body.error;
    if (fromBody != null && String(fromBody).trim()) {
      return String(fromBody);
    }
  } catch {
    /* не JSON */
  }
  return rawText.trim();
}

/**
 * Вызов Netlify Function; при ошибках выбрасывает Error с понятным message.
 * @returns {Promise<{mermaid_code: string, sql_query: string, explanation: string}>}
 */
async function requestGeneration(prompt, accessCode, temperature, model) {
  let response;
  try {
    response = await fetch("/.netlify/functions/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-access-code": accessCode
      },
      body: JSON.stringify({
        accessCode,
        prompt,
        temperature,
        model
      })
    });
  } catch {
    throw new Error("Ошибка соединения с сервером");
  }

  if (response.status === 401) {
    throw new Error("Неверный код доступа");
  }

  if (response.ok) {
    return response.json();
  }

  const errorText = await response.text();

  if (response.status === 400 || response.status === 500) {
    throw new Error(parseServerErrorMessage(errorText));
  }

  throw new Error(parseServerErrorMessage(errorText));
}

/**
 * Обрабатывает клик по кнопке «Сгенерировать».
 */
async function handleGenerate() {
  const accessCode = dom.accessCodeInput.value.trim();
  const prompt = dom.promptInput.value.trim();
  const temperature = parseFloat(dom.temperatureRange.value);
  const model = dom.modelSelect.value;

  if (!accessCode || !prompt) {
    showNotification(
      "Пожалуйста, заполните все поля и введите код доступа",
      "error"
    );
    return;
  }

  try {
    setLoadingState(true);
    const result = await requestGeneration(prompt, accessCode, temperature, model);

    hideNotification();
    showNotification("Результат успешно сгенерирован", "success");

    await renderDiagram(result.mermaid_code);
    dom.sqlOutput.textContent = result.sql_query;
    dom.explanationOutput.textContent = result.explanation;
  } catch (error) {
    showNotification(error.message || "Ошибка", "error");
    dom.diagramContainer.innerHTML =
      "<p class='text-red-600'>Не удалось сгенерировать диаграмму.</p>";
    dom.sqlOutput.textContent = "-- Ошибка генерации SQL";
    dom.explanationOutput.textContent = "";
  } finally {
    setLoadingState(false);
  }
}

/**
 * Инициализация приложения.
 */
async function bootstrap() {
  mermaid.initialize({
    startOnLoad: false,
    theme: "default"
  });

  await loadConfig();
  initializeControls();

  dom.temperatureRange.addEventListener("input", (event) => {
    updateTemperatureLabel(event.target.value);
  });

  dom.generateBtn.addEventListener("click", handleGenerate);
}

bootstrap();
