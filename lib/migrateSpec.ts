import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import * as fs from 'fs';

import {
  isFunction,
  isObject,
  isNumber,
  isString,
  isNil,
} from 'lodash';
import axios from 'axios';
import {
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import {
  BsnCmGetStaticFileOptions,
  BsnCmGetStaticFileProgressEvent,
} from './types';
import {
  BsAssetId,
  AssetLocation,
  AssetType,
  BsAssetLocator,
  BsAssetItem,
  bscIsAssetItem,
} from '@brightsign/bscore';
import {
  DmBsProjectState,
  DmState,
  dmFilterDmState,
  dmGetAssetItemIdsForSign,
  dmGetAssetItemById,
  bsDmReducer,
  dmUpdateAssetLocation,
} from '@brightsign/bsdatamodel';
import {
  BsAsset,
  BsAssetBase,
  BsPresentationAsset,
  BsDynamicPlaylistAsset,
  BsMediaFeedAsset,
  BsMediaAssetCollection,
  cmBsAssetExists,
  cmGetBsAssetForAssetLocator,
  cmGetBsAssetCollection,
} from '@brightsign/bs-content-manager';
import {
  BsnCmError,
  BsnCmErrorType,
} from './error';
import {
  BsnCmMigrateParameters,
  BsnCmMigrateSpec,
  BsnCmMigrateAssetSpec,
} from './types';
import {
  bsnCmMigrateConnect,
  bsnCmGetStoredFileAsArrayBuffer,
  bsnCmGetStoredFileAsJson,
  bsnCmGetStoredFileAsText,
  bsnCmGetGuid,
  csDmCreateHashFromAssetLocator,
} from './utils';
import {
  BsTaskResult,
} from '@brightsign/bs-task-manager';
import {
  BpfConverterJobResult,
  BpfConverterJob,
  BpfConversionParameters,
  BpfConverterSpec,
} from '@brightsign/bs-bpf-converter';

const bpfConverterJobResults: any[] = [];

export function bsnCmGetAsset(assetLocator: BsAssetLocator): Promise<BsAssetBase> {
  if (assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetPresentation must be given asset locator of BSN presentation entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    return cmBsAssetExists(assetLocator)
      .then((exists) => {
        if (!exists) {
          const errorMessage = 'bsnCmGetAsset unable to find asset ' + JSON.stringify(assetLocator);
          return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
        } else {
          return cmGetBsAssetForAssetLocator(assetLocator);
        }
      });
  }
}

function bsnCmGetDmStateAssets(dmBsProjectState: DmBsProjectState): BsAssetItem[] {
  // TODO validate DmBsProjectState
  const dmState = dmFilterDmState(dmBsProjectState);
  const assetIds = dmGetAssetItemIdsForSign(dmState);
  return assetIds.map((assetId) => {
    return dmGetAssetItemById(dmState, { id: assetId });
  });
}

function bsnCmGetPresentationMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if (assetLocator.assetType !== AssetType.Project || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetMigratePresentationAsset must be given asset locator of BSN presentation entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  }
  // else {
  //   const migrateAsset = {
  //     id: bsnCmGetGuid(),
  //     dependants: [],
  //     stagedAssetItem: null,
  //     destinationAssetItem: null,
  //   };
  //   return bsnCmGetAsset(assetLocator)
  //     .then((asset) => (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem)
  //     .then(() => bsnCmGetAsset(assetLocator))
  //     // .then(() => bsnCmGetStoredFileAsArrayBuffer(assetSpec.sourceAssetItem.fileUrl))
  //     .then((asset: BsPresentationAsset) =>
  //       bsnCmGetStoredFileAsArrayBuffer(asset.presentationProperties.projectFile.fileUrl))
  //     .then((arrayBuffer) => Buffer.from(arrayBuffer))
  //     .then((buffer) => bsnCmGetLegacyPresentationDmState(buffer))
  //     .then((dmState) => dmState as DmState)
  //     .then((dmState) => dmState as DmBsProjectState)
  //     .then((dmState) => bsnCmGetDmStateAssets(dmState))
  //     .then((assetItems) => (migrateAsset as BsnCmMigrateAssetSpec).dependencies = assetItems)
  //     .then(() => migrateAsset as BsnCmMigrateAssetSpec);
  // }
}

function bsnCmGetPresentationBpfMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if (assetLocator.assetType !== AssetType.ProjectBpf || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetPresentationBpfMigrateAsset must be given asset locator of BSN'
      + ' presentation bpf entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {

    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };

    let allBsnContentAssets: any;
    const contentCollection = cmGetBsAssetCollection(
      AssetLocation.Bsn,
      AssetType.Content,
      '/Shared/Incoming',
    ) as BsMediaAssetCollection;
    return contentCollection.update()
      .then( (assetNames) => allBsnContentAssets = contentCollection.allAssets )
      .then( () => bsnCmGetAsset(assetLocator))
      .then( (asset) => (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem)
      .then( () => {
        return bsnCmGetAsset(assetLocator);
      }).then((asset: BsPresentationAsset) => {
        return Promise.resolve(asset.presentationProperties.files);
      }).then((assetItems) => {
        return ((migrateAsset as BsnCmMigrateAssetSpec).dependencies = assetItems);
      }).then(() => {
        return (migrateAsset as BsnCmMigrateAssetSpec);
      });
  }
}

function bsnCmGetLegacyPresentationDmState(buffer: Buffer, presentationName: string): Promise<DmBsProjectState> {

  return new Promise((resolve, reject) => {
    const conversionParameters: BpfConversionParameters = {
      desktopConversion: false,
      buffer,
      assetItem: null,
      assetLocator: null,
      filePath: '',
    };

    const bpfConverterJob = new BpfConverterJob(conversionParameters, null);
    bpfConverterJob.start()
      .then((bsTaskResult: BsTaskResult) => {
        const conversionTaskResult: BpfConverterJobResult = bsTaskResult as BpfConverterJobResult;
        const bpfConverterJobResult: any = {
          presentationName,
          result: bpfConverterJob.result,
        };
        const result = JSON.stringify(bpfConverterJobResult) + '\n';
        bpfConverterJobResults.push(result);
        fs.writeFileSync('bpfConverterJobResults.txt', bpfConverterJobResults);
        console.log(bpfConverterJob);
        return resolve(conversionTaskResult.projectFileState);
      }).catch((err) => {
        const bpfConverterJobResult: any = {
          presentationName,
          err,
          result: bpfConverterJob.result,
        };
        const result = JSON.stringify(bpfConverterJobResult) + '\n';
        bpfConverterJobResults.push(result);
        fs.writeFileSync('bpfConverterJobResults.txt', bpfConverterJobResults);
        console.log(bpfConverterJob);
        return reject(err);
      });
  });
}

function bsnCmGetDataFeedMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if (assetLocator.assetType !== AssetType.BSNDataFeed || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetDataFeedMigrateAsset must be given asset locator of BSN data feed entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependencies: [],
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };
    return bsnCmGetAsset(assetLocator)
      // .then((asset) => asset.fetchAssetItemData())
      .then((asset) => (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem)
      .then(() => migrateAsset as BsnCmMigrateAssetSpec);
  }
}

function bsnCmGetDynamicPlaylistMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if (assetLocator.assetType !== AssetType.BSNDynamicPlaylist || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetDynamicPlaylistMigrateAsset must be given asset locator of BSN'
      + ' dynamic playlist entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };
    return bsnCmGetAsset(assetLocator)
      // .then((asset) => asset.fetchAssetItemData())
      .then((asset) => (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem)
      .then(() => bsnCmGetAsset(assetLocator))
      .then((asset: BsDynamicPlaylistAsset) => asset.feedInfo.content)
      .then((assetItems) => (migrateAsset as BsnCmMigrateAssetSpec).dependencies = assetItems)
      .then(() => migrateAsset as BsnCmMigrateAssetSpec);
  }
}

function bsnCmGetMediaFeedMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if (assetLocator.assetType !== AssetType.BSNMediaFeed || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetMediaFeedMigrateAsset must be given asset locator of BSN media feed entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };
    return bsnCmGetAsset(assetLocator)
      // .then((asset) => asset.fetchAssetItemData())
      .then((asset) => (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem)
      .then(() => bsnCmGetAsset(assetLocator))
      .then((asset: BsMediaFeedAsset) => asset.feedInfo.content)
      .then((assetItems) => (migrateAsset as BsnCmMigrateAssetSpec).dependencies = assetItems)
      .then(() => migrateAsset as BsnCmMigrateAssetSpec);
  }
}

function bsnCmGetHtmlSiteMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if (assetLocator.assetType !== AssetType.HtmlSite || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetHtmlSiteMigrateAsset must be given asset locator of BSN html site entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependencies: [],
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };
    return bsnCmGetAsset(assetLocator)
      .then((asset) => asset.fetchAssetItemData())
      .then((asset) => {
        (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem;
        (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem.assetData = asset.assetData;
      })
      .then(() => migrateAsset as BsnCmMigrateAssetSpec);
  }
}

function bsnCmGetDeviceWebPageMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if (assetLocator.assetType !== AssetType.DeviceHtmlSite || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetDeviceWebPageMigrateAsset must be given asset locator of BSN device web page entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependencies: [],
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };
    return bsnCmGetAsset(assetLocator)
      .then((asset) => asset.fetchAssetItemData())
      .then((asset) => {
        (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem;
        (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem.assetData = asset.assetData;
      })
      .then(() => migrateAsset as BsnCmMigrateAssetSpec);
  }
}

function bsnCmGetShallowMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {
  if ((assetLocator.assetType !== AssetType.Content
    && assetLocator.assetType !== AssetType.Other
    && assetLocator.assetType !== AssetType.BrightScript)
    || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetShallowMigrateAsset must be given asset locator of BSN content, '
      + ' other or brightscript entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else {
    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependencies: [],
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };
    return bsnCmGetAsset(assetLocator)
      .then((asset) => (migrateAsset as BsnCmMigrateAssetSpec).sourceAssetItem = asset.assetItem)
      .then(() => migrateAsset as BsnCmMigrateAssetSpec);
  }
}

function bsnCmGetMigrateAsset(assetLocator: BsAssetLocator): Promise<BsnCmMigrateAssetSpec> {

  if (assetLocator.name.endsWith('.brs')) {
    console.log(assetLocator);
  }

  if (!bscIsAssetItem(assetLocator) || assetLocator.location !== AssetLocation.Bsn) {
    const errorMessage = 'bsnCmGetMigrateAsset must be given asset locator of BSN entity';
    return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
  } else if (
    assetLocator.name === 'autoplugins.brs' ||
    assetLocator.name === '_deviceWebPage.html' ||
    assetLocator.name === '_deviceIdWebPage.html' ||
    assetLocator.name === 'BrightSignApplicationServer' ||
    assetLocator.name === 'BoseProducts.xml'
    ) {
    const migrateAsset = {
      id: bsnCmGetGuid(),
      dependencies: [],
      dependants: [],
      stagedAssetItem: null,
      destinationAssetItem: null,
    };
    return Promise.resolve(migrateAsset as BsnCmMigrateAssetSpec);
  } else {
    switch (assetLocator.assetType) {
      case AssetType.Project: {
        return bsnCmGetPresentationMigrateAsset(assetLocator);
      }
      case AssetType.ProjectBpf: {
        return bsnCmGetPresentationBpfMigrateAsset(assetLocator);
      }
      case AssetType.BSNDataFeed: {
        return bsnCmGetDataFeedMigrateAsset(assetLocator);
      }
      case AssetType.BSNDynamicPlaylist: {
        return bsnCmGetDynamicPlaylistMigrateAsset(assetLocator);
      }
      case AssetType.BSNMediaFeed: {
        return bsnCmGetMediaFeedMigrateAsset(assetLocator);
      }
      case AssetType.DeviceHtmlSite: {
        return bsnCmGetDeviceWebPageMigrateAsset(assetLocator);
      }
      case AssetType.HtmlSite: {
        return bsnCmGetHtmlSiteMigrateAsset(assetLocator);
      }
      case AssetType.BrightScript: // TODO does bsn expose scripts for legacy presentations?
      case AssetType.Content:
      case AssetType.Other: { // TODO does BSN hide AssetType.other?
        return bsnCmGetShallowMigrateAsset(assetLocator);
      }
      default: {
        const errorMessage = 'bsnCmGetMigrateAsset asset type not supported ' + assetLocator.assetType;
        return Promise.reject(new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage));
      }
    }
  }
}

