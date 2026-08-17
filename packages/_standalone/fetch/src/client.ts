import { composeMiddlewares, unknownToError, UnsafeMutate, utf8 } from "@yorozu/utils"
import type {
    CombineAddons,
    FetchAddon,
    FetchAddonCtx,
    FetchBaseOptions,
    FetchClient,
    FetchLike,
    FetchOptions,
    FetchResult,
} from "./types"
import { HttpError } from "./types"

export type {
    CombineAddons,
    FetchAddon,
    FetchAddonCtx,
    FetchBaseOptions,
    FetchClient,
    FetchLike,
    FetchMiddleware,
    FetchOptions,
    FetchResult,
    FetchResultInternals,
} from "./types"
export { HttpError } from "./types"

let OctetStreamContentType = "application/octet-stream"

function headersToObject(headers?: HeadersInit): Record<string, string> {
    if (!headers) return {}
    if (Array.isArray(headers) || headers instanceof Headers) return Object.fromEntries(headers)
    if (Symbol.iterator in headers) {
        return Object.fromEntries(headers as Iterable<Array<string>>)
    }
    return headers
}

class FetchResultImpl implements FetchResult {
    #fetch: FetchLike
    private readonly _url: string
    private readonly _init: RequestInit
    private _options: FetchOptions
    private _headers?: Record<string, string>
    #stack?: string

    constructor(
        fetch: FetchLike,
        url: string,
        init: RequestInit,
        headers: Record<string, string> | undefined,
        options: FetchOptions,
        stack?: string,
    ) {
        this.#fetch = fetch
        this._init = init
        this._url = url
        this._options = options
        this._headers = headers
        this.#stack = stack
    }

    get [Symbol.toStringTag](): string {
        return "FetchResult"
    }

    then<TResult1 = Response, TResult2 = never>(
        onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
    ): Promise<TResult1 | TResult2> {
        return this.raw().then(onfulfilled, onrejected)
    }

    catch<TResult = never>(
        onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
    ): Promise<Response | TResult> {
        return this.raw().catch(onrejected)
    }

    finally(onfinally?: (() => void) | undefined | null): Promise<Response> {
        return this.raw().finally(onfinally)
    }

    async raw(): Promise<Response> {
        if (this.#stack == null) return this.#fetchAndValidate()

        try {
            return await this.#fetchAndValidate()
        } catch (err_) {
            let err = unknownToError(err_)
            let origMessage = err.message
            let origStack = err.stack
            let stack = this.#stack!.split("\n").slice(2).join("\n")
            err.stack = `${err.name}: ${err.message}\n${stack}`
            err.cause = { message: origMessage, stack: origStack, cause: err.cause }
            throw err
        }
    }

    async stream(): Promise<ReadableStream<Uint8Array>> {
        let res = await this.raw()
        if (res.body == null) throw new Error("Response body is null")
        return res.body
    }

    async json<T>(): Promise<T> {
        this._headers ??= {}
        this._headers.Accept ??= "application/json"
        let res = await this.raw()
        return res.json() as Promise<T>
    }

    async text(): Promise<string> {
        let res = await this.raw()
        return res.text()
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
        this._headers ??= {}
        this._headers.Accept ??= OctetStreamContentType
        let res = await this.raw()
        return res.arrayBuffer()
    }

    async bytes(): Promise<Uint8Array> {
        return new Uint8Array(await this.arrayBuffer())
    }

    async blob(): Promise<Blob> {
        this._headers ??= {}
        this._headers.Accept ??= OctetStreamContentType
        let res = await this.raw()
        return res.blob()
    }

    async #fetchAndValidate(): Promise<Response> {
        let res = await this.#fetch(new Request(this._url, this._init))

        let err: HttpError | null = null
        if (this._options.validateResponse === undefined || this._options.validateResponse !== false) {
            if (typeof this._options.validateResponse === "function") {
                if (!(await this._options.validateResponse(res))) {
                    err = new HttpError(res)
                }
            } else if (!res.ok) {
                err = new HttpError(res)
            }
        }

        if (err != null) {
            if (this._options.readBodyOnError !== false) {
                try {
                    ;(err as UnsafeMutate<HttpError>).body = new Uint8Array(await res.arrayBuffer())
                    ;(err as UnsafeMutate<HttpError>).bodyText = utf8.decoder.decode(err.body!)
                } catch {}
            }

            if (this._options.mapError != null) throw this._options.mapError(err)
            throw err
        }

        return res
    }
}

