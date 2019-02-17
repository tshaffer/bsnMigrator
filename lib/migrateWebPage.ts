import isomorphicPath from 'isomorphic-path';
import {
  AssetType,
  AssetLocation,
  BsAssetItem,
  BsnHtmlSiteProperties,
  BsnHtmlSiteAssetItem,
  bscIsAssetItem,
} from '@brightsign/bscore';
import {
  BsUploadJobProgressCallback,
  BsAssetUploadWebPageSessionSpec,
  BsAssetUploadJob,
} from '@brightsign/bs-content-manager';
import {
  fsCreateNestedDirectory,
  fsSaveStreamAsLocalFile,
  fsGetAssetItemFromFile,
  fsGetLocalHtmlSiteSessionSpecForIndexFile,
} from '@brightsign/fsconnector';
import {
  BsnCmMigrateSpec,
  BsnCmMigrateAssetSpec,
  BsnCmMigrateConnectorConfiguration,
  BsnCmAssetUploadWebPageFileSpec,
} from './types';
import {
  BsnCmError,
  BsnCmErrorType,
} from './error';
import {
  bsnCmGetGuid,
  bsnCmMigrateConnect,
  bsnCmGetStoredFileAsStream,
  bsnCmNormalizeLocalPath,
  bsnCmGetTmpDirPathForAssetSpec,
  bsnCmGetTmpPathForAssetSpec,
  csDmCreateHashFromAssetLocator,
} from './utils';

function bsnCmGetTmpDirPathForWebPageAsset(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
  siteFile: BsnHtmlSiteAssetItem,
) {
  // TODO validate spec, site file
  const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
  // TODO remove siteFile.path.replace(/[\\/]+$/, '') stripping the trailing slash should be handled elsewhere
  const tempFilePath = isomorphicPath.join(tmpDirPath, siteFile.path.replace(/[\\/]+$/, ''));
  return bsnCmNormalizeLocalPath(tempFilePath);
}

function bsnCmGetTmpPathForWebPageAsset(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
  siteFile: BsnHtmlSiteAssetItem,
) {
  // TODO validate spec, site file
  const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
  // TODO remove siteFile.path.replace(/[\\/]+$/, '') stripping the trailing slash should be handled elsewhere
  const tempFilePath = isomorphicPath.join(tmpDirPath, siteFile.path.replace(/[\\/]+$/, ''), siteFile.name);
  return bsnCmNormalizeLocalPath(tempFilePath);
}

function bsnCmGetTmpPathForWebPageIndexAsset(
  spec: BsnCmMigrateSpec,
  assetSpec: BsnCmMigrateAssetSpec,
) {
  // TODO validate asset spec
  const assetData = assetSpec.sourceAssetItem.assetData as BsnHtmlSiteProperties;
  const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
  return isomorphicPath.join(tmpDirPath, assetData.indexFile.name);
}

function bsnCmGetWebPageAssetFiles(spec: BsnCmMigrateSpec, assetSpec: BsnCmMigrateAssetSpec): Promise<BsAssetItem> {
  if ((assetSpec.sourceAssetItem.assetType !== AssetType.HtmlSite
    && assetSpec.sourceAssetItem.assetType !== AssetType.DeviceHtmlSite)
    || assetSpec.sourceAssetItem.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetWebPageAssetFile must be given asset locator of BSN webpage';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const tmpDirPath = bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec);
    const tmpIndexFilePath = bsnCmGetTmpPathForWebPageIndexAsset(spec, assetSpec);
    const assetData = assetSpec.sourceAssetItem.assetData as BsnHtmlSiteProperties;

    return fsCreateNestedDirectory(tmpDirPath)
      .then(() => bsnCmGetStoredFileAsStream(assetData.indexFile.fileUrl))
      .then((stream) => fsSaveStreamAsLocalFile(stream, tmpIndexFilePath))
      .then(() => {
        const getNextWebPageFile = (siteFileIndex: number): Promise<void> => {
          if (siteFileIndex < 0) {
            return Promise.resolve();
          }
          const assetFile = assetData.assets[siteFileIndex];
          const tmpSiteFileDirPath = bsnCmGetTmpDirPathForWebPageAsset(spec, assetSpec, assetFile);
          const tmpSiteFilePath = bsnCmGetTmpPathForWebPageAsset(spec, assetSpec, assetFile);
          return fsCreateNestedDirectory(tmpSiteFileDirPath)
            .then(() => bsnCmGetStoredFileAsStream(assetFile.fileUrl))
            .then((stream) => fsSaveStreamAsLocalFile(stream, tmpSiteFilePath))
            .then(() => getNextWebPageFile(siteFileIndex - 1));
        };
        return getNextWebPageFile(assetData.assets.length - 1);
      })
      .then(() => fsGetAssetItemFromFile(tmpIndexFilePath));
  }
}

