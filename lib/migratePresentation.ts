import isomorphicPath from 'isomorphic-path';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import {
  isObject,
  isArray,
  isNil,
} from 'lodash';
import {
  AssetType,
  AssetLocation,
  BsAssetItem,
  BsnPresentationProperties,
  MediaType,
  bscIsAssetItem,
  BsAssetLocator,
} from '@brightsign/bscore';
import {
  DmState,
  DmBsProjectState,
  dmFilterDmState,
  dmUpdateAssetLocation,
  dmGetAssetItemById,
  dmGetAssetItemIdsForSign,
  bsDmReducer,
} from '@brightsign/bsdatamodel';
import {
  BsPresentationAssetCollection,
  BsPresentationAsset,
  cmGetBsAssetCollection,
  cmGetBsAssetForAssetLocator,
} from '@brightsign/bs-content-manager';
import {
  fsCreateNestedDirectory,
  fsSaveObjectAsLocalJsonFile,
  fsGetAssetItemFromFile,
  fsGetLocalJsonFileAsObject,
} from '@brightsign/fsconnector';
import { tmGetTaskManager, BsTaskResult } from '@brightsign/bs-task-manager';
import {
  BpfConverterJobResult,
  BpfConverterJob,
  BpfConverterSpec,
  bpfExecuteConversion,
} from '@brightsign/bs-bpf-converter';
import {
  BsnCmMigrateSpec,
  BsnCmMigrateAssetSpec,
  BsnCmMigrateConnectorConfiguration,
  BsnCmAssetUploadFileSpec,
} from './types';
import {
  BsnCmError,
  BsnCmErrorType,
} from './error';
import {
  bsnCmGetGuid,
  bsnCmMigrateConnect,
  bsnCmGetStoredFileAsArrayBuffer,
  bsnCmGetTmpDirPathForAssetSpec,
  bsnCmGetTmpPathForAssetSpec,
  csDmCreateHashFromAssetLocator,
} from './utils';
import {
  bsnCmGetAsset
} from './migrateSpec';

// TODO this translation routine belongs in bs-playlist-dm
function bsnCmResolveDmAssetMap(spec: BsnCmMigrateSpec, dmState: DmState | DmBsProjectState): DmState {
  // TODO validate DM state
  const store = createStore<DmState>(bsDmReducer, dmFilterDmState(dmState), applyMiddleware(thunk));
  const state = store.getState();
  const assetIds = dmGetAssetItemIdsForSign(state);
  assetIds.forEach((assetId) => {
    const assetItem = dmGetAssetItemById(state, { id: assetId });
    if (bscIsAssetItem(assetItem)) {
      const assetHash = csDmCreateHashFromAssetLocator(assetItem);
      const assetItemMigrationSpec = spec.assetMap[assetHash];
      if (isNil(assetItemMigrationSpec) || isNil(assetItemMigrationSpec.destinationAssetItem)) {
        const errorMessage = 'bsnCmGetPresentationDmState cannot find migrated asset item of project content '
          + JSON.stringify(assetItem);
        throw new BsnCmError(BsnCmErrorType.unexpectedError, errorMessage);
      }
      store.dispatch(dmUpdateAssetLocation(assetItem, assetItemMigrationSpec.destinationAssetItem));
    }
  });

  return dmFilterDmState(store.getState());
}

function bsnCmGetLegacyPresentationDmState(buffer: Buffer): Promise<DmBsProjectState> {

  return new Promise((resolve, reject) => {
    const conversionParameters = {
      buffer,
      assetItem: null,
      assetLocator: null,
      filePath: '',
    };

    const bpfConverterJob = new BpfConverterJob(conversionParameters, null);
    bpfConverterJob.start()
      .then((bsTaskResult: BsTaskResult) => {
        const conversionTaskResult: BpfConverterJobResult = bsTaskResult as BpfConverterJobResult;
        resolve(conversionTaskResult.projectFileState);
      });
  });
}

function bsnCmGetBpfxPresentationAssetFile(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
): Promise<BsAssetItem> {
  if (assetSpec.sourceAssetItem.assetType !== AssetType.Project
    || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetPresentationAssetFile must be given asset locator of BSN presentation entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpFilePath = bsnCmGetTmpPathForAssetSpec(spec, assetSpec);
    return fsCreateNestedDirectory(tmpDirPath)
      .then(() => cmGetBsAssetForAssetLocator(assetSpec.sourceAssetItem))
      .then((asset) => (asset as BsPresentationAsset).getProjectState())
      .then((state) => fsSaveObjectAsLocalJsonFile(state as object, tmpFilePath))
      .then(() => fsGetAssetItemFromFile(tmpFilePath));
  }
}

function bsnCmGetBpfPresentationAssetFile(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
): Promise<BsAssetItem> {
  if (assetSpec.sourceAssetItem.assetType !== AssetType.ProjectBpf
    || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetLegacyPresentationAssetFile must be given asset locator of BSN legacy '
      + ' presentation entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpFilePath = bsnCmGetTmpPathForAssetSpec(spec, assetSpec);

    const assetLocator: BsAssetLocator = spec.parameters.assets[0];
    bsnCmGetAsset(assetLocator).then( (asset: any) => {
      return fsCreateNestedDirectory(tmpDirPath)
      .then(() => bsnCmGetStoredFileAsArrayBuffer(asset.presentationProperties.projectFile.fileUrl))
      .then((arrayBuffer) => Buffer.from(arrayBuffer))
      .then((buffer) => bsnCmGetLegacyPresentationDmState(buffer))
      .then((state) => {
        console.log(state);
        return fsSaveObjectAsLocalJsonFile(state as object, tmpFilePath);
      })
      .then(() => fsGetAssetItemFromFile(tmpFilePath));
    });
  }
}

