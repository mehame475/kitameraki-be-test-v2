import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../src/errors';
import { parseCreateTask, parseIdList, parseUpdateTask } from '../src/validation/taskValidation';

const ID = '3f2b8c1e-9d4a-4e6b-8a7c-1d2e3f4a5b6c';

describe('parseCreateTask', () => {
  it('accepts a valid task and normalises it', () => {
    const task = parseCreateTask({
      title: '  Write docs ',
      status: 'todo',
      priority: 'high',
      dueDate: '2026-01-31T00:00:00.000Z',
      tags: ['a', ' a ', 'b'],
    });
    assert.equal(task.title, 'Write docs');
    assert.deepEqual(task.tags, ['a', 'b']);
  });

  it('requires title and status', () => {
    assert.throws(() => parseCreateTask({}), ValidationError);
  });

  it('rejects unknown, read-only and mistyped fields', () => {
    assert.throws(() => parseCreateTask({ title: 'x', status: 'todo', organizationId: ID }), ValidationError);
    assert.throws(() => parseCreateTask({ title: 'x', status: 'done' }), ValidationError);
    assert.throws(() => parseCreateTask({ title: 'x'.repeat(101), status: 'todo' }), ValidationError);
    assert.throws(() => parseCreateTask({ title: 'x', status: 'todo', dueDate: 'tomorrow' }), ValidationError);
    assert.throws(() => parseCreateTask('nope'), ValidationError);
  });
});

describe('parseUpdateTask', () => {
  it('allows partial updates and null to clear optional fields', () => {
    assert.deepEqual(parseUpdateTask({ status: 'completed', dueDate: null }), {
      status: 'completed',
      dueDate: null,
    });
  });

  it('rejects empty updates and null for required fields', () => {
    assert.throws(() => parseUpdateTask({}), ValidationError);
    assert.throws(() => parseUpdateTask({ title: null }), ValidationError);
  });
});

describe('parseIdList', () => {
  it('accepts and de-duplicates UUIDs', () => {
    assert.deepEqual(parseIdList({ ids: [ID, ID] }), [ID]);
  });
  it('rejects malformed input', () => {
    assert.throws(() => parseIdList({ ids: ['not-a-uuid'] }), ValidationError);
    assert.throws(() => parseIdList({ ids: [] }), ValidationError);
    assert.throws(() => parseIdList([ID]), ValidationError);
  });
});
