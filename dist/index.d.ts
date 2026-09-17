/**
 * HTTP transport layer.
 *
 * A thin wrapper around `fetch` that adds JSON encoding/decoding, request
 * timeouts, retry with exponential backoff for transient failures, and mapping
 * of failed responses onto the SDK's {@link HabboError} hierarchy.
 */
/**
 * The subset of the `fetch` signature the SDK relies on. Any compatible
 * implementation may be injected through the client configuration.
 */
type FetchLike = (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    headers: {
        get(name: string): string | null;
    };
    text(): Promise<string>;
}>;
/**
 * The HTTP methods used across the SDK.
 */
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
/**
 * Options for a single request issued through {@link HttpClient.request}.
 */
interface RequestOptions {
    /** Absolute request URL. */
    url: string;
    /** HTTP method. Defaults to `GET`. */
    method?: HttpMethod;
    /** Query string parameters. `undefined` values are omitted. */
    query?: Record<string, string | number | boolean | undefined>;
    /** Request body, serialized to JSON when present. */
    body?: unknown;
    /** Extra request headers, merged over the transport defaults. */
    headers?: Record<string, string>;
    /**
     * When `true`, the response body is returned as a raw string instead of being
     * parsed as JSON, and the `Accept` header is not forced to JSON. Used for
     * endpoints that return XML or plain text.
     */
    raw?: boolean;
}
/**
 * Configuration consumed by the {@link HttpClient}.
 */
interface HttpClientOptions {
    fetch: FetchLike;
    timeout: number;
    maxRetries: number;
    userAgent: string;
}
/**
 * Reusable HTTP client shared by all resource groups.
 */
declare class HttpClient {
    private readonly fetch;
    private readonly timeout;
    private readonly maxRetries;
    private readonly userAgent;
    constructor(options: HttpClientOptions);
    /**
     * Issues a request and decodes the response as JSON.
     *
     * @typeParam T - The expected shape of the decoded response body.
     * @returns The parsed response body, or `undefined` for empty (`204`)
     *   responses.
     * @throws {@link HabboError} or one of its subclasses on any failure.
     */
    request<T>(options: RequestOptions): Promise<T>;
    private dispatch;
    private decode;
    private describeTransportError;
    private backoffDelay;
    /**
     * Maps a non-2xx response onto the appropriate {@link HabboError} subclass,
     * mirroring the error semantics of the Habbo APIs.
     */
    private mapErrorResponse;
    private safeJson;
    /**
     * Extracts a human-readable message from a Habbo error body.
     *
     * The public API uses `{ "errors": [{ "msg": "..." }] }`, while the Wired
     * Variables API returns a single error code as `{ "error": "..." }`, for
     * example `wired.key_invalid`. `{ "message": "..." }` is also accepted.
     */
    private extractMessage;
}

/**
 * Client configuration and its resolution logic.
 *
 * The public endpoints need no authentication. The Wired Variables API is
 * authenticated per room, so its keys do not belong on this client: bind
 * them on a {@link RoomInstance} instead.
 */

/**
 * Hotel domain suffixes supported by the public Habbo API.
 *
 * The value is appended to `www.habbo.` to form the API host. The special value
 * Two values are not suffixes: `sandbox` targets `sandbox.habbo.com`, and
 * `origins` targets `origins.habbo.com`, the separate Habbo Origins hotel that
 * serves the `origins` resource.
 */
type Hotel = "com" | "es" | "com.br" | "de" | "fi" | "fr" | "it" | "nl" | "com.tr" | "sandbox" | "origins";
/**
 * Transport options shared by every client kind: the target host, the
 * `fetch` implementation, and the HTTP behaviour.
 */
interface TransportConfig {
    /**
     * The hotel domain used by the API.
     *
     * @defaultValue `"es"`
     */
    hotel?: Hotel;
    /**
     * Overrides the host serving the Wired Variables API, without a trailing
     * slash. Defaults to the same value as
     * {@link TransportConfig.publicBaseUrl}.
     */
    wiredBaseUrl?: string;
    /**
     * Overrides the host used by the public API. When set, it takes precedence
     * over {@link TransportConfig.hotel}. Useful for testing or for pointing at
     * a proxy. Provide it without a trailing slash.
     */
    publicBaseUrl?: string;
    /**
     * Custom `fetch` implementation. Defaults to the global `fetch`. Provide one
     * to run on older runtimes or to intercept requests in tests.
     */
    fetch?: FetchLike;
    /**
     * Request timeout in milliseconds. A value of `0` disables the timeout.
     *
     * @defaultValue `15000`
     */
    timeout?: number;
    /**
     * Number of times a failed request is retried for transient failures
     * (network errors and HTTP `429`/`5xx`). Set to `0` to disable retries.
     *
     * @defaultValue `2`
     */
    maxRetries?: number;
    /**
     * Value sent in the `User-Agent` header on every request.
     *
     * @defaultValue `"habbo-sdk/<version>"`
     */
    userAgent?: string;
}
/**
 * Full configuration object accepted by the {@link HabboClient} constructor.
 */
interface HabboClientConfig extends TransportConfig {
    /**
     * The optional `api_key` sent with the Habbo Origins fishing derby
     * endpoints. Only the derby routes accept it; every other endpoint ignores
     * it.
     */
    originsApiKey?: string;
}
/**
 * The fully normalized configuration consumed internally by the resources
 * and the HTTP transport.
 */
interface ResolvedConfig {
    readonly originsApiKey: string | undefined;
    readonly publicBaseUrl: string;
    readonly wiredBaseUrl: string;
    readonly fetch: FetchLike;
    readonly timeout: number;
    readonly maxRetries: number;
    readonly userAgent: string;
}

/**
 * Type definitions for the Wired Variables API (`variables` resource).
 */
/**
 * The scope a wired variable is bound to.
 *
 * - `user` variables are attached to a user, a pet, or a bot.
 * - `furni` variables are attached to a floor item or a wall item.
 * - Global variables are room-wide and use their own dedicated routes, so they
 *   are not part of this union.
 */
type VariableScope = "user" | "furni";
/**
 * Target kinds valid when {@link VariableScope} is `user`.
 */
type UserTargetKind = "users" | "pets" | "bots";
/**
 * Target kinds valid when {@link VariableScope} is `furni`.
 */
type FurniTargetKind = "furni" | "furni-bc" | "wall-items" | "wall-items-bc";
/**
 * Any target kind accepted by the scoped variable routes.
 */
type TargetKind = UserTargetKind | FurniTargetKind;
/**
 * Maps a scope onto the target kinds the API accepts for it, so an invalid
 * scope/kind pairing such as `("user", "wall-items")` fails to compile.
 */
type TargetKindFor<S extends VariableScope> = S extends "user" ? UserTargetKind : FurniTargetKind;
/**
 * The value type accepted when writing a wired variable.
 *
 * The API stores wired variables as signed 64-bit whole numbers only; strings
 * and booleans are rejected. Within the safe integer range the value may be a
 * plain `number`; beyond it use `bigint`, which carries every value the API
 * accepts. Values are validated by {@link assertVariableValue} before any
 * write leaves the SDK. Reads always come back as `bigint`.
 */
type VariableValue = number | bigint;
/**
 * A stored wired variable value together with its timestamps.
 */
interface WiredVariable {
    /** The current value. The API transports it as text; the SDK parses it to `bigint`. */
    value: bigint;
    /** ISO 8601 timestamp of when the value was first stored. */
    creation_time: string;
    /** ISO 8601 timestamp of the most recent update. */
    update_time: string;
}
/**
 * The variable names configured in a room, grouped by scope.
 *
 * Returned by {@link VariablesResource.list}. These are names only: use the
 * scoped read methods to fetch values.
 */
interface RoomVariables {
    /** Names of the user-scoped variables. */
    users: string[];
    /** Names of the furni-scoped variables. */
    furni: string[];
    /** Names of the room-wide global variables. */
    global: string[];
}
/**
 * Common payload fields shared by all paged variable results regardless of target.
 */
interface PagedVariableItemBase {
    variable: WiredVariable;
}
/**
 * Mapping table from each {@link TargetKind} to its target-specific entity payload.
 *
 * Each entry provides the property key and shape identifying the entity
 * (user, pet, bot, or furni) that holds the variable.
 */
