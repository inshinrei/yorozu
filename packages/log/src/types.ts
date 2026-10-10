import type { LogLevel } from "./levels"

export type LogArgs = Record<string, unknown>

export type LogRecord = {
    subsystem: string
    category: string
    level: LogLevel
    msg: string
    arguments: LogArgs
    timestamp: number
}

export type LogHandler = (record: LogRecord) => void

export type LogLevelFilter = {
    level?: LogLevel
    categories?: Record<string, { level?: LogLevel }>
}

export type LogConfig = {
    level?: LogLevel
    subsystems?: Record<string, LogLevelFilter>
    handlers?: LogHandler[]
}

export type Logger = {
    readonly subsystem: string
    readonly category: string
    isEnabled: (level: LogLevel) => boolean
    trace: (msg: string, args?: LogArgs) => void
    debug: (msg: string, args?: LogArgs) => void
    info: (msg: string, args?: LogArgs) => void
    notice: (msg: string, args?: LogArgs) => void
    warning: (msg: string, args?: LogArgs) => void
    error: (msg: string, args?: LogArgs) => void
    fault: (msg: string, args?: LogArgs) => void
    critical: (msg: string, args?: LogArgs) => void
    log: {
        (msg: string, args?: LogArgs): void
        (level: LogLevel, msg: string, args?: LogArgs): void
        (call: { level: LogLevel }, msg: string, args?: LogArgs): void
    }
}
