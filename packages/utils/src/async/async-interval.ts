import * as timers from "./timers"
import { noop } from "../misc"

export class AsyncInterval {
    #handler: (abortSignal: AbortSignal) => Promise<void>
    #interval: number
    #timer?: timers.Timer
    #onError: (err: unknown) => void = noop
    #stopped = true
    #abortController = new AbortController()

    constructor(handler: (abortSignal: AbortSignal) => Promise<void>, interval: number) {
        this.#handler = handler
        this.#interval = interval
    }

    start(after: number = this.#interval): void {
        this.stop()
        this.#stopped = false
        this.#timer = timers.setTimeout(this.#onTimeout, after)
    }

    startNow(): void {
        this.stop()
        this.#stopped = false
        this.#onTimeout()
    }

    stop(): void {
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

    #onTimeout = () => {
        this.#timer = undefined
        void (async () => {
            try {
                await this.#handler(this.#abortController.signal)
            } catch (err) {
                this.#onError(err)
            }

            if (this.#stopped) return
            this.#timer = timers.setTimeout(this.#onTimeout, this.#interval)
        })()
    }
}