interface PagedVariableItemTarget {
    /** Target details when querying user-held variables. */
    users: {
        user: UserProfileTarget;
    };
    /** Target details when querying pet-held variables. */
    pets: {
        pet: ItemProfileTarget;
    };
    /** Target details when querying bot-held variables. */
    bots: {
        bot: ItemProfileTarget;
    };
    /** Target details when querying standard floor furni variables. */
    furni: {
        furni: ItemProfileTarget;
    };
    /** Target details when querying Builders Club floor furni variables. */
    "furni-bc": {
        furni_bc: ItemProfileTarget;
    };
    /** Target details when querying standard wall item variables. */
    "wall-items": {
        wall_item: ItemProfileTarget;
    };
    /** Target details when querying Builders Club wall item variables. */
    "wall-items-bc": {
        wall_item_bc: ItemProfileTarget;
    };
}
/**
 * A single entry in a paged variable list.
 *
 * Combines the common {@link PagedVariableItemBase} fields with the target-specific
 * entity definition resolved via {@link PagedVariableItemTarget} for the given {@link TargetKind}.
 *
 * @typeParam K - The target kind to resolve entity metadata for. Defaults to all {@link TargetKind} variants.
 */
type PagedVariableItem<K extends TargetKind = TargetKind> = PagedVariableItemBase & PagedVariableItemTarget[K];
/**
 * One page of variable values for a target kind, as returned by
 * {@link VariablesResource.listByKind}.
 */
interface PagedVariables<K extends TargetKind = TargetKind> {
    /** The values on this page. */
    items: PagedVariableItem<K>[];
    /** The one-based page index this result represents; the first page is 1. */
    page: number;
    /** The page size used to produce this result. */
    size: number;
}
/**
 * Query options accepted by {@link VariablesResource.listByKind}.
 */
interface ListByKindOptions {
    /**
     * The field to sort by.
     *
     * @defaultValue the server's own ordering
     */
    orderBy?: "value" | "creation_time" | "update_time";
    /**
     * The sort direction.
     *
     * @defaultValue the server's own direction
     */
    orderDir?: "asc" | "desc";
    /** One-based page index; the first page is 1. */
    page?: number;
    /** Number of items per page. */
    size?: number;
}
/**
 * Request body used to write a single variable value.
 */
interface ValueWriteInput {
    /** The whole number to store. */
    value: VariableValue;
}
/**
 * A map of variable names to their stored values, as held by a variables
 * profile.
 */
type VariableMap = Record<string, WiredVariable>;
/**
 * A floor or wall item a variables profile belongs to. Items are identified by
 * id alone.
 */
interface ItemProfileTarget {
    /** Numeric identifier of the item. */
    id: number;
}
/**
 * A pet or bot a variables profile belongs to.
 */
interface NamedProfileTarget extends ItemProfileTarget {
    /** Display name of the pet or bot. */
    name?: string;
}
/**
 * The user a variables profile belongs to.
 */
interface UserProfileTarget extends NamedProfileTarget {
    /** The user's Habbo unique id. */
    unique_id?: string;
}
/**
 * Any entity a variables profile can belong to.
 *
 * Which fields are present depends on the target: users carry `name` and
 * `unique_id`, pets and bots carry `name`, and items carry only `id`.
 */
type ProfileTarget = UserProfileTarget;
/**
 * The variables profile of a user.
 */
interface UserProfile {
    /** The user the profile belongs to. */
    user: UserProfileTarget;
    /** The user's variables, keyed by name. */
    variables: VariableMap;
}
/**
 * The variables profile of a pet.
 */
interface PetProfile {
    /** The pet the profile belongs to. */
    pet: NamedProfileTarget;
    /** The pet's variables, keyed by name. */
    variables: VariableMap;
}
/**
 * The variables profile of a bot.
 */
interface BotProfile {
    /** The bot the profile belongs to. */
    bot: NamedProfileTarget;
    /** The bot's variables, keyed by name. */
    variables: VariableMap;
}
/**
 * The variables profile of a floor item.
 */
interface FurniProfile {
    /** The furni the profile belongs to. */
    furni: ItemProfileTarget;
    /** The furni's variables, keyed by name. */
    variables: VariableMap;
}
/**
 * The variables profile of a builders-club floor item.
 */
interface FurniBcProfile {
    /** The builders-club furni the profile belongs to. */
    furni_bc: ItemProfileTarget;
    /** The furni's variables, keyed by name. */
    variables: VariableMap;
}
/**
 * The variables profile of a wall item.
 */
interface WallItemProfile {
    /** The wall item the profile belongs to. */
    wall_item: ItemProfileTarget;
    /** The wall item's variables, keyed by name. */
    variables: VariableMap;
}
/**
 * The variables profile of a builders-club wall item.
 */
interface WallItemBcProfile {
    /** The builders-club wall item the profile belongs to. */
    wall_item_bc: ItemProfileTarget;
    /** The wall item's variables, keyed by name. */
    variables: VariableMap;
}
/**
 * The room-wide variables profile, which has no owning entity.
 */
interface GlobalProfile {
    /** The room's global variables, keyed by name. */
    variables: VariableMap;
}
/**
 * Any profile returned by the user-scoped profile routes.
 *
 * Narrow it by checking which owner key is present:
 *
 * ```ts
 * if ("pet" in profile) {
 *   console.log(profile.pet.name);
 * }
 * ```
 */
type AnyUserProfile = UserProfile | PetProfile | BotProfile;
/**
 * Any profile returned by the furni-scoped profile routes.
 */
type AnyFurniProfile = FurniProfile | FurniBcProfile | WallItemProfile | WallItemBcProfile;
/**
 * Any variables profile the API can return.
 */
type VariablesProfile = AnyUserProfile | AnyFurniProfile | GlobalProfile;
/**
 * Maps a user target kind onto the exact profile type that route returns, so
 * `get("users", …)` narrows to {@link UserProfile} without a manual cast.
 */
type UserProfileFor<K extends UserTargetKind> = K extends "users" ? UserProfile : K extends "pets" ? PetProfile : BotProfile;
/**
 * Maps a furni target kind onto the exact profile type that route returns.
 */
type FurniProfileFor<K extends FurniTargetKind> = K extends "furni" ? FurniProfile : K extends "furni-bc" ? FurniBcProfile : K extends "wall-items" ? WallItemProfile : WallItemBcProfile;
/**
 * Patch body for a user, pet, bot, or furni variables profile.
 *
 * Only the listed variables are touched. A `null` value deletes the stored
 * value for that variable; the variable itself stays configured in the room.
 */
interface VariablesPatch {
    /** Variable names mapped to a new value, or to `null` to delete the value. */
    variables: Record<string, VariableValue | null>;
}
/**
 * Patch body for the global variables profile.
 *
 * Unlike scoped profiles, global variables cannot be deleted through a patch,
 * so `null` is not accepted here.
 */
interface GlobalVariablesPatch {
    /** Variable names mapped to their new values. */
    variables: Record<string, VariableValue>;
}
/**
 * Body carried by `PUT` and `PATCH` batch operations.
 */
interface BatchOperationBody {
    /** The whole number to store. */
    value: VariableValue;
}
/**
 * A single operation inside a batch request.
 *
 * All operations in one batch act on the variable named in the route; `path`
 * selects the entity, in the form `<targetKind>/<entityId>` with no leading
 * slash, for example `users/44`.
 */
type BatchOperation = {
    op_id?: string;
    method: "GET";
    path: string;
} | {
    op_id?: string;
    method: "DELETE";
    path: string;
} | {
    op_id?: string;
    method: "PUT";
    path: string;
    body: BatchOperationBody;
} | {
    op_id?: string;
    method: "PATCH";
    path: string;
    body: BatchOperationBody;
};
/**
 * The error reported for a failed operation within a batch.
 */
interface BatchOperationError {
    /** Machine-readable error code, e.g. `wired.variables.invalid_target`. */
    code: string;
    /** Human-readable message. The server currently mirrors the code here. */
    message: string;
}
/**
 * The result of a single batch operation.
 *
 * Narrow on `status`: `200` carries a `body`, `204` carries neither `body` nor
 * `error`, and any other status carries an `error`. The helper
 * {@link isBatchOperationSuccess} does this narrowing for you.
 */
type BatchOperationResult = {
    op_id?: string | null;
    status: 200;
    body: WiredVariable;
} | {
    op_id?: string | null;
    status: 204;
} | {
    op_id?: string | null;
    status: 400 | 403 | 404 | 429 | 500;
    error: BatchOperationError;
};
/**
 * Narrows a {@link BatchOperationResult} to the operations that succeeded.
 *
 * @param result - A single result from a {@link BatchResults} response.
 * @returns `true` when the operation returned `200` or `204`.
 *
 * @example
 * ```ts
 * const { results } = await habbo.variables.batch(796, "user", "coins")
 *   .patch("users/44", 7)
 *   .execute();
 *
 * const failed = results.filter((r) => !isBatchOperationSuccess(r));
 * ```
 */
