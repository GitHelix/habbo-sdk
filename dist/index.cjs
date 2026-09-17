'use strict';

var jsonWithBigint = require('json-with-bigint');

// src/errors.ts
var HabboError = class extends Error {
  constructor(message, options = {}) {
    super(message, options.cause !== void 0 ? { cause: options.cause } : void 0);
    this.name = new.target.name;
    this.status = options.status;
    this.body = options.body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
};
var HabboNotFoundError = class extends HabboError {
};
var UserInvalidError = class extends HabboError {
};
var MaintenanceError = class extends HabboError {
};
var HabboAuthError = class extends HabboError {
};
var HabboRateLimitError = class extends HabboError {
  constructor(message, options = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
};
var HabboNetworkError = class extends HabboError {
};
function defaultFetch() {
  if (typeof fetch === "function") {
    return fetch;
  }
  throw new HabboError(
    "Global fetch is not available in this runtime. Upgrade to Node 18+ or pass a custom `fetch` implementation in the client configuration."
  );
}
var RETRYABLE_STATUS = /* @__PURE__ */ new Set([429, 500, 502, 503, 504]);
function appendQuery(url, query) {
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== void 0) {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs.length > 0 ? `${url}?${qs}` : url;
}
function parseRetryAfter(headerValue) {
  if (headerValue === null) {
    return void 0;
  }
  const seconds = Number(headerValue);
  return Number.isFinite(seconds) ? seconds : void 0;
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
var HttpClient = class {
  constructor(options) {
    this.fetch = options.fetch;
    this.timeout = options.timeout;
    this.maxRetries = options.maxRetries;
    this.userAgent = options.userAgent;
  }
  /**
   * Issues a request and decodes the response as JSON.
   *
   * @typeParam T - The expected shape of the decoded response body.
   * @returns The parsed response body, or `undefined` for empty (`204`)
   *   responses.
   * @throws {@link HabboError} or one of its subclasses on any failure.
   */
  async request(options) {
    const url = appendQuery(options.url, options.query);
    const method = options.method ?? "GET";
    const headers = {
      Accept: options.raw ? "*/*" : "application/json",
      "User-Agent": this.userAgent,
      ...options.headers
    };
    let serializedBody;
    if (options.body !== void 0) {
      serializedBody = jsonWithBigint.JSONStringify(options.body);
      headers["Content-Type"] = "application/json";
    }
    let attempt = 0;
    let lastError;
    while (attempt <= this.maxRetries) {
      try {
        const response = await this.dispatch(url, method, headers, serializedBody);
        const text = await response.text();
        if (response.ok) {
          return options.raw ? text : this.decode(text);
        }
        const error = this.mapErrorResponse(response.status, response.headers, text);
        if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxRetries) {
          lastError = error;
          await sleep(this.backoffDelay(attempt, error));
          attempt += 1;
          continue;
        }
        throw error;
      } catch (error) {
        if (error instanceof HabboError && !(error instanceof HabboNetworkError)) {
          throw error;
        }
        const networkError = error instanceof HabboNetworkError ? error : new HabboNetworkError(this.describeTransportError(error), { cause: error });
        if (attempt < this.maxRetries) {
          lastError = networkError;
          await sleep(this.backoffDelay(attempt));
          attempt += 1;
          continue;
        }
        throw networkError;
      }
    }
    throw lastError ?? new HabboError("Request failed after exhausting retries.");
  }
  async dispatch(url, method, headers, body) {
    const controller = this.timeout > 0 ? new AbortController() : void 0;
    const timer = controller !== void 0 ? setTimeout(() => controller.abort(), this.timeout) : void 0;
    try {
      return await this.fetch(url, {
        method,
        headers,
        ...body !== void 0 ? { body } : {},
        ...controller !== void 0 ? { signal: controller.signal } : {}
      });
    } catch (error) {
      if (controller?.signal.aborted) {
        throw new HabboNetworkError(`Request to ${url} timed out after ${this.timeout}ms.`, {
          cause: error
        });
      }
      throw error;
    } finally {
      if (timer !== void 0) {
        clearTimeout(timer);
      }
    }
  }
  decode(text) {
    if (text.length === 0) {
      return void 0;
    }
    try {
      return jsonWithBigint.JSONParse(text);
    } catch (error) {
      throw new HabboError("Failed to parse the API response as JSON.", {
        body: text,
        cause: error
      });
    }
  }
  describeTransportError(error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `Network request failed: ${detail}`;
  }
  backoffDelay(attempt, error) {
    if (error instanceof HabboRateLimitError && error.retryAfter !== void 0) {
      return error.retryAfter * 1e3;
    }
    const base = 300 * 2 ** attempt;
    const jitter = Math.random() * 100;
    return base + jitter;
  }
  /**
   * Maps a non-2xx response onto the appropriate {@link HabboError} subclass,
   * mirroring the error semantics of the Habbo APIs.
   */
  mapErrorResponse(status, headers, text) {
    const body = this.safeJson(text);
    const message = this.extractMessage(body, text);
    if (text.includes("maintenance")) {
      return new MaintenanceError("The hotel API is down for maintenance.", { status, body });
    }
    if (message === "user.invalid_name") {
      return new UserInvalidError("The supplied user name is invalid.", { status, body });
    }
    switch (status) {
      case 401:
      case 403:
        return new HabboAuthError(
          message ?? "Authentication failed. Verify the X-Wired-Write-Key.",
          { status, body }
        );
      case 404:
        return new HabboNotFoundError(message ?? "The requested resource was not found.", {
          status,
          body
        });
      case 429:
        return new HabboRateLimitError(message ?? "Rate limit exceeded.", {
          status,
          body,
          retryAfter: parseRetryAfter(headers.get("Retry-After"))
        });
      default:
        return new HabboError(message ?? `Request failed with status ${status}.`, {
          status,
          body
        });
    }
  }
  safeJson(text) {
    if (text.length === 0 || text[0] !== "{" && text[0] !== "[") {
      return void 0;
    }
    try {
      return jsonWithBigint.JSONParse(text);
    } catch {
      return void 0;
    }
  }
  /**
   * Extracts a human-readable message from a Habbo error body.
   *
   * The public API uses `{ "errors": [{ "msg": "..." }] }`, while the Wired
   * Variables API returns a single error code as `{ "error": "..." }`, for
   * example `wired.key_invalid`. `{ "message": "..." }` is also accepted.
   */
  extractMessage(body, fallback) {
    if (body !== null && typeof body === "object") {
      const record = body;
      const errors = record["errors"];
      if (Array.isArray(errors) && errors.length > 0) {
        const first = errors[0];
        if (first !== null && typeof first === "object" && "msg" in first) {
          const msg = first["msg"];
          if (typeof msg === "string") {
            return msg;
          }
        }
      }
      for (const key of ["error", "message"]) {
        const value = record[key];
        if (typeof value === "string") {
          return value;
        }
      }
    }
    return fallback.length > 0 && fallback.length < 200 ? fallback : void 0;
  }
};

// src/config.ts
var DEFAULT_HOTEL = "es";
var DEFAULT_TIMEOUT = 15e3;
var DEFAULT_MAX_RETRIES = 2;
var SDK_VERSION = "0.6.0" ;
function publicBaseUrlForHotel(hotel) {
  if (hotel === "sandbox") {
    return "https://sandbox.habbo.com";
  }
  if (hotel === "origins") {
    return "https://origins.habbo.com";
  }
  return `https://www.habbo.${hotel}`;
}
function stripTrailingSlash(url) {
  return url.replace(/\/+$/, "");
}
function resolveConfig(config, originsApiKey) {
  const hotel = config.hotel ?? DEFAULT_HOTEL;
  const host = publicBaseUrlForHotel(hotel);
  const publicBaseUrl = stripTrailingSlash(config.publicBaseUrl ?? host);
  const wiredBaseUrl = stripTrailingSlash(config.wiredBaseUrl ?? publicBaseUrl);
  return {
    originsApiKey,
    publicBaseUrl,
    wiredBaseUrl,
    fetch: config.fetch ?? defaultFetch(),
    timeout: config.timeout ?? DEFAULT_TIMEOUT,
    maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    userAgent: config.userAgent ?? `habbo-sdk/${SDK_VERSION}`
  };
}

// src/types/variables.ts
function isBatchOperationSuccess(result) {
  return result.status === 200 || result.status === 204;
}
var BATCH_MAX_OPERATIONS = 50;
var FURNI_ID_WRAP = 2147418112;
var INT64_MIN = -(2n ** 63n);
var INT64_MAX = 2n ** 63n - 1n;
function assertVariableValue(value) {
  if (typeof value === "bigint") {
    if (value < INT64_MIN || value > INT64_MAX) {
      throw new TypeError(
        `Wired variable values must fit in a signed 64-bit integer. Received: ${value.toString()}`
      );
    }
    return;
  }
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(
      `Wired variable values must be whole numbers; use bigint beyond 2^53. Received: ${String(value)}`
    );
  }
}
function sanitizeFurniId(furniId) {
  return toApiFurniId(furniId).id;
}
function toApiFurniId(furniId) {
  let id = typeof furniId === "number" ? furniId : Number.parseInt(furniId, 10);
  const isWall = id < 0;
  if (isWall) {
    id = -id;
  }
  let kind = isWall ? "wall-items" : "furni";
  if (id >= FURNI_ID_WRAP) {
    id -= FURNI_ID_WRAP;
    kind = isWall ? "wall-items-bc" : "furni-bc";
  }
  return { kind, id };
}
function fromApiFurniId(furniId) {
  const isBc = furniId.kind === "furni-bc" || furniId.kind === "wall-items-bc";
  const isWall = furniId.kind === "wall-items" || furniId.kind === "wall-items-bc";
  const base = isBc ? furniId.id + FURNI_ID_WRAP : furniId.id;
  return isWall ? -base : base;
}

// src/resources/batch-builder.ts
var BatchBuilder = class {
  constructor(executor) {
    this.executor = executor;
    this.operations = [];
  }
  /**
   * Queues a read of the variable for one entity.
   *
   * @param path - Target path, e.g. `users/44`.
   * @param options - Optional {@link BatchOperationOptions.opId}.
   * @returns This builder, for chaining.
   */
  get(path, options = {}) {
    return this.push({ method: "GET", path, ...withOpId(options) });
  }
  /**
   * Queues a create-or-replace of the variable for one entity.
   *
   * @param path - Target path, e.g. `users/44`.
   * @param value - The whole number to store.
   * @param options - Optional {@link BatchOperationOptions.opId}.
   * @returns This builder, for chaining.
   * @throws {@link TypeError} when the value is not a whole number.
   */
  put(path, value, options = {}) {
    assertVariableValue(value);
    return this.push({ method: "PUT", path, body: { value }, ...withOpId(options) });
  }
  /**
   * Queues an update of the variable for one entity.
   *
   * @param path - Target path, e.g. `users/44`.
   * @param value - The new whole number.
   * @param options - Optional {@link BatchOperationOptions.opId}.
   * @returns This builder, for chaining.
   * @throws {@link TypeError} when the value is not a whole number.
   */
  patch(path, value, options = {}) {
    assertVariableValue(value);
    return this.push({ method: "PATCH", path, body: { value }, ...withOpId(options) });
  }
  /**
   * Queues a deletion of the variable's stored value for one entity.
   *
   * @param path - Target path, e.g. `users/44`.
   * @param options - Optional {@link BatchOperationOptions.opId}.
   * @returns This builder, for chaining.
   */
  delete(path, options = {}) {
    return this.push({ method: "DELETE", path, ...withOpId(options) });
  }
  /**
   * Appends pre-built operations. An escape hatch for callers assembling
   * operations programmatically.
   *
   * @param operations - One or more operations to append.
   * @returns This builder, for chaining.
   */
  add(...operations) {
    for (const operation of operations) {
      this.push(operation);
    }
    return this;
  }
  /** How many operations are queued so far. */
  get size() {
    return this.operations.length;
  }
  /**
   * Returns a copy of the queued operations without sending them. Useful for
   * logging, inspection, and tests.
   */
  toOperations() {
    return [...this.operations];
  }
  /**
   * Sends every queued operation as a single request.
   *
   * @returns One result per operation, in the order they were queued.
   * @throws {@link RangeError} when no operation has been queued.
   * @throws {@link HabboAuthError} when the client lacks a `readKey` or a
   *   `writeKey`, both of which a batch requires.
   */
  execute() {
    if (this.operations.length === 0) {
      throw new RangeError("A batch must contain at least one operation.");
    }
    return this.executor(this.toOperations());
  }
  push(operation) {
    if (this.operations.length >= BATCH_MAX_OPERATIONS) {
      throw new RangeError(
        `A batch accepts at most ${BATCH_MAX_OPERATIONS} operations. Split the work across several batches.`
      );
    }
    this.operations.push(operation);
    return this;
  }
};
function withOpId(options) {
  return options.opId !== void 0 ? { op_id: options.opId } : {};
}

// src/utils/variables/wire-format.ts
var INTEGER_TEXT = /^-?\d+$/;
function toWireText(value) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value.toString();
  }
  return value;
}
function encodeVariableValues(node) {
  if (Array.isArray(node)) {
    return node.map(encodeVariableValues);
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "value") {
      result[key] = toWireText(value);
    } else if (key === "variables" && value !== null && typeof value === "object") {
      result[key] = encodeVariableMap(value);
    } else {
      result[key] = encodeVariableValues(value);
    }
  }
  return result;
}
function encodeVariableMap(map) {
  const result = {};
  for (const [name, value] of Object.entries(map)) {
    result[name] = value === null ? null : toWireText(value);
  }
  return result;
}
function decodeVariableValues(node) {
  if (Array.isArray(node)) {
    return node.map((item) => decodeVariableValues(item));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "value" && typeof value === "string" && INTEGER_TEXT.test(value)) {
      result[key] = BigInt(value);
    } else {
      result[key] = decodeVariableValues(value);
    }
  }
  return result;
}

