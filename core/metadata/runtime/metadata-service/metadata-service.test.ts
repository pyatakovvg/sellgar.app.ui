import { describe, expect, it, vi } from 'vitest';
import { Metadata, getMetadataDefaults } from '../../declaration/metadata';
import { MetadataServiceInterface } from '../../service/metadata-service';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { ModuleScope } from '../../../runtime/scope/kind/module-scope';
import { MetadataService } from './metadata-service';

describe('MetadataService', () => {
  it('copies defaults, updates individual fields, resets and publishes only actual changes', () => {
    const defaults = { title: 'Заказы', description: 'Список заказов' };
    const service = new MetadataService(defaults);
    defaults.title = 'Changed externally';
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);
    const initial = service.getSnapshot();
    service.set.title('Заказы');
    expect(service.getSnapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    service.set.title('Заказ №123');
    expect(service.get.description()).toBe('Список заказов');
    expect(initial.title).toBe('Заказы');
    service.set.description(undefined);
    expect(service.get.description()).toBeUndefined();
    service.reset.description();
    expect(service.get.description()).toBe('Список заказов');
    service.reset.all();
    expect(service.get.title()).toBe('Заказы');
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    service.set.title('Detached');
    expect(listener).toHaveBeenCalledTimes(4);
    service.dispose();
    service.set.title('Late result');
    expect(service.get.title()).toBe('Detached');
  });

  it('binds independent services for application, sibling and nested module owners', () => {
    const app = new ApplicationScope();
    app.bindMetadata({ title: 'Личный кабинет' });
    const page = new ModuleScope(app);
    const sibling = new ModuleScope(app);
    const frame = new ModuleScope(page);
    page.bindMetadata({ title: 'Заказы' });
    sibling.bindMetadata({ title: 'Клиенты' });
    frame.bindMetadata({ title: 'Фильтры' });
    const local = frame.get(MetadataServiceInterface);
    expect(frame.get(MetadataServiceInterface)).toBe(local);
    local.set.title('Избранные фильтры');
    expect(page.get(MetadataServiceInterface).get.title()).toBe('Заказы');
    expect(sibling.get(MetadataServiceInterface).get.title()).toBe('Клиенты');
    expect(app.get(MetadataServiceInterface).get.title()).toBe('Личный кабинет');
    frame.dispose();
    local.set.title('Late');
    expect(local.get.title()).toBe('Избранные фильтры');
    page.dispose();
    sibling.dispose();
    app.dispose();
  });

  it('keeps declaration defaults immutable and inherited without modifying the base owner', () => {
    @Metadata({ title: 'Base' })
    class Base {}
    class Inherited extends Base {}
    @Metadata({ title: 'Own' })
    class Own extends Base {}
    expect(getMetadataDefaults(Inherited).title).toBe('Base');
    expect(getMetadataDefaults(Own).title).toBe('Own');
    expect(getMetadataDefaults(Base).title).toBe('Base');
    expect(Object.isFrozen(getMetadataDefaults(Base))).toBe(true);
    expect(() => Metadata({ title: 'Duplicate' })(Base)).toThrow('только один раз');
  });
});
