# Чекпоинт анимаций тримапа

Точка «zoom-in и zoom-out с фазовой видимостью дочерних блоков» зафиксирована тегом в git. К ней можно вернуться без релиза в прод.

## Как вернуться к чекпоинту

```bash
# Посмотреть тег
git tag -l treemap-animations-checkpoint

# Вернуть рабочую копию к этому состоянию (жёстко)
git checkout treemap-animations-checkpoint

# Или создать ветку от чекпоинта и переключиться на неё
git checkout -b from-checkpoint treemap-animations-checkpoint
```

## Как перенести точку сохранения на текущий коммит

После коммита с нужным состоянием выполните:

```bash
# Переместить тег на текущую вершину (перезаписать старый чекпоинт)
git tag -f treemap-animations-checkpoint

# Либо создать второй тег, не трогая старый
git tag treemap-animations-checkpoint-v2
```

## Что в чекпоинте

- **Zoom-in:** плавный zoom камеры; в начале видны только цельные блоки, дочерние на всех блоках появляются в одной фазе (progress 0.4–0.62).
- **Zoom-out:** в начале дочерние блоки видны только у узла, с которого выходим (`zoomFromPath`); у остальных родителей дочерние скрыты. Дочерние текущего узла плавно исчезают в начале анимации (fade-out 0–0.4), затем камера доезжает до родителя.
- Контекст: `zoomFromPath` в `TreemapZoomContext` для различения «дети from» и «дети других».
- Константы `ZOOM_CHILDREN_BLOCK_FADEOUT_START` / `ZOOM_CHILDREN_BLOCK_FADEOUT_END` относились к старой реализации и в текущем коде отсутствуют.
- Схема root/zoomed без изменений: в покое — zoomed-лейаут (читаемый текст), во время зума — root-лейаут и камера.

**Текущее состояние (после правок):** исключение по aspect ratio для zoom убрано — всегда используются типы `drilldown` и `navigate-up` (варианты -fast удалены). Длительность exit синхронизирована с типом перехода; при `prefers-reduced-motion` анимация укорачивается.

**Чекпоинт `treemap-smooth-easing-checkpoint`:** состояние «до ускорения zoom и расширенного fade-in»: ease-in-out, text fade-out/fade-in, длительности drilldown 960 ms / navigate-up 900 ms, fade-in только у прямых детей focusedPath. Возврат: `git checkout treemap-smooth-easing-checkpoint`.

Дальнейшие правки (смягчение переключения layout в конце zoom-out и т.п.) делаются поверх этого состояния.
