import { Container } from '@azure/cosmos';
import { FormSettings } from '../models/formSettings';

/** Persistence port for per-organization form settings. */
export interface FormSettingsStore {
  get(organizationId: string): Promise<FormSettings | undefined>;
  save(organizationId: string, settings: FormSettings): Promise<FormSettings>;
}

/** One document per organization (partition key /organizationId). */
const SETTINGS_DOC_ID = 'task-form';

type StoredFormSettings = FormSettings & { id: string; organizationId: string; updatedAt: string };

const statusCode = (error: unknown): number | undefined => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
};

export class CosmosFormSettingsRepository implements FormSettingsStore {
  constructor(private readonly container: Container) {}

  async get(organizationId: string): Promise<FormSettings | undefined> {
    try {
      const { resource } = await this.container
        .item(SETTINGS_DOC_ID, organizationId)
        .read<StoredFormSettings>();
      return resource ? { rows: resource.rows } : undefined;
    } catch (error) {
      if (statusCode(error) === 404) return undefined;
      throw error;
    }
  }

  async save(organizationId: string, settings: FormSettings): Promise<FormSettings> {
    const doc: StoredFormSettings = {
      id: SETTINGS_DOC_ID,
      organizationId,
      rows: settings.rows,
      updatedAt: new Date().toISOString(),
    };
    await this.container.items.upsert<StoredFormSettings>(doc);
    return { rows: doc.rows };
  }
}
