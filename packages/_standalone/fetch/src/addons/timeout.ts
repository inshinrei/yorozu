import { FetchAddonCtx, FetchAddon, FetchMiddleware } from "../types"
import { timers } from "@yorozu/utils"

export class TimeoutError extends Error {
    constructor(readonly timeout: number) {
        super(`Timeout exceeded: ${timeout}ms.`)
    }
}

export interface TimeoutAddon {
    /**
     * timeout for the request in ms
     *
     * pass `Infinity` or `0` to disable the default timeout from the base options
     *
     * when the timeout is reached, the request will be aborted
     * and the promise will be rejected with a TimeoutError
     */
    timeout?: number | ((ctx: FetchAddonCtx<TimeoutAddon>) => number)
}

function timeoutMiddleware(timeout: number): FetchMiddleware {
    return async (request, next) => {
        let controller = new AbortController()

        let timer = timers.setTimeout(() => {
            controller.abort(new TimeoutError(timeout))
        }, timeout)

        if (request.signal != null) {
            let signal = request.signal
            if (signal.aborted) {
                throw signal.reason
            }
            signal.addEventListener(
                "abort",
                () => {
                    controller.abort(signal.reason)
                    timers.clearTimeout(timer)
                },
                { once: true },
            )
        }

        request = new Request(request, {
            signal: controller.signal,
        })

        try {
            return await next(request)
        } finally {
            timers.clearTimeout(timer)
        }
    }
}

/**
 * addon that allows setting a timeout for the request.
 * when the timeout is reached, the request will be aborted
 * and the promise will be rejected with a TimeoutError
 *
 * **note**: it is important to put this addon as the last one,
 * otherwise other middlewares might be counted towards the timeout
 */
export function timeout(): FetchAddon<TimeoutAddon, object> {
    return {
        beforeRequest: (ctx) => {
            if (ctx.options.timeout != null || ctx.baseOptions.timeout != null) {
                let timeout = (ctx.options.timeout ?? ctx.baseOptions.timeout)!
                if (typeof timeout === "function") {
                    timeout = timeout(ctx)
                }

                if (timeout === Infinity || timeout <= 0) {
                    return
                }

                ctx.options.middlewares ??= []
                ctx.options.middlewares.push(timeoutMiddleware(timeout))
            }
        },
    }
}
