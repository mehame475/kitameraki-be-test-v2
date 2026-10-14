import { ValidationError } from '../errors';
import { FormSettings } from '../models/formSettings';
import { isFieldId } from './common';
import { isIsoDateTime } from './taskValidation';

export const CUSTOM_VALUE_MAX = 1000;
export const CUSTOM_FIELDS_MAX = 100;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Shape check for the `customFields` property of a task body. */
export function readCustomFields(value: unknown, issues: string[]): Record<string, string> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push('customFields must be an object whose values are strings');
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.length > CUSTOM_FIELDS_MAX) {
    issues.push(`customFields can hold at most ${CUSTOM_FIELDS_MAX} values`);
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, v] of entries) {
    if (!isFieldId(key) || typeof v !== 'string' || v === '' || v.length > CUSTOM_VALUE_MAX) {
      issues.push(`customFields["${key}"] must have a valid field id and a non-empty string value of at most ${CUSTOM_VALUE_MAX} characters`);
      return undefined;
    }
    result[key] = v;
  }
  return result;
}

/** Checks values against the organization's form settings (known field + value matches the field type). */
export function validateCustomFieldValues(
  values: Record<string, string>,
  settings: FormSettings | undefined,
): void {
  const customFields = new Map(
    (settings?.rows ?? []).flatMap((row) => row.fields).flatMap((f) => (f.kind === 'custom' ? [[f.id, f] as const] : [])),
  );
  const issues: string[] = [];

  for (const [id, value] of Object.entries(values)) {
    const field = customFields.get(id);
    if (!field) {
      issues.push(`customFields["${id}"] does not match a custom field in the form settings`);
      continue;
    }
    if (field.type === 'email' && !EMAIL_RE.test(value)) issues.push(`"${field.label}" must be a valid email address`);
    if (field.type === 'date' && (!DATE_RE.test(value) || Number.isNaN(Date.parse(value)))) {
      issues.push(`"${field.label}" must be a date (yyyy-mm-dd)`);
    }
    if (field.type === 'datetime' && !isIsoDateTime(value)) {
      issues.push(`"${field.label}" must be an ISO 8601 date-time`);
    }
  }
  if (issues.length > 0) throw new ValidationError('Request validation failed', issues);
}