// src/resources/wired-resource.ts
var READ_KEY_HEADER = "X-Wired-Read-Key";
var WRITE_KEY_HEADER = "X-Wired-Write-Key";
function scopedEntityId(scope, entityId) {
  const id = scope === "furni" ? sanitizeFurniId(entityId) : entityId;
  return encodeURIComponent(String(id));
}
function furniEntityId(entityId) {
  return encodeURIComponent(String(sanitizeFurniId(entityId)));
}
var WiredResource = class {
  constructor(http, config, keys) {
    this.http = http;
    this.config = config;
    this.keys = keys;
  }
  /** Builds an absolute Wired API URL for the bound room and a path. */
  url(roomId, path) {
    return `${this.config.wiredBaseUrl}/api/public/rooms/${encodeURIComponent(String(roomId))}${path}`;
  }
  /**
   * Builds the authentication headers for an operation.
   *
   * @param need - Which keys the operation requires. Batch requests need both.
   * @throws {@link HabboAuthError} when a required key is not available.
   */
  authHeaders(need) {
    const headers = {};
    if (need === "read" || need === "both") {
      headers[READ_KEY_HEADER] = this.requireKey(this.keys.readKey, "readKey", READ_KEY_HEADER);
    }
    if (need === "write" || need === "both") {
      headers[WRITE_KEY_HEADER] = this.requireKey(
        this.keys.writeKey,
        "writeKey",
        WRITE_KEY_HEADER
      );
    }
    return headers;
  }
  requireKey(key, option, header) {
    if (key === void 0 || key.length === 0) {
      throw new HabboAuthError(
        `This Wired Variables operation requires a \`${option}\`. Configure it on your RoomInstance, alongside the room id. Both keys are found in the room's Wired settings inside the hotel.`
      );
    }
    return key;
  }
  /**
   * `async` so a missing key surfaces as a rejected promise rather than a
   * synchronous throw, keeping every public method uniformly awaitable.
   */
  async send(method, need, roomId, path, options = {}) {
    const response = await this.http.request({
      method,
      url: this.url(roomId, path),
      headers: this.authHeaders(need),
      ...options.body !== void 0 ? { body: encodeVariableValues(options.body) } : {},
      ...options.query !== void 0 ? { query: options.query } : {}
    });
    return decodeVariableValues(response);
  }
};

