export const TASK_STATUSES = ['todo', 'in-progress', 'completed'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Mirrors task.schema.json. `organizationId` is the Cosmos partition key. */
export type Task = {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
  status: TaskStatus;
  tags?: string[];
  /** Values of custom form fields, keyed by field id (see form settings). */
  customFields?: Record<string, string>;
};

/** Fields a client may supply when creating a task (id/organizationId are server-controlled). */
export type CreateTaskInput = Omit<Task, 'id' | 'organizationId'>;

/** Partial update. `null` on an optional field clears it. */
export type TaskChanges = {
  title?: string;
  status?: TaskStatus;
  description?: string | null;
  dueDate?: string | null;
  priority?: TaskPriority | null;
  tags?: string[] | null;
  customFields?: Record<string, string> | null;
};
