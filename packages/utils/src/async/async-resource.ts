import { UnsafeMutate } from "../types"
import { Deferred } from "./deferred"
import * as timers from "./timers"
import { Emitter } from "./emitter"
import { noop } from "../misc"

export interface AsyncResourceContext<T> {
    readonly current: T | null
    readonly currentFetchedAt: number
    readonly currentExpiresAt: number
    readonly isBackground: boolean
    readonly abort: AbortSignal | null
}

export interface AsyncResourceOptions<T> {
    autoReload?: boolean
    autoReloadAfter?: number
    /** @deprecated Use `autoReloadAfter`. */
    authReloadAfter?: number
    swr?: boolean
    swrValidator?: (ctx: AsyncResourceContext<T>) => boolean
    fetcher: (ctx: AsyncResourceContext<T>) => Promise<{ data: T; expiresIn: number }>
    onError?: (err: unknown, ctx: AsyncResourceContext<T>) => void
}

export class AsyncResource<T> {
    readonly onUpdated: Emitter<AsyncResourceContext<T>> = new Emitter()

    protected _abort?: AbortController
    protected _ctx: UnsafeMutate<AsyncResourceContext<T>>
    protected _updating?: Deferred<void>
    protected _timeout?: timers.Timer
    protected _destroyed = false

    constructor(readonly options: AsyncResourceOptions<T>) {
        this._ctx = {
            current: null,
            currentFetchedAt: 0,
            currentExpiresAt: 0,
            isBackground: false,
            abort: null,
        }
    }

    get isStale(): boolean {
        return this._ctx.current === null || this._ctx.currentExpiresAt <= performance.now()
    }

    setData(data: T, expiresIn: number): void {
        if (this._destroyed) return

        let now = performance.now()
        this._ctx.current = data
        this._ctx.currentExpiresAt = now + expiresIn
        this._ctx.currentFetchedAt = now
        this.onUpdated.emit(this._ctx)

        if (this.options.autoReload) {
            this._clearTimer()
            let delay = expiresIn + (this.options.autoReloadAfter ?? this.options.authReloadAfter ?? 0)
            this._timeout = timers.setTimeout(() => {
                if (this._destroyed) return
                this._ctx.isBackground = true
                this.update(true).catch(noop)
            }, delay)
        }
    }

    async update(force = false): Promise<void> {
        if (this._destroyed) return
        if (this._updating) {
            await this._updating.promise
            return
        }

        if (!force && !this.isStale) return

        this._abort?.abort()
        this._abort = new AbortController()
        this._ctx.abort = this._abort.signal

        this._updating = new Deferred()

        let result
        try {
            result = await this.options.fetcher(this._ctx)
        } catch (err: unknown) {
            if (err instanceof Error && err.name === "AbortError") {
                this._updating?.resolve()
                this._updating = undefined
                this._ctx.abort = null
                return
            }

            if (this.options.onError) this.options.onError(err, this._ctx)
            else console.error(err)

            this._updating?.resolve()
            this._updating = undefined
            this._ctx.abort = null
            return
        }

        this._updating?.resolve()
        this._updating = undefined
        this._ctx.abort = null

        if (!this._destroyed) {
            this.setData(result.data, result.expiresIn)
        }
    }

    async get(): Promise<T | null> {
        if (this._destroyed) return null

        if (this.options.swr === true && this._ctx.current !== null) {
            let validator = this.options.swrValidator
            if (!validator || validator(this._ctx)) {
                this._ctx.isBackground = true
                this.update(true).catch(noop)
                return this._ctx.current
            }
        }

        this._ctx.isBackground = false
        await this.update()
        return this._ctx.current
    }

    getCached(): T | null {
        return this._ctx.current
    }

    destroy(): void {
        if (this._destroyed) return
        this._destroyed = true

        this._clearTimer()
        this._abort?.abort()
        this.onUpdated.clear()

        this._updating?.resolve()
        this._updating = undefined
    }

    protected _clearTimer(): void {
        if (this._timeout) {
            timers.clearTimeout(this._timeout)
            this._timeout = undefined
        }
    }
}