declare function isBatchOperationSuccess(result: BatchOperationResult): result is Extract<BatchOperationResult, {
    status: 200 | 204;
}>;
/**
 * The response of a batch request: one result per submitted operation, in the
 * order the operations were sent.
 */
interface BatchResults {
    /** One entry per operation in the request. */
    results: BatchOperationResult[];
}
/**
 * The body of a batch request.
 *
 * Built for you by {@link BatchBuilder}; you only need this type when you
 * assemble a batch by hand.
 */
interface BatchRequest {
    /** Between 1 and {@link BATCH_MAX_OPERATIONS} operations. */
    requests: BatchOperation[];
}
/**
 * The response of the variable count endpoint.
 *
 * {@link VariablesResource.count} unwraps this and returns the number directly.
 */
interface VariableCount {
    /** How many values are stored. */
    count: number;
}
/**
 * Request body listing the variables whose stored values should be deleted.
 */
interface BulkDeleteInput {
    /**
     * Names of user or furni variables whose stored values will be deleted. The
     * variable definitions themselves remain configured in the room.
     */
    variables: string[];
}
/**
 * The machine-readable error codes the Wired Variables API can return.
 *
 * Read it off `error.body` to tell apart failures that share an HTTP status.
 * A `403`, for instance, means a bad key, a room with the API switched off, or
 * an operation the room does not permit: three very different fixes.
 *
 * Unknown strings are allowed so a newly added code does not break typing.
 *
 * | Code | HTTP | Meaning |
 * | --- | --- | --- |
 * | `wired.variables.invalid_target` | 400 | The target kind or entity id is not valid for the scope. |
 * | `wired.variables.invalid_value` | 400 | The value is not an accepted whole number. |
 * | `wired.variables.bulk_delete_empty` | 400 | The bulk delete listed no variables. |
 * | `wired.variables.bulk_delete_invalid_variable` | 400 | A named variable is not configured in the room. |
 * | `wired.variables.batch_empty` | 400 | The batch carried no operations. |
 * | `wired.variables.batch_limit_exceeded` | 400 | The batch exceeded 50 operations. |
 * | `wired.variables.key_missing` | 403 | No key was sent. |
 * | `wired.variables.key_invalid` | 403 | The key does not match the room. |
 * | `wired.variables.api_disabled` | 403 | The room has the API switched off. |
 * | `wired.variables.user_not_participating` | 403 | The user is not taking part in the room. |
 * | `wired.variables.operation_not_allowed` | 403 | The room does not permit this operation. |
 * | `wired.variables.bulk_delete_not_enabled` | 403 | The room does not permit bulk deletes. |
 * | `room.not_found` | 404 | No such room. |
 * | `wired.variables.not_found` | 404 | No such variable. |
 * | `wired.variables.entity_not_found` | 404 | No such user, pet, bot, or item. |
 * | `wired.variables.too_many_requests` | 429 | Rate limit exceeded. |
 *
 * @example
 * ```ts
 * import { HabboAuthError, type WiredErrorBody } from "habbo-sdk";
 *
 * try {
 *   await habbo.variables.updateGlobal(796, "jackpot", 10);
 * } catch (error) {
 *   if (error instanceof HabboAuthError) {
 *     const code = (error.body as WiredErrorBody | undefined)?.error;
 *     if (code === "wired.variables.api_disabled") {
 *       // the room owner has to switch the API on
 *     }
 *   }
 * }
 * ```
 */
type WiredErrorCode = "wired.variables.invalid_target" | "wired.variables.invalid_value" | "wired.variables.bulk_delete_empty" | "wired.variables.bulk_delete_invalid_variable" | "wired.variables.batch_empty" | "wired.variables.batch_limit_exceeded" | "wired.variables.key_missing" | "wired.variables.key_invalid" | "wired.variables.api_disabled" | "wired.variables.user_not_participating" | "wired.variables.operation_not_allowed" | "wired.variables.bulk_delete_not_enabled" | "room.not_found" | "wired.variables.not_found" | "wired.variables.entity_not_found" | "wired.variables.too_many_requests" | (string & {});
/**
 * The error body returned by the Wired Variables API on a failed request.
 *
 * Reachable through the `body` of any thrown {@link HabboError}.
 */
interface WiredErrorBody {
    /** The error code. See {@link WiredErrorCode}. */
    error: WiredErrorCode;
}
/**
 * The maximum number of operations the API accepts in a single batch request.
 */
declare const BATCH_MAX_OPERATIONS = 50;
/**
 * The threshold at which a furni identifier wraps back to its unsigned form.
 */
declare const FURNI_ID_WRAP = 2147418112;
/**
 * Throws when a value cannot be stored as a wired variable.
 *
 * Wired variables are signed 64-bit whole numbers; the SDK rejects anything
 * else up front so callers get a precise error instead of an opaque `400`
 * from the server.
 *
 * @param value - The value about to be written.
 * @throws {@link TypeError} when the value is not a whole number the API can
 *   store.
 */
declare function assertVariableValue(value: VariableValue): void;
/**
 * Normalizes a furni (floor or wall item) identifier for use in a Wired
 * Variables URL.
 *
 * In-room item ids may be negative or above {@link FURNI_ID_WRAP}, and the API
 * expects the wrapped, non-negative form. The SDK applies this automatically to
 * every furni-scoped path; callers building their own batch paths can use it
 * directly.
 *
 * @param furniId - The item identifier as reported by the room.
 * @returns The sanitized, positive item identifier.
 */
declare function sanitizeFurniId(furniId: string | number): number;
interface ApiFurniId {
    /** The target kind under which the API addresses the item. */
    kind: FurniTargetKind;
    /** The sanitized, positive identifier used in API paths. */
    id: number;
}
declare function toApiFurniId(furniId: string | number): ApiFurniId;
declare function fromApiFurniId(furniId: ApiFurniId): number;

/**
 * Fluent builder for batches of wired variable operations.
 *
 * A batch acts on a single variable, named when the builder is created, and can
 * touch up to {@link BATCH_MAX_OPERATIONS} different entities in one request.
 * Reads and writes may be mixed freely.
 *
 * Every method takes a `path` of the form `<targetKind>/<entityId>`, without a
 * leading slash, for example `users/44` or `furni/5521`.
 *
 * @example
 * ```ts
 * const { results } = await habbo.variables
 *   .batch(796, "user", "score")
 *   .get("users/44")
 *   .patch("users/45", 10)
 *   .delete("pets/12")
 *   .execute();
 * ```
 */

/**
 * The transport callback a {@link BatchBuilder} uses to dispatch its operations.
 * Supplied by {@link VariablesResource.batch}.
 */
type BatchExecutor = (operations: BatchRequest["requests"]) => Promise<BatchResults>;
/**
 * Options shared by every builder method.
 */
interface BatchOperationOptions {
    /**
     * A caller-supplied identifier echoed back on the matching result, which lets
     * you correlate results with your own records. Optional: results are also
     * returned in the order the operations were queued.
     */
    opId?: string;
}
/**
 * Accumulates wired variable operations and sends them as one request.
 *
 * Instances come from {@link VariablesResource.batch}; there is no reason to
 * construct one directly.
 */
declare class BatchBuilder {
    private readonly executor;
    private readonly operations;
    constructor(executor: BatchExecutor);
    /**
     * Queues a read of the variable for one entity.
     *
     * @param path - Target path, e.g. `users/44`.
     * @param options - Optional {@link BatchOperationOptions.opId}.
     * @returns This builder, for chaining.
     */
    get(path: string, options?: BatchOperationOptions): this;
    /**
     * Queues a create-or-replace of the variable for one entity.
     *
     * @param path - Target path, e.g. `users/44`.
     * @param value - The whole number to store.
     * @param options - Optional {@link BatchOperationOptions.opId}.
     * @returns This builder, for chaining.
     * @throws {@link TypeError} when the value is not a whole number.
     */
    put(path: string, value: VariableValue, options?: BatchOperationOptions): this;
    /**
     * Queues an update of the variable for one entity.
     *
     * @param path - Target path, e.g. `users/44`.
     * @param value - The new whole number.
     * @param options - Optional {@link BatchOperationOptions.opId}.
     * @returns This builder, for chaining.
     * @throws {@link TypeError} when the value is not a whole number.
     */
    patch(path: string, value: VariableValue, options?: BatchOperationOptions): this;
    /**
     * Queues a deletion of the variable's stored value for one entity.
     *
     * @param path - Target path, e.g. `users/44`.
     * @param options - Optional {@link BatchOperationOptions.opId}.
     * @returns This builder, for chaining.
     */
    delete(path: string, options?: BatchOperationOptions): this;
    /**
     * Appends pre-built operations. An escape hatch for callers assembling
     * operations programmatically.
     *
     * @param operations - One or more operations to append.
     * @returns This builder, for chaining.
     */
    add(...operations: BatchOperation[]): this;
    /** How many operations are queued so far. */
    get size(): number;
    /**
     * Returns a copy of the queued operations without sending them. Useful for
     * logging, inspection, and tests.
     */
    toOperations(): BatchOperation[];
    /**
     * Sends every queued operation as a single request.
     *
     * @returns One result per operation, in the order they were queued.
     * @throws {@link RangeError} when no operation has been queued.
     * @throws {@link HabboAuthError} when the client lacks a `readKey` or a
     *   `writeKey`, both of which a batch requires.
     */
    execute(): Promise<BatchResults>;
    private push;
}

