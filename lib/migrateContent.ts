import isomorphicPath from 'isomorphic-path';
import {
  AssetType,
  AssetLocation,
  BsAssetItem,
  bscIsAssetItem,
} from '@brightsign/bscore';
import {
  BsUploadJobProgressCallback,
  BsAssetUploadJob,
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

function bsnCmGetContentAssetFile(spec: BsnCmMigrateSpec, assetSpec: BsnCmMigrateAssetSpec): Promise<BsAssetItem> {
  if ((assetSpec.sourceAssetItem.assetType !== AssetType.Content
    && assetSpec.sourceAssetItem.assetType !== AssetType.Other)
  || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetContentAssetFile must be given asset locator of BSN content, '
      + ' other entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpFilePath = bsnCmGetTmpPathForAssetSpec(spec, assetSpec);
    return fsCreateNestedDirectory(tmpDirPath)
      .then(() => bsnCmGetStoredFileAsStream(assetSpec.sourceAssetItem.fileUrl))
      .then((stream) => fsSaveStreamAsLocalFile(stream, tmpFilePath))
      .then(() => fsGetAssetItemFromFile(tmpFilePath));
  }
}

function bsnCmRealizeContentAssets(spec: BsnCmMigrateSpec): Promise<void> {
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
          const errorMessage = 'bsnCmMigrateRealizeContentAssets must be given valid asset item of BSN content';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return realizeNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.Content && migrateAssetItem.assetType !== AssetType.Other) {
          // console.log('skip asset type: ', migrateAssetItem.assetType);
          return realizeNextAsset(index - 1);
        } else {
          return bsnCmGetContentAssetFile(spec, migrateAssetSpec)
            .then((assetItem) => migrateAssetSpec.stagedAssetItem = assetItem)
            .then(() => realizeNextAsset(index - 1));
        }
      };
      return realizeNextAsset(spec.assets.length - 1);
    });
}

export function bsnCmGetContentUploadJobSpec(spec: BsnCmMigrateSpec): BsnCmAssetUploadFileSpec[] {
  const uploadFileItemSpecs = [];
  spec.assets.forEach((hash) => {
    const migrateAssetSpec = spec.assetMap[hash];
    const migrateAssetItem = migrateAssetSpec.sourceAssetItem;

    if (!bscIsAssetItem(migrateAssetItem)) {
      const errorMessage = 'bsnCmGetContentUploadJobSpec must be given valid asset item of BSN content';
      // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
      // console.log('warning: ', errorMessage);
    } else if (migrateAssetItem.assetType === AssetType.Content || migrateAssetItem.assetType === AssetType.Other) {
      // TODO handle case if staged asset item is missing
      const stagedAssetItem = migrateAssetSpec.stagedAssetItem;
      const stagedPath = isomorphicPath.posix.join(stagedAssetItem.path, stagedAssetItem.name);

      const destinationPath = isomorphicPath.posix.join(spec.id, migrateAssetItem.name);

      const uploadFileSpec = {file: stagedPath, destinationPath, migrateAssetSpec };
      uploadFileItemSpecs.push(uploadFileSpec); // TODO what dest path should we assume? what if file exists?
    }
  });
  return uploadFileItemSpecs;
}

function bsnCmUploadContentAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.destination)
    .then(() => {
      const uploadSpec = bsnCmGetContentUploadJobSpec(spec);
      const uploadJob = new BsAssetUploadJob(bsnCmGetGuid(), uploadSpec, null);
      return uploadJob.start()
        .then((taskResult) => {
          uploadSpec.forEach((fileUploadSpec, index) => {
            const visitingHash = csDmCreateHashFromAssetLocator(fileUploadSpec.migrateAssetSpec.sourceAssetItem);
            const migrateAssetSpec = spec.assetMap[visitingHash];
            const destinationAssetItem = taskResult.fileUploadResults[index].assetItem;
            migrateAssetSpec.destinationAssetItem = destinationAssetItem;
          });
          return Promise.resolve();
        });
    });
}

// TODO handle progress reporting
export function bsnCmMigrateContentAssets(spec: BsnCmMigrateSpec): Promise<void> {
  // TODO validate spec
  // console.log('bsnCmMigrateContentAssets');
  return bsnCmRealizeContentAssets(spec)
    .then(() => bsnCmUploadContentAssets(spec))
    .then(() => Promise.resolve());
}
