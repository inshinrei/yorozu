import { ConnectionClosedError } from "./errors"
import { Closable } from "@yorozu/io"
import { Deferred, MaybePromise, timers, UnsafeMutate } from "@yorozu/utils"

interface ReconnectionState {
    readonly previousWait: number | null
    readonly consequentFails: number
    readonly lastError: Error | null
}

export type ReconnectionStrategy = (state: ReconnectionState) => number | false
export type OnErrorAction = "reconnect" | "reconnect-now" | "close"

export function defaultReconnectionStrategy({ previousWait }: ReconnectionState): number | false {
    if (previousWait === null) return 0
    if (previousWait === 0) return 1000
    if (previousWait >= 5000) return 5000
    return Math.min(5000, previousWait + 1000)
}

function defaultOnErrorAction(err: Error): OnErrorAction {
    return err instanceof ConnectionClosedError ? "reconnect" : "close"
}

export class PersistentConnection<CA, C extends Closable> {
    protected _state: UnsafeMutate<ReconnectionState> = {
        previousWait: null,
        lastError: null,
        consequentFails: 0,
    }

    protected _connect: (address: CA) => Promise<C>
    protected _lastAddress?: CA
    protected _connection?: C
    protected _connecting = false
    protected _strategy: ReconnectionStrategy
    protected _onError: (
        error: Error,
        connection: C | null,
        state: ReconnectionState,
    ) => MaybePromise<OnErrorAction>
    protected _sleep?: Deferred<boolean>
    protected _closed?: Deferred<void>

    constructor(
        readonly options: {
            connect: (address: CA) => Promise<C>
            strategy?: ReconnectionStrategy
            onOpen: (connection: C) => Promise<void>
            onClose?: () => MaybePromise<void>
            onWait?: (wait: number) => void
            onError?: (error: Error, connection: C | null, state: ReconnectionState) => MaybePromise<OnErrorAction>
        },
    ) {
        this._strategy = options.strategy ?? defaultReconnectionStrategy
        this._connect = options.connect
        this._onError = options.onError ?? defaultOnErrorAction
    }

    get isConnected(): boolean {
        return this._connection !== undefined
    }

    get isConnecting(): boolean {
        return this._connection === undefined && this._connecting
    }

    get isWaiting(): boolean {
        return this._connection === undefined && this._lastAddress !== undefined && !this._connecting
    }

    get connection(): C | null {
        return this._connection || null
    }

    get state(): ReconnectionState {
        return this._state
    }

    connect(address: CA): void {
        if (this._lastAddress !== undefined && this._lastAddress !== address)
            throw new Error("Connection is already open to another address.")
        this._closed = undefined
        this._lastAddress = address
        void this._loop()
    }

    reconnect(force: boolean): void {
        if (this._sleep) this._sleep.resolve(false)
        else if (this._connection && force) this._connection.close()
    }

    async close(): Promise<void> {
        if (this._closed) return this._closed.promise
        if (this._lastAddress == null) return

        this._closed = new Deferred()
        if (this._sleep) this._sleep.resolve(false)
        else if (this._connection) this._connection.close()

        return this._closed.promise
    }

    async changeTransport(connect: (address: CA) => Promise<C>): Promise<void> {
        this._connect = connect
        let addr = this._lastAddress
        await this.close()
        if (addr != null) this.connect(addr)
    }

    protected _resetState(): void {
        this._state.previousWait = null
        this._state.lastError = null
        this._state.consequentFails = 0
        this._connecting = false
    }

    protected async _loop(): Promise<void> {
        while (true) {
            if (this._closed) {
                this._closed.resolve()
                break
            }

            try {
                this._connecting = true
                this._connection = await this._connect(this._lastAddress!)

                if (this._closed) (this._closed as any).resolve()

                this._resetState()
                await this.options.onOpen?.(this._connection)

                this._connection?.close()
                this._connection = undefined
                break
            } catch (err) {
                let oldConnection = this._connection
                this._connection = undefined
                await this.options.onClose?.()

                if (this._closed) (this._closed as any).resolve()

                let action = await this._onError(err as Error, oldConnection ?? null, this._state)
                if (action === "close") break

                let wait = action === "reconnect-now" ? 0 : this._strategy(this._state)
                if (wait === false) break

                this.options.onWait?.(wait)

                if (wait > 0) {
                    this._sleep = new Deferred<boolean>()
                    let timer = timers.setTimeout(() => this._sleep!.resolve(true), wait)

                    let sleepResult = await this._sleep.promise
                    this._sleep = undefined

                    if (!sleepResult) {
                        timers.clearTimeout(timer)
                        if (this._closed) (this._closed as any).resolve()
                        continue
                    }
                }

                this._state.previousWait = wait
                this._state.consequentFails++
                this._state.lastError = err as Error
            }
        }

        this._lastAddress = undefined
        this._resetState()
    }
}
