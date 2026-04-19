import { MaybePromise } from "../types"

export interface AsyncPoolOptions<T> {
    limit?: number
    signal?: AbortSignal
    onErrorStrategy?: (item: T, index: number, error: unknown) => MaybePromise<"ignore" | "collect" | "throw">
}

class ErrorInfo<T> {
    constructor(
        readonly item: T,
        readonly index: number,
        readonly error: unknown,
    ) {}
}

export class AggregateError<T> extends Error {
    constructor(readonly errors: Array<ErrorInfo<T>>) {
        super(`AggregateError: ${errors.length} errors`)
    }
}

export async function asyncPool<T>(
    iterable: Iterable<T> | AsyncIterable<T>,
    executor: (item: T, index: number) => MaybePromise<T | void>,
    options: AsyncPoolOptions<T> = {},
): Promise<void> {
    let { limit = 16, signal, onErrorStrategy } = options
    if (limit <= 0) throw new RangeError(`Pool limit must be a positive integer.`)
    if (signal?.aborted) throw signal.reason
    let iterator =
        (iterable as AsyncIterable<T>)[Symbol.asyncIterator]?.() ?? (iterable as Iterable<T>)[Symbol.iterator]?.()
    if (!iterator) throw new TypeError(`iterable must be iterable`)

    let idx = 0
    let errors: Array<ErrorInfo<T>> = []
    let abortController = new AbortController()
    let abortSignal = signal ? AbortSignal.any([signal, abortController.signal]) : abortController.signal

    async function worker() {
        while (true) {
            if (abortSignal.aborted) return
            let result: IteratorResult<T>
            try {
                result = await iterator.next()
            } catch (e) {
                abortController.abort(e)
                return
            }

            if (result.done) return
            if (abortSignal.aborted) return
            let item = result.value
            let thisIdx = idx++
            try {
                await executor(item, thisIdx)
            } catch (err) {
                let action = onErrorStrategy?.(item, thisIdx, err) ?? "throw"

                if (action instanceof Promise) {
                    action = await action
                }

                if (action === "ignore") continue

                if (action === "collect") {
                    errors.push(new ErrorInfo(item, thisIdx, err))
                    continue
                }

                abortController.abort(err)
                return
            }
        }
    }

    await Promise.all(Array.from({ length: limit }, worker))
    if (abortSignal.aborted) throw abortSignal.reason
    if (errors.length > 0) throw new AggregateError(errors)
}

export async function parallelMap<T, R>(
    iterable: Iterable<T> | AsyncIterable<T>,
    executor: (item: T, index: number) => MaybePromise<R>,
    options: AsyncPoolOptions<T> = {},
): Promise<Array<R>> {
    let result: Array<R> = []
    if (Array.isArray(iterable)) {
        result.length = iterable.length
    }

    await asyncPool(
        iterable,
        async (item: T, index: number) => {
            result[index] = await executor(item, index)
        },
        options,
    )

    return result
}
