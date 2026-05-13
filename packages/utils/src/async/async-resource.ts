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
    authReloadAfter?: number
    swr?: boolean
    swrValidator?: (ctx: AsyncResourceContext<T>) => boolean
    fetcher: (ctx: AsyncResourceContext<T>) => Promise<{ data: T; expiresIn: number }>
    onError?: (err: unknown, ctx: AsyncResourceContext<T>) => void
}

export class AsyncResource<T> {
    readonly onUpdated: Emitter<AsyncResourceContext<T>> = new Emitter()

    #abort?: AbortController
    #ctx: UnsafeMutate<AsyncResourceContext<T>>
    #updating?: Deferred<void>
    #timeout?: timers.Timer
    #destroyed = false

    constructor(readonly options: AsyncResourceOptions<T>) {
        this.#ctx = {
            current: null,
            currentFetchedAt: 0,
            currentExpiresAt: 0,
            isBackground: false,
            abort: null,
        }
    }

    get isStale(): boolean {
        return this.#ctx.current === null || this.#ctx.currentExpiresAt <= performance.now()
    }

    setData(data: T, expiresIn: number): void {
        if (this.#destroyed) return

        let now = performance.now()
        this.#ctx.current = data
        this.#ctx.currentExpiresAt = now + expiresIn
        this.#ctx.currentFetchedAt = now
        this.onUpdated.emit(this.#ctx)

        if (this.options.autoReload) {
            this.#clearTimer()
            let delay = expiresIn + (this.options.authReloadAfter ?? 0)
            this.#timeout = timers.setTimeout(() => {
                if (this.#destroyed) return
                this.#ctx.isBackground = true
                this.update(true).catch(noop)
            }, delay)
        }
    }

    async update(force = false): Promise<void> {
        if (this.#destroyed) return
        if (this.#updating) {
            await this.#updating.promise
            return
        }

        if (!force && !this.isStale) return

        this.#abort?.abort()
        this.#abort = new AbortController()
        this.#ctx.abort = this.#abort.signal

        this.#updating = new Deferred()

        let result
        try {
            result = await this.options.fetcher(this.#ctx)
        } catch (err: any) {
            if (err.name === "AbortError") {
                // Expected during destroy or race
                this.#updating.resolve()
                this.#updating = undefined
                this.#ctx.abort = null
                return
            }

            if (this.options.onError) this.options.onError(err, this.#ctx)
            else console.error(err)

            this.#updating.resolve()
            this.#updating = undefined
            this.#ctx.abort = null
            return
        }

        this.#updating.resolve()
        this.#updating = undefined
        this.#ctx.abort = null

        if (!this.#destroyed) {
            this.setData(result.data, result.expiresIn)
        }
    }

    async get(): Promise<T | null> {
        if (this.#destroyed) return null

        if (this.options.swr === true && this.#ctx.current !== null) {
            let validator = this.options.swrValidator
            if (!validator || validator(this.#ctx)) {
                this.#ctx.isBackground = true
                this.update(true).catch(noop)
                return this.#ctx.current
            }
        }

        this.#ctx.isBackground = false
        await this.update()
        return this.#ctx.current
    }

    getCached(): T | null {
        return this.#ctx.current
    }

    destroy(): void {
        if (this.#destroyed) return
        this.#destroyed = true

        this.#clearTimer()
        this.#abort?.abort()
        this.onUpdated.clear()

        if (this.#updating) {
            this.#updating.resolve()
            this.#updating = undefined
        }
    }

    #clearTimer(): void {
        if (this.#timeout) {
            timers.clearTimeout(this.#timeout)
            this.#timeout = undefined
        }
    }
}
