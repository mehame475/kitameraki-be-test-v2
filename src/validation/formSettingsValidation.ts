import { ValidationError } from '../errors';
import {
  BUILTIN_FIELD_KEYS,
  BuiltinFieldKey,
  CUSTOM_FIELD_TYPES,
  CustomFieldType,
  FormField,
  FormRow,
  FormSettings,
  MAX_FORM_COLUMNS,
} from '../models/formSettings';
import { isFieldId } from './common';

export const LABEL_MAX = 100;
export const MAX_FIELDS = 100;

type Issues = string[];
type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function onlyKeys(obj: Obj, allowed: string[], where: string, issues: Issues): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) issues.push(`${where}: unknown property "${key}"`);
  }
}

function readField(raw: unknown, where: string, issues: Issues): FormField | undefined {
  if (!isObject(raw)) {
    issues.push(`${where} must be an object`);
    return undefined;
  }
  const before = issues.length;
  const { id, label, kind } = raw;

  if (!isFieldId(id)) issues.push(`${where}.id must be 1-64 characters of letters, digits, "_" or "-"`);
  const trimmed = typeof label === 'string' ? label.trim() : '';
  if (!trimmed || trimmed.length > LABEL_MAX) issues.push(`${where}.label must be 1-${LABEL_MAX} characters`);

  let field: FormField | undefined;
  if (kind === 'builtin') {
    onlyKeys(raw, ['id', 'label', 'kind', 'key'], where, issues);
    if (!(BUILTIN_FIELD_KEYS as readonly unknown[]).includes(raw.key)) {
      issues.push(`${where}.key must be one of: ${BUILTIN_FIELD_KEYS.join(', ')}`);
    } else if (id !== raw.key) {
      issues.push(`${where}.id of a built-in field must equal its key`);
    } else {
      field = { id: id as string, label: trimmed, kind: 'builtin', key: raw.key as BuiltinFieldKey };
    }
  } else if (kind === 'custom') {
    onlyKeys(raw, ['id', 'label', 'kind', 'type'], where, issues);
    if (!(CUSTOM_FIELD_TYPES as readonly unknown[]).includes(raw.type)) {
      issues.push(`${where}.type must be one of: ${CUSTOM_FIELD_TYPES.join(', ')}`);
    } else {
      field = { id: id as string, label: trimmed, kind: 'custom', type: raw.type as CustomFieldType };
    }
  } else {
    issues.push(`${where}.kind must be "builtin" or "custom"`);
  }
  return issues.length === before ? field : undefined;
}

export function parseFormSettings(body: unknown): FormSettings {
  if (!isObject(body)) throw new ValidationError('Request body must be a JSON object');
  const issues: Issues = [];
  onlyKeys(body, ['rows'], 'body', issues);

  const rawRows = body.rows;
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new ValidationError('Request validation failed', [...issues, 'rows must be a non-empty array']);
  }

  const rows: FormRow[] = [];
  const rowIds = new Set<string>();
  const fieldIds = new Set<string>();
  const builtinCounts = new Map<string, number>();
  let total = 0;

  rawRows.forEach((rawRow, r) => {
    const where = `rows[${r}]`;
    if (!isObject(rawRow)) {
      issues.push(`${where} must be an object`);
      return;
    }
    onlyKeys(rawRow, ['id', 'fields'], where, issues);
    if (!isFieldId(rawRow.id)) issues.push(`${where}.id must be 1-64 characters of letters, digits, "_" or "-"`);
    else if (rowIds.has(rawRow.id)) issues.push(`${where}.id is duplicated`);
    else rowIds.add(rawRow.id);

    const rawFields = rawRow.fields;
    if (!Array.isArray(rawFields) || rawFields.length < 1 || rawFields.length > MAX_FORM_COLUMNS) {
      issues.push(`${where}.fields must contain 1-${MAX_FORM_COLUMNS} fields`);
      return;
    }

    const fields: FormField[] = [];
    rawFields.forEach((rawField, c) => {
      total += 1;
      const field = readField(rawField, `${where}.fields[${c}]`, issues);
      if (!field) return;
      if (fieldIds.has(field.id)) issues.push(`${where}.fields[${c}].id is duplicated`);
      fieldIds.add(field.id);
      if (field.kind === 'builtin') builtinCounts.set(field.key, (builtinCounts.get(field.key) ?? 0) + 1);
      fields.push(field);
    });
    rows.push({ id: rawRow.id as string, fields });
  });

  if (total > MAX_FIELDS) issues.push(`a form can have at most ${MAX_FIELDS} fields`);
  for (const key of BUILTIN_FIELD_KEYS) {
    if (builtinCounts.get(key) !== 1) issues.push(`built-in field "${key}" must appear exactly once`);
  }

  if (issues.length > 0) throw new ValidationError('Request validation failed', issues);
  return { rows };
}
