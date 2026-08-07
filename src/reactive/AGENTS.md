# Reactive Layer

## Назначение

Слой содержит framework-примитивы реактивности, скрывающие конкретную
реализацию наблюдаемости от feature-кода и view.

## Структура

- `entity/` — декларация реактивной сущности и entity collection, identity
  metadata и инструментирование, автоматическая weak-registration экземпляров
  и коллекций, `updateEntity`, `insertEntity` и `removeEntity`.
- `react/` — React bridges `reactive` и `Reactive`, скрывающие MobX observer
  от view. `Reactive` принимает render callback, чтобы observable-поля читались
  внутри точечной реактивной границы, а не в родительском компоненте.

## Границы

- Доменная сущность может зависеть только от публичной декларации `@Entity`.
- MobX остаётся внутренней реализацией `@tiyn/app` и не должен требоваться в
  entity-классах.
- Транспорт обновлений и маршрутизация сообщений не принадлежат reactive-слою.
- Identity не вычисляется во время конструирования: гидратация сущности может
  завершиться после вызова конструктора.
- Registration создаётся constructor wrapper автоматически и привязывает
  instance к constructor + identity после заполнения identity-поля.
- Registry хранит только `WeakRef` и не удерживает entity в памяти.
- `updateEntity` получает entity constructor и данные; вызывающий код не ищет и
  не передаёт реализованные instances.
- `insertEntity` и `removeEntity` получают entity constructor и изменяют живые
  зарегистрированные коллекции; вызывающий код не передаёт loader data.
- `scopeBy` декларативно ограничивает вставку коллекциями с совпадающим scalar
  полем либо связывает разные поля через `{ owner, entity }`.
- Коллекционный registry хранит только `WeakRef` и не удерживает отсутствовавшие
  до регистрации updates.
- Слой не является backend cache: update до появления instance не сохраняется.

## Проверка

- Запустить тесты `src/reactive/entity`.
- Запустить тесты `src/reactive/react`.
- При изменении публичного API запустить `yarn build:management_panel_ui`.
