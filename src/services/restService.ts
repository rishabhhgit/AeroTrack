import { Service } from './infrastructure/service.js';

// Types
import type { IService } from './infrastructure/serviceTypes.js';

export enum ResponseStateEnumeration {
  Unknown,
  OK,
  Error
}

export interface IResponseMessage {
  context: string;
  logText?: string;
}

export interface IResponse<T> {
  state: ResponseStateEnumeration;
  messageStack: IResponseMessage[];
  payload?: T;
};

export const createResponse = <T>(payload: T, state: ResponseStateEnumeration = ResponseStateEnumeration.OK, messageStack: IResponseMessage[] = []) => {

  const response: IResponse<T> = {
    state: state,
    messageStack: messageStack,
    payload: payload
  }

  return response;
}

export interface IRESTService extends IService {
  get: <T>(url: string, init?: RequestInit) => Promise<IResponse<T>>;
  post: <T>(url: string, data: object | string, init?: RequestInit) => Promise<IResponse<T>>;
  put: <T>(url: string, data: object | string, init?: RequestInit) => Promise<IResponse<T>>;
  delete: <T>(url: string, data?: object | number, init?: RequestInit) => Promise<IResponse<T>>;
  getDefaultRequestInit: (method: string) => RequestInit;
  setAuthorization: (authorizationHeader: string | (() => Promise<string>) | undefined) => void;
};

export class RESTService extends Service implements IRESTService {

  // Props
  private authorizationHeader: string | (() => Promise<string>) | undefined = undefined;

  constructor(key: string) {
    super(key);
  };

  public get = <T>(url: string, init?: RequestInit): Promise<IResponse<T>> => {
    return this.invokeAsync<T>('GET', url, undefined, init);
  };

  public post = <T>(url: string, data: object | string, init?: RequestInit): Promise<IResponse<T>> => {
    return this.invokeAsync<T>('POST', url, data, init);
  };

  public put = <T>(url: string, data: object | string, init?: RequestInit): Promise<IResponse<T>> => {
    return this.invokeAsync<T>('PUT', url, data, init);
  };

  public delete = <T>(url: string, data?: object | number, init?: RequestInit): Promise<IResponse<T>> => {
    return this.invokeAsync<T>('DELETE', url, data, init);
  };

  public getDefaultRequestInit = (method: string): RequestInit => {

    const requestInit: RequestInit = {
      method: method,               // *GET, POST, PUT, DELETE, etc.
      mode: "same-origin",          // no-cors, cors, *same-origin
      cache: "default",             // *default, no-cache, reload, force-cache, only-if-cached
      credentials: "same-origin",   // include, *same-origin, omit
      redirect: "follow",           // manual, *follow, error
      referrer: "client",
    }

    return requestInit;
  };

  public setAuthorization = (authorizationHeader: string | (() => Promise<string>) | undefined) => {
    this.authorizationHeader = authorizationHeader;
  };

  protected async onStarting(): Promise<boolean> {
    return true;
  };

  protected async onStopping(): Promise<boolean> {
    return true;
  };

  private async getHeaders(data?: object | number | string): Promise<Headers> {

    const headers = new Headers();
    headers.set('Accept', 'application/json');

    // Dynamic Authorization Header
    if (this.authorizationHeader) {
      let authValue: string;
      if (typeof this.authorizationHeader === "function") {
        authValue = await this.authorizationHeader();
      } else {
        authValue = this.authorizationHeader;
      }
      if (authValue) headers.set('Authorization', authValue);
    }

    // Content-Type by data type
    if (data) {
      if ((typeof data === 'object')) {
        headers.set('Content-Type', 'application/json');
      }
      else {
        headers.set('Content-Type', 'application/x-www-form-urlencoded');
      }
    }

    return headers;
  }

  private getBody = (data?: object | number | string) => {

    let body = undefined;

    // Body data type must match "Content-Type" header
    if (data) {
      if ((typeof data === 'object')) {
        body = JSON.stringify(data);
      }
      else {
        body = String(data);
      }
    }

    return body;
  };

  private getRequestInit = (method: string, init?: RequestInit) => {

    let requestInit = this.getDefaultRequestInit(method);

    if (init)
      requestInit = { ...requestInit, ...init };

    return requestInit;
  };

  private invokeAsync = async <T>(method: string, url: string, data?: object | number | string, init?: RequestInit): Promise<IResponse<T>> => {

    let responseOk = false;
    let responseStatus = 0;
    let responseStatusText = '';

    const requestInit = this.getRequestInit(method, init);
    const headers = await this.getHeaders(data);
    const body = this.getBody(data);
    requestInit.headers = headers;
    requestInit.body = body;

    console.debug(`REST request '${method}' has started on url ${url}.`, requestInit);

    return fetch(url, requestInit)
      .then((response: Response) => {

        // Save the response state
        responseOk = response.ok;
        responseStatus = response.status;
        responseStatusText = response.statusText;

        // Check how to resolve the body
        const responseContentType = response.headers.get("content-type");
        if (responseContentType && responseContentType.indexOf("application/json") !== -1)
          return response.json();
        else
          return response.text();

      })
      .then((responseObject) => {

        // Setup the response object
        const responseData: IResponse<T> = {
          state: ResponseStateEnumeration.Unknown,
          messageStack: []
        }

        console.debug(`REST request '${method}' has returned from url ${url}. [${responseStatus}, ${responseStatusText}]`);

        // Treat non-2xx as errors (includes 429 rate limit)
        if (!responseOk) {
          const logMessage = `Request failed with status ${responseStatus}: ${responseStatusText}`;
          responseData.state = ResponseStateEnumeration.Error;
          responseData.messageStack.push({
            context: this.key,
            logText: logMessage
          });
        }
        else if (responseObject == null) {

          const displayValue = `No valid response.`;
          const logMessage = `${displayValue} Response object is null or undefined.`;

          responseData.messageStack.push({
            context: this.key,
            logText: logMessage
          })

          console.warn(logMessage);
        }
        else if (typeof responseObject == 'string') {

          const payload = {
            data: responseObject
          } as T;

          responseData.state = ResponseStateEnumeration.OK;
          responseData.payload = payload;
        }
        else if (typeof responseObject == 'object') {

          const assertedResponseData = responseObject as IResponse<T>;
          if (assertedResponseData.state && assertedResponseData.messageStack && assertedResponseData.payload) {

            responseData.state = assertedResponseData.state;
            responseData.messageStack = assertedResponseData.messageStack;
            responseData.payload = assertedResponseData.payload;
          }
          else {

            responseData.state = ResponseStateEnumeration.OK;
            responseData.payload = responseObject;
          }
        }
        else {

          const displayValue = `No response available.`;
          const logMessage = `${displayValue} No idea what's going on here. Go and drink a coffee.`;

          responseData.messageStack.push({
            context: this.key,
            logText: logMessage
          })

          console.warn(logMessage);
        }

        // Fill the response object
        const response: IResponse<T> = {
          state: responseData.state,
          messageStack: responseData.messageStack,
          payload: responseData.payload,
        };

        return response;
      })
      .catch((reason: unknown) => {

        // Setup the response object
        const errorMessage = reason instanceof Error ? reason.message : String(reason || 'Unknown error');
        const response: IResponse<T> = {
          state: ResponseStateEnumeration.Error,
          messageStack: [{
            context: this.key,
            logText: `Request failed: ${errorMessage}`
          }]
        };

        return response;
      });

  };
};