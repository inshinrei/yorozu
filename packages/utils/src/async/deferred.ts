import { UnsafeMutate } from "../types"

export class Deferred<T = void> {
    readonly resolve!: (value: T) => void
    readonly reject!: (reason: unknown) => void
    readonly promise: Promise<T>

    constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            ;(this as UnsafeMutate<this>).resolve = resolve
            ;(this as UnsafeMutate<this>).reject = reject
        })
    }
}

export class DeferredTracked<T = void> {
    readonly promise: Promise<T>
    readonly status: { type: "pending" } | { type: "fulfilled"; value: T } | { type: "rejected"; reason: unknown }
    #resolve!: (value: T) => void
    #reject!: (reason: unknown) => void

    constructor() {
        this.status = { type: "pending" }
        this.promise = new Promise<T>((resolve, reject) => {
            this.#resolve = resolve
            this.#reject = reject
        })
    }

    get result(): T | undefined {
        if (this.status.type === "fulfilled") return this.status.value
        return undefined
    }

    get error(): unknown | undefined {
        if (this.status.type === "rejected") return this.status.reason
        return undefined
    }

    resolve(value: T): void {
        if (this.status.type !== "pending") return
        ;(this as UnsafeMutate<this>).status = { type: "fulfilled", value }
        this.#resolve(value)
    }

    reject(reason: unknown): void {
        if (this.status.type !== "pending") return
        ;(this as UnsafeMutate<this>).status = { type: "rejected", reason }
        this.#reject(reason)
    }
}
