import type { MaybePromise, Middleware } from "@yorozu/utils"

export type FetchLike = (req: Request) => Promise<Response>
export type FetchMiddleware = Middleware<Request, Response>

export type CombineAddons<
    ResponseMixins extends FetchAddon<any, any>[],
    AccRequest = {},
    AccResponse = {},
> = ResponseMixins extends [
    FetchAddon<infer RequestMixin, infer ResponseMixin>,
    ...infer Rest extends FetchAddon<any, any>[],
]
    ? CombineAddons<Rest, AccRequest & RequestMixin, AccResponse & ResponseMixin>
    : {
          readonly request: AccRequest
          readonly response: AccResponse
      }

/** Context passed to each addon, in registration order. Mutating it is allowed. */
export interface FetchAddonCtx<RequestMixin extends object> {
    url: string
    options: FetchOptions & RequestMixin
    baseOptions: FetchOptions & RequestMixin
}

/** Internals exposed to response-mixin methods. */
export type FetchResultInternals<RequestMixin extends object> = FetchResult & {
    _url: string
    _init: RequestInit
    _options: FetchOptions & RequestMixin
    _headers?: Record<string, string>
}

export interface FetchAddon<RequestMixin extends object, ResponseMixin extends object> {
    /** called before each request; may mutate `ctx` */
    beforeRequest?: (ctx: FetchAddonCtx<RequestMixin>) => void
    /** mixin methods added to the response promise */
    response?: ResponseMixin
}

export interface FetchOptions {
    /**
     * http method
     * @default "GET"
     */
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS" | "CONNECT" | (string & {})

    /**
     * whether to throw HttpError on non-2xx responses.
     * a function should return whether the response is valid.
     * @default true
     */
    validateResponse?: false | ((res: Response) => MaybePromise<boolean>)

    /**
     * whether to read the body on HttpError.
     * @default true
     */
    readBodyOnError?: boolean

    /**
     * map HttpError to an app-level error.
     * `err.bodyText` is only set when `readBodyOnError` is true.
     */
    mapError?: (err: HttpError) => Error

    /**
     * always treated as a base path: the request path is appended
     * (unlike `new URL()`, which has slash-sensitive resolution)
     */
    baseUrl?: string
    body?: BodyInit | Uint8Array
    /** shorthand for a JSON body; mutually exclusive with `body` */
    json?: unknown
    headers?: HeadersInit
    middlewares?: Array<FetchMiddleware>
    extra?: RequestInit
}

export interface FetchBaseOptions<
    Addons extends FetchAddon<any, any>[] = FetchAddon<any, any>[],
> extends FetchOptions {
    fetch?: FetchLike
    addons?: Addons
    /**
     * capture a stack at call time and stitch it onto thrown errors.
     * @default true
     */
    captureStackTrace?: boolean
}

export interface FetchResult extends Promise<Response> {
    raw: () => Promise<Response>
    stream: () => Promise<ReadableStream<Uint8Array>>
    json: <T = unknown>() => Promise<T>
    text: () => Promise<string>
    arrayBuffer: () => Promise<ArrayBuffer>
    bytes: () => Promise<Uint8Array>
    blob: () => Promise<Blob>
}

/**
 * callable fetch client. the request options object may be mutated; do not rely on its immutability.
 */
export interface FetchClient<RequestMixin, ResponseMixin> {
    (url: string, params?: FetchOptions & RequestMixin): FetchResult & ResponseMixin
    get: (url: string, params?: FetchOptions & RequestMixin) => FetchResult & ResponseMixin
    post: (url: string, params?: FetchOptions & RequestMixin) => FetchResult & ResponseMixin
    put: (url: string, params?: FetchOptions & RequestMixin) => FetchResult & ResponseMixin
    delete: (url: string, params?: FetchOptions & RequestMixin) => FetchResult & ResponseMixin
    patch: (url: string, params?: FetchOptions & RequestMixin) => FetchResult & ResponseMixin
    head: (url: string, params?: FetchOptions & RequestMixin) => FetchResult & ResponseMixin
    options: (url: string, params?: FetchOptions & RequestMixin) => FetchResult & ResponseMixin
    /**
     * addons, middlewares and headers are merged; everything else is overridden.
     */
    extend: <
        const Addons extends FetchAddon<any, any>[],
        Combined extends { request: object; response: object } = CombineAddons<Addons>,
    >(
        baseOptions: FetchBaseOptions<Addons> & RequestMixin & Combined["request"],
    ) => FetchClient<RequestMixin & Combined["request"], ResponseMixin & Combined["response"]>
}

/** thrown when the response is not 2xx, or `validateResponse` returns false */
export class HttpError extends Error {
    readonly body: Uint8Array | null = null
    readonly bodyText: string | null = null

    constructor(readonly response: Response) {
        super(`HTTP Error ${response.status} ${response.statusText}`)
    }
}