// src/resources/room-profile-variables.ts
function assertPatchValues(variables) {
  for (const value of Object.values(variables)) {
    if (value !== null) {
      assertVariableValue(value);
    }
  }
}
var RoomVariablesProfileResource = class extends WiredResource {
  constructor(http, config, keys, roomId) {
    super(http, config, keys);
    this.roomId = roomId;
  }
  /**
   * Reads a user's variables profile by display name or unique id.
   *
   * Use this when you know who the user is but not their numeric in-room id.
   * Exactly one of `name` or `uniqueId` must be supplied.
   *
   * @param lookup - Either `{ name }` or `{ uniqueId }`.
   * @returns The user's profile, including the resolved target.
   * @throws {@link HabboAuthError} when no `readKey` is configured.
   * @throws {@link HabboNotFoundError} when the room or user does not exist.   */
  findUser(lookup) {
    const query = "name" in lookup ? { name: lookup.name } : { unique_id: lookup.uniqueId };
    return this.send("GET", "read", this.roomId, "/variables_profile/user/users", {
      query
    });
  }
  /**
   * Reads the variables profile of a user, pet, or bot by its in-room id.
   *
   * The return type narrows to match the target kind, so `"pets"` yields a
   * profile carrying a `pet` field rather than a union.
   *
   * @param targetKind - `"users"`, `"pets"`, or `"bots"`.
   * @param entityId - The entity's in-room identifier.
   * @returns The entity's profile.
   * @throws {@link HabboAuthError} when no `readKey` is configured.   */
  getUser(targetKind, entityId) {
    return this.send(
      "GET",
      "read",
      this.roomId,
      `/variables_profile/user/${targetKind}/${encodeURIComponent(String(entityId))}`
    );
  }
  /**
   * Updates several variables of a user, pet, or bot in a single request.
   *
   * Only the variables you list are touched. Passing `null` as a value deletes
   * that stored value while leaving the variable configured in the room.
   *
   * @param targetKind - `"users"`, `"pets"`, or `"bots"`.
   * @param entityId - The entity's in-room identifier.
   * @param variables - Variable names mapped to a whole number, or to `null` to
   *   delete the value.
   * @returns The profile as it stands after the patch.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.
   * @throws {@link TypeError} when a value is not a whole number.   */
  async patchUser(targetKind, entityId, variables) {
    assertPatchValues(variables);
    const body = { variables };
    return this.send(
      "PATCH",
      "write",
      this.roomId,
      `/variables_profile/user/${targetKind}/${encodeURIComponent(String(entityId))}`,
      { body }
    );
  }
  /**
   * Deletes every stored variable value of a user, pet, or bot.
   *
   * The room's variable definitions are unaffected; only this entity's values
   * are removed.
   *
   * @param targetKind - `"users"`, `"pets"`, or `"bots"`.
   * @param entityId - The entity's in-room identifier.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.   */
  deleteUser(targetKind, entityId) {
    return this.send(
      "DELETE",
      "write",
      this.roomId,
      `/variables_profile/user/${targetKind}/${encodeURIComponent(String(entityId))}`
    );
  }
  /**
   * Reads the variables profile of a floor or wall item.
   *
   * @param targetKind - `"furni"`, `"furni-bc"`, `"wall-items"`, or
   *   `"wall-items-bc"`.
   * @param entityId - The item's in-room identifier.
   * @returns The item's profile.
   * @throws {@link HabboAuthError} when no `readKey` is configured.   */
  getFurni(targetKind, entityId) {
    return this.send(
      "GET",
      "read",
      this.roomId,
      `/variables_profile/furni/${targetKind}/${furniEntityId(entityId)}`
    );
  }
  /**
   * Updates several variables of a floor or wall item in a single request.
   *
   * Passing `null` as a value deletes that stored value.
   *
   * @param targetKind - `"furni"`, `"furni-bc"`, `"wall-items"`, or
   *   `"wall-items-bc"`.
   * @param entityId - The item's in-room identifier.
   * @param variables - Variable names mapped to a whole number, or to `null`.
   * @returns The profile as it stands after the patch.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.
   * @throws {@link TypeError} when a value is not a whole number.   */
  async patchFurni(targetKind, entityId, variables) {
    assertPatchValues(variables);
    const body = { variables };
    return this.send(
      "PATCH",
      "write",
      this.roomId,
      `/variables_profile/furni/${targetKind}/${furniEntityId(entityId)}`,
      { body }
    );
  }
  /**
   * Reads every global variable of the room in one request.
   *
   * @returns The room's global profile.
   * @throws {@link HabboAuthError} when no `readKey` is configured.   */
  getGlobal() {
    return this.send("GET", "read", this.roomId, "/variables_profile/global");
  }
  /**
   * Updates several global variables of the room in a single request.
   *
   * Unlike scoped profiles, global variables cannot be deleted this way, so
   * `null` is not accepted here.
   *
   * @param variables - Variable names mapped to their new whole-number values.
   * @returns The global profile as it stands after the patch.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.
   * @throws {@link TypeError} when a value is not a whole number.   */
  async patchGlobal(variables) {
    for (const value of Object.values(variables)) {
      assertVariableValue(value);
    }
    const body = { variables };
    return this.send("PATCH", "write", this.roomId, "/variables_profile/global", {
      body
    });
  }
};

