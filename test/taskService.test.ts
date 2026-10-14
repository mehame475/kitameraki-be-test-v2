import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictError, NotFoundError, ValidationError } from '../src/errors';
import { FormSettings } from '../src/models/formSettings';
import { Task } from '../src/models/task';
import type { FormSettingsStore } from '../src/repositories/formSettingsRepository';
import type { TaskStore, VersionedTask } from '../src/repositories/taskRepository';
import { applyChanges, TaskService } from '../src/services/taskService';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';

class InMemoryStore implements TaskStore {
  private items = new Map<string, { task: Task; version: number }>();
  private key = (org: string, id: string) => `${org}/${id}`;

  async list(org: string) {
    return [...this.items.values()].map((i) => i.task).filter((t) => t.organizationId === org);
  }
  async findById(org: string, id: string): Promise<VersionedTask | undefined> {
    const item = this.items.get(this.key(org, id));
    return item && { task: item.task, etag: String(item.version) };
  }
  async create(task: Task) {
    this.items.set(this.key(task.organizationId, task.id), { task, version: 1 });
    return task;
  }
  async replace(task: Task, etag: string) {
    const item = this.items.get(this.key(task.organizationId, task.id));
    if (!item) throw new NotFoundError();
    if (String(item.version) !== etag) throw new ConflictError();
    this.items.set(this.key(task.organizationId, task.id), { task, version: item.version + 1 });
    return task;
  }
  async delete(org: string, id: string) {
    return this.items.delete(this.key(org, id));
  }
}

class InMemorySettingsStore implements FormSettingsStore {
  constructor(private settings?: FormSettings) {}
  async get() {
    return this.settings;
  }
  async save(_org: string, settings: FormSettings) {
    this.settings = settings;
    return settings;
  }
}

const withEmailField: FormSettings = {
  rows: [{ id: 'r1', fields: [{ id: 'email1', label: 'Contact', kind: 'custom', type: 'email' }] }],
};
const newService = (settings?: FormSettings) => new TaskService(new InMemoryStore(), new InMemorySettingsStore(settings));

describe('applyChanges', () => {
  const base: Task = { id: 'a', organizationId: ORG, title: 't', status: 'todo', dueDate: '2026-01-01T00:00:00Z' };

  it('sets values, clears nulls and leaves undefined untouched', () => {
    const next = applyChanges(base, { status: 'completed', dueDate: null, title: undefined });
    assert.equal(next.status, 'completed');
    assert.equal(next.title, 't');
    assert.equal('dueDate' in next, false);
    assert.equal(base.dueDate, '2026-01-01T00:00:00Z'); // original not mutated
  });
});

describe('TaskService', () => {
  it('creates tasks with a server-generated id in the caller organization', async () => {
    const service = newService();
    const task = await service.create(ORG, { title: 'x', status: 'todo' });
    assert.match(task.id, /^[0-9a-f-]{36}$/);
    assert.equal(task.organizationId, ORG);
  });

  it('isolates organizations', async () => {
    const service = newService();
    const task = await service.create(ORG, { title: 'x', status: 'todo' });
    assert.deepEqual(await service.list(OTHER_ORG), []);
    await assert.rejects(service.get(OTHER_ORG, task.id), NotFoundError);
    await assert.rejects(service.remove(OTHER_ORG, task.id), NotFoundError);
  });

  it('updates, and reports missing tasks', async () => {
    const service = newService();
    const task = await service.create(ORG, { title: 'x', status: 'todo' });
    const updated = await service.update(ORG, task.id, { status: 'in-progress' });
    assert.equal(updated.status, 'in-progress');
    await assert.rejects(service.update(ORG, 'missing', { status: 'todo' }), NotFoundError);
  });

  it('bulk delete reports deleted and missing ids', async () => {
    const service = newService();
    const task = await service.create(ORG, { title: 'x', status: 'todo' });
    const result = await service.removeMany(ORG, [task.id, 'missing']);
    assert.deepEqual(result, { deleted: [task.id], notFound: ['missing'] });
  });
});

describe('TaskService custom fields', () => {
  it('accepts values for configured custom fields', async () => {
    const service = newService(withEmailField);
    const task = await service.create(ORG, { title: 'x', status: 'todo', customFields: { email1: 'a@b.co' } });
    assert.deepEqual(task.customFields, { email1: 'a@b.co' });
  });

  it('rejects unknown fields and values that do not match the field type', async () => {
    const service = newService(withEmailField);
    await assert.rejects(service.create(ORG, { title: 'x', status: 'todo', customFields: { nope: 'v' } }), ValidationError);
    await assert.rejects(service.create(ORG, { title: 'x', status: 'todo', customFields: { email1: 'not-an-email' } }), ValidationError);
  });

  it('rejects custom values when the organization has no custom fields', async () => {
    const service = newService();
    await assert.rejects(service.create(ORG, { title: 'x', status: 'todo', customFields: { email1: 'a@b.co' } }), ValidationError);
  });

  it('validates custom values on update and lets null clear them', async () => {
    const service = newService(withEmailField);
    const task = await service.create(ORG, { title: 'x', status: 'todo', customFields: { email1: 'a@b.co' } });
    await assert.rejects(service.update(ORG, task.id, { customFields: { email1: 'bad' } }), ValidationError);
    const cleared = await service.update(ORG, task.id, { customFields: null });
    assert.equal('customFields' in cleared, false);
  });
});
