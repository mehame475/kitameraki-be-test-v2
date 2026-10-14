import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Container } from '@azure/cosmos';
import { ConflictError, NotFoundError } from '../src/errors';
import { Task } from '../src/models/task';
import { CosmosTaskRepository } from '../src/repositories/taskRepository';

const ORG = '11111111-1111-4111-8111-111111111111';
type Doc = Task & { _etag: string; _rid: string };

const cosmosError = (code: number) => Object.assign(new Error(`cosmos ${code}`), { code });

/** Minimal in-memory stand-in for the parts of the Cosmos SDK the repository uses. */
class FakeContainer {
  docs = new Map<string, Doc>();
  lastQuery: { query: string; parameters: { name: string; value: unknown }[] } | undefined;
  lastPartitionKey: unknown;
  readThrowsOn404 = false;
  private key = (pk: string, id: string) => `${pk}/${id}`;

  items = {
    query: (spec: FakeContainer['lastQuery'] & object, options: { partitionKey?: unknown }) => {
      this.lastQuery = spec;
      this.lastPartitionKey = options.partitionKey;
      const org = spec.parameters[0].value;
      return { fetchAll: async () => ({ resources: [...this.docs.values()].filter((d) => d.organizationId === org) }) };
    },
    create: async (task: Task) => {
      const doc: Doc = { ...task, _etag: 'v1', _rid: 'internal' };
      this.docs.set(this.key(task.organizationId, task.id), doc);
      return { resource: doc };
    },
  };

  item = (id: string, pk: string) => ({
    read: async () => {
      const doc = this.docs.get(this.key(pk, id));
      if (!doc && this.readThrowsOn404) throw cosmosError(404);
      return { resource: doc, statusCode: doc ? 200 : 404 };
    },
    replace: async (task: Task, options: { accessCondition: { condition: string } }) => {
      const current = this.docs.get(this.key(pk, id));
      if (!current) throw cosmosError(404);
      if (current._etag !== options.accessCondition.condition) throw cosmosError(412);
      const doc: Doc = { ...task, _etag: `${current._etag}+`, _rid: current._rid };
      this.docs.set(this.key(pk, id), doc);
      return { resource: doc };
    },
    delete: async () => {
      if (!this.docs.delete(this.key(pk, id))) throw cosmosError(404);
      return {};
    },
  });
}

const setup = () => {
  const container = new FakeContainer();
  return { container, repo: new CosmosTaskRepository(container as unknown as Container) };
};
const task = (over: Partial<Task> = {}): Task => ({ id: 'a', organizationId: ORG, title: 't', status: 'todo', ...over });

describe('CosmosTaskRepository', () => {
  it('lists with a parameterised, partition-scoped query (no injection)', async () => {
    const { container, repo } = setup();
    const hostile = "x' OR 1=1 --";
    await repo.list(hostile);
    assert.equal(container.lastQuery?.query.includes(hostile), false);
    assert.deepEqual(container.lastQuery?.parameters, [{ name: '@organizationId', value: hostile }]);
    assert.equal(container.lastPartitionKey, hostile);
  });

  it('never returns Cosmos system properties', async () => {
    const { repo } = setup();
    await repo.create(task());
    const [listed] = await repo.list(ORG);
    const found = await repo.findById(ORG, 'a');
    assert.deepEqual(Object.keys(listed).sort(), ['id', 'organizationId', 'status', 'title']);
    assert.equal(found?.etag, 'v1');
    assert.equal('_etag' in (found?.task ?? {}), false);
  });

  it('findById resolves undefined for missing items, whether the SDK returns or throws 404', async () => {
    const { container, repo } = setup();
    assert.equal(await repo.findById(ORG, 'missing'), undefined);
    container.readThrowsOn404 = true;
    assert.equal(await repo.findById(ORG, 'missing'), undefined);
  });

  it('replace uses the etag: stale writes become ConflictError, missing items NotFoundError', async () => {
    const { repo } = setup();
    await repo.create(task());
    const updated = await repo.replace(task({ title: 'new' }), 'v1');
    assert.equal(updated.title, 'new');
    await assert.rejects(repo.replace(task({ title: 'again' }), 'v1'), ConflictError);
    await assert.rejects(repo.replace(task({ id: 'ghost' }), 'v1'), NotFoundError);
  });

  it('delete reports whether the item existed', async () => {
    const { repo } = setup();
    await repo.create(task());
    assert.equal(await repo.delete(ORG, 'a'), true);
    assert.equal(await repo.delete(ORG, 'a'), false);
  });
});
