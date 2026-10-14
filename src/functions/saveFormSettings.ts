import { app } from '@azure/functions';
import { getFormSettingsService } from '../composition';
import { endpoint, json, readJsonBody } from '../http/handler';
import { parseFormSettings } from '../validation/formSettingsValidation';

app.http('SaveFormSettings', {
  methods: ['PUT'],
  route: 'settings/task-form',
  authLevel: 'function',
  handler: endpoint(async ({ request, organizationId }) => {
    const settings = parseFormSettings(await readJsonBody(request));
    return json(200, await getFormSettingsService().save(organizationId, settings));
  }),
});
