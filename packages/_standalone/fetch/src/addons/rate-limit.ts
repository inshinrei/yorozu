import { FetchAddon, FetchMiddleware } from "../types"
import { MaybePromise, sleep } from "@yorozu/utils"

export interface RateLimitAddon {
    rateLimit?: {
        /**
         * check if the request was rejected due to rate limit
         *
         * @default `res => res.status === 429`
         */
        isRejected?: (res: Response) => MaybePromise<boolean>

        /**
         * getter for the unix timestamp of the next reset
         * can either be a unix timestamp in seconds or an ISO 8601 date string
         *
         * @default `res => res.headers.get("x-ratelimit-reset")`
         */
        getReset?: (res: Response) => MaybePromise<string | number | null>

        /**
         * when the rate limit is exceeded (i.e. `isRejected` returns true),
         * but the reset time is unknown (i.e. `getReset` returns `null`),
         * what is the default time to wait until the rate limit is reset?
         * in milliseconds
         *
         * @default `30_000`
         */
        defaultWaitTime?: number

        /**
         * number of milliseconds to add to the reset time when the rate limit is exceeded,
         * to account for network latency and other factors
         *
         * @default `5000`
         */
        jitter?: number

        /**
         * when the rate limit has exceeded (i.e. `isRejected` returns true),
         * what is the maximum acceptable time to wait until the rate limit is reset?
         * in milliseconds
         *
         * @default `300_000`
         */
        maxWaitTime?: number

        /**
         * maximum number of retries
         *
         * @default `5`
         */
        maxRetries?: number

        /**
         * called when the rate limit is exceeded (i.e. `isRejected` returns true),
         * but before starting the wait timer
         *
         * @param res the response that caused the rate limit to be exceeded
         * @param waitTime the time to wait until the rate limit is reset (in milliseconds)
         */
        onRateLimitExceeded?: (res: Response, waitTime: number) => void
    }
}

let defaultIsRejected = (res: Response) => res.status === 429
let defaultGetReset = (res: Response) => res.headers.get("x-ratelimit-reset")

function tryParseDate(str: string | number | null): number | null {
    if (str == null) return null
    if (typeof str === "number") return str * 1000

    let asNum = Number(str)
    if (!Number.isNaN(asNum)) return asNum * 1000

    let asDate = new Date(str)
    if (asDate.toString() === "Invalid Date") return null
    return asDate.getTime()
}

function rateLimitMiddleware(options: NonNullable<RateLimitAddon["rateLimit"]>): FetchMiddleware {
    let {
        isRejected = defaultIsRejected,
        getReset = defaultGetReset,
        defaultWaitTime = 30_000,
        maxWaitTime = 300_000,
        jitter = 5_000,
        maxRetries = 5,
        onRateLimitExceeded,
    } = options

    return async (req, next) => {
        let attempts = 0

        while (true) {
            if (attempts > maxRetries) throw new Error("Rate limit exceeded, maximum retries exceeded.")
            attempts += 1

            let res = await next(req)

            let rejected = await isRejected(res)
            if (!rejected) return res

            let reset = tryParseDate(await getReset(res))

            let waitTime: number | undefined
            if (reset == null) {
                waitTime = defaultWaitTime
            } else {
                waitTime = reset - Date.now() + jitter
                if (waitTime < 0) {
                    waitTime = undefined
                } else if (waitTime > maxWaitTime) {
                    throw new Error(
                        `Rate limit exceeded, reset time is too far in the future: ${new Date(reset).toISOString()}.`,
                        { cause: res },
                    )
                }
            }

            if (waitTime == null) {
                onRateLimitExceeded?.(res, 0)
                continue
            }

            onRateLimitExceeded?.(res, waitTime)

            await sleep(waitTime)
        }
    }
}

/**
 * addon that handles "rate limit exceeded" errors,
 * and waits until the rate limit is reset
 */
export function rateLimitHandler(): FetchAddon<RateLimitAddon, object> {
    return {
        beforeRequest: (ctx) => {
            if (ctx.options.rateLimit != null || ctx.baseOptions.rateLimit != null) {
                let options = { ...ctx.baseOptions.rateLimit, ...ctx.options.rateLimit }

                ctx.options.middlewares ??= []
                ctx.options.middlewares.push(rateLimitMiddleware(options))
            }
        },
    }
}
