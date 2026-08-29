import {NoneToVoidFunction} from "../types"
import {Deque} from "../structures"

type LockInfo = [Promise<void>, NoneToVoidFunction]

export class AsyncLock {
    protected _queue: Deque<LockInfo> = new Deque<LockInfo>()

    async acquire(): Promise<void> {
        let unlock!: NoneToVoidFunction
        let promise = new Promise<void>((resolve) => {
            unlock = resolve
        })
        let prev = this._queue.peekBack()
        this._queue.pushBack([promise, unlock])
        if (prev) await prev[0]
    }

    release(): void {
        let front = this._queue.popFront()
        if (!front) {
            throw new Error("Nothing to release.", {cause: this._queue})
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