// src/resources/room-variables.ts
var RoomVariablesResource = class extends WiredResource {
  constructor(http, config, keys, roomId) {
    super(http, config, keys);
    this.roomId = roomId;
    this.profiles = new RoomVariablesProfileResource(http, config, keys, roomId);
  }
  scoped(scope, variableName) {
    return `/variables/${scope}/${encodeURIComponent(variableName)}`;
  }
  /**
   * Lists the names of every wired variable configured in a room, grouped by
   * scope.
   *
   * This returns names only. Use {@link RoomVariablesResource.get},
   * {@link RoomVariablesResource.listByKind}, or the profile methods to read values.
   *
   * @returns The configured variable names, grouped into `users`, `furni`, and
   *   `global`.
   * @throws {@link HabboAuthError} when no `readKey` is configured.   */
  list() {
    return this.send("GET", "read", this.roomId, "/variables");
  }
  /**
   * Reads one variable of one entity.
   *
   * @param scope - `"user"` or `"furni"`. It constrains which target kinds the
   *   next argument accepts.
   * @param variableName - The configured variable name.
   * @param targetKind - The entity kind, valid for the chosen scope.
   * @param entityId - The entity's in-room identifier.
   * @returns The stored value with its creation and update timestamps.
   * @throws {@link HabboAuthError} when no `readKey` is configured.
   * @throws {@link HabboNotFoundError} when the variable has no stored value
   *   for that entity.   */
  get(scope, variableName, targetKind, entityId) {
    return this.send(
      "GET",
      "read",
      this.roomId,
      `${this.scoped(scope, variableName)}/${targetKind}/${scopedEntityId(scope, entityId)}`
    );
  }
  /**
   * Creates or replaces one variable value of one entity.
   *
   * Use {@link RoomVariablesResource.update} instead when the value is expected to
   * already exist.
   *
   * @param scope - `"user"` or `"furni"`.
   * @param variableName - The configured variable name.
   * @param targetKind - The entity kind, valid for the chosen scope.
   * @param entityId - The entity's in-room identifier.
   * @param value - The whole number to store.
   * @returns The stored value with its timestamps.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.
   * @throws {@link TypeError} when the value is not a whole number.   */
  async set(scope, variableName, targetKind, entityId, value) {
    assertVariableValue(value);
    const body = { value };
    return this.send(
      "PUT",
      "write",
      this.roomId,
      `${this.scoped(scope, variableName)}/${targetKind}/${scopedEntityId(scope, entityId)}`,
      { body }
    );
  }
  /**
   * Updates one existing variable value of one entity.
   *
   * @param scope - `"user"` or `"furni"`.
   * @param variableName - The configured variable name.
   * @param targetKind - The entity kind, valid for the chosen scope.
   * @param entityId - The entity's in-room identifier.
   * @param value - The new whole number.
   * @returns The stored value with its timestamps.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.
   * @throws {@link TypeError} when the value is not a whole number.   */
  async update(scope, variableName, targetKind, entityId, value) {
    assertVariableValue(value);
    const body = { value };
    return this.send(
      "PATCH",
      "write",
      this.roomId,
      `${this.scoped(scope, variableName)}/${targetKind}/${scopedEntityId(scope, entityId)}`,
      { body }
    );
  }
  /**
   * Deletes one stored variable value of one entity.
   *
   * The variable stays configured in the room; only this entity's value is
   * removed.
   *
   * @param scope - `"user"` or `"furni"`.
   * @param variableName - The configured variable name.
   * @param targetKind - The entity kind, valid for the chosen scope.
   * @param entityId - The entity's in-room identifier.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.   */
  delete(scope, variableName, targetKind, entityId) {
    return this.send(
      "DELETE",
      "write",
      this.roomId,
      `${this.scoped(scope, variableName)}/${targetKind}/${scopedEntityId(scope, entityId)}`
    );
  }
  /**
   * Lists one page of stored values of a variable across every entity of a
   * target kind. Ideal for building leaderboards and ranked statistics.
   *
   * @typeParam S - The {@link VariableScope} defining whether the variable is
   *   bound to users or furni.
   * @typeParam K - The {@link TargetKind} subset accepted for scope `S`, enforced
   *   by {@link TargetKindFor}.
   *
   * @param scope - The variable scope: `"user"` or `"furni"`.
   * @param variableName - The configured variable name to fetch values for.
   * @param targetKind - The specific entity category to enumerate, constrained
   *   by the chosen `scope`.
   * @param options - Sorting and pagination parameters. See {@link ListByKindOptions}.
   *
   * @returns A promise resolving to {@link PagedVariables} containing the requested
   *   page of {@link PagedVariableItem} entries alongside pagination metadata.
   *
   * @throws {@link HabboAuthError} When no `readKey` is configured for the room.
   */
  listByKind(scope, variableName, targetKind, options = {}) {
    return this.send(
      "GET",
      "read",
      this.roomId,
      `${this.scoped(scope, variableName)}/${targetKind}`,
      {
        query: {
          order_by: options.orderBy,
          order_dir: options.orderDir,
          page: normalizePage(options.page),
          size: normalizePageSize(options.size)
        }
      }
    );
  }
  /**
   * Iterates every stored value of a variable across a target kind, fetching
   * one page at a time.
   *
   * Use this instead of {@link listByKind} when you need all values rather
   * than a single page, and you would rather not manage pagination manually.
   * Iteration automatically stops as soon as the server returns a short or
   * empty page.
   *
   * @typeParam S - The {@link VariableScope} defining whether the variable is
   *   bound to users or furni.
   * @typeParam K - The {@link TargetKind} subset accepted for scope `S`, enforced
   *   by {@link TargetKindFor}.
   *
   * @param scope - The variable scope: `"user"` or `"furni"`.
   * @param variableName - The configured variable name to fetch values for.
   * @param targetKind - The specific entity category to enumerate, constrained
   *   by the chosen `scope`.
   * @param options - Sorting parameters, plus `size` for the fetch batch size
   *   and `page` for the initial starting page. See {@link ListByKindOptions}.
   *
   * @yields Each {@link PagedVariableItem} for the target kind, in server order.
   *
   * @throws {@link HabboAuthError} When no `readKey` is configured for the room.
   */
  async *iterateByKind(scope, variableName, targetKind, options = {}) {
    const size = normalizePageSize(options.size) ?? 100;
    let page = normalizePage(options.page) ?? 1;
    for (; ; ) {
      const result = await this.listByKind(scope, variableName, targetKind, {
        ...options,
        page,
        size
      });
      for (const item of result.items) {
        yield item;
      }
      if (result.items.length < size) {
        return;
      }
      page += 1;
    }
  }
  /**
   * Counts how many entities of a target kind have a stored value for a
   * variable.
   *
   * @param scope - `"user"` or `"furni"`.
   * @param variableName - The configured variable name.
   * @param targetKind - The entity kind to count.
   * @returns The number of stored values.
   * @throws {@link HabboAuthError} when no `readKey` is configured.   */
  async count(scope, variableName, targetKind) {
    const result = await this.send(
      "GET",
      "read",
      this.roomId,
      `${this.scoped(scope, variableName)}/${targetKind}/count`
    );
    return result.count;
  }
  /**
   * Deletes every stored value of the named variables, across all entities in
   * the room.
   *
   * The variable definitions stay configured; only their stored values are
   * cleared. This is the fastest way to reset a game between rounds.
   *
   * @param variables - Names of the user or furni variables to clear.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.   */
  bulkDelete(variables) {
    return this.send("POST", "write", this.roomId, "/variables/bulk-delete", {
      body: { variables }
    });
  }
  /**
   * Starts a batch of operations against one variable, to be sent as a single
   * request.
   *
   * Every operation in the batch targets the same variable but a different
   * entity, and a batch may mix reads and writes freely. It therefore requires
   * both a `readKey` and a `writeKey`. Up to 50 operations are allowed.
   *
   * Chain the builder methods to queue operations, then `execute()` to send
   * them. The response reports one result per operation, in order.
   *
   * @param scope - `"user"` or `"furni"`.
   * @param variableName - The variable every operation acts on.
   * @returns A {@link BatchBuilder} that sends the queued operations.   *   */
  batch(scope, variableName) {
    const path = `${this.scoped(scope, variableName)}/batch`;
    return new BatchBuilder(
      (requests) => this.send("POST", "both", this.roomId, path, { body: { requests } })
    );
  }
  /**
   * Reads a room-wide global variable.
   *
   * @param variableName - The configured variable name.
   * @returns The stored value with its timestamps.
   * @throws {@link HabboAuthError} when no `readKey` is configured.   */
  getGlobal(variableName) {
    return this.send(
      "GET",
      "read",
      this.roomId,
      `/variables/global/${encodeURIComponent(variableName)}`
    );
  }
  /**
   * Updates a room-wide global variable.
   *
   * @param variableName - The configured variable name.
   * @param value - The new whole number.
   * @returns The stored value with its timestamps.
   * @throws {@link HabboAuthError} when no `writeKey` is configured.
   * @throws {@link TypeError} when the value is not a whole number.   */
  async updateGlobal(variableName, value) {
    assertVariableValue(value);
    const body = { value };
    return this.send(
      "PATCH",
      "write",
      this.roomId,
      `/variables/global/${encodeURIComponent(variableName)}`,
      { body }
    );
  }
};
var MAX_LIST_PAGE_SIZE = 100;
function normalizePageSize(size) {
  if (size === void 0 || !Number.isFinite(size) || size <= 0) {
    return void 0;
  }
  return Math.min(MAX_LIST_PAGE_SIZE, Math.floor(size));
}
function normalizePage(page) {
  if (page === void 0 || !Number.isFinite(page)) {
    return void 0;
  }
  return Math.max(1, Math.floor(page));
}

// src/room-instance.ts
var RoomInstance = class {
  /**
   * @param roomId - The room to bind.
   * @param keys - The room's effective Wired keys.
   * @param http - The shared HTTP transport of the owning client.
   * @param config - The shared resolved configuration of the owning client.
   */
  constructor(roomId, keys, http, config) {
    this.roomId = roomId;
    this.variables = new RoomVariablesResource(http, config, keys, roomId);
  }
};

