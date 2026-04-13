# Предварительный расчёт Google Sheets в быстром сценарии (скрыто в UI)

В коде быстрого сценария (`AdminQuickFlow`) реализован дополнительный шаг после «Проверка перед завершением»: переход к **предварительному расчёту** в Google Таблице (лист IN, опрос OUT, без записи в БД до отдельного действия). Логика Edge Functions и пропсы `enableSheetsPreviewStep`, `runSheetsPreviewCalculation`, `restoreSheetsInFromDatabase`, `applySheetCostsFromOut` сохранены.

**Сейчас этот вход в интерфейсе не показывается:** в `src/components/admin/AdminQuickFlow.tsx` задано `SHOW_GOOGLE_SHEETS_PREVIEW_IN_QUICK_FLOW_VALIDATION = false`. Чтобы снова показать блок с текстом про один администратора и кнопку «Далее: предварительный расчёт», установите константу в `true` (при этом должны оставаться включёнными `enableSheetsPreviewStep` и переданный `runSheetsPreviewCalculation` с родителя).

Контракт API и поведение листов IN/OUT описаны в [`GOOGLE_SHEETS_IN_OUT.md`](GOOGLE_SHEETS_IN_OUT.md), раздел про предпросмотр и вариант 2.
