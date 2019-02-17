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
  BsnDynamicPlaylistProperties,
  BsnDynamicPlaylistItemProperties,
  MediaType,
  bscIsAssetItem,
} from '@brightsign/bscore';
import {
  BsDynamicPlaylistAssetCollection,
  BsDynamicPlaylistAsset,
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
  plDmNewPlaylist,
  plDmAddContentItem,
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
function bsnCmGetDynamicPlaylistDmState(spec: BsnCmMigrateSpec, playlistData: BsnDynamicPlaylistProperties): PlDmState {
  const store = createStore(plDmReducer, applyMiddleware(thunk));
  // TODO validate playlistData
  const { name, supportsAudio, supportsVideo, supportsImages } = playlistData;
  store.dispatch(plDmNewPlaylist(name, supportsAudio, supportsVideo, supportsImages));
  if (isArray(playlistData.content)) {
    const customFieldIdMap: Map<string, string> = new Map();
    for (const assetItem of playlistData.content) {
      if (bscIsAssetItem(assetItem)) {

        const assetHash = csDmCreateHashFromAssetLocator(assetItem);
        const assetItemMigrationSpec = spec.assetMap[assetHash];
        if (isNil(assetItemMigrationSpec) || isNil(assetItemMigrationSpec.destinationAssetItem)) {
          const errorMessage = 'bsnCmGetDynamicPlaylistDmState cannot find migrated asset item of dynamic '
            + ' playlist content ' + JSON.stringify(assetItem);
          throw new BsnCmError(BsnCmErrorType.unexpectedError, errorMessage);
        }

        const assetItemData = assetItem.assetData as BsnDynamicPlaylistItemProperties;
        const playlistItemToAdd = {
          name: assetItemMigrationSpec.destinationAssetItem.name,
          type: assetItemMigrationSpec.destinationAssetItem.mediaType as MediaType,
          content: assetItemMigrationSpec.destinationAssetItem,
          displayDuration: assetItemData.displayDuration,
          validityStartDate: assetItemData.validityStartDate,
          validityEndDate: assetItemData.validityEndDate,
        };
        const addPlaylistItemAction = plDmAddContentItem(playlistItemToAdd);
        const addPlaylistItemResult: ContentItemAddAction = store.dispatch(addPlaylistItemAction);
      }
    }
  }
  return plDmFilterBaseState(store.getState());
}

function bsnCmGetDynamicPlaylistAssetFile(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
): Promise<BsAssetItem> {
  if ((assetSpec.sourceAssetItem.assetType !== AssetType.BSNDynamicPlaylist)
  || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetDynamicPlaylistAssetFile must be given asset locator of BSN dynamic playlist entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpFilePath = bsnCmGetTmpPathForAssetSpec(spec, assetSpec);
    return fsCreateNestedDirectory(tmpDirPath)
      .then(() => cmGetBsAssetForAssetLocator(assetSpec.sourceAssetItem))
      .then((asset) => bsnCmGetDynamicPlaylistDmState(spec, asset.assetData as BsnDynamicPlaylistProperties))
      .then((state) => fsSaveObjectAsLocalJsonFile(state as object, tmpFilePath))
      .then(() => fsGetAssetItemFromFile(tmpFilePath));
  }
}

function bsnCmRealizeDynamicPlaylistAssets(spec: BsnCmMigrateSpec): Promise<void> {
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
          const errorMessage = 'bsnCmRealizeDynamicPlaylistAssets must be given valid asset item of BSN dynamic '
            + 'playlist';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return realizeNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BSNDynamicPlaylist) {
          return realizeNextAsset(index - 1);
        } else {
          return bsnCmGetDynamicPlaylistAssetFile(spec, migrateAssetSpec)
            .then((assetItem) => migrateAssetSpec.stagedAssetItem = assetItem)
            .then(() => realizeNextAsset(index - 1));
        }
      };
      return realizeNextAsset(spec.assets.length - 1);
    });
}

function bsnCmUploadDynamicPlaylistAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.destination)
    .then(() => {
      const uploadCollection = cmGetBsAssetCollection(
        AssetLocation.Bsn,
        AssetType.BSNDynamicPlaylist,
      ) as BsDynamicPlaylistAssetCollection;
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
          const errorMessage = 'bsnCmUploadDynamicPlaylistAssets must be given valid asset item of BSN dynamic '
            + 'playlist';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return uploadNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BSNDynamicPlaylist) {
          return uploadNextAsset(index - 1);
        } else {
          // TODO do we need to strip ext of .brs file. BSN / bs-content-manager seem to have issues with this
          let uploadPromise: Promise<any> = Promise.resolve();

          // TODO we cannot rely on file hash to detect match as media asset links will change causing
          // feed sha1 to change
          const dynamicPlaylistAsset = uploadCollection.getAsset(migrateAssetItem.name) as BsDynamicPlaylistAsset;
          if (dynamicPlaylistAsset && dynamicPlaylistAsset.assetItem.fileHash === migrateAssetItem.fileHash) {
            migrateAssetSpec.destinationAssetItem = dynamicPlaylistAsset.assetItem;
            uploadPromise = Promise.resolve();
          } else {
            const stagedAssetItem = migrateAssetSpec.stagedAssetItem;
            const stagedFilePath = isomorphicPath.posix.join(stagedAssetItem.path, stagedAssetItem.name);
            const nextPlaylistName = spec.id + '_' + migrateAssetItem.name;
            uploadPromise = fsGetLocalJsonFileAsObject(stagedFilePath)
              .then((plDmState: PlDmState) => {
                // TODO remove name change once match detection routine is implemented
                plDmState.playlist.name = nextPlaylistName;
                return uploadCollection.createNewDynamicPlaylist(nextPlaylistName, plDmState);
              })
              .then(() => uploadCollection.getAsset(nextPlaylistName))
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
export function bsnCmMigrateDynamicPlaylistAssets(spec: BsnCmMigrateSpec): Promise<void> {
  // TODO validate spec
  return bsnCmRealizeDynamicPlaylistAssets(spec)
    .then(() => bsnCmUploadDynamicPlaylistAssets(spec))
    .then(() => Promise.resolve());
}
