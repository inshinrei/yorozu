import { isLevelEnabled, snapshotHandlers } from "./configure"
import { isLogLevel } from "./levels"
import type { LogLevel } from "./levels"
import type { LogArgs, Logger, LogRecord } from "./types"

let cache: Map<string, Logger> = new Map()
let emitDepth = 0

function resolveLogCall(a: unknown, b?: unknown, c?: LogArgs): { level: LogLevel; msg: string; args?: LogArgs } {
    if (typeof a === "string") {
        if (isLogLevel(a) && typeof b === "string") {
            return { level: a, msg: b, args: c }
        }
        if (isLogLevel(a) && b !== undefined) {
            throw new TypeError("log() requires msg string")
        }
        return { level: "notice", msg: a, args: b as LogArgs | undefined }
    }
    if (a != null && typeof a === "object") {
        let level = (a as { level?: unknown }).level
        if (!isLogLevel(level)) {
            throw new TypeError("log() object form requires { level }")
        }
        if (typeof b !== "string") {
            throw new TypeError("log() requires msg string")
        }
        return { level, msg: b, args: c }
    }
    throw new TypeError("log() requires msg string")
}

export function bindLogger(
    subsystem: string,
    category: string,
    isEnabled: (level: LogLevel) => boolean,
    emit: (level: LogLevel, msg: string, args?: LogArgs) => void,
): Logger {
    const log = ((a: unknown, b?: unknown, c?: LogArgs): void => {
        let call = resolveLogCall(a, b, c)
        emit(call.level, call.msg, call.args)
    }) as Logger["log"]

    return {
        subsystem,
        category,
        isEnabled,
        trace: (msg, args) => emit("trace", msg, args),
        debug: (msg, args) => emit("debug", msg, args),
        info: (msg, args) => emit("info", msg, args),
        notice: (msg, args) => emit("notice", msg, args),
        warning: (msg, args) => emit("warning", msg, args),
        error: (msg, args) => emit("error", msg, args),
        fault: (msg, args) => emit("fault", msg, args),
        critical: (msg, args) => emit("critical", msg, args),
        log,
    }
}

function emitRecord(subsystem: string, category: string, level: LogLevel, msg: string, args?: LogArgs): void {
    if (!isLevelEnabled(subsystem, category, level)) return
    if (emitDepth > 0) return
    let record: LogRecord = {
        subsystem,
        category,
        level,
        msg,
        arguments: { ...(args ?? {}) },
        timestamp: Date.now(),
    }
    let handlers = snapshotHandlers()
    emitDepth++
    try {
        for (let handler of handlers) {
            try {
                handler(record)
            } catch {
                // handler errors are swallowed
            }
        }
    } finally {
        emitDepth--
    }
}

export function init(subsystem?: string, category?: string): Logger {
    let sub = subsystem ?? ""
    let cat = category ?? ""
    let key = sub + "\0" + cat
    let existing = cache.get(key)
    if (existing) return existing
    const isEnabled = (level: LogLevel): boolean => isLevelEnabled(sub, cat, level)
    const emit = (level: LogLevel, msg: string, args?: LogArgs): void => {
        emitRecord(sub, cat, level, msg, args)
    }
    let logger = bindLogger(sub, cat, isEnabled, emit)
    cache.set(key, logger)
    return logger
}

const noopEmit = (_level: LogLevel, _msg: string, _args?: LogArgs): void => {}
const neverEnabled = (_level: LogLevel): boolean => false

export const disabled: Logger = bindLogger("", "", neverEnabled, noopEmit)
