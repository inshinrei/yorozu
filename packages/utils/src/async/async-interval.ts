import * as timers from "./timers"
import { noop } from "../misc"

export class AsyncInterval {
    #handler: (abortSignal: AbortSignal) => Promise<void>
    #interval: number
    #timer?: timers.Timer
    #onError: (err: unknown) => void = noop
    #stopped = true
    #generation = 0
    #abortController = new AbortController()

    constructor(handler: (abortSignal: AbortSignal) => Promise<void>, interval: number) {
        this.#handler = handler
        this.#interval = interval
    }

    start(after: number = this.#interval): void {
        this.stop()
        this.#stopped = false
        let generation = this.#generation
        this.#timer = timers.setTimeout(() => this.#onTimeout(generation), after)
    }

    startNow(): void {
        this.stop()
        this.#stopped = false
        this.#onTimeout(this.#generation)
    }

    stop(): void {
        this.#generation++
        this.#abortController.abort()
        this.#abortController = new AbortController()
        if (this.#timer != null) {
            timers.clearTimeout(this.#timer)
            this.#timer = undefined
        }
        this.#stopped = true
    }

    onError(handler: (err: unknown) => void): void {
        this.#onError = handler
    }

    #onTimeout = (generation: number) => {
        this.#timer = undefined
        void (async () => {
            try {
                await this.#handler(this.#abortController.signal)
            } catch (err) {
                this.#onError(err)
            }

            if (this.#stopped || generation !== this.#generation) return
            this.#timer = timers.setTimeout(() => this.#onTimeout(generation), this.#interval)
        })()
    }
}
