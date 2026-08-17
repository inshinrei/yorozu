import * as timers from "./timers"
import { noop } from "../misc"

export class AsyncInterval {
    protected _handler: (abortSignal: AbortSignal) => Promise<void>
    protected _interval: number
    protected _timer?: timers.Timer
    protected _onError: (err: unknown) => void = noop
    protected _stopped = true
    protected _generation = 0
    protected _abortController: AbortController = new AbortController()

    constructor(handler: (abortSignal: AbortSignal) => Promise<void>, interval: number) {
        this._handler = handler
        this._interval = interval
    }

    start(after: number = this._interval): void {
        this.stop()
        this._stopped = false
        let generation = this._generation
        this._timer = timers.setTimeout(() => this._onTimeout(generation), after)
    }

    startNow(): void {
        this.stop()
        this._stopped = false
        this._onTimeout(this._generation)
    }

    stop(): void {
        this._generation++
        this._abortController.abort()
        this._abortController = new AbortController()
        if (this._timer != null) {
            timers.clearTimeout(this._timer)
            this._timer = undefined
        }
        this._stopped = true
    }

    onError(handler: (err: unknown) => void): void {
        this._onError = handler
    }

    protected _onTimeout = (generation: number): void => {
        this._timer = undefined
        void (async () => {
            try {
                await this._handler(this._abortController.signal)
            } catch (err) {
                this._onError(err)
            }

            if (this._stopped || generation !== this._generation) return
            this._timer = timers.setTimeout(() => this._onTimeout(generation), this._interval)
        })()
    }
}
