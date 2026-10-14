import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../src/errors';
import { parseFormSettings } from '../src/validation/formSettingsValidation';

const builtin = (key: string, label = key) => ({ id: key, label, kind: 'builtin', key });

const validRows = () => [
  { id: 'r1', fields: [builtin('title', 'Title')] },
  { id: 'r2', fields: [builtin('description')] },
  { id: 'r3', fields: [builtin('status'), builtin('priority')] },
  { id: 'r4', fields: [builtin('dueDate'), builtin('tags')] },
];

describe('parseFormSettings', () => {
  it('accepts the default layout plus custom fields', () => {
    const rows = [...validRows(), { id: 'r5', fields: [{ id: 'abc', label: ' Phone ', kind: 'custom', type: 'text' }] }];
    const parsed = parseFormSettings({ rows });
    assert.equal(parsed.rows.length, 5);
    assert.equal(parsed.rows[4].fields[0].label, 'Phone');
  });

  it('rejects rows with more than two columns or no fields', () => {
    const three = [{ id: 'x', fields: [builtin('title'), builtin('status'), builtin('priority')] }];
    assert.throws(() => parseFormSettings({ rows: three }), ValidationError);
    assert.throws(() => parseFormSettings({ rows: [{ id: 'x', fields: [] }] }), ValidationError);
  });

  it('requires every built-in field exactly once', () => {
    assert.throws(() => parseFormSettings({ rows: validRows().slice(1) }), ValidationError);
    assert.throws(() => parseFormSettings({ rows: [...validRows(), { id: 'dup', fields: [builtin('title')] }] }), ValidationError);
  });

  it('rejects bad labels, unknown types, duplicate ids and unsafe ids', () => {
    const custom = (over: object) => ({ id: 'r9', fields: [{ id: 'f9', label: 'L', kind: 'custom', type: 'text', ...over }] });
    for (const bad of [{ label: ' ' }, { type: 'number' }, { id: '__proto__' }, { extra: 1 }]) {
      assert.throws(() => parseFormSettings({ rows: [...validRows(), custom(bad)] }), ValidationError);
    }
    const dupe = [...validRows(), custom({}), { id: 'r10', fields: [{ id: 'f9', label: 'L', kind: 'custom', type: 'date' }] }];
    assert.throws(() => parseFormSettings({ rows: dupe }), ValidationError);
  });
});
