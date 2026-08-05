# Занятие 1. Первый Запуск: От React К `Hello, @sellgar/app!`

- Статус документа: current
- Формат: 35–50 минут
- Новые понятия: `Application`, `Router`, `Route`, `Module`, view
- Не вводим: DI, bindings, controller, provider, widget, frame, policy

## Результат Занятия

Слушатель запускает приложение, видит первый экран и может своими словами
объяснить минимальную цепочку:

```text
Application выбирает Router
-> Router сопоставляет URL с Route
-> leaf Route загружает Module
-> Module показывает view
```

Цель занятия — не разобрать внутреннее устройство runtime, а получить первый
успешный результат и назвать владельцев верхнего уровня.

## Подготовка Ведущего

До занятия подготовить пустой host package и module package в учебном Yarn
workspace. Алиасы ниже следуют конвенции management panel; при отдельном
учебном стенде их нужно сопоставить с его `package.json` и Vite config.

Стартовая структура:

```text
clients/orders-training/
  src/
    application/orders-training.application.tsx
    bootstrap.tsx
    main.ts

modules/hello/
  src/
    hello.module.tsx
    index.ts
```

Не показывать заранее готовый финальный проект. На live coding файлы появляются
в порядке, в котором runtime встречает их при запуске.

---

## Слайд 1. Что Мы Сегодня Построим

### На Экране

```text
URL: /

Hello, @sellgar/app!
```

Пять сущностей, один работающий экран, ни одного controller-а.

### Заметки Ведущего

Сразу установите ожидание: это занятие намеренно маленькое. Технический quick
start пакета показывает много возможностей одновременно; учебный старт должен
дать слушателю устойчивую опору.

Спросите аудиторию: «Какие части, кроме React component, вообще нужны, чтобы
framework решил, что показать по URL?» Не исправляйте ответы — вернитесь к ним
после запуска.

---

## Слайд 2. Минимальная Модель

### На Экране

```text
Application -> Router -> Route -> Module -> View
```

### Заметки Ведущего

- `Application` — корень композиции и lifecycle.
- `Router` — дерево URL.
- `Route` — правило выбора ветки и module.
- `Module` — runtime основного экрана leaf route.
- View — React-представление выбранного module.

Пока не раскрывайте scopes, loaders и providers. Важно только различить
маршрут и экран: route отвечает на вопрос «когда», module — «что является
экраном».

---

## Слайд 3. Самый Простой View

### На Экране

```tsx
const HelloView: React.FC = () => {
  return <h1>Hello, @sellgar/app!</h1>;
};
```

### Заметки Ведущего

Это обычный React component. Framework не требует особого base class или
wrapper-а для view. Новая модель начинается не внутри JSX, а вокруг него — в
том, кто создаёт runtime и передаёт view на render.

### Live Coding

Создайте `modules/hello/src/hello.module.tsx` только с `HelloView`. Запустите
TypeScript check, если стенд уже настроен, и подчеркните: компонент сам по себе
ещё не является экраном framework.

---

## Слайд 4. Module Делает View Экраном

### На Экране

```tsx
import { Module } from '@sellgar/app';

const HelloView: React.FC = () => {
  return <h1>Hello, @sellgar/app!</h1>;
};

@Module({
  view: HelloView,
})
export class HelloModule {}
```

### Заметки Ведущего

`HelloModule` — declaration token с metadata. В этот момент constructor не
создаёт экран и decorator не запускает React. Runtime появится позже, когда
route загрузит экспорт package.

Сформулируйте первое важное различие курса:

```text
declaration описывает
runtime исполняет
```

Покажите публичный экспорт:

```ts
export { HelloModule } from './hello.module';
```

Route loader должен получить module через public export package, а не через
private deep import.

### Контрольная Точка

Вопрос: «Сколько экземпляров `HelloModule` мы создали?»

Ожидаемый ответ: ни одного; class используется как declaration token.

---

## Слайд 5. Route Связывает URL И Module

### На Экране

```ts
new Route({
  load: () => import('@module/hello'),
});
```

### Заметки Ведущего

Это index leaf route: у него нет собственного `path`, и он загружает module для
корня текущей ветки. На первом занятии не нужны nested routes, layouts или
policies.

Отметьте две границы:

- leaf route использует `load`;
- module находится через экспорт загруженного package.

Не показывайте `routes` и `load` вместе: эти формы взаимоисключающие.

---

## Слайд 6. Application Выбирает Router

### На Экране

```tsx
import {
  Application,
  Route,
  Router,
  type ApplicationConfiguratorInterface,
} from '@sellgar/app';

export class OrdersTrainingApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(
      new Router({
        routes: [
          new Route({
            load: () => import('@module/hello'),
          }),
        ],
      }),
    );
  }
}
```

### Заметки Ведущего

