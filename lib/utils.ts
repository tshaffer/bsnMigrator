import {
  isFunction,
  isObject,
  isNumber,
  isString,
  isNil,
} from 'lodash';
import isomorphicPath from 'isomorphic-path';
import axios from 'axios';
import {
  AxiosRequestConfig,
  AxiosResponse,
} from 'axios';
import * as fse from 'fs-extra';
import {
  AssetLocation,
  AssetType,
  BsAssetLocator,
  BsAssetItem,
  bscIsAssetItem,
  BsnOAuthServerConfiguration,
  BsnBDeployServerConfiguration,
  BsnServerConfiguration,
  BsDsSetupParams,
} from '@brightsign/bscore';
import {
  DmBsProjectState,
  dmFilterDmState,
  dmGetAssetItemIdsForSign,
  dmGetAssetItemById,
} from '@brightsign/bsdatamodel';
import {
  BsnSession,
  bsnGetSession,
  bsnConnectorConfig,
} from '@brightsign/bsnconnector';
import {
  BsPresentationAsset,
  cmBsAssetExists,
  cmGetBsAssetForAssetLocator,
} from '@brightsign/bs-content-manager';
import {
  BsnCmMigrateSpec,
  BsnCmMigrateAssetSpec,
  BsnCmGetStaticFileOptions,
  BsnCmGetStaticFileProgressEvent,
  BsnCmMigrateConnectorConfiguration,
} from './types';
import {
  BsnCmError,
  BsnCmErrorType,
} from './error';

// tslint:disable-next-line
axios.defaults.adapter = require('axios/lib/adapters/http');
// tslint:disable-next-line
const followRedirects = require('follow-redirects');
followRedirects.maxRedirects = 10;
followRedirects.maxBodyLength = 500 * 1024 * 1024 * 1024; // 500 GB

function validateGetStaticFileOptions(options: BsnCmGetStaticFileOptions): BsnCmError[] {
  const optionErrors: BsnCmError[] = [];
  if (isObject(options)) {
    if (options.hasOwnProperty('onFileProgress') && !isFunction(options.onFileProgress)) {
      const errorMessage = `Invalid options.onFileProgress must me of type object: ${options.onFileProgress}`;
      const error = new BsnCmError(BsnCmErrorType.invalidParameters, errorMessage);
      optionErrors.push(error);
    }
  }
  return optionErrors;
}

function processResponse(response: AxiosResponse): AxiosResponse {
  if (response.statusText === 'OK') {
    return response;
  } else {
    switch (true) {
      case response.status === 401:
      case response.status === 403: {
        const error = new BsnCmError(BsnCmErrorType.invalidParameters);
        error.response = response as any; // TODO fix this, axios missing body of response type
        throw error;
      }
      case response.status === 400:
      case response.status > 403 && response.status < 500: {
        const error = new BsnCmError(BsnCmErrorType.invalidParameters);
        error.response = response as any; // TODO fix this, axios missing body of response type
        throw error;
      }
      case response.status > 500: {
        const error = new BsnCmError(BsnCmErrorType.serverError);
        error.response = response as any; // TODO fix this, axios missing body of response type
        throw error;
      }
      default: {
        const error = new BsnCmError(BsnCmErrorType.unknownError);
        error.response = response as any; // TODO fix this, axios missing body of response type
        throw error;
      }
    }
  }
}

/** @internal */
/** @private */
function getBsnCmGetStaticFileProgressEvent(file: string, progressEvent: any): BsnCmGetStaticFileProgressEvent {
  if (isObject(progressEvent)) {
    let totalSize = 0;
    if (isNumber(progressEvent.lengthComputable)) {
      totalSize = progressEvent.lengthComputable;
    } else if (isNumber(progressEvent.total)) {
      totalSize = progressEvent.total;
    } else if (isNumber(progressEvent.target.getResponseHeader('content-length'))) {
      totalSize = progressEvent.target.getResponseHeader('content-length');
    } else if (isNumber(progressEvent.target.getResponseHeader('x-decompressed-content-length'))) {
      totalSize = progressEvent.target.getResponseHeader('x-decompressed-content-length');
    }
    const loadedSize = progressEvent.loaded;
    return {
      file,
      loadedSize,
      totalSize,
    };
  }
}

/** @internal */
/** @private */
function handleProgressEvent(
  file: string,
  callback: (progressEvent: BsnCmGetStaticFileProgressEvent) => void,
): (progressEvent: any) => void {
  const optionErrors: BsnCmError[] = [];
  if (isFunction(callback)) {
    return (progressEvent: any) => {
      const parsedProgressEvent = getBsnCmGetStaticFileProgressEvent(file, progressEvent);
      callback(parsedProgressEvent);
    };
  }
}