// src/resources/origins.ts
var OriginsResource = class {
  constructor(http, config) {
    this.http = http;
    this.config = config;
  }
  url(path) {
    return `${this.config.publicBaseUrl}${path}`;
  }
  /** Maps the shared history filters onto the query names the API expects. */
  historyQuery(query) {
    return {
      offset: query.offset,
      limit: query.limit,
      start_time: query.startTime,
      end_time: query.endTime
    };
  }
  /** Adds the configured Origins API key to a query when one is set. */
  withApiKey(query = {}) {
    return this.config.originsApiKey !== void 0 ? { ...query, api_key: this.config.originsApiKey } : query;
  }
  /**
   * Resolves an Origins unique player id into the `uniqueId` values used by the
   * rest of the public API.
   *
   * Match and derby records identify players by a `gp-...` player id, while
   * {@link ProfilesResource} works with `hh...` unique ids. This bridges the two.
   *
   * @param uniquePlayerId - The Origins unique player id.
   * @returns The matching Habbo unique ids. A player may map to more than one.
   *
   * @example
   * ```ts
   * const [uniqueId] = await habbo.origins.getHabboIds("gp-hhus-41a4d5...");
   * const user = uniqueId ? await habbo.profiles.getById(uniqueId) : undefined;
   * ```
   */
  getHabboIds(uniquePlayerId) {
    return this.http.request({
      url: this.url(`/api/public/users/by-playerId/${encodeURIComponent(uniquePlayerId)}`)
    });
  }
  /**
   * Lists the ids of matches a player took part in, most useful as the first
   * step before {@link OriginsResource.getMatch}.
   *
   * @param uniquePlayerId - The Origins unique player id.
   * @param query - Pagination and time filters. See {@link HistoryQuery}.
   * @returns The matching match ids.
   *
   * @example
   * ```ts
   * const ids = await habbo.origins.listMatchIds("gp-hhus-41a4d5...", {
   *   limit: 10,
   *   startTime: "2024-08-20 12:00:00.000",
   * });
   * ```
   */
  listMatchIds(uniquePlayerId, query = {}) {
    return this.http.request({
      url: this.url(`/api/public/matches/v1/${encodeURIComponent(uniquePlayerId)}/ids`),
      query: this.historyQuery(query)
    });
  }
  /**
   * Reads the full record of one match: its participants, their per-player
   * statistics, and the team results.
   *
   * @param uniqueMatchId - The unique match id.
   * @returns The match record.
   *
   * @example
   * ```ts
   * const match = await habbo.origins.getMatch("gm-hhus-fc2443...");
   *
   * console.log(match.info.gameMode, match.info.gameDuration);
   * for (const player of match.info.participants) {
   *   console.log(player.gamePlayerId, player.gameScore, player.playerPlacement);
   * }
   * ```
   */
  getMatch(uniqueMatchId) {
    return this.http.request({
      url: this.url(`/api/public/matches/v1/${encodeURIComponent(uniqueMatchId)}`)
    });
  }
  /**
   * Iterates every match id of a player, fetching one page at a time.
   *
   * Use this instead of {@link OriginsResource.listMatchIds} to walk a full
   * history without managing the offset yourself. Iteration stops as soon as a
   * page comes back short.
   *
   * @param uniquePlayerId - The Origins unique player id.
   * @param query - Time filters, plus the `limit` used as the page size and the
   *   `offset` used as the starting point.
   * @yields Each match id, in server order.
   *
   * @example
   * ```ts
   * for await (const id of habbo.origins.iterateMatchIds("gp-hhus-41a4d5...")) {
   *   const match = await habbo.origins.getMatch(id);
   *   console.log(match.info.gameMode);
   * }
   * ```
   */
  async *iterateMatchIds(uniquePlayerId, query = {}) {
    const limit = query.limit ?? 50;
    let offset = query.offset ?? 0;
    for (; ; ) {
      const ids = await this.listMatchIds(uniquePlayerId, { ...query, offset, limit });
      yield* ids;
      if (ids.length < limit) {
        return;
      }
      offset += limit;
    }
  }
  /**
   * Lists the ids of fishing derbies a player took part in.
   *
   * @param uniquePlayerId - The player to look up. In practice the hotel accepts
   *   the Habbo unique id (`hhous-...`) reported by
   *   {@link DerbyParticipant.accountId} here.
   * @param query - Pagination and time filters. See {@link HistoryQuery}.
   * @returns The matching derby ids.
   *
   * @example
   * ```ts
   * const ids = await habbo.origins.listDerbyIds("hhous-066a72...", { limit: 5 });
   * ```
   */
  listDerbyIds(uniquePlayerId, query = {}) {
    return this.http.request({
      url: this.url(`/api/public/minigame/derby/v1/${encodeURIComponent(uniquePlayerId)}/ids`),
      query: this.withApiKey(this.historyQuery(query))
    });
  }
  /**
   * Reads one fishing derby: when it ran and how every entrant scored.
   *
   * @param uniqueDerbyId - The unique derby id.
   * @returns The derby record.
   *
   * @example
   * ```ts
   * const derby = await habbo.origins.getDerby("fd-hhous-f5d562...");
   *
   * const ranking = [...derby.info.participants].sort(
   *   (a, b) => b.fishCaught - a.fishCaught,
   * );
   * console.log(ranking[0]?.accountId, ranking[0]?.fishCaught);
   * ```
   */
  getDerby(uniqueDerbyId) {
    return this.http.request({
      url: this.url(`/api/public/minigame/derby/v1/${encodeURIComponent(uniqueDerbyId)}`),
      query: this.withApiKey()
    });
  }
  /**
   * Reads the hotel's current fishing derby, including live standings when one
   * is running.
   *
   * @returns The status, with `derby` present only while one is in progress.
   *
   * @example
   * ```ts
   * const { status, derby } = await habbo.origins.getDerbyStatus();
   *
   * if (derby !== undefined) {
   *   console.log(status, derby.info.participants.length, "entrants");
   * }
   * ```
   */
  getDerbyStatus() {
    return this.http.request({
      url: this.url("/api/public/minigame/derby/v1/status"),
      query: this.withApiKey()
    });
  }
  /**
   * Reads a player's progress in a skill.
   *
   * @param uniquePlayerId - The player to look up. In practice the hotel accepts
   *   the Habbo unique id (`hhous-...`) here.
   * @param skillType - The skill to read. Only `"FISHING"` exists today.
   * @returns The player's level and experience.
   *
   * @example
   * ```ts
   * const skill = await habbo.origins.getSkill("hhous-066a72...", "FISHING");
   * console.log(skill.level, skill.experience); // 99 32650913
   * ```
   */
  getSkill(uniquePlayerId, skillType = "FISHING") {
    return this.http.request({
      url: this.url(`/api/public/skills/${encodeURIComponent(uniquePlayerId)}`),
      query: { skillType }
    });
  }
  /**
   * Reads one page of a skill leaderboard.
   *
   * @param skillType - The skill to rank. Only `"FISHING"` exists today.
   * @param page - The page number, starting at 1.
   * @returns One page of ranked players, with the total page count.
   *
   * @example
   * ```ts
   * const board = await habbo.origins.getSkillLeaderboard("FISHING", 1);
   *
   * for (const entry of board.entries) {
   *   console.log(entry.uniqueId, entry.level);
   * }
   * ```
   */
  getSkillLeaderboard(skillType = "FISHING", page = 1) {
    return this.http.request({
      url: this.url("/api/public/skills/leaderboard"),
      query: { skillType, page }
    });
  }
  /**
   * Iterates every entry of a skill leaderboard, fetching one page at a time.
   *
   * @param skillType - The skill to rank.
   * @yields Each leaderboard entry, from the top down.
   *
   * @example
   * ```ts
   * for await (const entry of habbo.origins.iterateSkillLeaderboard("FISHING")) {
   *   console.log(entry.uniqueId, entry.experience);
   * }
   * ```
   */
  async *iterateSkillLeaderboard(skillType = "FISHING") {
    let page = 1;
    let totalPages = 1;
    do {
      const board = await this.getSkillLeaderboard(skillType, page);
      yield* board.entries;
      totalPages = board.totalPages;
      page += 1;
    } while (page <= totalPages);
  }
};

