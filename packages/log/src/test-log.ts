import type { LogLevel } from "./levels"
import { bindLogger } from "./logger"
import type { LogArgs, Logger, LogRecord } from "./types"

export type TestLog = Logger & {
    collect: () => LogRecord[]
    clear: () => void
}

export function createTestLog(subsystem?: string, category?: string): TestLog {
    let buffer: LogRecord[] = []
    let sub = subsystem ?? ""
    let cat = category ?? ""
    const alwaysEnabled = (_level: LogLevel): boolean => true
    const emit = (level: LogLevel, msg: string, args?: LogArgs): void => {
        buffer.push({
            subsystem: sub,
            category: cat,
            level,
            msg,
            arguments: { ...(args ?? {}) },
            timestamp: Date.now(),
        })
    }
    let logger = bindLogger(sub, cat, alwaysEnabled, emit)
    const collect = (): LogRecord[] => buffer.slice()
    const clear = (): void => {
        buffer.length = 0
    }
    return { ...logger, collect, clear }
}
