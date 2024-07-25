const BASE_PATH = "https://api.flotiq.com".replace(/\/+$/, "");
class Configuration {
  constructor(configuration = {}) {
    this.configuration = configuration;
  }
  set config(configuration) {
    this.configuration = configuration;
  }
  get basePath() {
    return this.configuration.basePath != null ? this.configuration.basePath : BASE_PATH;
  }
  get fetchApi() {
    return this.configuration.fetchApi;
  }
  get middleware() {
    return this.configuration.middleware || [];
  }
  get queryParamsStringify() {
    return this.configuration.queryParamsStringify || querystring;
  }
  get username() {
    return this.configuration.username;
  }
  get password() {
    return this.configuration.password;
  }
  get apiKey() {
    const apiKey = this.configuration.apiKey;
    if (apiKey) {
      return typeof apiKey === "function" ? apiKey : () => apiKey;
    }
    return void 0;
  }
  get accessToken() {
    const accessToken = this.configuration.accessToken;
    if (accessToken) {
      return typeof accessToken === "function" ? accessToken : async () => accessToken;
    }
    return void 0;
  }
  get headers() {
    return this.configuration.headers;
  }
  get credentials() {
    return this.configuration.credentials;
  }
}
const DefaultConfig = new Configuration();
class BaseAPI {
  constructor(configuration = DefaultConfig) {
    this.configuration = configuration;
    this.fetchApi = async (url, init) => {
      let fetchParams = { url, init };
      for (const middleware of this.middleware) {
        if (middleware.pre) {
          fetchParams = await middleware.pre({
            fetch: this.fetchApi,
            ...fetchParams
          }) || fetchParams;
        }
      }
      let response = void 0;
      try {
        response = await (this.configuration.fetchApi || fetch)(fetchParams.url, fetchParams.init);
      } catch (e) {
        for (const middleware of this.middleware) {
          if (middleware.onError) {
            response = await middleware.onError({
              fetch: this.fetchApi,
              url: fetchParams.url,
              init: fetchParams.init,
              error: e,
              response: response ? response.clone() : void 0
            }) || response;
          }
        }
        if (response === void 0) {
          if (e instanceof Error) {
            throw new FetchError(e, "The request failed and the interceptors did not return an alternative response");
          } else {
            throw e;
          }
        }
      }
      for (const middleware of this.middleware) {
        if (middleware.post) {
          response = await middleware.post({
            fetch: this.fetchApi,
            url: fetchParams.url,
            init: fetchParams.init,
            response: response.clone()
          }) || response;
        }
      }
      return response;
    };
    this.middleware = configuration.middleware;
  }
  static {
    this.jsonRegex = new RegExp("^(:?application/json|[^;/ 	]+/[^;/ 	]+[+]json)[ 	]*(:?;.*)?$", "i");
  }
  withMiddleware(...middlewares) {
    const next = this.clone();
    next.middleware = next.middleware.concat(...middlewares);
    return next;
  }
  withPreMiddleware(...preMiddlewares) {
    const middlewares = preMiddlewares.map((pre) => ({ pre }));
    return this.withMiddleware(...middlewares);
  }
  withPostMiddleware(...postMiddlewares) {
    const middlewares = postMiddlewares.map((post) => ({ post }));
    return this.withMiddleware(...middlewares);
  }
  /**
   * Check if the given MIME is a JSON MIME.
   * JSON MIME examples:
   *   application/json
   *   application/json; charset=UTF8
   *   APPLICATION/JSON
   *   application/vnd.company+json
   * @param mime - MIME (Multipurpose Internet Mail Extensions)
   * @return True if the given MIME is JSON, false otherwise.
   */
  isJsonMime(mime) {
    if (!mime) {
      return false;
    }
    return BaseAPI.jsonRegex.test(mime);
  }
  async request(context, initOverrides) {
    const { url, init } = await this.createFetchParams(context, initOverrides);
    const response = await this.fetchApi(url, init);
    if (response && (response.status >= 200 && response.status < 300)) {
      return response;
    }
    throw new ResponseError(response, "Response returned an error code");
  }
  async createFetchParams(context, initOverrides) {
    let url = this.configuration.basePath + context.path;
    if (context.query !== void 0 && Object.keys(context.query).length !== 0) {
      url += "?" + this.configuration.queryParamsStringify(context.query);
    }
    const headers = Object.assign({}, this.configuration.headers, context.headers);
    Object.keys(headers).forEach((key) => headers[key] === void 0 ? delete headers[key] : {});
    const initOverrideFn = typeof initOverrides === "function" ? initOverrides : async () => initOverrides;
    const initParams = {
      method: context.method,
      headers,
      body: context.body,
      credentials: this.configuration.credentials
    };
    const overriddenInit = {
      ...initParams,
      ...await initOverrideFn({
        init: initParams,
        context
      })
    };
    let body;
    if (isFormData(overriddenInit.body) || overriddenInit.body instanceof URLSearchParams || isBlob(overriddenInit.body)) {
      body = overriddenInit.body;
    } else if (this.isJsonMime(headers["Content-Type"])) {
      body = JSON.stringify(overriddenInit.body);
    } else {
      body = overriddenInit.body;
    }
    const init = {
      ...overriddenInit,
      body
    };
    return { url, init };
  }
  /**
   * Create a shallow clone of `this` by constructing a new instance
   * and then shallow cloning data members.
   */
  clone() {
    const constructor = this.constructor;
    const next = new constructor(this.configuration);
    next.middleware = this.middleware.slice();
    return next;
  }
}
function isBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}
function isFormData(value) {
  return typeof FormData !== "undefined" && value instanceof FormData;
}
class ResponseError extends Error {
  constructor(response, msg) {
    super(msg);
    this.response = response;
    this.name = "ResponseError";
  }
}
class FetchError extends Error {
  constructor(cause, msg) {
    super(msg);
    this.cause = cause;
    this.name = "FetchError";
  }
}
class RequiredError extends Error {
  constructor(field, msg) {
    super(msg);
    this.field = field;
    this.name = "RequiredError";
  }
}
function querystring(params, prefix = "") {
  return Object.keys(params).map((key) => querystringSingleKey(key, params[key], prefix)).filter((part) => part.length > 0).join("&");
}
function querystringSingleKey(key, value, keyPrefix = "") {
  const fullKey = keyPrefix + (keyPrefix.length ? `[${key}]` : key);
  if (value instanceof Array) {
    const multiValue = value.map((singleValue) => encodeURIComponent(String(singleValue))).join(`&${encodeURIComponent(fullKey)}=`);
    return `${encodeURIComponent(fullKey)}=${multiValue}`;
  }
  if (value instanceof Set) {
    const valueAsArray = Array.from(value);
    return querystringSingleKey(key, valueAsArray, keyPrefix);
  }
  if (value instanceof Date) {
    return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value.toISOString())}`;
  }
  if (value instanceof Object) {
    return querystring(value, fullKey);
  }
  return `${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`;
}
class JSONApiResponse {
  constructor(raw, transformer = (jsonValue) => jsonValue) {
    this.raw = raw;
    this.transformer = transformer;
  }
  async value() {
    return this.transformer(await this.raw.json());
  }
}
class VoidApiResponse {
  constructor(raw) {
    this.raw = raw;
  }
  async value() {
    return void 0;
  }
}

function AbstractContentTypeSchemaDefinitionInternalFromJSON(json) {
  return AbstractContentTypeSchemaDefinitionInternalFromJSONTyped(json);
}
function AbstractContentTypeSchemaDefinitionInternalFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "contentType": json["contentType"],
    "createdAt": json["createdAt"],
    "updatedAt": json["updatedAt"],
    "deletedAt": json["deletedAt"],
    "workflowState": json["workflowState"] == null ? void 0 : json["workflowState"],
    "objectTitle": json["objectTitle"] == null ? void 0 : json["objectTitle"],
    "latestVersion": json["latestVersion"] == null ? void 0 : json["latestVersion"],
    "workflowPublicVersion": json["workflowPublicVersion"] == null ? void 0 : json["workflowPublicVersion"],
    "workflowPublishedAt": json["workflowPublishedAt"] == null ? void 0 : json["workflowPublishedAt"]
  };
}
function AbstractContentTypeSchemaDefinitionInternalToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "contentType": value["contentType"],
    "createdAt": value["createdAt"],
    "updatedAt": value["updatedAt"],
    "deletedAt": value["deletedAt"],
    "workflowState": value["workflowState"],
    "objectTitle": value["objectTitle"],
    "latestVersion": value["latestVersion"],
    "workflowPublicVersion": value["workflowPublicVersion"],
    "workflowPublishedAt": value["workflowPublishedAt"]
  };
}

function BatchResponseSuccessFromJSON(json) {
  return BatchResponseSuccessFromJSONTyped(json);
}
function BatchResponseSuccessFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "batch_total_count": json["batch_total_count"] == null ? void 0 : json["batch_total_count"],
    "batch_success_count": json["batch_success_count"] == null ? void 0 : json["batch_success_count"],
    "batch_error_count": json["batch_error_count"] == null ? void 0 : json["batch_error_count"],
    "errors": json["errors"] == null ? void 0 : json["errors"]
  };
}

function DataSourceToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "dataUrl": value["dataUrl"],
    "type": value["type"]
  };
}

function MediaWithoutInternalAllOfTrimFromJSON(json) {
  return MediaWithoutInternalAllOfTrimFromJSONTyped(json);
}
function MediaWithoutInternalAllOfTrimFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "top": json["top"],
    "left": json["left"],
    "right": json["right"] == null ? void 0 : json["right"],
    "width": json["width"] == null ? void 0 : json["width"],
    "bottom": json["bottom"] == null ? void 0 : json["bottom"],
    "height": json["height"] == null ? void 0 : json["height"]
  };
}
function MediaWithoutInternalAllOfTrimToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "top": value["top"],
    "left": value["left"],
    "right": value["right"],
    "width": value["width"],
    "bottom": value["bottom"],
    "height": value["height"]
  };
}

function MediaWithoutInternalAllOfVariantsFromJSON(json) {
  return MediaWithoutInternalAllOfVariantsFromJSONTyped(json);
}
function MediaWithoutInternalAllOfVariantsFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "name": json["name"],
    "trim": json["trim"] == null ? void 0 : MediaWithoutInternalAllOfTrimFromJSON(json["trim"])
  };
}
function MediaWithoutInternalAllOfVariantsToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "name": value["name"],
    "trim": MediaWithoutInternalAllOfTrimToJSON(value["trim"])
  };
}

function TagFromJSON(json) {
  return TagFromJSONTyped(json);
}
function TagFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "id": json["id"],
    "internal": json["internal"] == null ? void 0 : AbstractContentTypeSchemaDefinitionInternalFromJSON(json["internal"]),
    "name": json["name"]
  };
}

function MediaFromJSON(json) {
  return MediaFromJSONTyped(json);
}
function MediaFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "id": json["id"],
    "internal": json["internal"] == null ? void 0 : AbstractContentTypeSchemaDefinitionInternalFromJSON(json["internal"]),
    "url": json["url"],
    "size": json["size"],
    "tags": json["tags"] == null ? void 0 : json["tags"].map(TagFromJSON),
    "type": json["type"],
    "width": json["width"] == null ? void 0 : json["width"],
    "height": json["height"] == null ? void 0 : json["height"],
    "source": json["source"],
    "fileName": json["fileName"],
    "mimeType": json["mimeType"],
    "variants": json["variants"] == null ? void 0 : json["variants"].map(MediaWithoutInternalAllOfVariantsFromJSON),
    "extension": json["extension"],
    "externalId": json["externalId"] == null ? void 0 : json["externalId"]
  };
}

function MediaBatchDelete200ResponseFromJSON(json) {
  return MediaBatchDelete200ResponseFromJSONTyped(json);
}
function MediaBatchDelete200ResponseFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "deletedCount": json["deletedCount"] == null ? void 0 : json["deletedCount"]
  };
}

function MediaListFromJSON(json) {
  return MediaListFromJSONTyped(json);
}
function MediaListFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "total_count": json["total_count"],
    "count": json["count"],
    "total_pages": json["total_pages"],
    "current_page": json["current_page"],
    "data": json["data"] == null ? void 0 : json["data"].map(MediaFromJSON)
  };
}

function VersionItemAllOfOwnerFromJSON(json) {
  return VersionItemAllOfOwnerFromJSONTyped(json);
}
function VersionItemAllOfOwnerFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "id": json["id"] == null ? void 0 : json["id"],
    "username": json["username"] == null ? void 0 : json["username"],
    "email": json["email"] == null ? void 0 : json["email"],
    "firstName": json["firstName"] == null ? void 0 : json["firstName"],
    "lastName": json["lastName"] == null ? void 0 : json["lastName"],
    "roles": json["roles"] == null ? void 0 : json["roles"],
    "language": json["language"] == null ? void 0 : json["language"],
    "enabled": json["enabled"] == null ? void 0 : json["enabled"],
    "resetPasswordAt": json["resetPasswordAt"] == null ? void 0 : json["resetPasswordAt"],
    "subscribed": json["subscribed"] == null ? void 0 : json["subscribed"],
    "deletedAt": json["deletedAt"] == null ? void 0 : json["deletedAt"],
    "createdAt": json["createdAt"] == null ? void 0 : json["createdAt"],
    "updatedAt": json["updatedAt"] == null ? void 0 : json["updatedAt"]
  };
}

function VersionItemFromJSON(json) {
  return VersionItemFromJSONTyped(json);
}
function VersionItemFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "id": json["id"],
    "internal": json["internal"] == null ? void 0 : AbstractContentTypeSchemaDefinitionInternalFromJSON(json["internal"]),
    "deletedAt": json["deletedAt"] == null ? void 0 : json["deletedAt"],
    "createdAt": json["createdAt"] == null ? void 0 : json["createdAt"],
    "updatedAt": json["updatedAt"] == null ? void 0 : json["updatedAt"],
    "current": json["current"] == null ? void 0 : json["current"],
    "version": json["version"] == null ? void 0 : json["version"],
    "owner": json["owner"] == null ? void 0 : VersionItemAllOfOwnerFromJSON(json["owner"]),
    "editor": json["editor"] == null ? void 0 : VersionItemAllOfOwnerFromJSON(json["editor"])
  };
}

function MediaVersionsListFromJSON(json) {
  return MediaVersionsListFromJSONTyped(json);
}
function MediaVersionsListFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "total_count": json["total_count"],
    "count": json["count"],
    "total_pages": json["total_pages"],
    "current_page": json["current_page"],
    "data": json["data"] == null ? void 0 : json["data"].map(VersionItemFromJSON)
  };
}

function MediaWithoutInternalToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "id": value["id"],
    "url": value["url"],
    "size": value["size"],
    "tags": value["tags"] == null ? void 0 : value["tags"].map(DataSourceToJSON),
    "type": value["type"],
    "width": value["width"],
    "height": value["height"],
    "source": value["source"],
    "fileName": value["fileName"],
    "mimeType": value["mimeType"],
    "variants": value["variants"] == null ? void 0 : value["variants"].map(MediaWithoutInternalAllOfVariantsToJSON),
    "extension": value["extension"],
    "externalId": value["externalId"]
  };
}

function MediaWithoutRequiredToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "id": value["id"],
    "internal": AbstractContentTypeSchemaDefinitionInternalToJSON(value["internal"]),
    "url": value["url"],
    "size": value["size"],
    "tags": value["tags"] == null ? void 0 : value["tags"].map(DataSourceToJSON),
    "type": value["type"],
    "width": value["width"],
    "height": value["height"],
    "source": value["source"],
    "fileName": value["fileName"],
    "mimeType": value["mimeType"],
    "variants": value["variants"] == null ? void 0 : value["variants"].map(MediaWithoutInternalAllOfVariantsToJSON),
    "extension": value["extension"],
    "externalId": value["externalId"]
  };
}

function ProductFromJSON(json) {
  return ProductFromJSONTyped(json);
}
function ProductFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "id": json["id"],
    "internal": json["internal"] == null ? void 0 : AbstractContentTypeSchemaDefinitionInternalFromJSON(json["internal"]),
    "name": json["name"],
    "slug": json["slug"],
    "price": json["price"],
    "description": json["description"] == null ? void 0 : json["description"],
    "productImage": json["productImage"] == null ? void 0 : json["productImage"].map(MediaFromJSON),
    "productGallery": json["productGallery"] == null ? void 0 : json["productGallery"].map(MediaFromJSON)
  };
}

function ProductListFromJSON(json) {
  return ProductListFromJSONTyped(json);
}
function ProductListFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "total_count": json["total_count"],
    "count": json["count"],
    "total_pages": json["total_pages"],
    "current_page": json["current_page"],
    "data": json["data"] == null ? void 0 : json["data"].map(ProductFromJSON)
  };
}

function ProductVersionsListFromJSON(json) {
  return ProductVersionsListFromJSONTyped(json);
}
function ProductVersionsListFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "total_count": json["total_count"],
    "count": json["count"],
    "total_pages": json["total_pages"],
    "current_page": json["current_page"],
    "data": json["data"] == null ? void 0 : json["data"].map(VersionItemFromJSON)
  };
}

function ProductWithoutInternalToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "id": value["id"],
    "name": value["name"],
    "slug": value["slug"],
    "price": value["price"],
    "description": value["description"],
    "productImage": value["productImage"] == null ? void 0 : value["productImage"].map(DataSourceToJSON),
    "productGallery": value["productGallery"] == null ? void 0 : value["productGallery"].map(DataSourceToJSON)
  };
}

function ProductWithoutRequiredToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "id": value["id"],
    "internal": AbstractContentTypeSchemaDefinitionInternalToJSON(value["internal"]),
    "name": value["name"],
    "slug": value["slug"],
    "price": value["price"],
    "description": value["description"],
    "productImage": value["productImage"] == null ? void 0 : value["productImage"].map(DataSourceToJSON),
    "productGallery": value["productGallery"] == null ? void 0 : value["productGallery"].map(DataSourceToJSON)
  };
}

function TagListFromJSON(json) {
  return TagListFromJSONTyped(json);
}
function TagListFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "total_count": json["total_count"],
    "count": json["count"],
    "total_pages": json["total_pages"],
    "current_page": json["current_page"],
    "data": json["data"] == null ? void 0 : json["data"].map(TagFromJSON)
  };
}

function TagVersionsListFromJSON(json) {
  return TagVersionsListFromJSONTyped(json);
}
function TagVersionsListFromJSONTyped(json, ignoreDiscriminator) {
  if (json == null) {
    return json;
  }
  return {
    "total_count": json["total_count"],
    "count": json["count"],
    "total_pages": json["total_pages"],
    "current_page": json["current_page"],
    "data": json["data"] == null ? void 0 : json["data"].map(VersionItemFromJSON)
  };
}

function TagWithoutInternalToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "id": value["id"],
    "name": value["name"]
  };
}

function TagWithoutRequiredToJSON(value) {
  if (value == null) {
    return value;
  }
  return {
    "id": value["id"],
    "internal": AbstractContentTypeSchemaDefinitionInternalToJSON(value["internal"]),
    "name": value["name"]
  };
}

class MediaInternalAPI extends BaseAPI {
  /**
   * Removes Media (internal) object.<br />
   * Delete a _media object
   */
  async _deleteRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling _delete().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new VoidApiResponse(response);
  }
  /**
   * Removes Media (internal) object.<br />
   * Delete a _media object
   */
  async _delete(requestParameters, initOverrides) {
    await this._deleteRaw(requestParameters, initOverrides);
  }
  /**
   * Allows you to create or create and update up to 100 objects of Media (internal) type. <br />
   * Create a batch of _media objects
   */
  async batchCreateRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["updateExisting"] != null) {
      queryParameters["updateExisting"] = requestParameters["updateExisting"];
    }
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/batch`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["MediaWithoutInternal"].map(MediaWithoutInternalToJSON)
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => BatchResponseSuccessFromJSON(jsonValue));
  }
  /**
   * Allows you to create or create and update up to 100 objects of Media (internal) type. <br />
   * Create a batch of _media objects
   */
  async batchCreate(requestParameters = {}, initOverrides) {
    const response = await this.batchCreateRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to delete up to 100 objects of Media (internal) type. <br />Request body accepts an array of content object IDs that are to be deleted.<br />
   * Delete a batch of _media objects
   */
  async batchDeleteRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/batch-delete`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["request_body"]
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaBatchDelete200ResponseFromJSON(jsonValue));
  }
  /**
   * Allows you to delete up to 100 objects of Media (internal) type. <br />Request body accepts an array of content object IDs that are to be deleted.<br />
   * Delete a batch of _media objects
   */
  async batchDelete(requestParameters = {}, initOverrides) {
    const response = await this.batchDeleteRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to update up to 100 objects of Media (internal) type. <br />
   * Update selected fields of a batch of objects
   */
  async batchPatchRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/batch`,
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["MediaWithoutInternal"].map(MediaWithoutInternalToJSON)
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => BatchResponseSuccessFromJSON(jsonValue));
  }
  /**
   * Allows you to update up to 100 objects of Media (internal) type. <br />
   * Update selected fields of a batch of objects
   */
  async batchPatch(requestParameters = {}, initOverrides) {
    const response = await this.batchPatchRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to create object of Media (internal) type. <br />
   * Create a _media object
   */
  async createRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: MediaWithoutInternalToJSON(requestParameters["MediaWithoutInternal"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaFromJSON(jsonValue));
  }
  /**
   * Allows you to create object of Media (internal) type. <br />
   * Create a _media object
   */
  async create(requestParameters = {}, initOverrides) {
    const response = await this.createRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Returns all information about Media (internal) object. <br />
   * Get _media object by Id
   */
  async getRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling get().'
      );
    }
    const queryParameters = {};
    if (requestParameters["hydrate"] != null) {
      queryParameters["hydrate"] = requestParameters["hydrate"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaFromJSON(jsonValue));
  }
  /**
   * Returns all information about Media (internal) object. <br />
   * Get _media object by Id
   */
  async get(requestParameters, initOverrides) {
    const response = await this.getRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Get ids of removed Media (internal) objects. <br />
   * Get removed object identifiers
   */
  async getRemovedRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["deletedAfter"] != null) {
      queryParameters["deletedAfter"] = requestParameters["deletedAfter"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/removed`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response);
  }
  /**
   * Get ids of removed Media (internal) objects. <br />
   * Get removed object identifiers
   */
  async getRemoved(requestParameters = {}, initOverrides) {
    const response = await this.getRemovedRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Return version of Media (internal) object. <br />
   * Get a specific version of _media object
   */
  async getVersionsRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling getVersions().'
      );
    }
    if (requestParameters["versionId"] == null) {
      throw new RequiredError(
        "versionId",
        'Required parameter "versionId" was null or undefined when calling getVersions().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/{id}/version/{versionId}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))).replace(`{${"versionId"}}`, encodeURIComponent(String(requestParameters["versionId"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaFromJSON(jsonValue));
  }
  /**
   * Return version of Media (internal) object. <br />
   * Get a specific version of _media object
   */
  async getVersions(requestParameters, initOverrides) {
    const response = await this.getVersionsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List objects of Media (internal) type. <br />
   * List _media objects
   */
  async listRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["page"] != null) {
      queryParameters["page"] = requestParameters["page"];
    }
    if (requestParameters["limit"] != null) {
      queryParameters["limit"] = requestParameters["limit"];
    }
    if (requestParameters["order_by"] != null) {
      queryParameters["order_by"] = requestParameters["order_by"];
    }
    if (requestParameters["order_direction"] != null) {
      queryParameters["order_direction"] = requestParameters["order_direction"];
    }
    if (requestParameters["hydrate"] != null) {
      queryParameters["hydrate"] = requestParameters["hydrate"];
    }
    if (requestParameters["filters"] != null) {
      queryParameters["filters"] = requestParameters["filters"];
    }
    if (requestParameters["ids"] != null) {
      queryParameters["ids[]"] = requestParameters["ids"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaListFromJSON(jsonValue));
  }
  /**
   * List objects of Media (internal) type. <br />
   * List _media objects
   */
  async list(requestParameters = {}, initOverrides) {
    const response = await this.listRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List objects versions of Media (internal) type. <br />
   * List all versions of a _media object
   */
  async listVersionRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling listVersion().'
      );
    }
    const queryParameters = {};
    if (requestParameters["page"] != null) {
      queryParameters["page"] = requestParameters["page"];
    }
    if (requestParameters["limit"] != null) {
      queryParameters["limit"] = requestParameters["limit"];
    }
    if (requestParameters["order_by"] != null) {
      queryParameters["order_by"] = requestParameters["order_by"];
    }
    if (requestParameters["order_direction"] != null) {
      queryParameters["order_direction"] = requestParameters["order_direction"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/{id}/version`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaVersionsListFromJSON(jsonValue));
  }
  /**
   * List objects versions of Media (internal) type. <br />
   * List all versions of a _media object
   */
  async listVersion(requestParameters, initOverrides) {
    const response = await this.listVersionRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows update of the Media (internal) object, but it is unnecessary to specify all the object\'s properties. Properties not included in the payload will be completed with data from the database. <br />
   * Update selected fields of _media object
   */
  async patchRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling patch().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: MediaWithoutRequiredToJSON(requestParameters["MediaWithoutRequired"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaFromJSON(jsonValue));
  }
  /**
   * Allows update of the Media (internal) object, but it is unnecessary to specify all the object\'s properties. Properties not included in the payload will be completed with data from the database. <br />
   * Update selected fields of _media object
   */
  async patch(requestParameters, initOverrides) {
    const response = await this.patchRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows update of the Media (internal) object, it has to have all fields, as this operation overwrites the object. All properties not included in the payload will be lost. <br />
   * Update existing _media object
   */
  async updateRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling update().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_media/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "PUT",
      headers: headerParameters,
      query: queryParameters,
      body: MediaWithoutInternalToJSON(requestParameters["MediaWithoutInternal"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaFromJSON(jsonValue));
  }
  /**
   * Allows update of the Media (internal) object, it has to have all fields, as this operation overwrites the object. All properties not included in the payload will be lost. <br />
   * Update existing _media object
   */
  async update(requestParameters, initOverrides) {
    const response = await this.updateRaw(requestParameters, initOverrides);
    return await response.value();
  }
}

class ProductAPI extends BaseAPI {
  /**
   * Removes Product object.<br />
   * Delete a Product object
   */
  async _deleteRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling _delete().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new VoidApiResponse(response);
  }
  /**
   * Removes Product object.<br />
   * Delete a Product object
   */
  async _delete(requestParameters, initOverrides) {
    await this._deleteRaw(requestParameters, initOverrides);
  }
  /**
   * Allows you to create or create and update up to 100 objects of Product type. <br />
   * Create a batch of product objects
   */
  async batchCreateRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["updateExisting"] != null) {
      queryParameters["updateExisting"] = requestParameters["updateExisting"];
    }
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/batch`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["ProductWithoutInternal"].map(ProductWithoutInternalToJSON)
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => BatchResponseSuccessFromJSON(jsonValue));
  }
  /**
   * Allows you to create or create and update up to 100 objects of Product type. <br />
   * Create a batch of product objects
   */
  async batchCreate(requestParameters = {}, initOverrides) {
    const response = await this.batchCreateRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to delete up to 100 objects of Product type. <br />Request body accepts an array of content object IDs that are to be deleted.<br />
   * Delete a batch of Product objects
   */
  async batchDeleteRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/batch-delete`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["request_body"]
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaBatchDelete200ResponseFromJSON(jsonValue));
  }
  /**
   * Allows you to delete up to 100 objects of Product type. <br />Request body accepts an array of content object IDs that are to be deleted.<br />
   * Delete a batch of Product objects
   */
  async batchDelete(requestParameters = {}, initOverrides) {
    const response = await this.batchDeleteRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to update up to 100 objects of Product type. <br />
   * Update selected fields of a batch of objects
   */
  async batchPatchRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/batch`,
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["ProductWithoutInternal"].map(ProductWithoutInternalToJSON)
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => BatchResponseSuccessFromJSON(jsonValue));
  }
  /**
   * Allows you to update up to 100 objects of Product type. <br />
   * Update selected fields of a batch of objects
   */
  async batchPatch(requestParameters = {}, initOverrides) {
    const response = await this.batchPatchRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to create object of Product type. <br />
   * Create a Product object
   */
  async createRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: ProductWithoutInternalToJSON(requestParameters["ProductWithoutInternal"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => ProductFromJSON(jsonValue));
  }
  /**
   * Allows you to create object of Product type. <br />
   * Create a Product object
   */
  async create(requestParameters = {}, initOverrides) {
    const response = await this.createRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Returns all information about Product object. <br />
   * Get Product object by Id
   */
  async getRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling get().'
      );
    }
    const queryParameters = {};
    if (requestParameters["hydrate"] != null) {
      queryParameters["hydrate"] = requestParameters["hydrate"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => ProductFromJSON(jsonValue));
  }
  /**
   * Returns all information about Product object. <br />
   * Get Product object by Id
   */
  async get(requestParameters, initOverrides) {
    const response = await this.getRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Get ids of removed Product objects. <br />
   * Get removed object identifiers
   */
  async getRemovedRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["deletedAfter"] != null) {
      queryParameters["deletedAfter"] = requestParameters["deletedAfter"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/removed`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response);
  }
  /**
   * Get ids of removed Product objects. <br />
   * Get removed object identifiers
   */
  async getRemoved(requestParameters = {}, initOverrides) {
    const response = await this.getRemovedRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Return version of Product object. <br />
   * Get a specific version of Product object
   */
  async getVersionsRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling getVersions().'
      );
    }
    if (requestParameters["versionId"] == null) {
      throw new RequiredError(
        "versionId",
        'Required parameter "versionId" was null or undefined when calling getVersions().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/{id}/version/{versionId}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))).replace(`{${"versionId"}}`, encodeURIComponent(String(requestParameters["versionId"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => ProductFromJSON(jsonValue));
  }
  /**
   * Return version of Product object. <br />
   * Get a specific version of Product object
   */
  async getVersions(requestParameters, initOverrides) {
    const response = await this.getVersionsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List objects of Product type. <br />
   * List Product objects
   */
  async listRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["page"] != null) {
      queryParameters["page"] = requestParameters["page"];
    }
    if (requestParameters["limit"] != null) {
      queryParameters["limit"] = requestParameters["limit"];
    }
    if (requestParameters["order_by"] != null) {
      queryParameters["order_by"] = requestParameters["order_by"];
    }
    if (requestParameters["order_direction"] != null) {
      queryParameters["order_direction"] = requestParameters["order_direction"];
    }
    if (requestParameters["hydrate"] != null) {
      queryParameters["hydrate"] = requestParameters["hydrate"];
    }
    if (requestParameters["filters"] != null) {
      queryParameters["filters"] = requestParameters["filters"];
    }
    if (requestParameters["ids"] != null) {
      queryParameters["ids[]"] = requestParameters["ids"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => ProductListFromJSON(jsonValue));
  }
  /**
   * List objects of Product type. <br />
   * List Product objects
   */
  async list(requestParameters = {}, initOverrides) {
    const response = await this.listRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List objects versions of Product type. <br />
   * List all versions of a Product object
   */
  async listVersionRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling listVersion().'
      );
    }
    const queryParameters = {};
    if (requestParameters["page"] != null) {
      queryParameters["page"] = requestParameters["page"];
    }
    if (requestParameters["limit"] != null) {
      queryParameters["limit"] = requestParameters["limit"];
    }
    if (requestParameters["order_by"] != null) {
      queryParameters["order_by"] = requestParameters["order_by"];
    }
    if (requestParameters["order_direction"] != null) {
      queryParameters["order_direction"] = requestParameters["order_direction"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/{id}/version`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => ProductVersionsListFromJSON(jsonValue));
  }
  /**
   * List objects versions of Product type. <br />
   * List all versions of a Product object
   */
  async listVersion(requestParameters, initOverrides) {
    const response = await this.listVersionRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows update of the Product object, but it is unnecessary to specify all the object\'s properties. Properties not included in the payload will be completed with data from the database. <br />
   * Update selected fields of Product object
   */
  async patchRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling patch().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: ProductWithoutRequiredToJSON(requestParameters["ProductWithoutRequired"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => ProductFromJSON(jsonValue));
  }
  /**
   * Allows update of the Product object, but it is unnecessary to specify all the object\'s properties. Properties not included in the payload will be completed with data from the database. <br />
   * Update selected fields of Product object
   */
  async patch(requestParameters, initOverrides) {
    const response = await this.patchRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows update of the Product object, it has to have all fields, as this operation overwrites the object. All properties not included in the payload will be lost. <br />
   * Update existing Product object
   */
  async updateRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling update().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/product/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "PUT",
      headers: headerParameters,
      query: queryParameters,
      body: ProductWithoutInternalToJSON(requestParameters["ProductWithoutInternal"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => ProductFromJSON(jsonValue));
  }
  /**
   * Allows update of the Product object, it has to have all fields, as this operation overwrites the object. All properties not included in the payload will be lost. <br />
   * Update existing Product object
   */
  async update(requestParameters, initOverrides) {
    const response = await this.updateRaw(requestParameters, initOverrides);
    return await response.value();
  }
}

class TagInternalAPI extends BaseAPI {
  /**
   * Removes Tag (internal) object.<br />
   * Delete a _tag object
   */
  async _deleteRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling _delete().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "DELETE",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new VoidApiResponse(response);
  }
  /**
   * Removes Tag (internal) object.<br />
   * Delete a _tag object
   */
  async _delete(requestParameters, initOverrides) {
    await this._deleteRaw(requestParameters, initOverrides);
  }
  /**
   * Allows you to create or create and update up to 100 objects of Tag (internal) type. <br />
   * Create a batch of _tag objects
   */
  async batchCreateRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["updateExisting"] != null) {
      queryParameters["updateExisting"] = requestParameters["updateExisting"];
    }
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/batch`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["TagWithoutInternal"].map(TagWithoutInternalToJSON)
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => BatchResponseSuccessFromJSON(jsonValue));
  }
  /**
   * Allows you to create or create and update up to 100 objects of Tag (internal) type. <br />
   * Create a batch of _tag objects
   */
  async batchCreate(requestParameters = {}, initOverrides) {
    const response = await this.batchCreateRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to delete up to 100 objects of Tag (internal) type. <br />Request body accepts an array of content object IDs that are to be deleted.<br />
   * Delete a batch of _tag objects
   */
  async batchDeleteRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/batch-delete`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["request_body"]
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => MediaBatchDelete200ResponseFromJSON(jsonValue));
  }
  /**
   * Allows you to delete up to 100 objects of Tag (internal) type. <br />Request body accepts an array of content object IDs that are to be deleted.<br />
   * Delete a batch of _tag objects
   */
  async batchDelete(requestParameters = {}, initOverrides) {
    const response = await this.batchDeleteRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to update up to 100 objects of Tag (internal) type. <br />
   * Update selected fields of a batch of objects
   */
  async batchPatchRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/batch`,
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: requestParameters["TagWithoutInternal"].map(TagWithoutInternalToJSON)
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => BatchResponseSuccessFromJSON(jsonValue));
  }
  /**
   * Allows you to update up to 100 objects of Tag (internal) type. <br />
   * Update selected fields of a batch of objects
   */
  async batchPatch(requestParameters = {}, initOverrides) {
    const response = await this.batchPatchRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows you to create object of Tag (internal) type. <br />
   * Create a _tag object
   */
  async createRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag`,
      method: "POST",
      headers: headerParameters,
      query: queryParameters,
      body: TagWithoutInternalToJSON(requestParameters["TagWithoutInternal"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => TagFromJSON(jsonValue));
  }
  /**
   * Allows you to create object of Tag (internal) type. <br />
   * Create a _tag object
   */
  async create(requestParameters = {}, initOverrides) {
    const response = await this.createRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Returns all information about Tag (internal) object. <br />
   * Get _tag object by Id
   */
  async getRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling get().'
      );
    }
    const queryParameters = {};
    if (requestParameters["hydrate"] != null) {
      queryParameters["hydrate"] = requestParameters["hydrate"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => TagFromJSON(jsonValue));
  }
  /**
   * Returns all information about Tag (internal) object. <br />
   * Get _tag object by Id
   */
  async get(requestParameters, initOverrides) {
    const response = await this.getRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Get ids of removed Tag (internal) objects. <br />
   * Get removed object identifiers
   */
  async getRemovedRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["deletedAfter"] != null) {
      queryParameters["deletedAfter"] = requestParameters["deletedAfter"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/removed`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response);
  }
  /**
   * Get ids of removed Tag (internal) objects. <br />
   * Get removed object identifiers
   */
  async getRemoved(requestParameters = {}, initOverrides) {
    const response = await this.getRemovedRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Return version of Tag (internal) object. <br />
   * Get a specific version of _tag object
   */
  async getVersionsRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling getVersions().'
      );
    }
    if (requestParameters["versionId"] == null) {
      throw new RequiredError(
        "versionId",
        'Required parameter "versionId" was null or undefined when calling getVersions().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/{id}/version/{versionId}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))).replace(`{${"versionId"}}`, encodeURIComponent(String(requestParameters["versionId"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => TagFromJSON(jsonValue));
  }
  /**
   * Return version of Tag (internal) object. <br />
   * Get a specific version of _tag object
   */
  async getVersions(requestParameters, initOverrides) {
    const response = await this.getVersionsRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List objects of Tag (internal) type. <br />
   * List _tag objects
   */
  async listRaw(requestParameters, initOverrides) {
    const queryParameters = {};
    if (requestParameters["page"] != null) {
      queryParameters["page"] = requestParameters["page"];
    }
    if (requestParameters["limit"] != null) {
      queryParameters["limit"] = requestParameters["limit"];
    }
    if (requestParameters["order_by"] != null) {
      queryParameters["order_by"] = requestParameters["order_by"];
    }
    if (requestParameters["order_direction"] != null) {
      queryParameters["order_direction"] = requestParameters["order_direction"];
    }
    if (requestParameters["hydrate"] != null) {
      queryParameters["hydrate"] = requestParameters["hydrate"];
    }
    if (requestParameters["filters"] != null) {
      queryParameters["filters"] = requestParameters["filters"];
    }
    if (requestParameters["ids"] != null) {
      queryParameters["ids[]"] = requestParameters["ids"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag`,
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => TagListFromJSON(jsonValue));
  }
  /**
   * List objects of Tag (internal) type. <br />
   * List _tag objects
   */
  async list(requestParameters = {}, initOverrides) {
    const response = await this.listRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * List objects versions of Tag (internal) type. <br />
   * List all versions of a _tag object
   */
  async listVersionRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling listVersion().'
      );
    }
    const queryParameters = {};
    if (requestParameters["page"] != null) {
      queryParameters["page"] = requestParameters["page"];
    }
    if (requestParameters["limit"] != null) {
      queryParameters["limit"] = requestParameters["limit"];
    }
    if (requestParameters["order_by"] != null) {
      queryParameters["order_by"] = requestParameters["order_by"];
    }
    if (requestParameters["order_direction"] != null) {
      queryParameters["order_direction"] = requestParameters["order_direction"];
    }
    const headerParameters = {};
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/{id}/version`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "GET",
      headers: headerParameters,
      query: queryParameters
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => TagVersionsListFromJSON(jsonValue));
  }
  /**
   * List objects versions of Tag (internal) type. <br />
   * List all versions of a _tag object
   */
  async listVersion(requestParameters, initOverrides) {
    const response = await this.listVersionRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows update of the Tag (internal) object, but it is unnecessary to specify all the object\'s properties. Properties not included in the payload will be completed with data from the database. <br />
   * Update selected fields of _tag object
   */
  async patchRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling patch().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "PATCH",
      headers: headerParameters,
      query: queryParameters,
      body: TagWithoutRequiredToJSON(requestParameters["TagWithoutRequired"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => TagFromJSON(jsonValue));
  }
  /**
   * Allows update of the Tag (internal) object, but it is unnecessary to specify all the object\'s properties. Properties not included in the payload will be completed with data from the database. <br />
   * Update selected fields of _tag object
   */
  async patch(requestParameters, initOverrides) {
    const response = await this.patchRaw(requestParameters, initOverrides);
    return await response.value();
  }
  /**
   * Allows update of the Tag (internal) object, it has to have all fields, as this operation overwrites the object. All properties not included in the payload will be lost. <br />
   * Update existing _tag object
   */
  async updateRaw(requestParameters, initOverrides) {
    if (requestParameters["id"] == null) {
      throw new RequiredError(
        "id",
        'Required parameter "id" was null or undefined when calling update().'
      );
    }
    const queryParameters = {};
    const headerParameters = {};
    headerParameters["Content-Type"] = "application/json";
    if (this.configuration && this.configuration.apiKey) {
      headerParameters["X-AUTH-TOKEN"] = await this.configuration.apiKey("X-AUTH-TOKEN");
    }
    const response = await this.request({
      path: `/api/v1/content/_tag/{id}`.replace(`{${"id"}}`, encodeURIComponent(String(requestParameters["id"]))),
      method: "PUT",
      headers: headerParameters,
      query: queryParameters,
      body: TagWithoutInternalToJSON(requestParameters["TagWithoutInternal"])
    }, initOverrides);
    return new JSONApiResponse(response, (jsonValue) => TagFromJSON(jsonValue));
  }
  /**
   * Allows update of the Tag (internal) object, it has to have all fields, as this operation overwrites the object. All properties not included in the payload will be lost. <br />
   * Update existing _tag object
   */
  async update(requestParameters, initOverrides) {
    const response = await this.updateRaw(requestParameters, initOverrides);
    return await response.value();
  }
}

const hydrateMiddleware = async (ctx) => {
  if (ctx.init.method == "GET") {
    const url = new URL(ctx.url);
    if (!url.searchParams.has("hydrate")) {
      if (ctx.url.indexOf("?") > 0) {
        ctx.url = ctx.url + "&hydrate=1";
      } else {
        ctx.url = ctx.url + "?hydrate=1";
      }
    }
  }
  return {
    ...ctx,
    init: {
      ...ctx.init
    }
  };
};
class FlotiqApi {
  constructor(key) {
    if (!key) {
      throw new Error("FLOTIQ_API_KEY must be passed to the FlotiqAPI constructor.");
    }
    const configParameters = {
      apiKey: key
    };
    const configuration = new Configuration(configParameters);
    this.MediaInternalAPI = new MediaInternalAPI(configuration);
    this.MediaInternalAPI = this.MediaInternalAPI.withPreMiddleware(hydrateMiddleware);
    this.ProductAPI = new ProductAPI(configuration);
    this.ProductAPI = this.ProductAPI.withPreMiddleware(hydrateMiddleware);
    this.TagInternalAPI = new TagInternalAPI(configuration);
    this.TagInternalAPI = this.TagInternalAPI.withPreMiddleware(hydrateMiddleware);
  }
}

const flotiq = new FlotiqApi("37cddfbf8562a36c0e601e42ad61c15d");

export { flotiq as f };
