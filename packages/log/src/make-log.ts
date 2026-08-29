import type { Logger } from "./types"

function isThenable(v: unknown): v is Promise<unknown> {
    return v != null && typeof (v as { then?: unknown }).then === "function"
}

/** LDD catch-boundary: Error → flow.error, else never-happen. */
export function reportFlowFailure(flow: Logger, err: unknown, ctx?: Record<string, unknown>): void {
    if (err instanceof Error) flow.error(err, ctx)
    else flow.warn("never-happen", { err, ...ctx })
}

/**
 * Bind issueKey on .error / .assert. Intercepts child / flow / create / span so
 * descendants keep the same key (including spanFlow closeFailure).
 * Input must already be a spanFlow logger (halua.create / createTestLog).
 * A missing .flow throws — it does not invent a child.
 */
export function makeLog(src: Logger, issueKey: string): Logger {
    if (typeof src.flow !== "function") {
        throw new Error("makeLog requires Logger.flow (halua.create / createTestLog with spanFlow)")
    }

    const mergeMeta = (meta?: Record<string, unknown>): Record<string, unknown> => {
        if (!meta) return { issueKey }
        let { issueKey: _ignored, ...rest } = meta
        return { issueKey, ...rest }
    }

    function wrap(inner: Logger): Logger {
        return new Proxy(inner, {
            get(target, prop, receiver) {
                if (prop === "error") {
                    return (err: unknown, meta?: Record<string, unknown>) => {
                        target.error(err, mergeMeta(meta))
                    }
                }
                if (prop === "assert") {
                    return (assertion: boolean, error: unknown, meta?: Record<string, unknown>) => {
                        target.assert(assertion, error, meta ? mergeMeta(meta) : { issueKey })
                    }
                }
                if (prop === "child") {
                    return (...args: unknown[]) => wrap(target.child(...args) as Logger)
                }
                if (prop === "flow") {
                    return (name: string, ctx?: Record<string, unknown>) => wrap(target.flow(name, ctx))
                }
                if (prop === "create") {
                    return (arg1?: unknown, arg2?: unknown) =>
                        wrap(target.create(arg1 as never, arg2 as never) as Logger)
                }
                if (prop === "span") {
                    return (label: string, fn?: (log: Logger) => unknown) => {
                        // Own the span child so closeFailure goes through wrap (issueKey).
                        let spanLog = wrap(target.child("span", label) as Logger)
                        let start = performance.now()
                        spanLog.info("start", { span: label })
                        const closeOk = (): number => {
                            let elapsedMs = performance.now() - start
                            spanLog.info("done", { span: label, elapsedMs })
                            return elapsedMs
                        }
                        const closeFail = (err: unknown): void => {
                            let elapsedMs = performance.now() - start
                            reportFlowFailure(spanLog, err, { span: label, elapsedMs })
                        }
                        if (typeof fn !== "function") {
                            let ended = false
                            let duration = 0
                            return () => {
                                if (ended) return duration
                                ended = true
                                duration = closeOk()
                                return duration
                            }
                        }
                        try {
                            let result = fn(spanLog)
                            if (isThenable(result)) {
                                return result.then(
                                    (value) => {
                                        closeOk()
                                        return value
                                    },
                                    (err: unknown) => {
                                        closeFail(err)
                                        throw err
                                    },
                                )
                            }
                            closeOk()
                            return result
                        } catch (err) {
                            closeFail(err)
                            throw err
                        }
                    }
                }
                let value = Reflect.get(target, prop, receiver)
                if (typeof value === "function") {
                    return (value as (...args: unknown[]) => unknown).bind(target)
                }
                return value
            },
        }) as Logger
    }

    return wrap(src)
}
