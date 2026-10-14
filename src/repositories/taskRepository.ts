import { Container } from '@azure/cosmos';
import { ConflictError, NotFoundError } from '../errors';
import { Task } from '../models/task';

export interface VersionedTask {
  task: Task;
  /** Opaque concurrency token used for optimistic locking. */
  etag: string;
}

/** Persistence port; the service depends on this, not on Cosmos. */
export interface TaskStore {
  list(organizationId: string): Promise<Task[]>;
  findById(organizationId: string, id: string): Promise<VersionedTask | undefined>;
  create(task: Task): Promise<Task>;
  replace(task: Task, etag: string): Promise<Task>;
  /** Resolves to false when the task does not exist. */
  delete(organizationId: string, id: string): Promise<boolean>;
}

type StoredTask = Task & { _etag?: string };

const statusCode = (error: unknown): number | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
};

/** Whitelist known fields so Cosmos system properties (_rid, _self, _etag, ...) never leak to clients. */
export function toTask(doc: Task): Task {
  const task: Task = {
    id: doc.id,
    organizationId: doc.organizationId,
    title: doc.title,
    status: doc.status,
  };
  if (doc.description !== undefined) task.description = doc.description;
  if (doc.dueDate !== undefined) task.dueDate = doc.dueDate;
  if (doc.priority !== undefined) task.priority = doc.priority;
  if (doc.tags !== undefined) task.tags = doc.tags;
  if (doc.customFields !== undefined) task.customFields = doc.customFields;
  return task;
}

export class CosmosTaskRepository implements TaskStore {
  constructor(private readonly container: Container) {}

  async list(organizationId: string): Promise<Task[]> {
    // Parameterised query + partition key: no injection, single-partition read.
    const { resources } = await this.container.items
      .query<StoredTask>(
        {
          query: 'SELECT * FROM c WHERE c.organizationId = @organizationId',
          parameters: [{ name: '@organizationId', value: organizationId }],
        },
        { partitionKey: organizationId },
      )
      .fetchAll();
    return resources.map(toTask);
  }

  async findById(organizationId: string, id: string): Promise<VersionedTask | undefined> {
    try {
      const { resource } = await this.container.item(id, organizationId).read<StoredTask>();
      if (!resource) return undefined;
      return { task: toTask(resource), etag: resource._etag ?? '' };
    } catch (error) {
      if (statusCode(error) === 404) return undefined;
      throw error;
    }
  }

  async create(task: Task): Promise<Task> {
    const { resource } = await this.container.items.create<Task>(task);
    return toTask(resource ?? task);
  }

  async replace(task: Task, etag: string): Promise<Task> {
    try {
      const { resource } = await this.container
        .item(task.id, task.organizationId)
        .replace<Task>(task, { accessCondition: { type: 'IfMatch', condition: etag } });
      return toTask(resource ?? task);
    } catch (error) {
      const code = statusCode(error);
      if (code === 412) throw new ConflictError();
      if (code === 404) throw new NotFoundError();
      throw error;
    }
  }

  async delete(organizationId: string, id: string): Promise<boolean> {
    try {
      await this.container.item(id, organizationId).delete();
      return true;
    } catch (error) {
      if (statusCode(error) === 404) return false;
      throw error;
    }
  }
}
