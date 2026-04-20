import { NoneToVoidFunction } from "../types"
import { Deque } from "../structures"

type LockInfo = [Promise<void>, NoneToVoidFunction]

export class AsyncLock {
    private _queue = new Deque<LockInfo>()

    async acquire(): Promise<void> {
        let info
        while ((info = this._queue.peekFront())) {
            await info[0]
        }

        let unlock!: NoneToVoidFunction
        const promise = new Promise<void>((resolve) => {
            unlock = resolve
        })

        this._queue.pushBack([promise, unlock])
    }

    release(): void {
        const front = this._queue.popFront()
        if (!front) {
            throw new Error("Nothing to release.", { cause: this._queue })
        }
        front[1]()
    }

    with<T>(func: () => Promise<T>): Promise<T> {
        return (async () => {
            await this.acquire()
            try {
                return await func()
            } finally {
                this.release()
            }
        })()
    }
}
