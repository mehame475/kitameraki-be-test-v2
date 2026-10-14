import { app } from '@azure/functions';
import { getTaskService } from '../composition';
import { endpoint, json, readJsonBody } from '../http/handler';
import { parseCreateTask } from '../validation/taskValidation';

app.http('InsertTask', {
  methods: ['POST'],
  route: 'tasks',
  authLevel: 'function',
  handler: endpoint(async ({ request, organizationId }) => {
    const input = parseCreateTask(await readJsonBody(request));
    return json(201, await getTaskService().create(organizationId, input));
  }),
});
