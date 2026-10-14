import { Container, CosmosClient, Database } from '@azure/cosmos';
import { getConfig } from '../config/env';

let database: Database | undefined;

/** One CosmosClient per worker process (the SDK is designed to be reused). */
function getDatabase(): Database {
  if (!database) {
    const config = getConfig();
    database = new CosmosClient({
      connectionString: config.cosmosConnectionString,
      userAgentSuffix: 'kitameraki-task-api', // identifies this service in Cosmos diagnostics
    }).database(config.databaseId);
  }
  return database;
}

export const getTasksContainer = (): Container => getDatabase().container(getConfig().containerId);

export const getFormSettingsContainer = (): Container =>
  getDatabase().container(getConfig().settingsContainerId);
