# Занятие 2. Application И Lifecycle

- Статус документа: current
- Формат: 45–60 минут
- Уже известно: `Application → Router → Route → Module → View`
- Новые понятия: `compose`, `initialize`, `createView`, UI slots, initializer,
  `dispose`

## Результат Занятия

Слушатель понимает, почему bootstrap — это lifecycle, а не только `render`, и
может выбрать один из двух корректных режимов старта: дождаться initialization
до render либо показать splash во время initialization.

---

## Слайд 1. Статический Экран Уже Недостаточен

### На Экране

```text
До первого рабочего экрана нужно:

- получить runtime config
- восстановить session
- подготовить application services
- уметь показать startup failure
```

### Заметки Ведущего

Начните с проблемы. В первом занятии `initialize()` почти ничего не делал.
Теперь приложение получает первую startup-задачу, поэтому порядок lifecycle
становится наблюдаемым.

---

## Слайд 2. Application — Владелец Корневого Runtime

### На Экране

```text
new Application
-> compose()       синхронная композиция
-> initialize()    асинхронный startup
-> createView()    React adapter
-> dispose()       остановка root runtime
```

### Заметки Ведущего

`Application` владеет root DI scope, router view, application initializers,
session runtime state, application store, global frame layer и cleanup. Он не
должен знать controller каждого feature screen.

Подчеркните: `createView()` не создаёт новое приложение. Он возвращает React
component, отражающий состояние уже существующего application runtime.

---

## Слайд 3. Два Корректных Bootstrap-Режима

### На Экране

```tsx
// Ничего не показываем до ready
app.compose();
await app.initialize();
const AppView = app.createView();
root.render(<AppView />);
```

```tsx
// Показываем splash во время startup
app.compose();
const AppView = app.createView();
root.render(<AppView />);
void app.initialize().catch(() => {});
```

### Заметки Ведущего

Выбор определяется UX, а не «правильностью» framework. Для учебного приложения
используйте второй вариант: он позволяет увидеть переход lifecycle.

### Контрольная Точка

Почему нельзя вызвать `createView()` до `compose()`? Ожидаемый ответ: view должен
подключаться к уже скомпонованному application runtime.

---

## Слайд 4. UI Slots Показывают Состояние Application

### На Экране

```tsx
app.components({
  splash: <p>Запускаем приложение…</p>,
  failed: <p>Startup завершился ошибкой</p>,
  exception: <p>Произошла runtime-ошибка</p>,
  fallback: <p>Открываем экран…</p>,
  forbidden: <p>Нет доступа</p>,
  notFound: <p>Страница не найдена</p>,
});
```

### Заметки Ведущего

Разделите application и route состояния. `splash` и startup `failed`
принадлежат application lifecycle; если `failed` не задан, используется
`exception`. `fallback`, `forbidden` и `notFound` используются router
adapter-ом; их route-level переопределения появятся позже.

---

## Слайд 5. Первый Initializer

### На Экране

```ts
@Initializer()
export class TrainingDelayInitializer
  extends ApplicationInitializerInterface {
  async execute(
    context: ApplicationInitializerContextInterface,
  ): Promise<void> {
    await wait(800, context.signal);
  }
}
```

```ts
app.initializers([TrainingDelayInitializer]);
```

### Заметки Ведущего

Initializer — DI-managed startup participant. На этом занятии зависимостей ещё
нет: цель — увидеть splash и завершение initialization. `context.signal` нужно
передавать в async operation, чтобы `dispose()` мог её остановить.

### Live Coding

Добавьте задержку, обновите страницу и покажите splash. Затем временно бросьте
ошибку и покажите startup `failed`. После демонстрации верните успешный код.

---

## Слайд 6. Последовательно И Параллельно

### На Экране

```ts
app.initializers([
  ResolveConfigInitializer,
  Initializers.parallel([
    ResolveSessionInitializer,
    ResolveFeatureFlagsInitializer,
  ]),
]);
```

### Заметки Ведущего

Внешний массив — последовательные стадии. `Initializers.parallel(...)` — одна
blocking stage, внутри которой задачи выполняются параллельно. Не превращайте
все initializers в один Promise.all: config может быть prerequisite для session
и feature flags.

---

## Слайд 7. Cleanup Является Частью Контракта

### На Экране

```ts
execute(context): void {
  context.disposables.add(subscribeToGlobalSource());
}
```

```text
dispose application
-> abort active initializers
-> dispose registered resources
-> dispose root runtime
```

### Заметки Ведущего

Если initializer создаёт application-level subscription, он обязан передать
disposable владельцу lifecycle. Пока не вводите event bus — используйте
условную функцию и закрепите сам принцип ownership.

---

## Слайд 8. Практика И Проверка

### Задание

1. Добавить `splash` и startup `exception`.
2. Создать initializer с задержкой и `AbortSignal`.
3. Показать оба bootstrap-режима.
4. Объяснить, какой режим выбран для продукта и почему.

### Контрольные Вопросы

- Чем `compose` отличается от `initialize`?
- Кто владеет startup subscription?
- Что должен сделать async initializer при dispose?
- Почему feature loader не следует помещать в application initializer?

### Мост К Следующей Теме

Приложение умеет стартовать, но знает только URL `/`. Следующая задача — два
экрана, переход между ними и URL как наблюдаемое состояние.

## Источники Ведущего

- [Application](../02-application.md)
- [Application host structure](../16-application-host-structure.md)
- [Ментальная модель](../01-mental-model.md)
