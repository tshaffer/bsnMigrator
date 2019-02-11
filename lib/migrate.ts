import { DeviceNetworkingConfiguration } from '@brightsign/bscore';
import { tmGetTaskManager } from '@brightsign/bs-task-manager';
import {
  BsnCmError,
  BsnCmErrorType,
} from './error';
import { BsnCmMigrateParameters } from './types';
import { BsnContentMigrateJob } from './migrateJob';

export function bsnCmExecuteMigrate(migrateParameters: BsnCmMigrateParameters) {
  const taskManager = tmGetTaskManager();
  const migrateJob = new BsnContentMigrateJob(migrateParameters);
  taskManager.addTask(migrateJob);
}
