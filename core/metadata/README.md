# Метаданные Application и Module

Статус: current.

`@Metadata` объявляет локальные значения по умолчанию. `MetadataServiceInterface`
хранит изменяемые значения конкретного runtime-владельца. Core не зависит от DOM,
renderer или способа открытия модуля.

```ts
import { Controller, Inject, Metadata, MetadataServiceInterface } from '@sellgar/app';
import { Application, Module, type ApplicationConfiguratorInterface } from '@sellgar/app/react';

@Metadata({ title: 'Личный кабинет', description: 'Управление кабинетом' })
class CabinetApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(cabinetRouter);
  }
}

@Metadata({ title: 'Заказы', description: 'Список заказов' })
@Module({ view: OrdersView })
class OrdersModule {}

@Controller()
class OrderController {
  constructor(
    @Inject(MetadataServiceInterface)
    private readonly metadata: MetadataServiceInterface,
  ) {}

  showOrder(number: string): void {
    this.metadata.set.title(`Заказ №${number}`);
  }
}
```

## Публичный контракт

Из core и renderer facades экспортируются `Metadata`, `MetadataValues`,
`MetadataServiceInterface`, типы групп операций, `MetadataComposition`,
`MetadataCompositionOptions`, `composeMetadata` и `formatMetadataTitle`.

```ts
metadata.set.title('Заказы');
metadata.set.description('Список заказов');
metadata.get.title(); // string | undefined
metadata.get.description(); // string | undefined
metadata.reset.title();
metadata.reset.description();
metadata.reset.all();
```

`set` меняет только указанное поле; `undefined` удаляет локальное значение.
`reset` возвращает поле к декларации владельца, `reset.all()` возвращает все
поля. Пустая строка является явным значением; formatter не выводит пустые title.
Description с пустой строкой остаётся пустым и не наследуется от родителя.

`getSnapshot()` возвращает неизменяемый snapshot с устойчивой ссылкой до
фактического изменения. `subscribe()` возвращает cleanup. Группы операций
также неизменяемы, методы можно передавать как callbacks.

## React hook

`useMetadata()` из `@sellgar/app/react` (также Native и FSM facades) возвращает тот же сервис, который контроллер
получает через DI. Используется ближайший runtime scope: внутри Module — его
метаданные, в application-level view — метаданные Application.

```tsx
import { useMetadata } from '@sellgar/app/react';

function OrdersHeader() {
  const metadata = useMetadata();

  return <button onClick={() => metadata.set.title('Архив заказов')}>{metadata.get.title()}</button>;
}
```

Hook подписывается на локальный snapshot, поэтому чтение через `get.*` в render
обновляется и при изменениях из контроллера. Изменять значения следует в event
handlers или effects. Hook не записывает значения при render и не сбрасывает их
при unmount: состояние и defaults принадлежат владельцу scope. Несколько
компонентов одного модуля используют общий сервис.

## Ownership и lifecycle

- Application создаёт сервис в application scope до активации bindings,
  initializers и features; defaults читаются с класса приложения.
- Module создаёт свой сервис до активации bindings и создания controllers.
  Все controllers одного модуля получают один экземпляр. Дочерний Module
  регистрирует собственный экземпляр, даже если его scope вложен в Module.
- Сервис не определяет, открыт модуль страницей, фреймом или другим shell.
  `get.title()` всегда возвращает собственное значение, без строки приложения.
- Подготовка Module меняет только его локальные значения. В композицию входит
  committed-ветка Router; pending-кандидаты туда не попадают.
- Retained runtime сохраняет свои значения. Он снова участвует в композиции,
  когда выбран навигацией. Если renderer освобождает модуль при уходе, повторное
  открытие создаёт новый сервис и запускает обычный lifecycle.
- Освобождение scope удаляет подписчиков и закрывает сервис для последующих
  записей. Поздняя запись в освобождённый экземпляр игнорируется.
- Все concurrent controllers одного владельца намеренно изменяют одно состояние:
  последняя выполненная запись побеждает. Отменяемые операции должны соблюдать
  свой `AbortSignal`, как и при изменении другого состояния контроллера.

Defaults копируются и замораживаются. Наследование класса сохраняет defaults
родителя, пока подкласс не объявит собственный `@Metadata`. Две декларации
`@Metadata` на одном классе являются ошибкой.

## Композиция

Core проецирует метаданные выбранной ветки в структурированные части:

```ts
{
  application: { title: 'Личный кабинет' },
  page: { title: 'Заказы' },
  frames: [{ title: 'Настройка фильтров' }],
}
```

Локальная ветка корневого Router определяет `page`, каждый вложенный Router —
следующий элемент `frames` снаружи внутрь. В пределах одной локальной ветки
значения более глубокого Module переопределяют поля предков по отдельности.
Структурные Route без Module не добавляют метаданные.

Формат по умолчанию:

```text
Личный кабинет
Личный кабинет: Заказы
Личный кабинет: Заказы (Настройка фильтров)
Личный кабинет: Заказы (Настройка фильтров — Сохранение)
```

Приложение может изменить формат в существующем `configure`:

```ts
app.metadata({
  formatTitle: ({ application, page, frames }) =>
    [application.title, page.title, ...frames.map((frame) => frame.title)].filter(Boolean).join(' / '),
});
```

Description не склеивается: используется ближайшее определённое описание,
начиная с внутреннего фрейма, затем страницы, затем приложения. Пустой title
или description не требует дополнительного HTTP-запроса.

## Renderers

React и FSM подключают один browser host на Application. Он обновляет title и
один description node при изменении итоговых строк, переиспользует существующий
meta node и восстанавливает исходные значения при unmount. Если framework не
определяет поле, используется исходное значение документа. Native не подключает
DOM host.

React `ShellContextInterface.metadata` и Native
`ShellContextInterface.metadata` предоставляют локальные метаданные содержимого
shell. Они не содержат заголовок приложения и метаданные вложенного shell.

В Next plugin автоматически экспортирует `generateMetadata` для `withModule`,
если у страницы нет собственных `metadata`/`generateMetadata`. Page и
`generateMetadata` используют одну request-scoped подготовку Module с общими
loader results. Root layout аналогично получает базовые метаданные приложения.
Явные Next metadata exports сохраняют приоритет; клиентский framework host этой
страницы также не подменяет их. Layouts Next не добавляют части `frames`:
фреймы здесь принадлежат framework Router, которого Next adapter не создаёт.

Snapshot Module переносит локальные метаданные, базовые метаданные приложения и
готовый серверный результат. Hydration восстанавливает локальные значения без
повторного выполнения loaders, а reset продолжает использовать декларативные
defaults. Последующие изменения сервиса публикуются browser host. При уходе со страницы
Next host не восстанавливает старые значения поверх метаданных нового маршрута,
которыми владеет Next.

## Решение и проверки

Владелец состояния — core metadata service в существующих scopes. Навигация,
controller lifecycle, providers, error handling, authentication и cleanup не
заменяются отдельным runtime. Ни Module decorator renderer-а, ни Route не
получают browser-specific поля. Автоматический поиск декорированных getters
контроллеров и глобальный изменяемый title отвергнуты из-за неоднозначного
ownership.

Regression-проверки расположены у owners: сервис и defaults, композиция,
browser host с реальными Application/Router/Module, локальные shell metadata,
отмена pending-навигации, Back, освобождение scope, StrictMode, Next exports и
snapshot hydration. Public API дополнительно проверяет
`contracts/metadata.fixture.ts` в full/core typecheck.
