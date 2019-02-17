import isomorphicPath from 'isomorphic-path';
import {createStore, applyMiddleware} from 'redux';
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
  BsnMediaFeedProperties,
  BsnMediaFeedItemProperties,
  MediaType,
  bscIsAssetItem,
} from '@brightsign/bscore';
import {
  BsMediaFeedAssetCollection,
  BsMediaFeedAsset,
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
  AddNewCustomFieldNameAction,
  ContentItemAddAction,
  PlDmState,
  plDmReducer,
  plDmNewLiveMediaFeed,
  plDmAddMediaFeedContentItemForLoadNewState,
  plDmAddNewCustomFieldName,
  plDmUpdateCustomFieldValue,
  plDmFilterBaseState,
} from '@brightsign/bs-playlist-dm';
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

// TODO this translation routine belongs in bs-playlist-dm
function bsnCmGetMediaFeedDmState(spec: BsnCmMigrateSpec, feedData: BsnMediaFeedProperties): PlDmState {
  const store = createStore(plDmReducer, applyMiddleware(thunk));
  // TODO validate feedData
  store.dispatch(plDmNewLiveMediaFeed(feedData.name, feedData.ttl));
  if (isArray(feedData.content)) {
    let index = 0;
    const customFieldIdMap: Map<string, string> = new Map();
    for (const assetItem of feedData.content) {
      if (bscIsAssetItem(assetItem)) {

        const assetHash = csDmCreateHashFromAssetLocator(assetItem);
        const assetItemMigrationSpec = spec.assetMap[assetHash];
        if (isNil(assetItemMigrationSpec) || isNil(assetItemMigrationSpec.destinationAssetItem)) {
          const errorMessage = 'bsnCmGetDynamicPlaylistDmState cannot find migrated asset item of media '
            + ' feed content ' + JSON.stringify(assetItem);
          throw new BsnCmError(BsnCmErrorType.unexpectedError, errorMessage);
        }

        const assetItemData = assetItem.assetData as BsnMediaFeedItemProperties;
        const feedItemToAdd = {
          name: assetItemData.title,
          type: assetItemMigrationSpec.destinationAssetItem.mediaType as MediaType,
          content: assetItemMigrationSpec.destinationAssetItem,
          displayDuration: assetItemData.displayDuration,
          validityStartDate: assetItemData.validityStartDate,
          validityEndDate: assetItemData.validityEndDate,
        };
        const addFeedItemAction = plDmAddMediaFeedContentItemForLoadNewState(feedItemToAdd);
        const addFeedItemResult: ContentItemAddAction = store.dispatch(addFeedItemAction);

        if (isObject(assetItemData.customFields)) {
          for (const customField of Object.keys(assetItemData.customFields)) {
            if (index === 0) {
              const addCustomFieldAction = plDmAddNewCustomFieldName(customField);
              const addCustomFieldResult: AddNewCustomFieldNameAction = store.dispatch(addCustomFieldAction);
              const name = addCustomFieldResult.payload.name;
              const nameId = addCustomFieldResult.payload.nameId;
              customFieldIdMap.set(name, nameId);
            }
            const customFeedItemValueToAdd = {
              id: addFeedItemResult.payload.items[0].id,
              nameId: customFieldIdMap[customField],
              value: assetItemData.customFields[customField],
            };
            store.dispatch(plDmUpdateCustomFieldValue(customFeedItemValueToAdd));
          }
        }
      }
      index += 1;
    }
  }
  return plDmFilterBaseState(store.getState());
}

function bsnCmGetMediaFeedAssetFile(spec: BsnCmMigrateSpec, assetSpec: BsnCmMigrateAssetSpec): Promise<BsAssetItem> {
  if ((assetSpec.sourceAssetItem.assetType !== AssetType.BSNMediaFeed)
  || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetMediaFeedAssetFile must be given asset locator of BSN media feed entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpFilePath = bsnCmGetTmpPathForAssetSpec(spec, assetSpec);
    return fsCreateNestedDirectory(tmpDirPath)
      .then(() => cmGetBsAssetForAssetLocator(assetSpec.sourceAssetItem))
      .then((asset) => bsnCmGetMediaFeedDmState(spec, asset.assetData as BsnMediaFeedProperties))
      .then((state) => fsSaveObjectAsLocalJsonFile(state as object, tmpFilePath))
      .then(() => fsGetAssetItemFromFile(tmpFilePath));
  }
}

function bsnCmRealizeMediaFeedAssets(spec: BsnCmMigrateSpec): Promise<void> {
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
          const errorMessage = 'bsnCmRealizeMediaFeedAssets must be given valid asset item of BSN media feed';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return realizeNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BSNMediaFeed) {
          return realizeNextAsset(index - 1);
        } else {
          return bsnCmGetMediaFeedAssetFile(spec, migrateAssetSpec)
            .then((assetItem) => migrateAssetSpec.stagedAssetItem = assetItem)
            .then(() => realizeNextAsset(index - 1));
        }
      };
      return realizeNextAsset(spec.assets.length - 1);
    });
}

function bsnCmUploadMediaFeedAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.destination)
    .then(() => {
      const uploadCollection = cmGetBsAssetCollection(
        AssetLocation.Bsn,
        AssetType.BSNMediaFeed,
      ) as BsMediaFeedAssetCollection;
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
          const errorMessage = 'bsnCmUploadMediaFeedAssets must be given valid asset item of BSN media feed';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return uploadNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BSNMediaFeed) {
          return uploadNextAsset(index - 1);
        } else {
          let uploadPromise: Promise<any> = Promise.resolve();
          const mediaFeedAsset = uploadCollection.getAsset(migrateAssetItem.name) as BsMediaFeedAsset;
          // TODO we cannot rely on file hash to detect match as media asset links will change causing
          // feed sha1 to change
          if (mediaFeedAsset && mediaFeedAsset.assetItem.fileHash === migrateAssetItem.fileHash) {
            migrateAssetSpec.destinationAssetItem = mediaFeedAsset.assetItem;
            uploadPromise = Promise.resolve();
          } else {
            const stagedAssetItem = migrateAssetSpec.stagedAssetItem;
            const stagedFilePath = isomorphicPath.posix.join(stagedAssetItem.path, stagedAssetItem.name);
            const nextFeedName = spec.id + '_' + migrateAssetItem.name;
            uploadPromise = fsGetLocalJsonFileAsObject(stagedFilePath)
              .then((plDmState: PlDmState) => {
                // TODO remove name change once match detection routine is implemented
                plDmState.playlist.name = nextFeedName;
                return uploadCollection.createNewMediaFeed(nextFeedName, plDmState);
              })
              .then(() => uploadCollection.getAsset(nextFeedName))
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
export function bsnCmMigrateMediaFeedAssets(spec: BsnCmMigrateSpec): Promise<void> {
  // TODO validate spec
  return bsnCmRealizeMediaFeedAssets(spec)
    .then(() => bsnCmUploadMediaFeedAssets(spec))
    .then(() => Promise.resolve());
}
