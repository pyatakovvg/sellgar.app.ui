import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MetadataServiceInterface } from '../../../../core/metadata/service/metadata-service';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { ModuleScope } from '../../../../core/runtime/scope/kind/module-scope';
import { RuntimeScopeProvider as ReactScopeProvider } from '../../../../react/runtime/scope/runtime-scope-context';
import { RuntimeScopeProvider as NativeScopeProvider } from '../../../../native/runtime/scope/runtime-scope-context';
import { RuntimeScopeProvider as FsmScopeProvider } from '../../../../fsm/runtime/scope/runtime-scope-context';
import { useMetadata as useReactMetadata } from '../../../../react/metadata/hook/use-metadata';
import { useMetadata as useNativeMetadata } from '../../../../native/metadata/hook/use-metadata';
import { useMetadata as useFsmMetadata } from '../../../../fsm/metadata/hook/use-metadata';

describe.each([
  ['React', useReactMetadata, ReactScopeProvider],
  ['Native', useNativeMetadata, NativeScopeProvider],
  ['FSM', useFsmMetadata, FsmScopeProvider],
] as const)('useMetadata (%s)', (_renderer, useMetadata, RuntimeScopeProvider) => {
  it('shares the scoped service, reacts to writes and resets, and balances StrictMode subscriptions', () => {
    const app = new ApplicationScope();
    app.bindMetadata({ title: 'Кабинет' });
    const module = new ModuleScope(app);
    module.bindMetadata({ title: 'Заказы', description: 'Список заказов' });
    const service = module.get(MetadataServiceInterface);
    const subscribe = service.subscribe;
    let subscriptions = 0;
    vi.spyOn(service, 'subscribe').mockImplementation((listener) => {
      subscriptions++;
      const cleanup = subscribe(listener);
      return () => {
        subscriptions--;
        cleanup();
      };
    });
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <React.StrictMode>
        <RuntimeScopeProvider scope={module}>{children}</RuntimeScopeProvider>
      </React.StrictMode>
    );
    const { result, rerender, unmount } = renderHook(
      () => {
        const metadata = useMetadata();
        return { metadata, title: metadata.get.title(), description: metadata.get.description() };
      },
      { wrapper },
    );

    expect(result.current.metadata).toBe(service);
    expect(result.current.title).toBe('Заказы');
    expect(subscriptions).toBe(1);
    rerender();
    expect(result.current.metadata).toBe(service);
    expect(result.current.title).toBe('Заказы');
    act(() => result.current.metadata.set.title('Архив заказов'));
    expect(result.current.title).toBe('Архив заказов');
    expect(result.current.description).toBe('Список заказов');
    act(() => service.set.description('Архив'));
    expect(result.current.description).toBe('Архив');
    act(() => result.current.metadata.reset.all());
    expect(result.current.title).toBe('Заказы');
    expect(result.current.description).toBe('Список заказов');
    act(() => service.set.title('Сохранённый заголовок'));
    unmount();
    expect(subscriptions).toBe(0);
    expect(service.get.title()).toBe('Сохранённый заголовок');
    vi.restoreAllMocks();
    module.dispose();
    app.dispose();
  });

  it('uses the nearest owner, isolates frame writes and changes subscriptions when the provider changes', () => {
    const app = new ApplicationScope();
    app.bindMetadata({ title: 'Кабинет' });
    const page = new ModuleScope(app);
    page.bindMetadata({ title: 'Заказы' });
    const frame = new ModuleScope(page);
    frame.bindMetadata({ title: 'Фильтры' });
    let scope = page;
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
      <RuntimeScopeProvider scope={app}>
        <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>
      </RuntimeScopeProvider>
    );
    const { result, rerender, unmount } = renderHook(
      () => {
        const metadata = useMetadata();
        return { metadata, title: metadata.get.title() };
      },
      { wrapper },
    );
    expect(result.current.metadata).toBe(page.get(MetadataServiceInterface));
    scope = frame;
    rerender();
    expect(result.current.title).toBe('Фильтры');
    act(() => result.current.metadata.set.title('Избранные фильтры'));
    expect(result.current.title).toBe('Избранные фильтры');
    expect(page.get(MetadataServiceInterface).get.title()).toBe('Заказы');
    expect(app.get(MetadataServiceInterface).get.title()).toBe('Кабинет');
    const previousResult = result.current;
    act(() => page.get(MetadataServiceInterface).set.title('Архив'));
    expect(result.current).toBe(previousResult);
    unmount();
    frame.dispose();
    page.dispose();
    app.dispose();
  });
});