`configure` — composition root. Здесь приложение объявляет router, но не
рендерит module вручную. В последующих занятиях здесь появятся application
components, layouts, features и initializers; сегодня они не нужны.

Не добавляйте пустой `@UseBindings`: bindings вводятся только тогда, когда
возникает зависимость, которую должен собрать DI container.

---

## Слайд 7. Bootstrap Запускает Lifecycle

### На Экране

```tsx
const app = new OrdersTrainingApplication();

app.compose();

const AppView = app.createView();

createRoot(document.querySelector('#root')!).render(<AppView />);

void app.initialize().catch(() => {});
```

### Заметки Ведущего

Проговорите порядок без внутренней детализации:

```text
new
-> compose
-> createView/render
-> initialize
```

Этот вариант позволяет позже показать splash во время async initialization.
Другой допустимый вариант — дождаться `initialize()` до первого render; он
будет разобран на следующем занятии.

В `main.ts` до bootstrap должен импортироваться `reflect-metadata`, потому что
framework использует decorators и DI metadata:

```ts
import 'reflect-metadata';
import './bootstrap';
```

### Live Coding

Запустите приложение. Сначала покажите `Hello, @sellgar/app!`, затем измените текст
во view и убедитесь, что обновился только React-код, а composition осталась
прежней.

---

## Слайд 8. Что Произошло При Открытии `/`

### На Экране

```text
1. Application собрал root runtime
2. Router сопоставил URL `/`
3. Route импортировал `@module/hello`
4. Framework нашёл HelloModule declaration
5. Module runtime отрендерил HelloView
```

### Заметки Ведущего

Вернитесь к ответам аудитории со слайда 1. Теперь попросите провести границу:

- React отвечает за представление view;
- framework runtime отвечает за orchestration.

Не утверждайте, что React вообще не участвует в lifecycle UI. Точная мысль:
React mount/unmount не является владельцем framework graph.

---

## Слайд 9. Module — Не Любой Component

### На Экране

```text
React component
  часть интерфейса

Module
  основной экран leaf route
  владелец module runtime
```

### Заметки Ведущего

Антипример: не создавать отдельный module для заголовка, кнопки или карточки.
Обычные части экрана остаются React components. Позже widget будет введён как
переиспользуемый блок с собственным runtime, но сейчас не нужно давать его API.

### Контрольная Точка

Предложите три объекта — экран `/orders`, карточка заказа и drawer деталей — и
спросите, что из них точно является module. На этом этапе правильный уверенный
ответ нужен только для экрана `/orders`; остальные варианты будут разрешены в
последующих занятиях.

---

## Слайд 10. Самостоятельная Практика

### Задание

1. Переименовать `HelloModule` в `WelcomeModule`.
2. Вынести `WelcomeView` в отдельный файл `view/welcome.view.tsx`.
3. Сохранить единственный публичный экспорт module package.
4. Добавить в view заголовок и короткое описание курса.
5. Объяснить, какой файл отвечает за URL, какой — за экран, какой — за JSX.

### Критерии Готовности

- приложение открывается по `/`;
- feature code импортирует API только из `@sellgar/app`;
- route использует public package import;
- module class не создаётся через `new`;
- во view нет navigation, data loading или DI «на будущее».

---

## Слайд 11. Что Мы Намеренно Не Решили

### На Экране

```text
Как показать startup?
Как получить service?
Как добавить второй URL?
Как загрузить данные?
```

### Заметки Ведущего

Это мост к следующим занятиям. Не отвечайте API-кодом сразу. Зафиксируйте, что
текущий минимум хорош ровно для статического экрана:

- lifecycle приложения будет следующим шагом;
- DI появится после первой внешней зависимости;
- navigation появится после второго route;
- controller появится, когда экрану понадобятся loader/action boundaries.

Так аудитория видит, зачем возникает каждый новый механизм, а не запоминает
случайный порядок разделов документации.

## Разбор После Занятия

Слушатель готов двигаться дальше, если без подсказки объясняет:

1. Почему `HelloView` сам по себе не является route screen.
2. Чем declaration `HelloModule` отличается от module runtime.
3. Кто выбирает module по URL.
4. Почему module package экспортируется через public `index.ts`.
5. Какие четыре lifecycle-вызова уже видны в bootstrap и что пока осталось
   нераскрытым.

Если группа путает `Route` и `Module`, не добавляйте DI на следующем шаге.
Повторите упражнение со вторым статическим экраном и попросите отдельно назвать
правило URL и содержимое экрана.

## Источники Ведущего

- [ментальная модель runtime](../01-mental-model.md);
- [application lifecycle и bootstrap](../02-application.md);
- [Router и формы Route](../03-router-and-navigation.md);
- [назначение и declaration Module](../04-modules-controllers-providers.md);
- [структура module package](../13-module-package-structure.md);
- [структура application host](../16-application-host-structure.md);
- [граница public API](../17-public-api-boundary.md).