// src/resources/profiles.ts
var ProfilesResource = class {
  constructor(http, config) {
    this.http = http;
    this.config = config;
  }
  base(path) {
    return `${this.config.publicBaseUrl}${path}`;
  }
  /**
   * Looks up a user by name.
   *
   * @param name - The exact, case-insensitive Habbo name to resolve.
   * @returns The matching {@link Habbo}.
   * @throws {@link UserInvalidError} when the name is rejected as invalid.
   * @throws {@link HabboNotFoundError} when no user matches the name.
   *
   * @example
   * ```ts
   * const user = await habbo.profiles.get("Cebolla1");
   * console.log(user.uniqueId);
   * ```
   */
  get(name) {
    return this.http.request({
      url: this.base("/api/public/users"),
      query: { name }
    });
  }
  /**
   * Fetches a user by their stable unique identifier.
   *
   * @param uniqueId - The user's unique identifier (e.g. `"hhes-..."`).
   * @returns The matching {@link Habbo}.
   */
  getById(uniqueId) {
    return this.http.request({
      url: this.base(`/api/public/users/${encodeURIComponent(uniqueId)}`)
    });
  }
  /**
   * Fetches a user's aggregated public profile, including their friends,
   * groups, rooms, and badges.
   *
   * @param uniqueId - The user's unique identifier.
   * @returns The aggregated {@link Profile}.
   */
  getProfile(uniqueId) {
    return this.http.request({
      url: this.base(`/api/public/users/${encodeURIComponent(uniqueId)}/profile`)
    });
  }
  /**
   * Fetches a user's badges.
   *
   * @param uniqueId - The user's unique identifier.
   */
  getBadges(uniqueId) {
    return this.http.request({
      url: this.base(`/api/public/users/${encodeURIComponent(uniqueId)}/badges`)
    });
  }
  /**
   * Fetches a user's public friends.
   *
   * @param uniqueId - The user's unique identifier.
   */
  getFriends(uniqueId) {
    return this.http.request({
      url: this.base(`/api/public/users/${encodeURIComponent(uniqueId)}/friends`)
    });
  }
  /**
   * Fetches the groups a user belongs to.
   *
   * @param uniqueId - The user's unique identifier.
   */
  getGroups(uniqueId) {
    return this.http.request({
      url: this.base(`/api/public/users/${encodeURIComponent(uniqueId)}/groups`)
    });
  }
  /**
   * Fetches a user's public rooms.
   *
   * @param uniqueId - The user's unique identifier.
   */
  getRooms(uniqueId) {
    return this.http.request({
      url: this.base(`/api/public/users/${encodeURIComponent(uniqueId)}/rooms`)
    });
  }
  /**
   * Fetches a user's public photos, or the hotel's latest photos when no
   * identifier is supplied.
   *
   * @param uniqueId - The user's unique identifier. Omit to retrieve the
   *   hotel-wide latest photos.
   *
   * @remarks
   * These photo endpoints live under `/extradata` rather than `/api/public` and
   * are not part of the documented API, so their response may change without
   * notice.
   */
  getPhotos(uniqueId) {
    const path = uniqueId !== void 0 ? `/extradata/public/users/${encodeURIComponent(uniqueId)}/photos` : "/extradata/public/photos";
    return this.http.request({ url: this.base(path) });
  }
  /**
   * Fetches a user's achievements.
   *
   * @param uniqueId - The user's unique identifier.
   */
  getAchievements(uniqueId) {
    return this.http.request({
      url: this.base(`/api/public/achievements/${encodeURIComponent(uniqueId)}`)
    });
  }
  /**
   * Fetches the full catalogue of achievements defined by the hotel.
   */
  getAllAchievements() {
    return this.http.request({
      url: this.base("/api/public/achievements")
    });
  }
  /**
   * Fetches how many users own a badge, along with the badge's name and
   * description.
   *
   * The endpoint reports a count, not the list of owners.
   *
   * @param badgeCode - The badge code to look up.
   *
   * @example
   * ```ts
   * const badge = await habbo.profiles.getBadgeOwners("ACH_BasicClub1");
   * console.log(badge.ownerCount);
   * ```
   */
  getBadgeOwners(badgeCode) {
    return this.http.request({
      url: this.base(`/api/public/badge/owners/${encodeURIComponent(badgeCode)}`)
    });
  }
  /**
   * Fetches a room by its identifier.
   *
   * @param roomId - The numeric room identifier (the `id` field of a
   *   {@link Room}, not its `uniqueId`).
   */
  getRoom(roomId) {
    return this.http.request({
      url: this.base(`/api/public/rooms/${encodeURIComponent(String(roomId))}`)
    });
  }
  /**
   * Fetches the current list of hot looks (popular avatar figures).
   *
   * This endpoint returns XML rather than JSON; the raw XML document is returned
   * as a string for the caller to parse.
   */
  getHotLooks() {
    return this.http.request({
      url: this.base("/api/public/lists/hotlooks"),
      raw: true
    });
  }
  /**
   * Fetches marketplace statistics for several furni in a single request.
   *
   * Floor items and wall items are requested separately and come back in
   * matching fields of the response.
   *
   * @param query - The floor and wall items to look up.
   *
   * @example
   * ```ts
   * const stats = await habbo.profiles.getMarketplaceStats({
   *   roomItems: [{ item: "throne" }],
   *   wallItems: [{ item: "rare_dragonlamp" }],
   * });
   *
   * console.log(stats.roomItemData[0]?.currentPrice);
   * ```
   */
  getMarketplaceStats(query) {
    return this.http.request({
      method: "POST",
      url: this.base("/api/public/marketplace/stats/batch"),
      body: query
    });
  }
  /**
   * Pings the public API to check availability.
   *
   * A healthy hotel replies `200` with an empty body, so this resolves on
   * success and throws otherwise.
   *
   * @throws {@link MaintenanceError} when the hotel is under maintenance.
   * @throws {@link HabboNetworkError} when the hotel is unreachable.
   *
   * @example
   * ```ts
   * try {
   *   await habbo.profiles.ping();
   * } catch {
   *   // the hotel is unavailable
   * }
   * ```
   */
  async ping() {
    await this.http.request({ url: this.base("/api/public/ping"), raw: true });
  }
  /**
   * Fetches a group by its identifier.
   *
   * @param groupId - The unique group identifier.
   */
  getGroup(groupId) {
    return this.http.request({
      url: this.base(`/api/public/groups/${encodeURIComponent(groupId)}`)
    });
  }
  /**
   * Fetches the members of a group.
   *
   * Members carry their avatar in `habboFigure` rather than the `figureString`
   * used elsewhere, so they have their own {@link GroupMember} type.
   *
   * @param groupId - The unique group identifier.
   *
   * @example
   * ```ts
   * const members = await habbo.profiles.getGroupMembers("g-hhes-...");
   * const admins = members.filter((member) => member.isAdmin);
   * ```
   */
  getGroupMembers(groupId) {
    return this.http.request({
      url: this.base(`/api/public/groups/${encodeURIComponent(groupId)}/members`)
    });
  }
};

// src/client.ts
var HabboClient = class {
  /**
   * Creates a new client.
   *
   * @param config - The hotel and transport configuration.
   */
  constructor(config) {
    this.resolved = resolveConfig(config, config.originsApiKey);
    this.http = new HttpClient({
      fetch: this.resolved.fetch,
      timeout: this.resolved.timeout,
      maxRetries: this.resolved.maxRetries,
      userAgent: this.resolved.userAgent
    });
    this.profiles = new ProfilesResource(this.http, this.resolved);
    this.origins = new OriginsResource(this.http, this.resolved);
  }
  /**
   * Binds the Wired Variables API of one room of this hotel.
   *
   * The room shares this client's transport; only the room id and its
   * Wired keys are supplied here:
   *
   * ```ts
   * const room = habbo.room({
   *   roomId: 796,
   *   readKey: process.env.WIRED_READ_KEY,
   *   writeKey: process.env.WIRED_WRITE_KEY,
   * });
   *
   * const coins = await room.variables.get("user", "coins", "users", 44);
   * ```
   *
   * @param config - The room id and its keys.
   * @returns A {@link RoomInstance} sharing this client's transport.
   */
  room(config) {
    return new RoomInstance(
      config.roomId,
      { readKey: config.readKey, writeKey: config.writeKey },
      this.http,
      this.resolved
    );
  }
};

// src/utils/level-up/base-level-upper.ts
var BaseLevelUpper = class {
  /**
   * Clamps an XP amount to the valid `0n..maxXp()` range.
   *
   * @param xp - The XP amount about to be measured.
   * @returns `0n` for negative input, `maxXp()` above the maximum, the input
   *   otherwise.
   */
  boundedValue(xp) {
    if (xp < 0n) {
      return 0n;
    }
    const maxXp = this.maxXp();
    return xp > maxXp ? maxXp : xp;
  }
  /**
   * The completed share of a level as a whole percentage from `0n` to `100n`.
   *
   * @param part - The XP accumulated inside the level.
   * @param whole - The total XP the level requires.
   * @returns `Math.floor(part / whole * 100)` as a `bigint`.
   */
  floorPercent(part, whole) {
    return BigInt(Math.floor(Number(part) / Number(whole) * 100));
  }
};

