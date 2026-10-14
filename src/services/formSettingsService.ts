import { FormSettings } from '../models/formSettings';
import type { FormSettingsStore } from '../repositories/formSettingsRepository';

export class FormSettingsService {
  constructor(private readonly store: FormSettingsStore) {}

  /** `undefined` means the organization has not customised its form yet. */
  get(organizationId: string): Promise<FormSettings | undefined> {
    return this.store.get(organizationId);
  }

  save(organizationId: string, settings: FormSettings): Promise<FormSettings> {
    return this.store.save(organizationId, settings);
  }
}
