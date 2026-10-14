import { getFormSettingsContainer, getTasksContainer } from './infrastructure/cosmos';
import { CosmosFormSettingsRepository } from './repositories/formSettingsRepository';
import { CosmosTaskRepository } from './repositories/taskRepository';
import { FormSettingsService } from './services/formSettingsService';
import { TaskService } from './services/taskService';

let taskService: TaskService | undefined;
let formSettingsService: FormSettingsService | undefined;

const settingsRepository = () => new CosmosFormSettingsRepository(getFormSettingsContainer());

/** Composition root: the only place that wires concrete implementations together. */
export function getTaskService(): TaskService {
  if (!taskService) {
    taskService = new TaskService(new CosmosTaskRepository(getTasksContainer()), settingsRepository());
  }
  return taskService;
}

export function getFormSettingsService(): FormSettingsService {
  if (!formSettingsService) formSettingsService = new FormSettingsService(settingsRepository());
  return formSettingsService;
}