function _wrapMethod<T extends FetchClient<any, any>>(method: string, fn: T): T {
    return ((url: string, options: FetchOptions) => {
        return fn(url, { ...options, method }) as FetchResult
    }) as T
}

/** create a new FetchClient with the given base options */
export function createFetch<
    const Addons extends FetchAddon<any, any>[],
    Combined extends {
        request: object
        response: object
    } = CombineAddons<Addons>,
>(
    baseOptions: FetchBaseOptions<Addons> & Combined["request"] = {},
): FetchClient<Combined["request"], Combined["response"]> {
    let captureStackTrace = baseOptions.captureStackTrace ?? true
    let baseFetch = baseOptions.fetch ?? globalThis.fetch?.bind(globalThis)
    let wrappedFetch =
        baseOptions.middlewares !== undefined && baseOptions.middlewares.length > 0
            ? composeMiddlewares(baseOptions.middlewares, baseFetch)
            : baseFetch
    let addons = baseOptions.addons ?? []

    let FetchResultInner
    if (addons.length) {
        FetchResultInner = class extends FetchResultImpl {}

        for (let i = 0; i < addons.length; i++) {
            let addon = addons[i]
            for (let key in addon.response) {
                ;(FetchResultInner.prototype as any)[key] = addon.response[key]
            }
        }
    } else {
        FetchResultInner = FetchResultImpl
    }

    let fn_ = (url: string, options: FetchOptions = {}) => {
        let stack: string | undefined
        if (captureStackTrace) {
            stack = new Error().stack
        }

        if (addons.length) {
            let ctx: FetchAddonCtx<any> = { url, options, baseOptions }

            for (let i = 0; i < addons.length; i++) {
                let addon = addons[i]
                addon.beforeRequest?.(ctx)
            }

            url = ctx.url
            options = ctx.options as FetchOptions
        }

        let fetcher = wrappedFetch
        if (options.middlewares !== undefined && options.middlewares.length > 0) {
            fetcher = composeMiddlewares(options.middlewares, wrappedFetch)
        }

        if ((baseOptions?.baseUrl != null || options.baseUrl != null) && !url.includes("://")) {
            let prepend = (options.baseUrl ?? baseOptions?.baseUrl)!
            if (prepend[prepend.length - 1] !== "/") prepend += "/"
            if (url[0] === "/") url = url.slice(1)
            url = prepend + url
        }

        let init: RequestInit
        let headers: Record<string, string>

        if (baseOptions != null) {
            init = { ...baseOptions.extra, ...options.extra }
            headers = { ...headersToObject(baseOptions.headers), ...headersToObject(options.headers) }
        } else {
            init = options.extra ?? {}
            headers = headersToObject(options.headers)
        }

        if (options.json !== undefined) {
            if (options.body != null) throw new Error("Cannot set both json and body.")
            init.body = JSON.stringify(options.json)
            init.method = options.method ?? "POST"
            headers["Content-Type"] ??= "application/json"
        } else {
            init.body = options.body as Exclude<typeof options.body, Uint8Array>
            init.method = options.method ?? baseOptions.method ?? "GET"
            if (init.body instanceof ReadableStream) {
                ;(init as any).duplex ??= "half"
            }
        }

        init.headers = headers
        options.validateResponse ??= baseOptions.validateResponse
        options.readBodyOnError ??= baseOptions.readBodyOnError
        options.mapError ??= baseOptions.mapError

        return new FetchResultInner(fetcher, url, init, headers, options, stack)
    }

    let fn = fn_ as unknown as FetchClient<Combined["request"], Combined["response"]>
    fn.get = _wrapMethod("GET", fn)
    fn.post = _wrapMethod("POST", fn)
    fn.put = _wrapMethod("PUT", fn)
    fn.delete = _wrapMethod("DELETE", fn)
    fn.patch = _wrapMethod("PATCH", fn)
    fn.head = _wrapMethod("HEAD", fn)
    fn.options = _wrapMethod("OPTIONS", fn)

    fn.extend = (otherOptions: FetchBaseOptions<any>) => {
        return createFetch<Addons, Combined>({
            ...baseOptions,
            ...otherOptions,
            addons: [...(baseOptions.addons ?? []), ...(otherOptions.addons ?? [])],
            middlewares: [...(baseOptions.middlewares ?? []), ...(otherOptions.middlewares ?? [])],
            headers: {
                ...headersToObject(baseOptions.headers),
                ...headersToObject(otherOptions.headers),
            },
        })
    }

    return fn
}
