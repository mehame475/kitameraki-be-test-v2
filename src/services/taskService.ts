import { randomUUID } from 'crypto';
import { NotFoundError } from '../errors';
import { CreateTaskInput, Task, TaskChanges } from '../models/task';
import type { FormSettingsStore } from '../repositories/formSettingsRepository';
import type { TaskStore } from '../repositories/taskRepository';
import { validateCustomFieldValues } from '../validation/customFieldValidation';

/** Pure merge: `null` clears an optional field, `undefined` leaves it untouched. */
export function applyChanges(task: Task, changes: TaskChanges): Task {
  const next: Task = { ...task };
  const target = next as Record<string, unknown>;
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    if (value === null) delete target[key];
    else target[key] = value;
  }
  return next;
}

export interface BulkDeleteResult {
  deleted: string[];
  notFound: string[];
}

export class TaskService {
  constructor(
    private readonly store: TaskStore,
    private readonly settingsStore: FormSettingsStore,
  ) {}

  /** Custom field values must belong to a custom field in the organization's form settings. */
  private async assertCustomFields(organizationId: string, values?: Record<string, string> | null) {
    if (!values || Object.keys(values).length === 0) return;
    validateCustomFieldValues(values, await this.settingsStore.get(organizationId));
  }

  list(organizationId: string): Promise<Task[]> {
    return this.store.list(organizationId);
  }

  async get(organizationId: string, id: string): Promise<Task> {
    const found = await this.store.findById(organizationId, id);
    if (!found) throw new NotFoundError();
    return found.task;
  }

  async create(organizationId: string, input: CreateTaskInput): Promise<Task> {
    await this.assertCustomFields(organizationId, input.customFields);
    return this.store.create({ ...input, id: randomUUID(), organizationId });
  }

  async update(organizationId: string, id: string, changes: TaskChanges): Promise<Task> {
    await this.assertCustomFields(organizationId, changes.customFields);
    const found = await this.store.findById(organizationId, id);
    if (!found) throw new NotFoundError();
    return this.store.replace(applyChanges(found.task, changes), found.etag);
  }

  async remove(organizationId: string, id: string): Promise<void> {
    if (!(await this.store.delete(organizationId, id))) throw new NotFoundError();
  }

  async removeMany(organizationId: string, ids: string[]): Promise<BulkDeleteResult> {
    // All deletes are awaited (the original fire-and-forget forEach reported success before finishing).
    const outcomes = await Promise.all(
      ids.map(async (id) => ({ id, existed: await this.store.delete(organizationId, id) })),
    );
    return {
      deleted: outcomes.filter((o) => o.existed).map((o) => o.id),
      notFound: outcomes.filter((o) => !o.existed).map((o) => o.id),
    };
  }
}
