import isomorphicPath from 'isomorphic-path';
import {createStore, applyMiddleware} from 'redux';
import thunk from 'redux-thunk';
import {
  isObject,
  isArray,
  isDate,
} from 'lodash';
import {
  AssetType,
  AssetLocation,
  BsAssetItem,
  BsnTextFeedProperties,
  BsnDataFeedItemProperties,
  MediaType,
  bscIsAssetItem,
} from '@brightsign/bscore';
import {
  BsTextFeedAssetCollection,
  BsTextFeedAsset,
  cmGetBsAssetCollection,
  cmGetBsAssetForAssetLocator,
} from '@brightsign/bs-content-manager';
import {
  fsCreateNestedDirectory,
  fsSaveObjectAsLocalJsonFile,
  fsGetAssetItemFromFile,
  fsGetLocalJsonFileAsObject,
} from '@brightsign/fsconnector';
import {
  DfDmState,
  UpdateFieldValueActionParams,
  dfDmReducer,
  dfDmNewDataFeed,
  dfDmAddNewField,
  dfDmUpdateFieldValue,
  plDmBatchActions,
  dfDmFilterBaseState,
} from '@brightsign/bs-data-feed-dm';
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
  bsnCmGetStoredFileAsStream,
  bsnCmGetTmpDirPathForAssetSpec,
  bsnCmGetTmpPathForAssetSpec,
  csDmCreateHashFromAssetLocator,
} from './utils';

// TODO this translation routine belongs in bs-data-feed-dm
function bsnCmGetDataFeedDmState(feedData: BsnTextFeedProperties): DfDmState {
  const store = createStore(dfDmReducer, applyMiddleware(thunk));
  // TODO validate feedData
  store.dispatch(dfDmNewDataFeed(feedData.name));
  if (isArray(feedData.items)) {
    const batchActions = [];
    for (const item of feedData.items) {
      const addActionPayload = dfDmAddNewField(item.title);
      batchActions.push(addActionPayload);
      const updateData: UpdateFieldValueActionParams = {
        id: addActionPayload.payload.fieldObject.id,
        value: item.description,
      };
      if (isDate(item.validityStartDate) && isDate(item.validityEndDate)) {
        updateData.validityStartDate = item.validityStartDate;
        updateData.validityEndDate = item.validityEndDate;
        updateData.enableValidityDate = true;
      } else {
        updateData.enableValidityDate = false;
      }
      batchActions.push(dfDmUpdateFieldValue(updateData));
    }
    store.dispatch(plDmBatchActions(batchActions));
  }
  return dfDmFilterBaseState(store.getState());
}

function bsnCmGetDataFeedAssetFile(spec: BsnCmMigrateSpec, assetSpec: BsnCmMigrateAssetSpec): Promise<BsAssetItem> {
  if ((assetSpec.sourceAssetItem.assetType !== AssetType.BSNDataFeed)
  || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetDataFeedAssetFile must be given asset locator of BSN data feed entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpFilePath = bsnCmGetTmpPathForAssetSpec(spec, assetSpec);
    return fsCreateNestedDirectory(tmpDirPath)
      .then(() => cmGetBsAssetForAssetLocator(assetSpec.sourceAssetItem))
      .then((asset) => bsnCmGetDataFeedDmState(asset.assetData as BsnTextFeedProperties))
      .then((state) => fsSaveObjectAsLocalJsonFile(state as object, tmpFilePath))
      .then(() => fsGetAssetItemFromFile(tmpFilePath));
  }
}

function bsnCmRealizeDataFeedAssets(spec: BsnCmMigrateSpec): Promise<void> {
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
          const errorMessage = 'bsnCmRealizeDataFeedAssets must be given valid asset item of BSN data feed';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return realizeNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BSNDataFeed) {
          return realizeNextAsset(index - 1);
        } else {
          return bsnCmGetDataFeedAssetFile(spec, migrateAssetSpec)
            .then((assetItem) => migrateAssetSpec.stagedAssetItem = assetItem)
            .then(() => realizeNextAsset(index - 1));
        }
      };
      return realizeNextAsset(spec.assets.length - 1);
    });
}

function bsnCmUploadDataFeedAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.destination)
    .then(() => {
      const uploadCollection = cmGetBsAssetCollection(
        AssetLocation.Bsn,
        AssetType.BSNDataFeed,
      ) as BsTextFeedAssetCollection;
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
          const errorMessage = 'bsnCmUploadDataFeedAssets must be given valid asset item of BSN data feed';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return uploadNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BSNDataFeed) {
          return uploadNextAsset(index - 1);
        } else {
          // TODO do we need to strip ext of .brs file. BSN / bs-content-manager seem to have issues with this
          let uploadPromise: Promise<any> = Promise.resolve();
          const dataFeedAsset = uploadCollection.getAsset(migrateAssetItem.name) as BsTextFeedAsset;
          if (dataFeedAsset && dataFeedAsset.assetItem.fileHash === migrateAssetItem.fileHash) {
            migrateAssetSpec.destinationAssetItem = dataFeedAsset.assetItem;
            uploadPromise = Promise.resolve();
          } else {
            const stagedAssetItem = migrateAssetSpec.stagedAssetItem;
            const stagedFilePath = isomorphicPath.posix.join(stagedAssetItem.path, stagedAssetItem.name);
            uploadPromise = fsGetLocalJsonFileAsObject(stagedFilePath)
              .then((plDmState: DfDmState) => uploadCollection.createNewTextFeed(migrateAssetItem.name, plDmState))
              .then(() => uploadCollection.getAsset(migrateAssetItem.name))
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
export function bsnCmMigrateDataFeedAssets(spec: BsnCmMigrateSpec): Promise<void> {
  // TODO validate spec
  return bsnCmRealizeDataFeedAssets(spec)
    .then(() => bsnCmUploadDataFeedAssets(spec))
    .then(() => Promise.resolve());
}
