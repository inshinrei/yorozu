import type { LogArgs, Logger } from "./types"

export function reportError(log: Logger, err: unknown, extra?: LogArgs): void {
    if (err instanceof Error) log.error(err.message, extra ? { err, ...extra } : { err })
    else log.warning("never-happen", extra ? { err, ...extra } : { err })
}