function bsnCmRealizeWebPageAssets(spec: BsnCmMigrateSpec): Promise<void> {
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
          const errorMessage = 'bsnCmMigrateRealizeWebPageAssets must be given valid asset item of BSN web page';
          // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
          // console.log('warning: ', errorMessage);
          return realizeNextAsset(index - 1);
        } else if (migrateAssetItem.assetType !== AssetType.HtmlSite
          && migrateAssetItem.assetType !== AssetType.DeviceHtmlSite) {
          return realizeNextAsset(index - 1);
        } else {
          return bsnCmGetWebPageAssetFiles(spec, migrateAssetSpec)
            .then((assetItem) => migrateAssetSpec.stagedAssetItem = assetItem)
            .then(() => realizeNextAsset(index - 1));
        }
      };
      return realizeNextAsset(spec.assets.length - 1);
    });
}

export function bsnCmGetWebPageUploadJobSpec(spec: BsnCmMigrateSpec): Promise<BsnCmAssetUploadWebPageFileSpec[]> {
  const htmlSiteUploadSpecs = [];
  const getUploadSpec = (index: number) => {
    if (index < 0) {
      return Promise.resolve();
    }

    const hash = spec.assets[index];
    const migrateAssetSpec = spec.assetMap[hash];
    const migrateAssetItem = migrateAssetSpec.sourceAssetItem;
    if (!bscIsAssetItem(migrateAssetItem)) {
      const errorMessage = 'bsnCmGetWebPageUploadJobSpec must be given valid asset item of BSN web page';
      // return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
      // console.log('warning: ', errorMessage);
      return getUploadSpec(index - 1);
    } else if (migrateAssetItem.assetType !== AssetType.HtmlSite
      && migrateAssetItem.assetType !== AssetType.DeviceHtmlSite) {
      return getUploadSpec(index - 1);
    } else {

      const tmpIndexFilePath = bsnCmGetTmpPathForWebPageIndexAsset(spec, migrateAssetSpec);
      return fsGetLocalHtmlSiteSessionSpecForIndexFile(tmpIndexFilePath)
        .then((webPageSessionSpec) => {
          const webPageSpec: BsnCmAssetUploadWebPageFileSpec = {
            // TODO instead of adding site name prefix, handle case if web page already exists
            siteName: spec.id.substring(0, 5) + '_' + migrateAssetSpec.sourceAssetItem.name,
            siteType: migrateAssetSpec.sourceAssetItem.assetType,
            indexUploadFile: webPageSessionSpec.indexFile,
            assetUploadFiles: webPageSessionSpec.assetFiles,
            migrateAssetSpec,
          };
          htmlSiteUploadSpecs.push(webPageSpec);
          return getUploadSpec(index - 1);
        });
    }
  };
  return getUploadSpec(spec.assets.length - 1)
    .then(() => htmlSiteUploadSpecs);
}

function bsnCmUploadWebPageAssets(spec: BsnCmMigrateSpec): Promise<void> {
  return bsnCmMigrateConnect(spec.parameters.destination)
    .then(() => bsnCmGetWebPageUploadJobSpec(spec))
    .then((uploadSpec) => {
      const uploadJob = new BsAssetUploadJob(bsnCmGetGuid(), null, uploadSpec);
      return uploadJob.start()
        .then((taskResult) => {
          uploadSpec.forEach((fileUploadSpec, index) => {
            const visitingHash = csDmCreateHashFromAssetLocator(fileUploadSpec.migrateAssetSpec.sourceAssetItem);
            const migrateAssetSpec = spec.assetMap[visitingHash];
            const destinationAssetItem = taskResult.webPageUploadResults[index].assetItem;
            migrateAssetSpec.destinationAssetItem = destinationAssetItem;
          });
          return Promise.resolve();
        });
    });
}

// TODO handle progress reporting
export function bsnCmMigrateWebPageAssets(spec: BsnCmMigrateSpec): Promise<void> {
  // TODO validate spec
  return bsnCmRealizeWebPageAssets(spec)
    .then(() => bsnCmUploadWebPageAssets(spec))
    .then(() => Promise.resolve());
}