function bsnCmGetPresentationAssetFile(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
): Promise<BsAssetItem> {
  if (!bscIsAssetItem(assetSpec.sourceAssetItem)) {
    const errorMessage = 'bsnCmUploadPresentationAssets must be given valid asset item of BSN presentation';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else if (assetSpec.sourceAssetItem.assetType === AssetType.Project) {
    return bsnCmGetBpfxPresentationAssetFile(spec, assetSpec);
  } else if (assetSpec.sourceAssetItem.assetType === AssetType.ProjectBpf) {
    return bsnCmGetBpfPresentationAssetFile(spec, assetSpec);
  } else {
    const errorMessage = 'bsnCmGetPresentationAssetFile must be given valid asset item of BSN presentation';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  }
}

function bsnCmRealizePresentationAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.source)
    .then(() => {
      const realizeNextAsset = (index: number) => {
        if (index < 0) {
          return Promise.resolve();
        }
        const hash = spec.assets[index];
        const migrateAssetSpec = spec.assetMap[hash];
        const migrateAssetItem = migrateAssetSpec.sourceAssetItem;
        if (!bscIsAssetItem(migrateAssetItem)) {
          const errorMessage = 'bsnCmRealizePresentationAssets must be given valid asset item of BSN presentation';
          return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
        } else if (migrateAssetItem.assetType !== AssetType.Project
          && migrateAssetItem.assetType !== AssetType.ProjectBpf) {
          return realizeNextAsset(index - 1);
        } else {
          return bsnCmGetPresentationAssetFile(spec, migrateAssetSpec)
            .then((assetItem) => migrateAssetSpec.stagedAssetItem = assetItem)
            .then(() => {
              return Promise.resolve();
            })
            .then(() => realizeNextAsset(index - 1));
        }
      };
      return realizeNextAsset(spec.assets.length - 1);
    });
}

function bsnCmUploadPresentationAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.destination)
    .then(() => {
      const uploadCollection = cmGetBsAssetCollection(
        AssetLocation.Bsn,
        AssetType.Project,
        undefined,
        { includeLegacyAssets: true },
      ) as BsPresentationAssetCollection;
      return uploadCollection.update()
        .then(() => uploadCollection);
    })
    .then((uploadCollection) => {

      const uploadNextAsset = (index: number) => {
        if (index < 0) {
          return Promise.resolve();
        }

        const hash = spec.assets[index];
        const migrateAssetSpec = spec.assetMap[hash];
        const migrateAssetItem = migrateAssetSpec.sourceAssetItem;
        if (!bscIsAssetItem(migrateAssetItem)) {
          const errorMessage = 'bsnCmUploadPresentationAssets must be given valid asset item of BSN presentation';
          return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
        } else if (migrateAssetItem.assetType !== AssetType.Project
          && migrateAssetItem.assetType !== AssetType.ProjectBpf) {
          return uploadNextAsset(index - 1);
        } else {
          // TODO do we need to strip ext of .brs file. BSN / bs-content-manager seem to have issues with this
          let uploadPromise: Promise<any> = Promise.resolve();
          const presentationAsset = uploadCollection.getAsset(migrateAssetItem.name) as BsPresentationAsset;
          // TODO we cannot rely on file hash to detect match as media asset links will change causing
          // presentation sha1 to change
          if (presentationAsset && presentationAsset.assetItem.fileHash === migrateAssetItem.fileHash) {
            migrateAssetSpec.destinationAssetItem = presentationAsset.assetItem;
            uploadPromise = Promise.resolve();
          } else {
            const stagedAssetItem = migrateAssetSpec.stagedAssetItem;
            const stagedFilePath = isomorphicPath.posix.join(stagedAssetItem.path, stagedAssetItem.name);
            const nextPresentationName = spec.id + '_' + migrateAssetItem.name;
            uploadPromise = fsGetLocalJsonFileAsObject(stagedFilePath)
              .then((dmState: DmState) => {
                const resolvedDmState = bsnCmResolveDmAssetMap(spec, dmState);
                // TODO remove name change once match detection routine is implemented
                resolvedDmState.sign.properties.name = nextPresentationName;
                const projectState = {
                  ...dmState,
                  bsdm: resolvedDmState,
                };
                return uploadCollection.createNewPresentation(nextPresentationName, projectState);
              })
              .then(() => uploadCollection.getAsset(nextPresentationName))
              .then((result) => migrateAssetSpec.destinationAssetItem = result.assetItem);
          }
          return uploadPromise
            .then(() => uploadNextAsset(index - 1));
        }
      };
      return uploadNextAsset(spec.assets.length - 1);
    });
}

// TODO handle progress reporting
export function bsnCmMigratePresentationAssets(spec: BsnCmMigrateSpec): Promise<void> {
  // TODO validate spec
  return bsnCmRealizePresentationAssets(spec)
    .then(() => bsnCmUploadPresentationAssets(spec))
    .then(() => Promise.resolve());
}
