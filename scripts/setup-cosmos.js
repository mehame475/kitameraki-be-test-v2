#!/usr/bin/env node
'use strict';
/**
 * Creates the Cosmos DB database and containers this API needs (idempotent).
 *   npm run setup:cosmos
 * Reads COSMOS_CONNECTION_STRING / COSMOS_DATABASE / COSMOS_CONTAINER / COSMOS_SETTINGS_CONTAINER
 * from the environment, falling back to the "Values" in local.settings.json.
 * Emulator with a self-signed certificate: NODE_TLS_REJECT_UNAUTHORIZED=0 npm run setup:cosmos
 */
const fs = require('fs');
const path = require('path');
const { CosmosClient } = require('@azure/cosmos');

function setting(name, fallback) {
  if (process.env[name]) return process.env[name];
  try {
    const file = path.join(__dirname, '..', 'local.settings.json');
    const values = JSON.parse(fs.readFileSync(file, 'utf8')).Values || {};
    if (values[name]) return values[name];
  } catch {
    /* no local.settings.json */
  }
  return fallback;
}

async function main() {
  const connectionString = setting('COSMOS_CONNECTION_STRING');
  if (!connectionString) {
    throw new Error('COSMOS_CONNECTION_STRING is not set (environment or local.settings.json)');
  }
  const databaseId = setting('COSMOS_DATABASE', 'TaskApp');
  const containerIds = [setting('COSMOS_CONTAINER', 'Tasks'), setting('COSMOS_SETTINGS_CONTAINER', 'FormSettings')];

  const client = new CosmosClient(connectionString);
  const { database } = await client.databases.createIfNotExists({ id: databaseId });
  for (const id of containerIds) {
    // organizationId is the partition key: every query is scoped to a single organization.
    await database.containers.createIfNotExists({ id, partitionKey: { paths: ['/organizationId'] } });
    console.log(`ready: ${databaseId}/${id} (partition key /organizationId)`);
  }
}

main().catch((error) => {
  console.error(`Setup failed: ${error.message}`);
  process.exit(1);
});
