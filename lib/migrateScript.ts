import isomorphicPath from 'isomorphic-path';
import {
  AssetType,
  AssetLocation,
  BsAssetItem,
  bscIsAssetItem,
  bscStripFileExtension,
} from '@brightsign/bscore';
import {
  BsBrightScriptAssetCollection,
  BsBrightScriptAsset,
  cmGetBsAssetCollection,
} from '@brightsign/bs-content-manager';
import {
  fsCreateNestedDirectory,
  fsSaveStreamAsLocalFile,
  fsGetAssetItemFromFile,
} from '@brightsign/fsconnector';
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

function bsnCmAddScriptExtension(path: string) {
  // TODO validate path
  // add extension is a temporary workaround for bug between bsn / bs-content-manager
  // where ext is required for upload (post) but stripped off for exists, enumeration (read)
  return bscStripFileExtension(path) + '.brs';
}

function bsnCmGetScriptTmpFilePath(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
) {
  // TODO validate spec, site file
  // add extension is a temporary workaround for bug between bsn / bs-content-manager
  // where ext is required for upload (post) but stripped off for exists, enumeration (read)
  return bsnCmAddScriptExtension(bsnCmGetTmpPathForAssetSpec(spec, assetSpec));
}

function bsnCmGetScriptAssetFile(spec: BsnCmMigrateSpec, assetSpec: BsnCmMigrateAssetSpec): Promise<BsAssetItem> {
  if ((assetSpec.sourceAssetItem.assetType !== AssetType.BrightScript)
  || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetScriptAssetFile must be given asset locator of BSN brightscript entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpFilePath = bsnCmGetScriptTmpFilePath(spec, assetSpec);
    return fsCreateNestedDirectory(tmpDirPath)
      .then(() => bsnCmGetStoredFileAsStream(assetSpec.sourceAssetItem.fileUrl))
      .then((stream) => fsSaveStreamAsLocalFile(stream, tmpFilePath))
      .then(() => fsGetAssetItemFromFile(tmpFilePath));
  }
}

function bsnCmRealizeScriptAssets(spec: BsnCmMigrateSpec): Promise<void> {
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
          const errorMessage = 'bsnCmRealizeScriptAssets must be given valid asset item of BSN content';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return realizeNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BrightScript) {
          return realizeNextAsset(index - 1);
        } else {
          return bsnCmGetScriptAssetFile(spec, migrateAssetSpec)
            .then((assetItem) => migrateAssetSpec.stagedAssetItem = assetItem)
            .then(() => realizeNextAsset(index - 1));
        }
      };
      return realizeNextAsset(spec.assets.length - 1);
    });
}

function bsnCmUploadScriptAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.destination)
    .then(() => {
      const uploadCollection = cmGetBsAssetCollection(
        AssetLocation.Bsn,
        AssetType.BrightScript,
      ) as BsBrightScriptAssetCollection;
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
          const errorMessage = 'bsnCmUploadScriptAssets must be given valid asset item of BSN brightscript';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return uploadNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.BrightScript) {
          return uploadNextAsset(index - 1);
        } else {
          // TODO do we need to strip ext of .brs file. BSN / bs-content-manager seem to have issues with this
          let uploadPromise: Promise<any> = Promise.resolve();
          const pluginName = bsnCmAddScriptExtension(migrateAssetItem.name);
          const pluginAsset = uploadCollection.getAsset(pluginName) as BsBrightScriptAsset;
          if (pluginAsset && pluginAsset.assetItem.fileHash === migrateAssetItem.fileHash) {
            migrateAssetSpec.destinationAssetItem = pluginAsset.assetItem;
            uploadPromise = Promise.resolve();
          } else {
            // TODO handle case where plugin exists by name but is not file match
            const stagedAssetItem = migrateAssetSpec.stagedAssetItem;
            const fileSpec = isomorphicPath.posix.join(stagedAssetItem.path, stagedAssetItem.name);
            uploadPromise = uploadCollection.uploadNewPlugin(fileSpec)
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
export function bsnCmMigrateScriptAssets(spec: BsnCmMigrateSpec): Promise<void> {
  // TODO validate spec
  return bsnCmRealizeScriptAssets(spec)
    .then(() => bsnCmUploadScriptAssets(spec))
    .then(() => Promise.resolve());
}
