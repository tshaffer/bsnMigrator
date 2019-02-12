import {
  BsTask,
  BsTaskType,
  BsTaskStatus,
  BsTaskResult,
} from '@brightsign/bs-task-manager';
import {
  AssetType,
  BsAssetItem,
  bscIsAssetItem,
} from '@brightsign/bscore';
import {
  BsnCmError,
  BsnCmErrorType,
} from './error';
import {
  BsnCmMigrateParameters,
  BsnCmMigrateSpec,
  BsnCmMigrateAssetSpec,
  BsnCmMigrateAssetStatus,
  BsnCmMigrateAssetResult,
  BsnCmMigrateJobResult,
  BsnCmMigrateJobProgress,
  BsnCmMigrateJobProgressCallback,
} from './types';
import { bsnCmGetMigrationSpec } from './migrateSpec';
import { bsnCmMigrateContentAssets } from './migrateContent';
import { bsnCmMigrateScriptAssets } from './migrateScript';
import { bsnCmMigrateWebPageAssets } from './migrateWebPage';
import { bsnCmMigrateDataFeedAssets } from './migrateDataFeed';
import { bsnCmMigrateMediaFeedAssets } from './migrateMediaFeed';
import { bsnCmMigrateDynamicPlaylistAssets } from './migrateDynamicPlaylist';
import { bsnCmMigratePresentationAssets } from './migratePresentation';
import { bsnCmGetGuid } from './utils';

export class BsnContentMigrateJob implements BsTask {

  // region Private fields
  /** @internal */
  /** @private */
  private _id: string;
  /** @internal */
  /** @private */
  private _name: string;
  /** @internal */
  /** @private */
  private _type: BsTaskType;
  /** @internal */
  /** @private */
  private _status: BsTaskStatus;
  /** @internal */
  /** @private */
  private _migrateParameters: BsnCmMigrateParameters;
  /** @internal */
  /** @private */
  private _migrateSpec: BsnCmMigrateSpec;
  /** @internal */
  /** @private */
  private _progressCallback: BsnCmMigrateJobProgressCallback;
  /** @internal */
  /** @private */
  private _result: BsnCmMigrateJobResult = null;
  /** @internal */
  /** @private */
  private _progress: BsnCmMigrateJobProgress = null;
  /** @internal */
  /** @private */
  private _completedPublishSize: number = 0;
  /** @internal */
  /** @private */
  private _totalPublishSize: number = 0;
  /** @internal */
  /** @private */
  private _cancellationRequested: boolean = false;
  // endregion

  // region Public properties
  get id() {
    return this._id;
  }
  get name() {
    return this._name;
  }
  get type() {
    return this._type;
  }
  get status() {
    return this._status;
  }
  get isDone() {
    return this.status === BsTaskStatus.Completed
    || this.status === BsTaskStatus.Failed
    || this.status === BsTaskStatus.Cancelled;
  }
  get isCancelled() {
    return this._status === BsTaskStatus.Cancelled;
  }
  get cancellationRequested() {
    return this._cancellationRequested;
  }
  get hasItemFailures() {
    return this._result.hasItemFailures;
  }
  get progress() {
    return this._progress;
  }
  get result() {
    return this._result;
  }
  // endregion

  // region constructor
  constructor(parameters: BsnCmMigrateParameters) {
    // TODO validate publish params

    // Generate a unique ID for the job
    this._id = bsnCmGetGuid();
    this._name = 'Migrate Job'; // TODO allow client code to provide this
    this._type = BsTaskType.BsnContentMigrateJob;
    this._status = BsTaskStatus.Pending;
    this._migrateParameters = parameters;
    this._result = {
      id: this._id,
      type: this._type,
      status: this._status,
      results: [],
      hasItemFailures: false,
    };

    this._progress = {
      id: this._id,
      type: this._type,
      status: this._status,
      totalItems: 0,
      completedItems: 0,
      failedItems: 0,
      totalProgressFraction: 0,
      statuses: [],
    };

    this._progressCallback = parameters.onProgressEvent;
    this._completedPublishSize = 0;
    this._totalPublishSize = 0;
    this._cancellationRequested = false;

  }

  start(): Promise<BsTaskResult> {
    this._setTaskStatus(BsTaskStatus.Initializing);
    return this._prepareMigrateSpec()
     // creates a list of all assets; pulls files and throws them away after it retrieves required information
      .then(() => this._prepareMigrateTarget())
      .then(() => this._setTaskStatus(BsTaskStatus.InProgress))
      // .then(() => console.log('migrating content...'))
      // .then(() => bsnCmMigrateContentAssets(this._migrateSpec))
      // .then(() => console.log('migrating presentations...'))
      // .then(() => bsnCmMigratePresentationAssets(this._migrateSpec))

      .then(() => console.log('migrating content...'))
      .then(() => bsnCmMigrateContentAssets(this._migrateSpec))
      .then(() => console.log('migrating scripts...'))
      .then(() => bsnCmMigrateScriptAssets(this._migrateSpec))
      .then(() => console.log('migrating web pages...'))
      .then(() => bsnCmMigrateWebPageAssets(this._migrateSpec))
      .then(() => console.log('migrating data feeds...'))
      .then(() => bsnCmMigrateDataFeedAssets(this._migrateSpec))
      .then(() => console.log('migrating media feeds...'))
      .then(() => bsnCmMigrateMediaFeedAssets(this._migrateSpec))
      .then(() => console.log('migrating playlists...'))
      .then(() => bsnCmMigrateDynamicPlaylistAssets(this._migrateSpec))
      .then(() => console.log('migrating presentations...'))
      .then(() => bsnCmMigratePresentationAssets(this._migrateSpec))

      // TODO clean up temp assets

      .then(() => this._setTaskStatus(BsTaskStatus.Completed))
      .then(() => this._result)
      .catch((error: Error) => {
        this._result.error = error;
        this._setTaskStatus(BsTaskStatus.Failed);
        return this._result;
      });
  }

