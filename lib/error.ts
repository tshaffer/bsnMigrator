export enum BsnCmErrorType {
  unknownError,
  unexpectedError,
  invalidUserPassword,
  invalidParameters,
  networkError,
  requestError,
  apiError,
  serverError,
}

const bsnCmErrorMessage: {[type: number]: string} = {
  [BsnCmErrorType.unknownError] : 'Unknown error',
  [BsnCmErrorType.unexpectedError] : 'Unexpected error',
  [BsnCmErrorType.invalidParameters] : 'Invalid parameters',
  [BsnCmErrorType.networkError] : 'Network error',
  [BsnCmErrorType.requestError] : 'Request error',
  [BsnCmErrorType.apiError] : 'API error',
  [BsnCmErrorType.serverError] : 'Server error',
};

export class BsnCmError extends Error {
  name = 'BsnCmError';
  type: BsnCmErrorType;
  response?: Response | string;

  constructor(type: BsnCmErrorType, reason?: string) {
    super();
    this.type = type;
    if (reason) {
      this.message = bsnCmErrorMessage[type] + ': ' + reason;
    } else {
      this.message = bsnCmErrorMessage[type];
    }
    Object.setPrototypeOf(this, BsnCmError.prototype);
  }
}
