import { app } from '@azure/functions';
import { getTaskService } from '../composition';
import { endpoint, json, readJsonBody, requireTaskId } from '../http/handler';
import { parseUpdateTask } from '../validation/taskValidation';

app.http('UpdateTask', {
  methods: ['PATCH'],
  route: 'tasks/{id}',
  authLevel: 'function',
  handler: endpoint(async ({ request, organizationId }) => {
    const id = requireTaskId(request);
    const changes = parseUpdateTask(await readJsonBody(request));
    return json(200, await getTaskService().update(organizationId, id, changes));
  }),
});