/**
 * Shared plumbing for the room-bound Wired Variables resources.
 *
 * The Wired read/write keys are issued per room, so a resource binds the
 * room id and its keys once and then calls endpoints without repeating
 * either. This module centralizes URL building, key selection, and the
 * typed request helper those resources use.
 */

/** Identifies a room. Numeric ids are accepted as strings for convenience. */
type RoomId = number | string;
/**
 * The keys a room-bound resource sends. `undefined` means the operation has
 * no key and will reject when the endpoint needs one.
 */
interface ResolvedWiredKeys {
    readonly readKey: string | undefined;
    readonly writeKey: string | undefined;
}
/**
 * Base for the Wired Variables resources of one room.
 *
 * Holds the HTTP transport, the effective keys, and the room id, and offers
 * URL building plus a typed request helper that authenticates with the
 * bound keys.
 */
declare abstract class WiredResource {
    protected readonly http: HttpClient;
    protected readonly config: ResolvedConfig;
    protected readonly keys: ResolvedWiredKeys;
    protected constructor(http: HttpClient, config: ResolvedConfig, keys: ResolvedWiredKeys);
    /** Builds an absolute Wired API URL for the bound room and a path. */
    protected url(roomId: RoomId, path: string): string;
    /**
     * Builds the authentication headers for an operation.
     *
     * @param need - Which keys the operation requires. Batch requests need both.
     * @throws {@link HabboAuthError} when a required key is not available.
     */
    protected authHeaders(need: "read" | "write" | "both"): Record<string, string>;
    private requireKey;
    /**
     * `async` so a missing key surfaces as a rejected promise rather than a
     * synchronous throw, keeping every public method uniformly awaitable.
     */
    protected send<T>(method: HttpMethod, need: "read" | "write" | "both", roomId: RoomId, path: string, options?: {
        body?: unknown;
        query?: Record<string, string | number | boolean | undefined>;
    }): Promise<T>;
}

/**
 * Whole-profile operations for one room: every variable attached to a
 * single user, pet, bot, furni, wall item, or to the room itself.
 *
 * Instances are bound to a room id and its Wired keys, so none of the
 * methods repeat either. Prefer these over per-variable reads whenever you
 * need more than one variable of the same entity, since a profile call
 * returns them all in one request.
 */

declare class RoomVariablesProfileResource extends WiredResource {
    private readonly roomId;
    constructor(http: HttpClient, config: ResolvedConfig, keys: ResolvedWiredKeys, roomId: RoomId);
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
    findUser(lookup: {
        name: string;
    } | {
        uniqueId: string;
    }): Promise<UserProfile>;
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
    getUser<K extends UserTargetKind>(targetKind: K, entityId: string | number): Promise<UserProfileFor<K>>;
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
    patchUser<K extends UserTargetKind>(targetKind: K, entityId: string | number, variables: Record<string, VariableValue | null>): Promise<UserProfileFor<K>>;
    /**
     * Deletes every stored variable value of a user, pet, or bot.
     *
     * The room's variable definitions are unaffected; only this entity's values
     * are removed.
     *
     * @param targetKind - `"users"`, `"pets"`, or `"bots"`.
     * @param entityId - The entity's in-room identifier.
     * @throws {@link HabboAuthError} when no `writeKey` is configured.   */
    deleteUser(targetKind: UserTargetKind, entityId: string | number): Promise<void>;
    /**
     * Reads the variables profile of a floor or wall item.
     *
     * @param targetKind - `"furni"`, `"furni-bc"`, `"wall-items"`, or
     *   `"wall-items-bc"`.
     * @param entityId - The item's in-room identifier.
     * @returns The item's profile.
     * @throws {@link HabboAuthError} when no `readKey` is configured.   */
    getFurni<K extends FurniTargetKind>(targetKind: K, entityId: string | number): Promise<FurniProfileFor<K>>;
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
    patchFurni<K extends FurniTargetKind>(targetKind: K, entityId: string | number, variables: Record<string, VariableValue | null>): Promise<FurniProfileFor<K>>;
    /**
     * Reads every global variable of the room in one request.
     *
     * @returns The room's global profile.
     * @throws {@link HabboAuthError} when no `readKey` is configured.   */
    getGlobal(): Promise<GlobalProfile>;
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
    patchGlobal(variables: Record<string, VariableValue>): Promise<GlobalProfile>;
}

/**
 * The wired variables of one room: per-variable reads and writes, lists,
 * counts, bulk deletes, and batches.
 *
 * Instances are bound to a room id and its Wired keys, so none of the
 * methods repeat either. Obtain one from a room-bound wired client.
 */

/**
 * Reads and writes individual wired variables in a room, lists and counts their
 * values, deletes them in bulk, and executes batches.
 *
 * Used through a room-bound wired client. Whole-entity operations live on
 * {@link RoomVariablesResource.profiles}.
 */
declare class RoomVariablesResource extends WiredResource {
    private readonly roomId;
    /**
     * Whole-profile operations: read or patch every variable of one entity at
     * once. See {@link RoomVariablesProfileResource}.
     */
    readonly profiles: RoomVariablesProfileResource;
    constructor(http: HttpClient, config: ResolvedConfig, keys: ResolvedWiredKeys, roomId: RoomId);
    private scoped;
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
    list(): Promise<RoomVariables>;
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
    get<S extends VariableScope>(scope: S, variableName: string, targetKind: TargetKindFor<S>, entityId: string | number): Promise<WiredVariable>;
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
    set<S extends VariableScope>(scope: S, variableName: string, targetKind: TargetKindFor<S>, entityId: string | number, value: VariableValue): Promise<WiredVariable>;
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
    update<S extends VariableScope>(scope: S, variableName: string, targetKind: TargetKindFor<S>, entityId: string | number, value: VariableValue): Promise<WiredVariable>;
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
    delete<S extends VariableScope>(scope: S, variableName: string, targetKind: TargetKindFor<S>, entityId: string | number): Promise<void>;
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
    listByKind<S extends VariableScope, K extends TargetKindFor<S>>(scope: S, variableName: string, targetKind: K, options?: ListByKindOptions): Promise<PagedVariables<K>>;
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
    iterateByKind<S extends VariableScope, K extends TargetKindFor<S>>(scope: S, variableName: string, targetKind: K, options?: ListByKindOptions): AsyncGenerator<PagedVariables<K>["items"][number], void, undefined>;
    /**
     * Counts how many entities of a target kind have a stored value for a
     * variable.
     *
     * @param scope - `"user"` or `"furni"`.
     * @param variableName - The configured variable name.
     * @param targetKind - The entity kind to count.
     * @returns The number of stored values.
     * @throws {@link HabboAuthError} when no `readKey` is configured.   */
    count<S extends VariableScope>(scope: S, variableName: string, targetKind: TargetKindFor<S>): Promise<number>;
    /**
     * Deletes every stored value of the named variables, across all entities in
     * the room.
     *
     * The variable definitions stay configured; only their stored values are
     * cleared. This is the fastest way to reset a game between rounds.
     *
     * @param variables - Names of the user or furni variables to clear.
     * @throws {@link HabboAuthError} when no `writeKey` is configured.   */
    bulkDelete(variables: string[]): Promise<void>;
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
    batch<S extends VariableScope>(scope: S, variableName: string): BatchBuilder;
    /**
     * Reads a room-wide global variable.
     *
     * @param variableName - The configured variable name.
     * @returns The stored value with its timestamps.
     * @throws {@link HabboAuthError} when no `readKey` is configured.   */
    getGlobal(variableName: string): Promise<WiredVariable>;
    /**
     * Updates a room-wide global variable.
     *
     * @param variableName - The configured variable name.
     * @param value - The new whole number.
     * @returns The stored value with its timestamps.
     * @throws {@link HabboAuthError} when no `writeKey` is configured.
     * @throws {@link TypeError} when the value is not a whole number.   */
    updateGlobal(variableName: string, value: VariableValue): Promise<WiredVariable>;
}