// src/utils/level-up/exponential-level-upper.ts
var ExponentialLevelUpper = class extends BaseLevelUpper {
  /**
   * @param initialXp - The XP required to reach level `2` from level `1`.
   * @param strength - The exponential growth factor as a percentage.
   * @param maximumLevel - The highest achievable level.
   */
  constructor(initialXp, strength, maximumLevel) {
    super();
    this.initialXp = initialXp;
    this.maximumLevel = maximumLevel;
    this.strengthAsDecimal = Number(strength) / 100;
    this.maxXpValue = this.xpForLevel(this.maximumLevel);
  }
  /** {@inheritDoc BaseLevelUpper.currentLevel} */
  currentLevel(xp) {
    const bounded = this.boundedValue(xp);
    if (bounded <= 0n) {
      return 1n;
    }
    const logBase = 1 + this.strengthAsDecimal;
    const rawEstimate = Number(bounded) * this.strengthAsDecimal / Number(this.initialXp) + 1;
    let level = BigInt(Math.floor(Math.log(rawEstimate) / Math.log(logBase)) + 1);
    if (level > this.maximumLevel) {
      return this.maximumLevel;
    }
    if (level < 1n) {
      return 1n;
    }
    if (bounded < this.xpForLevel(level)) {
      return level > 1n ? level - 1n : 1n;
    }
    if (bounded >= this.xpForLevel(level + 1n)) {
      return level + 1n > this.maximumLevel ? this.maximumLevel : level + 1n;
    }
    return level;
  }
  /** {@inheritDoc BaseLevelUpper.totalXpRequired} */
  totalXpRequired(xp) {
    if (this.isMaxed(xp)) {
      return 0n;
    }
    const currentLevel = this.currentLevel(xp);
    return this.xpForLevel(currentLevel + 1n) - this.xpForLevel(currentLevel);
  }
  /** {@inheritDoc BaseLevelUpper.progress} */
  progress(xp) {
    const bounded = this.boundedValue(xp);
    if (this.isMaxed(bounded)) {
      return 0n;
    }
    const currentLevel = this.currentLevel(bounded);
    return bounded - this.xpForLevel(currentLevel);
  }
  /** {@inheritDoc BaseLevelUpper.progressPercentage} */
  progressPercentage(xp) {
    const bounded = this.boundedValue(xp);
    if (this.isMaxed(bounded)) {
      return 0n;
    }
    const currentLevel = this.currentLevel(bounded);
    const levelXp = this.xpForLevel(currentLevel);
    const nextLevelXp = this.xpForLevel(currentLevel + 1n);
    if (levelXp === nextLevelXp) {
      return 100n;
    }
    return this.floorPercent(bounded - levelXp, nextLevelXp - levelXp);
  }
  /** {@inheritDoc BaseLevelUpper.xpRemaining} */
  xpRemaining(xp) {
    const bounded = this.boundedValue(xp);
    if (this.isMaxed(bounded)) {
      return 0n;
    }
    return this.xpForLevel(this.currentLevel(bounded) + 1n) - bounded;
  }
  /** {@inheritDoc BaseLevelUpper.isMaxed} */
  isMaxed(xp) {
    return this.currentLevel(xp) >= this.maximumLevel;
  }
  /** {@inheritDoc BaseLevelUpper.maxLevel} */
  maxLevel() {
    return this.maximumLevel;
  }
  /** {@inheritDoc BaseLevelUpper.maxXp} */
  maxXp() {
    return this.maxXpValue;
  }
  /**
   * The exact XP at which a level starts.
   *
   * @param level - The level to measure, starting at `1`.
   * @returns The starting XP of the level, or `0n` below level `1`. Levels
   *   past the maximum report `maxXp()` so lookups above the ceiling stay
   *   bounded.
   */
  xpForLevel(level) {
    if (level < 1n) {
      return 0n;
    }
    if (level > this.maximumLevel) {
      return this.maxXpValue;
    }
    const growth = (Math.pow(1 + this.strengthAsDecimal, Number(level) - 1) - 1 + 1e-9) / this.strengthAsDecimal;
    return BigInt(Math.floor(Number(this.initialXp) * growth));
  }
};

// src/utils/level-up/interpolate-level-upper.ts
var InterpolateLevelUpper = class extends BaseLevelUpper {
  /**
   * @param levelToXpMap - Known levels mapped to the XP each one starts at.
   *   Levels and XP do not need to be ordered; entries are sorted by XP.
   */
  constructor(levelToXpMap) {
    super();
    this.xpToLevel = Object.entries(levelToXpMap).map(([level, xp]) => ({ level: BigInt(level), xp })).sort((left, right) => left.xp < right.xp ? -1 : left.xp > right.xp ? 1 : 0);
  }
  /** {@inheritDoc BaseLevelUpper.currentLevel} */
  currentLevel(xp) {
    return this.findProgressInfo(xp).currentLevel;
  }
  /** {@inheritDoc BaseLevelUpper.totalXpRequired} */
  totalXpRequired(xp) {
    const info = this.findProgressInfo(xp);
    return info.nextLevelXp - info.currentLevelXp;
  }
  /** {@inheritDoc BaseLevelUpper.progress} */
  progress(xp) {
    const info = this.findProgressInfo(xp);
    return info.currentXp - info.currentLevelXp;
  }
  /** {@inheritDoc BaseLevelUpper.progressPercentage} */
  progressPercentage(xp) {
    const info = this.findProgressInfo(xp);
    const totalRequired = info.nextLevelXp - info.currentLevelXp;
    if (totalRequired === 0n) {
      return 0n;
    }
    return this.floorPercent(info.currentXp - info.currentLevelXp, totalRequired);
  }
  /** {@inheritDoc BaseLevelUpper.xpRemaining} */
  xpRemaining(xp) {
    const info = this.findProgressInfo(xp);
    return info.nextLevelXp - info.currentXp;
  }
  /** {@inheritDoc BaseLevelUpper.isMaxed} */
  isMaxed(xp) {
    return this.findProgressInfo(xp).isMaxed;
  }
  /** {@inheritDoc BaseLevelUpper.maxLevel} */
  maxLevel() {
    return this.findProgressInfo(this.maxXp()).currentLevel;
  }
  /** {@inheritDoc BaseLevelUpper.maxXp} */
  maxXp() {
    if (this.xpToLevel.length === 0) {
      return 0n;
    }
    return this.xpToLevel[this.xpToLevel.length - 1].xp;
  }
  /**
   * Resolves the level band an XP amount falls into.
   *
   * The band between two known points is divided by
   * `(nextLevelXp - currentLevelXp) / (nextLevel - currentLevel)`, and
   * fractional steps accumulate through `Math.floor`, exactly as the add-on
   * computes them. This also means band boundaries can shift by one XP
   * depending on the map's rounding.
   *
   * @param xp - The XP amount to measure, unclamped.
   * @returns The current level, the XP its band starts at, the next level's
   *   starting XP, and whether the final level was reached.
   */
  findProgressInfo(xp) {
    if (this.xpToLevel.length === 0) {
      return { currentLevel: 1n, currentLevelXp: 0n, currentXp: 0n, nextLevelXp: 0n, isMaxed: true };
    }
    const bounded = this.boundedValue(xp);
    const last = this.xpToLevel[this.xpToLevel.length - 1];
    if (bounded >= last.xp) {
      return {
        currentLevel: last.level,
        currentLevelXp: last.xp,
        currentXp: last.xp,
        nextLevelXp: last.xp,
        isMaxed: true
      };
    }
    let lower = { level: 1n, xp: 0n };
    let upper = this.xpToLevel[0];
    for (const entry of this.xpToLevel) {
      if (entry.xp <= bounded) {
        lower = entry;
        continue;
      }
      upper = entry;
      break;
    }
    const levelDifference = upper.level - lower.level;
    const xpDifference = upper.xp - lower.xp;
    const xpPerLevel = Number(xpDifference) / Number(levelDifference);
    const stepXp = (steps) => lower.xp + BigInt(Math.floor(xpPerLevel * Number(steps)));
    const maxSteps = levelDifference - 1n;
    let levelSteps = BigInt(
      Math.min(
        Math.max(Math.floor(Number(bounded - lower.xp) / xpPerLevel), 0),
        Number(maxSteps)
      )
    );
    const onLastStep = levelSteps === maxSteps;
    let nextLevelXp = onLastStep ? upper.xp : stepXp(levelSteps + 1n);
    if (!onLastStep && bounded >= nextLevelXp) {
      levelSteps += 1n;
      nextLevelXp = levelSteps === levelDifference ? upper.xp : stepXp(levelSteps + 1n);
    }
    return {
      currentLevel: lower.level + levelSteps,
      currentLevelXp: stepXp(levelSteps),
      currentXp: bounded,
      nextLevelXp,
      isMaxed: false
    };
  }
};

