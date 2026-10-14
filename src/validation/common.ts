const FIELD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Ids used as object keys / identifiers: short, URL-safe, and never a prototype-polluting name. */
export const isFieldId = (value: unknown): value is string =>
  typeof value === 'string' && FIELD_ID_RE.test(value) && !FORBIDDEN_KEYS.has(value);