/**
 * The authenticated entry point to the Wired Variables API of one room.
 *
 * Rooms are created through {@link HabboClient.room}, which binds the room
 * to the client's transport: the hotel, fetch, and timeouts live on the
 * client exactly once, and the keys are the only thing the room adds:
 *
 * ```ts
 * const habbo = new HabboClient({ hotel: "es" });
 * const room = habbo.room({
 *   roomId: 796,
 *   readKey: process.env.WIRED_READ_KEY,
 *   writeKey: process.env.WIRED_WRITE_KEY,
 * });
 *
 * const names = await room.variables.list();
 * ```
 */

/**
 * The room binding passed to {@link HabboClient.room}: the room id and its
 * Wired keys. The transport is the client's; a room adds nothing else.
 */
interface RoomInstanceConfig {
    /** The room whose wired variables this instance manages. */
    roomId: RoomId;
    /**
     * The room's `X-Wired-Read-Key`, from its Wired settings. Required by
     * every read; calls that need it reject when it is missing.
     */
    readKey?: string;
    /**
     * The room's `X-Wired-Write-Key`, from its Wired settings. Required by
     * every write; calls that need it reject when it is missing.
     */
    writeKey?: string;
}
/**
 * Binds the Wired Variables API of one room: the room id and its keys,
 * sharing the transport of the {@link HabboClient} that created it.
 *
 * Create one instance per room you manage; several rooms with different
 * keys are several instances of the same client. The constructor is
 * internal: obtain instances through {@link HabboClient.room}.
 */
declare class RoomInstance {
    /** The room every wired call targets. */
    readonly roomId: RoomId;
    /**
     * Per-variable reads and writes, lists, counts, bulk deletes, batches,
     * and global variables of this room.
     */
    readonly variables: RoomVariablesResource;
    /**
     * @param roomId - The room to bind.
     * @param keys - The room's effective Wired keys.
     * @param http - The shared HTTP transport of the owning client.
     * @param config - The shared resolved configuration of the owning client.
     */
    constructor(roomId: RoomId, keys: ResolvedWiredKeys, http: HttpClient, config: ResolvedConfig);
}

/**
 * Type definitions for the Habbo Origins endpoints: matches, the fishing derby,
 * skills, and player id resolution.
 *
 * Origins identifies players by a *unique player id* (`gp-...`), which differs
 * from the `uniqueId` (`hh...`) used elsewhere in the public API. Convert one
 * into the other with {@link OriginsResource.getHabboIds}.
 */
/**
 * The skills the API tracks. Only fishing is exposed today.
 */
type SkillType = "FISHING";
/**
 * A player's progress in a single skill.
 */
interface PlayerSkill {
    /** The current level of the skill. */
    level: number;
    /** Experience points accumulated in the skill. */
    experience: number;
}
/**
 * One entry of a skill leaderboard.
 */
interface SkillLeaderboardEntry {
    /** The player's unique id. */
    uniqueId: string;
    /** The player's level in the skill. */
    level: number;
    /** The player's experience in the skill. */
    experience: number;
}
/**
 * One page of a skill leaderboard.
 */
interface SkillLeaderboard {
    /** The players on this page, in ranking order. */
    entries: SkillLeaderboardEntry[];
    /** How many pages exist in total. */
    totalPages: number;
    /** The page number this result represents, starting at 1. */
    currentPage: number;
    /** How many entries each page holds. */
    pageSize: number;
}
/**
 * Time and pagination filters shared by the match and derby id listings.
 */
interface HistoryQuery {
    /** How many items to skip before collecting results. */
    offset?: number;
    /** How many items to return. */
    limit?: number;
    /**
     * Only include games starting after this time, formatted as
     * `YYYY-MM-DD HH:mm:ss.SSS`, for example `2024-08-20 12:00:00.000`.
     */
    startTime?: string;
    /**
     * Only include games ending before this time, in the same format as
     * {@link HistoryQuery.startTime}.
     */
    endTime?: string;
}
/**
 * Identifiers describing a match and who took part in it.
 */
interface MatchMetadata {
    /** The unique match id. */
    matchId: string;
    /** The unique player ids of everyone who took part. */
    participantPlayerIds: string[];
}
/**
 * A single player's performance within a match.
 *
 * Tile counters are specific to tile-capture game modes and read as `0` in
 * modes that do not use them.
 */
interface MatchParticipant {
    /** The participant's unique player id. */
    gamePlayerId: string;
    /** Points scored by the participant. */
    gameScore: number;
    /** Where the participant finished, `1` being first. */
    playerPlacement: number;
    /** The team the participant belonged to. */
    teamId: number;
    /** Where the participant's team finished. */
    teamPlacement: number;
    /** How many times the participant was stunned. */
    timesStunned: number;
    /** How many power-ups the participant picked up. */
    powerUpPickups: number;
    /** How many power-ups the participant used. */
    powerUpActivations: number;
    /** Tiles the participant cleaned. */
    tilesCleaned: number;
    /** Tiles the participant coloured. */
    tilesColoured: number;
    /** Tiles the participant took from opponents. */
    tilesStolen: number;
    /** Tiles the participant locked. */
    tilesLocked: number;
    /** Tiles the participant coloured in an opponent's colour. */
    tilesColouredForOpponents: number;
}
/**
 * A team's result within a match.
 */
interface MatchTeam {
    /** The team identifier. */
    teamId: number;
    /** Whether the team won. */
    win: boolean;
    /** Points scored by the team. */
    teamScore: number;
    /** Where the team finished, `1` being first. */
    teamPlacement: number;
}
/**
 * The details of how a match was played.
 *
 * Timestamps are Unix milliseconds and durations are milliseconds.
 */
interface MatchInfo {
    /** When the match was created, as a Unix timestamp in milliseconds. */
    gameCreation: number;
    /** How long the match lasted, in milliseconds. */
    gameDuration: number;
    /** When the match ended, as a Unix timestamp in milliseconds. */
    gameEnd: number;
    /** The game mode, for example `"BOUNCER"`. */
    gameMode: string;
    /** The map the match was played on. */
    mapId: number;
    /** Whether the match counted towards ranking. */
    ranked: boolean;
    /** Per-player results. */
    participants: MatchParticipant[];
    /** Per-team results. */
    teams: MatchTeam[];
}
/**
 * A full match record.
 */
interface Match {
    /** Identifiers for the match and its participants. */
    metadata: MatchMetadata;
    /** How the match played out. */
    info: MatchInfo;
}
/**
 * Lifecycle state of a fishing derby.
 *
 * Other values may appear as the hotel evolves, so unknown strings are allowed
 * rather than rejected.
 */
type DerbyStatus = "ACTIVE" | "REGISTRATION" | "ENDED" | (string & {});
/**
 * Identifiers describing a fishing derby and who entered it.
 */
interface DerbyMetadata {
    /** The unique derby id. */
    derbyId: string;
    /** The Habbo unique ids of everyone entered. */
    participantAccountIds: string[];
}
/**
 * One player's running tally within a fishing derby.
 */
interface DerbyParticipant {
    /** The player's Habbo unique id. */
    accountId: string;
    /** How many fish the player has caught. */
    fishCaught: number;
    /** How many golden fish the player has caught. */
    goldenFishCaught: number;
    /** How many fish the player caught in private rooms. */
    privateFishCaught: number;
    /** When this tally last changed, as a Unix timestamp in milliseconds. */
    lastUpdated: number;
    /** The mode the player is competing in, for example `"standard"`. */
    derbyMode: string;
    /** Total weight of the player's catch in grams, in standard mode. */
    standardWeightGrams: number;
}
/**
 * How a fishing derby is scheduled and how its entrants are doing.
 *
 * All timestamps are Unix milliseconds.
 */
interface DerbyInfo {
    /** The derby's lifecycle state. */
    status: DerbyStatus;
    /** When the derby was created. */
    creationTime: number;
    /** When entry opened. */
    registrationStartTime: number;
    /** When entry closed. */
    registrationEndTime: number;
    /** When fishing started. */
    startTime: number;
    /** When fishing ends. */
    endTime: number;
    /** Every entrant and their current tally. */
    participants: DerbyParticipant[];
}
/**
 * A full fishing derby record.
 */
interface Derby {
    /** Identifiers for the derby and its entrants. */
    metadata: DerbyMetadata;
    /** Scheduling and standings. */
    info: DerbyInfo;
}
/**
 * The current state of the hotel's fishing derby.
 *
 * `derby` is absent when no derby is running.
 */
