import { ValidationError } from '../errors';
import { readCustomFields } from './customFieldValidation';
import {
  CreateTaskInput,
  TASK_PRIORITIES,
  TASK_STATUSES,
  TaskChanges,
  TaskPriority,
  TaskStatus,
} from '../models/task';

export const TITLE_MAX = 100;
export const DESCRIPTION_MAX = 1000;
export const TAG_MAX = 50;
export const TAGS_MAX_COUNT = 50;
export const BULK_DELETE_MAX = 100;

const WRITABLE_FIELDS = ['title', 'description', 'dueDate', 'priority', 'status', 'tags', 'customFields'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export const isIsoDateTime = (value: unknown): value is string =>
  typeof value === 'string' && DATE_TIME_RE.test(value) && !Number.isNaN(Date.parse(value));

export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && UUID_RE.test(value);

type Issues = string[];

function readTitle(value: unknown, issues: Issues): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.push('title must be a non-empty string');
    return undefined;
  }
  const title = value.trim();
  if (title.length > TITLE_MAX) {
    issues.push(`title must be at most ${TITLE_MAX} characters`);
    return undefined;
  }
  return title;
}

function readDescription(value: unknown, issues: Issues): string | undefined {
  if (typeof value !== 'string') {
    issues.push('description must be a string');
    return undefined;
  }
  if (value.length > DESCRIPTION_MAX) {
    issues.push(`description must be at most ${DESCRIPTION_MAX} characters`);
    return undefined;
  }
  return value;
}

function readDueDate(value: unknown, issues: Issues): string | undefined {
  if (!isIsoDateTime(value)) {
    issues.push('dueDate must be an ISO 8601 date-time, e.g. 2026-01-31T00:00:00.000Z');
    return undefined;
  }
  return value;
}

function readEnum<T extends string>(
  name: string,
  allowed: readonly T[],
  value: unknown,
  issues: Issues,
): T | undefined {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    issues.push(`${name} must be one of: ${allowed.join(', ')}`);
    return undefined;
  }
  return value as T;
}

function readTags(value: unknown, issues: Issues): string[] | undefined {
  if (!Array.isArray(value) || value.length > TAGS_MAX_COUNT) {
    issues.push(`tags must be an array of at most ${TAGS_MAX_COUNT} strings`);
    return undefined;
  }
  const tags: string[] = [];
  for (const raw of value) {
    const tag = typeof raw === 'string' ? raw.trim() : '';
    if (!tag || tag.length > TAG_MAX) {
      issues.push(`each tag must be a non-empty string of at most ${TAG_MAX} characters`);
      return undefined;
    }
    tags.push(tag);
  }
  return Array.from(new Set(tags));
}

function asObject(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  return body as Record<string, unknown>;
}

function rejectUnknownFields(body: Record<string, unknown>, issues: Issues): void {
  for (const key of Object.keys(body)) {
    if (!WRITABLE_FIELDS.includes(key)) issues.push(`unknown or read-only field "${key}"`);
  }
}

function failIfInvalid(issues: Issues): void {
  if (issues.length > 0) throw new ValidationError('Request validation failed', issues);
}

export function parseCreateTask(body: unknown): CreateTaskInput {
  const obj = asObject(body);
  const issues: Issues = [];
  rejectUnknownFields(obj, issues);

  if (obj.title === undefined) issues.push('title is required');
  if (obj.status === undefined) issues.push('status is required');

  const input: Partial<CreateTaskInput> = {};
  if (obj.title !== undefined) input.title = readTitle(obj.title, issues);
  if (obj.status !== undefined) input.status = readEnum<TaskStatus>('status', TASK_STATUSES, obj.status, issues);
  if (obj.description !== undefined) input.description = readDescription(obj.description, issues);
  if (obj.dueDate !== undefined) input.dueDate = readDueDate(obj.dueDate, issues);
  if (obj.priority !== undefined) input.priority = readEnum<TaskPriority>('priority', TASK_PRIORITIES, obj.priority, issues);
  if (obj.tags !== undefined) input.tags = readTags(obj.tags, issues);
  if (obj.customFields !== undefined) input.customFields = readCustomFields(obj.customFields, issues);

  failIfInvalid(issues);
  return input as CreateTaskInput;
}

export function parseUpdateTask(body: unknown): TaskChanges {
  const obj = asObject(body);
  const issues: Issues = [];
  rejectUnknownFields(obj, issues);

  const changes: TaskChanges = {};
  if (obj.title !== undefined) changes.title = readTitle(obj.title, issues);
  if (obj.status !== undefined) changes.status = readEnum<TaskStatus>('status', TASK_STATUSES, obj.status, issues);
  if (obj.description !== undefined) changes.description = obj.description === null ? null : readDescription(obj.description, issues);
  if (obj.dueDate !== undefined) changes.dueDate = obj.dueDate === null ? null : readDueDate(obj.dueDate, issues);
  if (obj.priority !== undefined) changes.priority = obj.priority === null ? null : readEnum<TaskPriority>('priority', TASK_PRIORITIES, obj.priority, issues);
  if (obj.tags !== undefined) changes.tags = obj.tags === null ? null : readTags(obj.tags, issues);
  if (obj.customFields !== undefined) changes.customFields = obj.customFields === null ? null : readCustomFields(obj.customFields, issues);

  if (!WRITABLE_FIELDS.some((key) => obj[key] !== undefined)) {
    issues.push('provide at least one field to update');
  }
  failIfInvalid(issues);
  return changes;
}

export function parseIdList(body: unknown): string[] {
  const ids = (typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).ids
    : undefined) as unknown;

  if (!Array.isArray(ids) || ids.length === 0 || ids.length > BULK_DELETE_MAX || !ids.every(isUuid)) {
    throw new ValidationError(
      `Body must be { "ids": [...] } with 1-${BULK_DELETE_MAX} task ids (UUIDs)`,
    );
  }
  return Array.from(new Set(ids as string[]));
}