function bsnCmValidateMigrateParameters(parameters: BsnCmMigrateParameters): boolean {
  // TODO implement
  return true;
}

export function bsnCmGetMigrationSpec(parameters: BsnCmMigrateParameters): Promise<BsnCmMigrateSpec> {
  bsnCmValidateMigrateParameters(parameters);
  const spec: BsnCmMigrateSpec = {
    id: bsnCmGetGuid(),
    parameters,
    assets: [],
    assetMap: {},
  };

  const visited: Set<string> = new Set();
  let toVisit: BsAssetLocator[] = [...parameters.assets];
  const assetInDegrees = new Map<string, number>();
  const prepareNextMigrateAsset = () => {
    if (toVisit.length === 0) {
      return Promise.resolve();
    }
    const visiting = toVisit.shift();
    const visitingHash = csDmCreateHashFromAssetLocator(visiting);
    if (visited.has(visitingHash)) {
      return prepareNextMigrateAsset();
    }

    // found origin node without any known dependants at this point
    // init in degree to zero
    if (!assetInDegrees.has(visitingHash)) {
      assetInDegrees.set(visitingHash, 0);
    }

    let globalMigrateAsset: any;

    return bsnCmGetMigrateAsset(visiting)
      .then((migrateAsset) => {
        // console.log(migrateAsset);
        globalMigrateAsset = migrateAsset;
        spec.assetMap[visitingHash] = migrateAsset;
        migrateAsset.dependencies.forEach((assetItem) => {
          const dependencyHash = csDmCreateHashFromAssetLocator(assetItem);
          if (assetInDegrees.has(dependencyHash)) {
            assetInDegrees.set(dependencyHash, assetInDegrees.get(dependencyHash) + 1);
          } else {
            assetInDegrees.set(dependencyHash, 1);
          }
          toVisit.push(assetItem);
        });
        visited.add(visitingHash);
        return Promise.resolve();
      })
      .then(() => prepareNextMigrateAsset())
      .catch((err: Error) => {
        console.log(err);
        console.log(globalMigrateAsset);
        return prepareNextMigrateAsset();
      });
  };

  // topological sort spec assets to ensure switch presentations are ordered
  const sortMigrateSpec = () => {
    toVisit = [...parameters.assets];
    while (toVisit.length > 0) {
      const visiting = toVisit.shift();
      const visitingHash = csDmCreateHashFromAssetLocator(visiting);
      spec.assets.push(visitingHash);
      const visitingMigrateSpec = spec.assetMap[visitingHash];
      const visitingDependencies = visitingMigrateSpec.dependencies;

      for (const dependency of visitingDependencies) {
        const dependencyHash = csDmCreateHashFromAssetLocator(dependency);
        const dependencyMigrateSpec = spec.assetMap[dependencyHash];
        dependencyMigrateSpec.dependants.push(visitingMigrateSpec.sourceAssetItem);
        assetInDegrees.set(dependencyHash, assetInDegrees.get(dependencyHash) - 1);
        if (assetInDegrees.get(dependencyHash) === 0) {
          toVisit.push(dependency);
        }
      }
    }

    // detect cycle in dependency graph. although this should not occur, it likely indicates
    // circular reference with switch presentations
    if (Object.keys(spec.assetMap).length !== spec.assets.length) {
      const errorMessage = 'error cycle detected in migrate dependency graph ' + JSON.stringify(spec.assetMap);
      return Promise.reject(new BsnCmError(BsnCmErrorType.unexpectedError, errorMessage));
    }

  };

  return bsnCmMigrateConnect(spec.parameters.source)
    .then(() => prepareNextMigrateAsset())
    .then(() => sortMigrateSpec())
    .then(() => spec);
}