interface DerbyStatusResponse {
    /** The overall state, mirroring `derby.info.status` when one is running. */
    status: DerbyStatus;
    /** The derby currently in progress, when there is one. */
    derby?: Derby;
}

/**
 * The `origins` resource: minigame match history, the fishing derby, skill
 * progression, and player id resolution.
 *
 * These endpoints are served by the Habbo Origins hotel, so the client must be
 * configured with `hotel: "origins"`. Pointing them at a regular hotel returns
 * `404`, since only Origins exposes these routes.
 *
 * They need no authentication, though the fishing derby routes accept an
 * optional `api_key`, configured once on the client as `originsApiKey`.
 */

/**
 * Reads Habbo Origins minigame data: matches, fishing derbies, and skills.
 *
 * Access it through `habbo.origins`.
 *
 * @example
 * ```ts
 * const habbo = new HabboClient({ hotel: "origins" });
 * const skill = await habbo.origins.getSkill(playerId, "FISHING");
 * ```
 */
declare class OriginsResource {
    private readonly http;
    private readonly config;
    constructor(http: HttpClient, config: ResolvedConfig);
    private url;
    /** Maps the shared history filters onto the query names the API expects. */
    private historyQuery;
    /** Adds the configured Origins API key to a query when one is set. */
    private withApiKey;
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
    getHabboIds(uniquePlayerId: string): Promise<string[]>;
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
    listMatchIds(uniquePlayerId: string, query?: HistoryQuery): Promise<string[]>;
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
    getMatch(uniqueMatchId: string): Promise<Match>;
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
    iterateMatchIds(uniquePlayerId: string, query?: HistoryQuery): AsyncGenerator<string, void, undefined>;
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
    listDerbyIds(uniquePlayerId: string, query?: HistoryQuery): Promise<string[]>;
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
    getDerby(uniqueDerbyId: string): Promise<Derby>;
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
    getDerbyStatus(): Promise<DerbyStatusResponse>;
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
    getSkill(uniquePlayerId: string, skillType?: SkillType): Promise<PlayerSkill>;
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
    getSkillLeaderboard(skillType?: SkillType, page?: number): Promise<SkillLeaderboard>;
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
    iterateSkillLeaderboard(skillType?: SkillType): AsyncGenerator<SkillLeaderboard["entries"][number], void, undefined>;
}

/**
 * Type definitions for the public Habbo API (`profiles` resource).
 *
 * Field names and shapes mirror the JSON returned by the public endpoints under
 * `https://www.habbo.<hotel>/api/public`. Timestamps are exposed as raw ISO 8601
 * strings exactly as returned by the API; callers may convert them to `Date`
 * instances as needed.
 */
/**
 * A badge displayed on a Habbo profile.
 */
interface Badge {
    /** Zero-based position of the badge within the user's selection, when applicable. */
    badgeIndex?: number;
    /** The badge's unique code, used to build its image URL. */
    code: string;
    /** Human-readable badge name. */
    name: string;
    /** Human-readable badge description. */
    description: string;
}
/**
 * A Habbo user, as returned by the user and friend list endpoints.
 *
 * Many fields are only present on the full user endpoint and are therefore
 * optional; friend list entries expose a reduced subset.
 */
interface Habbo {
    /** Stable unique identifier, prefixed with the hotel code, e.g. `"hhes-..."`. */
    uniqueId: string;
    /** The user's display name. */
    name: string;
    /** The user's motto. */
    motto: string;
    /** The figure (avatar) string used to render the user. */
    figureString: string;
    /** ISO 8601 timestamp of when the account was created, when available. */
    memberSince?: string;
    /** ISO 8601 timestamp of the user's last login, when available. */
    lastAccessTime?: string;
    /** Whether the user is currently online, when reported. */
    online?: boolean;
    /** Whether the user's profile (home) is publicly visible. */
    profileVisible?: boolean;
    /**
     * Badges the user has chosen to display, each carrying its `badgeIndex`
     * position within the selection.
     */
    selectedBadges?: Badge[];
    /** The user's current level, when reported. */
    currentLevel?: number;
    /** Percentage progress towards the next level, when reported. */
    currentLevelCompletePercent?: number;
    /** Total accumulated experience, when reported. */
    totalExperience?: number;
    /** StarGem balance, when reported. */
    starGemCount?: number;
}
/**
 * A Habbo group as it appears in a user's profile.
 */
interface Group {
    /** Unique group identifier, e.g. `"g-hhes-..."`. */
    id: string;
    /** Group name. */
    name: string;
    /** Group description. */
    description: string;
    /** Group type, e.g. `"NORMAL"`. */
    type: string;
    /** Code used to render the group's badge, when available. */
    badgeCode?: string;
    /** Identifier of the group's room, when available. */
    roomId?: string;
    /** Primary badge colour as a hex string without the leading `#`. */
    primaryColour?: string;
    /** Secondary badge colour as a hex string without the leading `#`. */
    secondaryColour?: string;
    /** Whether the requesting context is an administrator of the group. */
    isAdmin?: boolean;
    /** Whether the group's room is currently online, when reported. */
    online?: boolean;
}
/**
 * A room owned by a user, as returned by the profile and room endpoints.
 */
interface Room {
    /** Legacy numeric room identifier. */
    id: number;
    /** Stable unique room identifier. */
    uniqueId: string;
    /** Room name. */
    name: string;
    /** Room description. `null` when the owner left it blank. */
    description: string | null;
    /** Maximum number of simultaneous visitors. */
    maximumVisitors: number;
    /** Free-form tags assigned to the room. */
    tags: string[];
    /** Whether the owner's name is shown publicly. */
    showOwnerName: boolean;
    /** Display name of the room owner. */
    ownerName: string;
    /** Unique identifier of the room owner. */
    ownerUniqueId: string;
    /** Category identifiers the room belongs to. */
    categories: string[];
    /** URL of the room's thumbnail image. */
    thumbnailUrl: string;
    /** URL of the room's full image. */
    imageUrl: string;
    /** Aggregate room rating. */
    rating: number;
    /** ISO 8601 timestamp of room creation, when available. */
    creationTime?: string;
    /** Associated group identifier, when the room belongs to a group. */
    habboGroupId?: string;
}
/**
 * The aggregated public profile returned by the `/profile` endpoint.
 *
 * The user sits under {@link Profile.user}, with their friends, groups, rooms,
 * and badges alongside it.
 */
interface Profile {
    /** The profile owner. */
    user: Habbo;
    /** The user's public friends. */
    friends: Habbo[];
    /** The groups the user belongs to. */
    groups: Group[];
    /** The user's public rooms. */
    rooms: Room[];
    /** Badges the user has earned. */
    badges: Badge[];
}
/**
 * A member of a group, as returned by the group members endpoint.
 *
 * This endpoint names the avatar field `habboFigure` rather than
 * `figureString`, and adds `gender` and `isAdmin`.
 */
interface GroupMember {
    /** The member's unique identifier. */
    uniqueId: string;
    /** The member's display name. */
    name: string;
    /** The member's motto. */
    motto: string;
    /** The figure (avatar) string used to render the member. */
    habboFigure: string;
    /** The member's gender, e.g. `"M"` or `"F"`. */
    gender?: string;
    /** ISO 8601 timestamp of when the member joined the group. */
    memberSince?: string;
    /** Whether the member is currently online. */
    online?: boolean;
    /** Whether the member administrates the group. */
    isAdmin?: boolean;
}
/**
 * A public photo taken by a user.
 *
 * The `time` field is a Unix timestamp in milliseconds, as delivered by the
 * `extradata` photo endpoints.
 */
interface Photo {
    /** Unique photo identifier. */
    id: string;
    /** URL of the photo preview image. */
    previewUrl: string;
    /** URL of the full photo image. */
    url: string;
    /** Photo type discriminator reported by the API. */
    type: string;
    /** Free-form tags applied to the photo. */
    tags: string[];
    /** Capture time as a Unix timestamp in milliseconds. */
    time: number;
    /** Unique identifier of the creator. */
    creator_uniqueId: string;
    /** Display name of the creator. */
    creator_name: string;
    /** Legacy numeric identifier of the creator. */
    creator_id: number;
    /** Identifier of the room the photo was taken in. */
    room_id: number;
    /** Identifiers of users who liked the photo. */
    likes: string[];
}
/**
 * The definition of an achievement.
 */