/** @internal */
/** @private */
export function bsnCmGetStoredFileAsJson(url: string, options?: BsnCmGetStaticFileOptions): Promise<object> {
  const optionErrors = validateGetStaticFileOptions(options);
  if (optionErrors.length > 0) {
    const error = new BsnCmError(BsnCmErrorType.invalidParameters);
    error.response = JSON.stringify(optionErrors);
    return Promise.reject(error);
  }

  const mergedOptions: Partial<AxiosRequestConfig> = {
    responseType: 'json',
  };

  if (isObject(options) && isFunction(options.onFileProgress)) {
    mergedOptions.onDownloadProgress =  handleProgressEvent(url, options.onFileProgress);
  }
  return axios.get(url, mergedOptions)
    .then((resp) => processResponse(resp))
    .then((resp) => resp.data);
}

/** @internal */
/** @private */
export function bsnCmGetStoredFileAsDocument(url: string, options?: BsnCmGetStaticFileOptions): Promise<Document> {
  const optionErrors = validateGetStaticFileOptions(options);
  if (optionErrors.length > 0) {
    const error = new BsnCmError(BsnCmErrorType.invalidParameters);
    error.response = JSON.stringify(optionErrors);
    return Promise.reject(error);
  }

  const mergedOptions: Partial<AxiosRequestConfig> = {
    responseType: 'document',
  };

  if (isObject(options) && isFunction(options.onFileProgress)) {
    mergedOptions.onDownloadProgress =  handleProgressEvent(url, options.onFileProgress);
  }
  return axios.get(url, mergedOptions)
    .then((resp) => processResponse(resp))
    .then((resp) => resp.data);
}

/** @internal */
/** @private */
export function bsnCmGetStoredFileAsText(url: string, options?: BsnCmGetStaticFileOptions): Promise<Document> {
  const optionErrors = validateGetStaticFileOptions(options);
  if (optionErrors.length > 0) {
    const error = new BsnCmError(BsnCmErrorType.invalidParameters);
    error.response = JSON.stringify(optionErrors);
    return Promise.reject(error);
  }

  const mergedOptions: Partial<AxiosRequestConfig> = {
    responseType: 'text',
  };

  if (isObject(options) && isFunction(options.onFileProgress)) {
    mergedOptions.onDownloadProgress =  handleProgressEvent(url, options.onFileProgress);
  }
  return axios.get(url, mergedOptions)
    .then((resp) => processResponse(resp))
    .then((resp) => resp.data);
}

/** @internal */
/** @private */
export function bsnCmGetStoredFileAsArrayBuffer(
  url: string,
  options?: BsnCmGetStaticFileOptions,
): Promise<ArrayBuffer> {
  const optionErrors = validateGetStaticFileOptions(options);
  if (optionErrors.length > 0) {
    const error = new BsnCmError(BsnCmErrorType.invalidParameters);
    error.response = JSON.stringify(optionErrors);
    return Promise.reject(error);
  }

  const mergedOptions: Partial<AxiosRequestConfig> = {
    responseType: 'arraybuffer',
  };

  if (isObject(options) && isFunction(options.onFileProgress)) {
    mergedOptions.onDownloadProgress =  handleProgressEvent(url, options.onFileProgress);
  }
  return axios.get(url, mergedOptions)
    .then((resp) => processResponse(resp))
    .then((resp) => resp.data);
}

/** @internal */
/** @private */
export function bsnCmGetStoredFileAsStream(
  url: string,
  options?: BsnCmGetStaticFileOptions,
): Promise<NodeJS.ReadableStream> {
  const optionErrors = validateGetStaticFileOptions(options);
  if (optionErrors.length > 0) {
    const error = new BsnCmError(BsnCmErrorType.invalidParameters);
    error.response = JSON.stringify(optionErrors);
    return Promise.reject(error);
  }

  const mergedOptions: Partial<AxiosRequestConfig> = {
    responseType: 'stream',
  };

  if (isObject(options) && isFunction(options.onFileProgress)) {
    mergedOptions.onDownloadProgress =  handleProgressEvent(url, options.onFileProgress);
  }
  return axios.get(url, mergedOptions)
    .then((resp) => processResponse(resp))
    .then((resp) => resp.data);
}

/** @internal */
/** @private */
export function bsnCmGetGuid(): string {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + s4() + s4() + s4() + s4() + s4() + s4();
}