  cancel() {
    if (!this.isDone) {
      this._cancellationRequested = true;
    }
  }

  _setTaskStatus(status: BsTaskStatus): void {
    // ignore incoming state change
    // if terminal state already set
    if (this._status === BsTaskStatus.Failed
    || this._status === BsTaskStatus.Cancelled
    || this._status === BsTaskStatus.Completed) {
      this._result.status = this._status;
      this._progress.status = this._status;
    } else {
      if (status === BsTaskStatus.Failed) {
        this._result.hasItemFailures = true;
      } else if (status === BsTaskStatus.Completed) {
        this._result.hasItemFailures = false;
      }

      this._result.status = status;
      this._progress.status = status;
      this._status = status;
    }
    if (this._progressCallback) {
      this._progressCallback(this._progress);
    }
  }

  _prepareMigrateSpec(): Promise<void> {
    if (this._status === BsTaskStatus.Cancelled
    || this._status === BsTaskStatus.Failed) {
      return Promise.resolve();
    } else if (this._cancellationRequested) {
      this._setTaskStatus(BsTaskStatus.Cancelled);
      return Promise.resolve();
    }

    return bsnCmGetMigrationSpec(this._migrateParameters)
      .then((migrateSpec) => {
        this._migrateSpec = migrateSpec;
        return Promise.resolve();
      });
  }

  _prepareMigrateTarget(): Promise<void> {
    if (this._status === BsTaskStatus.Cancelled
    || this._status === BsTaskStatus.Failed) {
      return Promise.resolve();
    } else if (this._cancellationRequested) {
      this._setTaskStatus(BsTaskStatus.Cancelled);
      return Promise.resolve();
    }

  }
  // _handleProgressUpdate(): Promise<void> {
  //   // TODO validate spec
  //   let failureCount = 0;

  //   const processNextAsset = (index: number): Promise<void> => {

  //     if (index >= this._migrateSpec.assets.length) {
  //       return Promise.resolve();
  //     }

  //     const migrateAssetHash = this._migrateSpec.assets[index];
  //     const migrateAsset = this._migrateSpec.assetMap[migrateAssetHash];
  //     if (this._status !== BsTaskStatus.Cancelled && !this.hasItemFailures) {
  //       if (this._status === BsTaskStatus.Failed) {
  //         return Promise.resolve();
  //       } else if (this._cancellationRequested) {
  //         this._setTaskStatus(BsTaskStatus.Cancelled);
  //         this._progress.statuses[index].status = BsnCmMigrateAssetStatus.Cancelled;
  //         this._result.results[index].status = BsnCmMigrateAssetStatus.Cancelled;
  //         return Promise.resolve();
  //       }

  //       this._progress.statuses[index].status = BsnCmMigrateAssetStatus.Publishing;
  //       this._result.results[index].status = BsnCmMigrateAssetStatus.Publishing;
  //       return bsnCmMigrateAsset(migrateAsset)
  //         .then(() => {
  //           this._completedPublishSize += migrateAsset.sourceAssetItem.fileSize;
  //           this._progress.completedItems += 1;
  //           this._progress.totalProgressFraction = this._completedPublishSize / this._totalPublishSize;
  //           this._progress.statuses[index].fractionComplete = 1;
  //           this._progress.statuses[index].status = BsnCmMigrateAssetStatus.Published;
  //           this._result.results[index].status = BsnCmMigrateAssetStatus.Published;
  //           failureCount = 0;

  //           if (this._progressCallback) {
  //             this._progressCallback(this._progress);
  //           }

  //           return processNextAsset(index + 1);

  //         }).catch((error: Error) => {
  //           if (failureCount > 3) {
  //             this._progress.statuses[index].status = BsnCmMigrateAssetStatus.Failed;
  //             this._result.results[index].status = BsnCmMigrateAssetStatus.Failed;
  //             this._result.results[index].error = error;
  //             this._result.hasItemFailures = true;
  //             this._progress.failedItems += 1;
  //             // fail job on first file publish failure
  //             this._setTaskStatus(BsTaskStatus.Failed);
  //             return Promise.resolve();
  //           }
  //           failureCount++;
  //           return processNextAsset(index);
  //         });
  //       } else {
  //         // Cancelled or job level failure
  //         return Promise.resolve();
  //       }
  //     };
  //   return processNextAsset(0);
  // }
}