interface AchievementDefinition {
    /** Achievement identifier. */
    id: number;
    /** Achievement name. */
    name: string;
    /** Achievement category, e.g. `"identity"`. */
    category: string;
    /** Lifecycle state, e.g. `"ENABLED"`. */
    state?: string;
    /** Creation date, formatted `YYYY-MM-DD`. */
    creationTime?: string;
}
/**
 * The score needed to reach one level of an achievement.
 */
interface AchievementLevelRequirement {
    /** The level being described. */
    level: number;
    /** The score required to reach it. */
    requiredScore: number;
}
/**
 * An achievement together with its level thresholds, and, when read for a
 * specific user, that user's progress.
 */
interface Achievement {
    /** The achievement definition. */
    achievement: AchievementDefinition;
    /** The score required at each level, when reported. */
    levelRequirements?: AchievementLevelRequirement[];
    /** The level the user has reached, when reported. */
    level?: number;
    /** The score the user has accrued, when reported. */
    score?: number;
}
/**
 * Summary information about a badge and how many users hold it.
 */
interface BadgeOwners {
    /** How many users own the badge. */
    ownerCount: number;
    /** The badge name. */
    name: string;
    /** The badge description. */
    description: string;
}
/**
 * The furni to look up in a marketplace stats request.
 *
 * Provide floor items under `roomItems` and wall items under `wallItems`; each
 * entry names one furni.
 */
interface MarketplaceStatsQuery {
    /** Floor items to look up. */
    roomItems?: Array<{
        item: string;
    }>;
    /** Wall items to look up. */
    wallItems?: Array<{
        item: string;
    }>;
}
/**
 * One historical data point of a furni's marketplace activity.
 *
 * The API returns these fields as strings, including the numeric ones.
 */
interface MarketplaceHistoryPoint {
    /** Days before `statsDate` this point describes, e.g. `"-1"`. */
    dayOffset: string;
    /** Average price on that day. */
    averagePrice: string;
    /** How many items sold on that day. */
    totalSoldItems: string;
    /** Total credits exchanged on that day. */
    totalCreditSum: string;
    /** How many offers were open on that day. */
    totalOpenOffers: string;
}
/**
 * Marketplace statistics for a single furni.
 */
interface MarketplaceItemStats {
    /** The furni these stats describe. */
    item: string;
    /** The date the stats were computed, formatted `YYYY-MM-DD`. */
    statsDate: string;
    /** Day-by-day history leading up to `statsDate`. */
    history: MarketplaceHistoryPoint[];
    /** How many were sold over the reporting window. */
    soldItemCount: number;
    /** Total credits exchanged over the window. */
    creditSum: number;
    /** Average price over the window. */
    averagePrice: number;
    /** Total offers opened over the window. */
    totalOpenOffers: number;
    /** How many offers are open right now. */
    currentOpenOffers: number;
    /** The lowest price among the currently open offers. */
    currentPrice: number;
    /** How many days of history the API retains. */
    historyLimitInDays: number;
}
/**
 * The response of the batch marketplace stats endpoint.
 */
interface MarketplaceStats {
    /** Request status, e.g. `"OK"`. */
    status: string;
    /** Stats for the requested floor items. */
    roomItemData: MarketplaceItemStats[];
    /** Stats for the requested wall items. */
    wallItemData: MarketplaceItemStats[];
}

/**
 * The `profiles` resource: a read-only wrapper over the public Habbo API.
 *
 * None of these endpoints require authentication. Every method targets
 * `https://www.habbo.<hotel>/api/public` (or the configured `publicBaseUrl`).
 */

/**
 * Provides access to public Habbo user data: users, profiles, friends, groups,
 * rooms, badges, photos, and achievements.
 */
declare class ProfilesResource {
    private readonly http;
    private readonly config;
    constructor(http: HttpClient, config: ResolvedConfig);
    private base;
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
    get(name: string): Promise<Habbo>;
    /**
     * Fetches a user by their stable unique identifier.
     *
     * @param uniqueId - The user's unique identifier (e.g. `"hhes-..."`).
     * @returns The matching {@link Habbo}.
     */
    getById(uniqueId: string): Promise<Habbo>;
    /**
     * Fetches a user's aggregated public profile, including their friends,
     * groups, rooms, and badges.
     *
     * @param uniqueId - The user's unique identifier.
     * @returns The aggregated {@link Profile}.
     */
    getProfile(uniqueId: string): Promise<Profile>;
    /**
     * Fetches a user's badges.
     *
     * @param uniqueId - The user's unique identifier.
     */
    getBadges(uniqueId: string): Promise<Badge[]>;
    /**
     * Fetches a user's public friends.
     *
     * @param uniqueId - The user's unique identifier.
     */
    getFriends(uniqueId: string): Promise<Habbo[]>;
    /**
     * Fetches the groups a user belongs to.
     *
     * @param uniqueId - The user's unique identifier.
     */
    getGroups(uniqueId: string): Promise<Group[]>;
    /**
     * Fetches a user's public rooms.
     *
     * @param uniqueId - The user's unique identifier.
     */
    getRooms(uniqueId: string): Promise<Room[]>;
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
    getPhotos(uniqueId?: string): Promise<Photo[]>;
    /**
     * Fetches a user's achievements.
     *
     * @param uniqueId - The user's unique identifier.
     */
    getAchievements(uniqueId: string): Promise<Achievement[]>;
    /**
     * Fetches the full catalogue of achievements defined by the hotel.
     */
    getAllAchievements(): Promise<Achievement[]>;
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
    getBadgeOwners(badgeCode: string): Promise<BadgeOwners>;
    /**
     * Fetches a room by its identifier.
     *
     * @param roomId - The numeric room identifier (the `id` field of a
     *   {@link Room}, not its `uniqueId`).
     */
    getRoom(roomId: string | number): Promise<Room>;
    /**
     * Fetches the current list of hot looks (popular avatar figures).
     *
     * This endpoint returns XML rather than JSON; the raw XML document is returned
     * as a string for the caller to parse.
     */
    getHotLooks(): Promise<string>;
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
    getMarketplaceStats(query: MarketplaceStatsQuery): Promise<MarketplaceStats>;
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
    ping(): Promise<void>;
    /**
     * Fetches a group by its identifier.
     *
     * @param groupId - The unique group identifier.
     */
    getGroup(groupId: string): Promise<Group>;
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
    getGroupMembers(groupId: string): Promise<GroupMember[]>;
}

/**
 * The {@link HabboClient} entry point: the hotel's public API and the
 * factory of its wired rooms.
 */

/**
 * Reads the public, unauthenticated Habbo API and creates the room-bound
 * Wired clients of its hotel.
 *
 * The transport (hotel, fetch, timeouts) is configured once here and
 * shared with every {@link RoomInstance} this client creates; the Wired
 * keys never live on the client, only on the rooms.
 *
 * @example
 * ```ts
 * import { HabboClient } from "habbo-sdk";
 *
 * const habbo = new HabboClient({ hotel: "es" });
 * const user = await habbo.profiles.get("Cebolla1");
 *
 * const room = habbo.room({
 *   roomId: 796,
 *   readKey: process.env.WIRED_READ_KEY,
 *   writeKey: process.env.WIRED_WRITE_KEY,
 * });
 * ```
 */
declare class HabboClient {
    /**
     * The public Habbo API resource. Requires no authentication.
     */
    readonly profiles: ProfilesResource;
    /**
     * The Habbo Origins resource: minigame matches, the fishing derby, and
     * skill leaderboards. Requires no authentication, though the derby
     * endpoints accept an optional `originsApiKey`.
     */
    readonly origins: OriginsResource;
    private readonly http;
    private readonly resolved;
    /**
     * Creates a new client.
     *
     * @param config - The hotel and transport configuration.
     */
    constructor(config: HabboClientConfig);
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
    room(config: RoomInstanceConfig): RoomInstance;
}

/**
 * Error hierarchy for the Habbo SDK.
 *
 * Every failure surfaced by the SDK is an instance of {@link HabboError}, allowing
 * consumers to catch a single base type while still being able to narrow to a
 * specific subclass when finer-grained handling is required.
 */
/**
 * Base class for all errors thrown by the SDK.
 *
 * It carries the HTTP status code (when the error originated from a response) and
 * the raw response body, which is useful for diagnostics and logging.
 */
declare class HabboError extends Error {
    /**
     * The HTTP status code associated with the failure, or `undefined` when the
     * error was raised before a response was received (for example a network or
     * timeout error).
     */
    readonly status: number | undefined;
    /**
     * The raw, unparsed response body, when available.
     */
    readonly body: unknown;
    constructor(message: string, options?: {
        status?: number;
        body?: unknown;
        cause?: unknown;
    });
}
/**
 * Thrown when a requested resource (Habbo, group, room, variable, profile) does
 * not exist. Corresponds to HTTP `404` responses.
 */
