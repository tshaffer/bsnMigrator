import {
  BsnConnectorOverrideProps,
  BsAssetLocator,
  BsAssetItem,
} from '@brightsign/bscore';
import {
  BsTaskResult,
  BsTaskProgress,
} from '@brightsign/bs-task-manager';
import {
  BsAssetUploadFileItemSpec,
  BsAssetUploadWebPageSessionSpec,
} from '@brightsign/bs-content-manager';

export interface BsnCmGetStaticFileProgressEvent {
  file: string;
  loadedSize: number;
  totalSize: number;
}

export interface BsnCmGetStaticFileOptions {
  onFileProgress: (progressEvent: BsnCmGetStaticFileProgressEvent) => void;
}

export interface BsnCmAuthenticationData {
  userName: string;
  password: string;
  networkName: string;
}

export interface BsnCmMigrateConnectorConfiguration {
  service: BsnConnectorOverrideProps;
  authentication: BsnCmAuthenticationData;
}

export type BsnCmMigrateJobProgressCallback = (migrateProgress: BsnCmMigrateJobProgress) => void;

export interface BsnCmMigrateParameters {
  source: BsnCmMigrateConnectorConfiguration;
  destination: BsnCmMigrateConnectorConfiguration;
  assets: BsAssetLocator[];
  onProgressEvent?: BsnCmMigrateJobProgressCallback;
}

export interface BsnCmMigrateAssetSpec {
  id: string;
  sourceAssetItem: BsAssetItem;
  stagedAssetItem: BsAssetItem | null;
  destinationAssetItem: BsAssetItem | null;
  dependencies: BsAssetItem[];
  dependants: BsAssetItem[];
}

export interface BsnCmMigrateAssetMap {
  [assetHash: string]: BsnCmMigrateAssetSpec;
}

export interface BsnCmMigrateSpec {
  id: string;
  parameters: BsnCmMigrateParameters;
  assets: string[];
  assetMap: BsnCmMigrateAssetMap;
}

export class BsnCmMigrateAssetStatus {
  static Pending: string = 'Pending';
  static Initializing: string = 'Initializing';
  static Publishing: string = 'Migrating';
  static Published: string = 'Completed';
  static Cancelled: string = 'Canceled';
  static Failed: string = 'Failed';
}

Object.freeze(BsnCmMigrateAssetStatus);

export interface BsnCmMigrateAssetResult {
  jobIndex: number;
  status: BsnCmMigrateAssetStatus;
  spec: BsnCmMigrateAssetSpec;
  error?: Error;
}

export interface BsnCmMigrateAssetProgress {
  jobIndex: number;
  status: BsnCmMigrateAssetStatus;
  spec: BsnCmMigrateAssetSpec;
  fractionComplete: number;
}

export interface BsnCmMigrateJobResult extends BsTaskResult {
  results: BsnCmMigrateAssetResult[];
  error?: Error; // tracks job level failures not associated with migrate asset
}

export interface BsnCmMigrateJobProgress extends BsTaskProgress {
  statuses: BsnCmMigrateAssetProgress[];
}

export interface BsnCmAssetUploadFileSpec extends BsAssetUploadFileItemSpec {
  migrateAssetSpec: BsnCmMigrateAssetSpec;
}

export interface BsnCmAssetUploadWebPageFileSpec extends BsAssetUploadWebPageSessionSpec {
  migrateAssetSpec: BsnCmMigrateAssetSpec;
}

export interface SplunkConvertBpfIssue {
  status: string;
  type: string;
  issueData?: any;
}

export interface SplunkResult {
  status: string;
  hasItemFailures: boolean;
  convertBpfIssues: SplunkConvertBpfIssue[];
}

export interface SplunkConversionResult {
  timeStamp: Date;
  presentationName: string;
  result: SplunkResult;
}