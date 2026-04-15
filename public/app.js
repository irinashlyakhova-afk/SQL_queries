const dom = {
  accessCodeInput: document.getElementById("access-code"),
  promptInput: document.getElementById("promptInput"),
  temperatureRange: document.getElementById("temperatureRange"),
  temperatureValue: document.getElementById("temperatureValue"),
  modelSelect: document.getElementById("modelSelect"),
  generateBtn: document.getElementById("generateBtn"),
  diagramContainer: document.getElementById("diagramContainer"),
  sqlOutput: document.getElementById("sqlOutput"),
  explanationOutput: document.getElementById("explanationOutput")
};

let appConfig = {
  defaultTemperature: 0.3,
  models: ["gemini-2.5-flash", "gemini-2.5-pro"]
};

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
 * Функция вызывается при инициализации и при каждом движении ползунка,
 * чтобы пользователь мгновенно видел фактическое значение генерации.
 * @param {number|string} value - Текущее значение слайдера температуры.
 */
function updateTemperatureLabel(value) {
  dom.temperatureValue.textContent = parseFloat(value).toFixed(1);
}

/**
 * Переключает визуальное состояние загрузки для кнопки и бейджа.
 * Это помогает пользователю понять, что генерация уже выполняется
 * и предотвращает повторные нажатия на кнопку в процессе запроса.
 * @param {boolean} isLoading - Флаг активного запроса.
 */
function setLoadingState(isLoading) {
  dom.generateBtn.disabled = isLoading;
  dom.generateBtn.textContent = isLoading ? "Генерация..." : "Сгенерировать";
}

/**
 * Выполняет рендер Mermaid-диаграммы в контейнере результата.
 * Перед рендером очищает предыдущую диаграмму и создает уникальный id,
 * чтобы Mermaid корректно инициализировал новый SVG.
 * @param {string} mermaidCode - Mermaid-код ER-диаграммы.
 */
async function renderDiagram(mermaidCode) {
  const chartId = `erDiagram-${Date.now()}`;
  dom.diagramContainer.innerHTML = `<div class="mermaid" id="${chartId}">${mermaidCode}</div>`;
  await mermaid.run({
    querySelector: `#${chartId}`
  });
}

/**
 * Выполняет вызов серверной Netlify Function и возвращает JSON-результат.
 * На вход принимает текст запроса, температуру и выбранную модель,
 * а затем отправляет их в backend для генерации структуры БД и SQL.
 * @param {string} prompt - Пользовательский текстовый запрос.
 * @param {string} accessCode - Код доступа для проверки на backend.
 * @param {number} temperature - Значение температуры генерации.
 * @param {string} model - Идентификатор выбранной Gemini-модели.
 * @returns {Promise<{mermaid_code: string, sql_query: string, explanation: string}>}
 */
async function requestGeneration(prompt, accessCode, temperature, model) {
  const response = await fetch("/.netlify/functions/generate", {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Ошибка вызова backend-функции");
  }

  return response.json();
}

/**
 * Обрабатывает клик по кнопке "Сгенерировать":
 * валидирует ввод, отправляет запрос к backend,
 * обновляет диаграмму, SQL и текстовое пояснение.
 * При ошибках показывает понятное сообщение в интерфейсе.
 */
async function handleGenerate() {
  const accessCode = dom.accessCodeInput.value.trim();
  const prompt = dom.promptInput.value.trim();
  const temperature = parseFloat(dom.temperatureRange.value);
  const model = dom.modelSelect.value;

  if (!accessCode) {
    dom.explanationOutput.textContent = "Введите код доступа перед генерацией.";
    return;
  }

  if (!prompt) {
    dom.explanationOutput.textContent = "Введите текстовый запрос перед генерацией.";
    return;
  }

  try {
    setLoadingState(true);
    const result = await requestGeneration(prompt, accessCode, temperature, model);
    await renderDiagram(result.mermaid_code);
    dom.sqlOutput.textContent = result.sql_query;
    dom.explanationOutput.textContent = result.explanation;
  } catch (error) {
    dom.diagramContainer.innerHTML = "<p class='text-red-300'>Не удалось отрисовать диаграмму.</p>";
    dom.sqlOutput.textContent = "-- Ошибка генерации SQL";
    dom.explanationOutput.textContent = `Причина: ${error.message}`;
  } finally {
    setLoadingState(false);
  }
}

/**
 * Инициализирует приложение на странице:
 * включает Mermaid, загружает конфиг, настраивает контролы
 * и подписывает UI-обработчики на пользовательские действия.
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
