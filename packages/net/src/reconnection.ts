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
    #state: UnsafeMutate<ReconnectionState> = {
        previousWait: null,
        lastError: null,
        consequentFails: 0,
    }

    #connect: (address: CA) => Promise<C>
    #lastAddress?: CA
    #connection?: C
    #connecting = false
    #strategy: ReconnectionStrategy
    #onError
    #sleep?: Deferred<boolean>
    #closed?: Deferred<void>

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
        this.#strategy = options.strategy ?? defaultReconnectionStrategy
        this.#connect = options.connect
        this.#onError = options.onError ?? defaultOnErrorAction
    }

    get isConnected(): boolean {
        return this.#connection !== undefined
    }

    get isConnecting(): boolean {
        return this.#connection === undefined && this.#connecting
    }

    get isWaiting(): boolean {
        return this.#connection === undefined && this.#lastAddress !== undefined && !this.#connecting
    }

    get connection(): C | null {
        return this.#connection || null
    }

    get state(): ReconnectionState {
        return this.#state
    }

    connect(address: CA): void {
        if (this.#lastAddress !== undefined && this.#lastAddress !== address)
            throw new Error("Connection is already open to another address.")
        this.#closed = undefined
        this.#lastAddress = address
        void this.#loop()
    }

    reconnect(force: boolean): void {
        if (this.#sleep) this.#sleep.resolve(false)
        else if (this.#connection && force) this.#connection.close()
    }

    async close(): Promise<void> {
        if (this.#closed) return this.#closed.promise
        if (this.#lastAddress == null) return

        this.#closed = new Deferred()
        if (this.#sleep) this.#sleep.resolve(false)
        else if (this.#connection) this.#connection.close()

        return this.#closed.promise
    }

    async changeTransport(connect: (address: CA) => Promise<C>): Promise<void> {
        this.#connect = connect
        let addr = this.#lastAddress
        await this.close()
        if (addr != null) this.connect(addr)
    }

    #resetState(): void {
        this.#state.previousWait = null
        this.#state.lastError = null
        this.#state.consequentFails = 0
        this.#connecting = false
    }

    async #loop(): Promise<void> {
        while (true) {
            if (this.#closed) {
                this.#closed.resolve()
                break
            }

            try {
                this.#connecting = true
                this.#connection = await this.#connect(this.#lastAddress!)

                if (this.#closed) (this.#closed as any).resolve()

                this.#resetState()
                await this.options.onOpen?.(this.#connection)

                this.#connection?.close()
                this.#connection = undefined
                break
            } catch (err) {
                let oldConnection = this.#connection
                this.#connection = undefined
                await this.options.onClose?.()

                if (this.#closed) (this.#closed as any).resolve()

                let action = await this.#onError(err as Error, oldConnection ?? null, this.#state)
                if (action === "close") break

                let wait = action === "reconnect-now" ? 0 : this.#strategy(this.#state)
                if (wait === false) break

                this.options.onWait?.(wait)

                if (wait > 0) {
                    this.#sleep = new Deferred<boolean>()
                    let timer = timers.setTimeout(() => this.#sleep!.resolve(true), wait)

                    let sleepResult = await this.#sleep.promise
                    this.#sleep = undefined

                    if (!sleepResult) {
                        timers.clearTimeout(timer)
                        if (this.#closed) (this.#closed as any).resolve()
                        continue
                    }
                }

                this.#state.previousWait = wait
                this.#state.consequentFails++
                this.#state.lastError = err as Error
            }
        }

        this.#lastAddress = undefined
        this.#resetState()
    }
}
