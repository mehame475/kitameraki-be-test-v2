import { app } from '@azure/functions';
import { getFormSettingsService } from '../composition';
import { NotFoundError } from '../errors';
import { endpoint, json } from '../http/handler';

// 404 means "not customised yet": clients fall back to the default form.
app.http('GetFormSettings', {
  methods: ['GET'],
  route: 'settings/task-form',
  authLevel: 'function',
  handler: endpoint(async ({ organizationId }) => {
    const settings = await getFormSettingsService().get(organizationId);
    if (!settings) throw new NotFoundError('Form settings have not been configured');
    return json(200, settings);
  }),
});