/** @internal */
/** @private */
export function csDmCreateHashFromAssetLocator(assetItem: BsAssetLocator): string {
  if (!bscIsAssetItem(assetItem) || assetItem.location !== AssetLocation.Bsn) {
    return null;
  }

  const { scope = '', location, assetType, networkId, path, name } = assetItem;
  const locatorHash = `${scope}@${isomorphicPath.posix.sep}${location}://`;

  if (location === AssetLocation.Bsn) {
    return `${locatorHash}${assetType}${isomorphicPath.posix.sep}${networkId}`;
  }
  return locatorHash;
}

/** @internal */
/** @private */
export function bsnCmIsWindows(): boolean {
  return isomorphicPath.win32.sep === isomorphicPath.sep;
}

/** @internal */
/** @private */
export function bsnCmNormalizeLocalPath(filePath: string): string {
  let sep = isomorphicPath.sep;
  if (bsnCmIsWindows()) {
    sep += isomorphicPath.sep; // windows files paths are assumed to be escaped by node i.e. \\
  }

  const parsedPath = filePath.replace(/(\\\\)|(\/\/)|[\/\\]|(\/\\)|(\\\/)|(^.*:\\)/g, sep);
  if (bsnCmIsWindows()) {
    const prefix = parsedPath.substr(0, 2);
    const root = isomorphicPath.parse(process.cwd()).root;
    if (prefix === root) {
      return parsedPath;
    } else if (prefix === sep) {
      return root + parsedPath.substr(2, parsedPath.length - 1);
    } else {
      return root + parsedPath;
    }
  } else {
    return parsedPath;
  }
}

/** @internal */
/** @private */
export function bsnCmGetTmpDirPathForAssetSpec(spec: BsnCmMigrateSpec, assetSpec: BsnCmMigrateAssetSpec): string {
  const path = isomorphicPath.join(bsnCmGetTmpDirectory(), spec.id, assetSpec.id);
  return bsnCmNormalizeLocalPath(path);
}

/** @internal */
/** @private */
export function bsnCmGetTmpPathForAssetSpec(spec: BsnCmMigrateSpec, assetSpec: BsnCmMigrateAssetSpec): string {
  const path = isomorphicPath.join(bsnCmGetTmpDirPathForAssetSpec(spec, assetSpec), assetSpec.sourceAssetItem.name);
  return bsnCmNormalizeLocalPath(path);
}

let DEFAULT_TMP_DIR: string = isomorphicPath.join('.', 'tmp'); // default for local testing
export const bsnCmSetTmpDirectory = (path: string) => {
  if (fse.existsSync(path)) {
    return DEFAULT_TMP_DIR = path;
  } else {
    throw new BsnCmError(BsnCmErrorType.unexpectedError, 'tmp path does not exist ' + path);
  }
};
export function bsnCmGetTmpDirectory(): string {
  try {
    if (process.env.TMP && fse.existsSync(process.env.TMP)) {
      return process.env.TMP;
    } else {
      throw new BsnCmError(BsnCmErrorType.unexpectedError, 'tmp path does not exist ' + process.env.TMP);
    }
  } catch (e) {
    if (fse.existsSync(DEFAULT_TMP_DIR)) {
      return DEFAULT_TMP_DIR;
    } else {
      throw new BsnCmError(BsnCmErrorType.unexpectedError, 'tmp path does not exist ' + process.env.TMP);
    }
  }
}

export interface BsnConnectorOverrideProps {
  bsnClient: BsnClient;
  oAuthClient: BsnOAuthClient;
  oAuthServerConfiguration: BsnOAuthServerConfiguration;
  bDeployServerConfiguration: BsnBDeployServerConfiguration;
  bsnServerConfiguration: BsnServerConfiguration;
}
export interface BsnClient {
  id: string;
  secret: string;
}
export interface BsnOAuthClient {
  id: string;
  secret: string;
  refreshExpirationInterval: number;
}
export interface BsnOAuthServerConfiguration {
  oAuthTokenUrl: string;
}
export interface BsnBDeployServerConfiguration {
  bDeployUrl: string;
}
export interface BsnServerConfiguration {
  bsnDefaultUrl: string;
  bsnAuthEndpoint: string;
  bsnRestApiEndpoint: string;
  bsnUploadApiEndpoint: string;
}

export function bsnCmMigrateConnect(configuration: BsnCmMigrateConnectorConfiguration): Promise<BsnSession> {
  const session = bsnGetSession();
  if (session.isNetworkActive || session.isUserActive) {
    session.deactivate();
  }

  bsnConnectorConfig(configuration.service);

  // TODO validate BsnCmMigrateConnectorConfiguration
  const userName = configuration.authentication.userName;
  const password = configuration.authentication.password;
  const network = configuration.authentication.networkName;
  return bsnGetSession().activate(userName, password, network);
}