// src/utils/level-up/linear-level-upper.ts
var LinearLevelUpper = class extends BaseLevelUpper {
  /**
   * @param stepSize - The XP every level requires.
   * @param maximumLevel - The highest achievable level.
   */
  constructor(stepSize, maximumLevel) {
    super();
    this.stepSize = stepSize;
    this.maximumLevel = maximumLevel;
  }
  /** {@inheritDoc BaseLevelUpper.currentLevel} */
  currentLevel(xp) {
    const bounded = this.boundedValue(xp);
    const candidate = 1n + bounded / this.stepSize;
    return candidate > this.maximumLevel ? this.maximumLevel : candidate;
  }
  /** {@inheritDoc BaseLevelUpper.totalXpRequired} */
  totalXpRequired(xp) {
    return this.isMaxed(xp) ? 0n : this.stepSize;
  }
  /** {@inheritDoc BaseLevelUpper.progress} */
  progress(xp) {
    const bounded = this.boundedValue(xp);
    return this.isMaxed(bounded) ? 0n : bounded % this.stepSize;
  }
  /** {@inheritDoc BaseLevelUpper.progressPercentage} */
  progressPercentage(xp) {
    if (this.isMaxed(xp)) {
      return 0n;
    }
    return this.floorPercent(this.progress(xp), this.stepSize);
  }
  /** {@inheritDoc BaseLevelUpper.xpRemaining} */
  xpRemaining(xp) {
    const bounded = this.boundedValue(xp);
    return this.isMaxed(bounded) ? 0n : this.stepSize - bounded % this.stepSize;
  }
  /** {@inheritDoc BaseLevelUpper.isMaxed} */
  isMaxed(xp) {
    return this.currentLevel(xp) >= this.maximumLevel;
  }
  /** {@inheritDoc BaseLevelUpper.maxLevel} */
  maxLevel() {
    return this.maximumLevel;
  }
  /** {@inheritDoc BaseLevelUpper.maxXp} */
  maxXp() {
    return (this.maximumLevel - 1n) * this.stepSize;
  }
};

// src/utils/level-up/steps-level-upper.ts
var StepsLevelUpper = class extends BaseLevelUpper {
  /**
   * @param xpPerLevel - The XP required to advance from level `i + 1` to
   *   level `i + 2`, one entry per transition. Must not be empty, and every
   *   step must be positive.
   * @throws {@link TypeError} when no step is given or a step is not a
   *   positive whole number.
   */
  constructor(xpPerLevel) {
    super();
    if (xpPerLevel.length === 0) {
      throw new TypeError("LevelUpper.steps needs at least one XP step.");
    }
    const thresholds = [];
    let total = 0n;
    for (const step of xpPerLevel) {
      if (typeof step !== "bigint" || step <= 0n) {
        throw new TypeError(`Each XP step must be a positive bigint. Received: ${String(step)}`);
      }
      total += step;
      thresholds.push(total);
    }
    this.thresholds = thresholds;
    this.xpPerLevel = xpPerLevel;
  }
  /** {@inheritDoc BaseLevelUpper.currentLevel} */
  currentLevel(xp) {
    const bounded = this.boundedValue(xp);
    let lastPassed = -1;
    let low = 0;
    let high = this.thresholds.length - 1;
    while (low <= high) {
      const middle = low + high >> 1;
      if (this.thresholds[middle] <= bounded) {
        lastPassed = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return BigInt(lastPassed + 2);
  }
  /** {@inheritDoc BaseLevelUpper.totalXpRequired} */
  totalXpRequired(xp) {
    if (this.isMaxed(xp)) {
      return 0n;
    }
    const level = this.currentLevel(xp);
    return this.xpPerLevel[Number(level) - 1];
  }
  /** {@inheritDoc BaseLevelUpper.progress} */
  progress(xp) {
    const bounded = this.boundedValue(xp);
    if (this.isMaxed(bounded)) {
      return 0n;
    }
    const level = this.currentLevel(bounded);
    return bounded - this.startOf(level);
  }
  /** {@inheritDoc BaseLevelUpper.progressPercentage} */
  progressPercentage(xp) {
    const bounded = this.boundedValue(xp);
    if (this.isMaxed(bounded)) {
      return 0n;
    }
    const level = this.currentLevel(bounded);
    return this.floorPercent(this.progress(bounded), this.xpPerLevel[Number(level) - 1]);
  }
  /** {@inheritDoc BaseLevelUpper.xpRemaining} */
  xpRemaining(xp) {
    const bounded = this.boundedValue(xp);
    if (this.isMaxed(bounded)) {
      return 0n;
    }
    const level = this.currentLevel(bounded);
    return this.startOf(level + 1n) - bounded;
  }
  /** {@inheritDoc BaseLevelUpper.isMaxed} */
  isMaxed(xp) {
    return this.currentLevel(xp) >= this.maxLevel();
  }
  /** {@inheritDoc BaseLevelUpper.maxLevel} */
  maxLevel() {
    return BigInt(this.thresholds.length + 1);
  }
  /** {@inheritDoc BaseLevelUpper.maxXp} */
  maxXp() {
    return this.thresholds[this.thresholds.length - 1];
  }
  startOf(level) {
    return level <= 1n ? 0n : this.thresholds[Number(level) - 2];
  }
};

// src/utils/level-up/level-upper.ts
var LevelUpper = class extends BaseLevelUpper {
  /**
   * Creates a linear profile, where every level costs the same XP.
   *
   * @param stepSize - The XP every level requires.
   * @param maxLevel - The highest achievable level.
   * @returns A {@link LevelUpperConfig} with evenly spaced levels.
   */
  static linear(stepSize, maxLevel) {
    return new LinearLevelUpper(stepSize, maxLevel);
  }
  /**
   * Creates an interpolating profile from a handful of known levels.
   *
   * @param levelToXpMap - Known levels mapped to the XP each one starts at.
   * @returns A {@link LevelUpperConfig} that spreads the levels between the
   *   known points evenly.
   */
  static interpolate(levelToXpMap) {
    return new InterpolateLevelUpper(levelToXpMap);
  }
  /**
   * Creates a stepwise profile from the exact XP each level transition
   * requires.
   *
   * Nothing is interpolated or invented: entry `i` of the array is the XP
   * needed to advance from level `i + 1` to level `i + 2`, so arbitrary
   * curves are expressed directly. The maximum level is one past the last
   * configured step.
   *
   * @param xpPerLevel - The XP required by each level transition, in order.
   * @returns A {@link LevelUpperConfig} following the configured jumps
   *   exactly.
   * @throws {@link TypeError} when no step is given or a step is not a
   *   positive whole number.
   *
   * @example
   * ```ts
   * const levels = LevelUpper.steps([100n, 150n, 150n, 400n]);
   * ```
   */
  static steps(xpPerLevel) {
    return new StepsLevelUpper(xpPerLevel);
  }
  /**
   * Creates an exponential profile, where every level costs more than the
   * last.
   *
   * @param initialXp - The XP required to reach level `2` from level `1`.
   * @param strength - The per-level growth as a percentage.
   * @param maxLevel - The highest achievable level.
   * @returns A {@link LevelUpperConfig} with growing level costs.
   */
  static exponential(initialXp, strength, maxLevel) {
    return new ExponentialLevelUpper(initialXp, strength, maxLevel);
  }
};

exports.BATCH_MAX_OPERATIONS = BATCH_MAX_OPERATIONS;
exports.BatchBuilder = BatchBuilder;
exports.FURNI_ID_WRAP = FURNI_ID_WRAP;
exports.HabboAuthError = HabboAuthError;
exports.HabboClient = HabboClient;
exports.HabboError = HabboError;
exports.HabboNetworkError = HabboNetworkError;
exports.HabboNotFoundError = HabboNotFoundError;
exports.HabboRateLimitError = HabboRateLimitError;
exports.LevelUpper = LevelUpper;
exports.MaintenanceError = MaintenanceError;
exports.RoomInstance = RoomInstance;
exports.UserInvalidError = UserInvalidError;
exports.assertVariableValue = assertVariableValue;
exports.fromApiFurniId = fromApiFurniId;
exports.isBatchOperationSuccess = isBatchOperationSuccess;
exports.sanitizeFurniId = sanitizeFurniId;
exports.toApiFurniId = toApiFurniId;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map