declare class HabboNotFoundError extends HabboError {
}
/**
 * Thrown when the supplied user name is rejected by the public API as invalid.
 */
declare class UserInvalidError extends HabboError {
}
/**
 * Thrown when the hotel API is unavailable because it is undergoing maintenance.
 */
declare class MaintenanceError extends HabboError {
}
/**
 * Thrown when a Wired Variables request is rejected for authentication or
 * authorization reasons. Corresponds to HTTP `401` and `403` responses, most
 * commonly a missing or invalid `X-Wired-Write-Key`.
 */
declare class HabboAuthError extends HabboError {
}
/**
 * Thrown when the API responds with HTTP `429`, signalling that the client has
 * exceeded the allowed request rate.
 */
declare class HabboRateLimitError extends HabboError {
    /**
     * The value of the `Retry-After` response header in seconds, when provided by
     * the server.
     */
    readonly retryAfter: number | undefined;
    constructor(message: string, options?: {
        status?: number;
        body?: unknown;
        retryAfter?: number | undefined;
        cause?: unknown;
    });
}
/**
 * Thrown when a request fails to complete at the transport level, for example a
 * DNS failure, a dropped connection, or a client-side timeout.
 */
declare class HabboNetworkError extends HabboError {
}

/**
 * The contract every level-up calculator implements.
 *
 * All amounts are `bigint`, matching the signed 64-bit whole numbers the Wired
 * Variables API stores, so an XP value read straight from a variable can be
 * fed into these methods. Every implementation clamps its input through
 * {@link LevelUpperConfig.boundedValue} before calculating: negative XP counts
 * as `0n` and XP past the maximum counts as the maximum.
 */
interface LevelUpperConfig {
    /** The level reached at the given XP, starting at level `1`. */
    currentLevel(xp: bigint): bigint;
    /** The total XP the current level needs to advance to the next one; `0n` when maxed out. */
    totalXpRequired(xp: bigint): bigint;
    /** The XP already accumulated inside the current level. */
    progress(xp: bigint): bigint;
    /** The share of the current level completed, from `0n` to `100n`. */
    progressPercentage(xp: bigint): bigint;
    /** The XP still needed to reach the next level. */
    xpRemaining(xp: bigint): bigint;
    /** Whether the maximum level has been reached. */
    isMaxed(xp: bigint): boolean;
    /** The maximum achievable level. */
    maxLevel(): bigint;
    /** The XP at which the maximum level is reached. */
    maxXp(): bigint;
    /** Clamps an XP amount to the valid `0n..maxXp()` range. */
    boundedValue(xp: bigint): bigint;
}

/**
 * Shared behaviour for the level-up strategies.
 *
 * Implements {@link LevelUpperConfig.boundedValue} once, plus the
 * {@link BaseLevelUpper.floorPercent} helper used by every percentage
 * calculation, and declares the members each strategy must provide.
 */

declare abstract class BaseLevelUpper implements LevelUpperConfig {
    /**
     * Clamps an XP amount to the valid `0n..maxXp()` range.
     *
     * @param xp - The XP amount about to be measured.
     * @returns `0n` for negative input, `maxXp()` above the maximum, the input
     *   otherwise.
     */
    boundedValue(xp: bigint): bigint;
    /**
     * The completed share of a level as a whole percentage from `0n` to `100n`.
     *
     * @param part - The XP accumulated inside the level.
     * @param whole - The total XP the level requires.
     * @returns `Math.floor(part / whole * 100)` as a `bigint`.
     */
    protected floorPercent(part: bigint, whole: bigint): bigint;
    /** {@inheritDoc LevelUpperConfig.currentLevel} */
    abstract currentLevel(xp: bigint): bigint;
    /** {@inheritDoc LevelUpperConfig.totalXpRequired} */
    abstract totalXpRequired(xp: bigint): bigint;
    /** {@inheritDoc LevelUpperConfig.progress} */
    abstract progress(xp: bigint): bigint;
    /** {@inheritDoc LevelUpperConfig.progressPercentage} */
    abstract progressPercentage(xp: bigint): bigint;
    /** {@inheritDoc LevelUpperConfig.xpRemaining} */
    abstract xpRemaining(xp: bigint): bigint;
    /** {@inheritDoc LevelUpperConfig.isMaxed} */
    abstract isMaxed(xp: bigint): boolean;
    /** {@inheritDoc LevelUpperConfig.maxLevel} */
    abstract maxLevel(): bigint;
    /** {@inheritDoc LevelUpperConfig.maxXp} */
    abstract maxXp(): bigint;
}

/**
 * The level-up system calculator, mirroring the math of the room's
 * level-up add-on.
 *
 * Pick a profile with one of the static factories; every one returns a
 * {@link LevelUpperConfig} whose methods take and return `bigint`, so XP values read from
 * wired variables can be fed in directly.
 *
 * @example
 * ```ts
 * const levels = LevelUpper.linear(100n, 50n);
 * const level = levels.currentLevel(xp);
 * ```
 */

declare abstract class LevelUpper extends BaseLevelUpper {
    /**
     * Creates a linear profile, where every level costs the same XP.
     *
     * @param stepSize - The XP every level requires.
     * @param maxLevel - The highest achievable level.
     * @returns A {@link LevelUpperConfig} with evenly spaced levels.
     */
    static linear(stepSize: bigint, maxLevel: bigint): LevelUpperConfig;
    /**
     * Creates an interpolating profile from a handful of known levels.
     *
     * @param levelToXpMap - Known levels mapped to the XP each one starts at.
     * @returns A {@link LevelUpperConfig} that spreads the levels between the
     *   known points evenly.
     */
    static interpolate(levelToXpMap: Readonly<Record<number, bigint>>): LevelUpperConfig;
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
    static steps(xpPerLevel: readonly bigint[]): LevelUpperConfig;
    /**
     * Creates an exponential profile, where every level costs more than the
     * last.
     *
     * @param initialXp - The XP required to reach level `2` from level `1`.
     * @param strength - The per-level growth as a percentage.
     * @param maxLevel - The highest achievable level.
     * @returns A {@link LevelUpperConfig} with growing level costs.
     */
    static exponential(initialXp: bigint, strength: bigint, maxLevel: bigint): LevelUpperConfig;
}

export { type Achievement, type AchievementDefinition, type AchievementLevelRequirement, type AnyFurniProfile, type AnyUserProfile, type ApiFurniId, BATCH_MAX_OPERATIONS, type Badge, type BadgeOwners, BatchBuilder, type BatchExecutor, type BatchOperation, type BatchOperationBody, type BatchOperationError, type BatchOperationOptions, type BatchOperationResult, type BatchRequest, type BatchResults, type BotProfile, type BulkDeleteInput, type Derby, type DerbyInfo, type DerbyMetadata, type DerbyParticipant, type DerbyStatus, type DerbyStatusResponse, FURNI_ID_WRAP, type FetchLike, type FurniBcProfile, type FurniProfile, type FurniProfileFor, type FurniTargetKind, type GlobalProfile, type GlobalVariablesPatch, type Group, type GroupMember, type Habbo, HabboAuthError, HabboClient, type HabboClientConfig, HabboError, HabboNetworkError, HabboNotFoundError, HabboRateLimitError, type HistoryQuery, type Hotel, type ItemProfileTarget, LevelUpper, type LevelUpperConfig, type ListByKindOptions, MaintenanceError, type MarketplaceHistoryPoint, type MarketplaceItemStats, type MarketplaceStats, type MarketplaceStatsQuery, type Match, type MatchInfo, type MatchMetadata, type MatchParticipant, type MatchTeam, type NamedProfileTarget, OriginsResource, type PagedVariableItem, type PagedVariables, type PetProfile, type Photo, type PlayerSkill, type Profile, type ProfileTarget, ProfilesResource, type Room, type RoomId, RoomInstance, type RoomInstanceConfig, type RoomVariables, RoomVariablesProfileResource, RoomVariablesResource, type SkillLeaderboard, type SkillLeaderboardEntry, type SkillType, type TargetKind, type TargetKindFor, type TransportConfig, UserInvalidError, type UserProfile, type UserProfileFor, type UserProfileTarget, type UserTargetKind, type ValueWriteInput, type VariableCount, type VariableMap, type VariableScope, type VariableValue, type VariablesPatch, type VariablesProfile, type WallItemBcProfile, type WallItemProfile, type WiredErrorBody, type WiredErrorCode, type WiredVariable, assertVariableValue, fromApiFurniId, isBatchOperationSuccess, sanitizeFurniId, toApiFurniId };
