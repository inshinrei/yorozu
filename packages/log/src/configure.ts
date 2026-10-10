import { rank } from "./levels"
import type { LogLevel } from "./levels"
import type { LogConfig, LogHandler, LogLevelFilter } from "./types"

let current: LogConfig = {}

export function configure(config: LogConfig): void {
    let next: LogConfig = {}
    if (config.level !== undefined) next.level = config.level
    if (config.subsystems !== undefined) next.subsystems = { ...config.subsystems }
    if (config.handlers !== undefined) next.handlers = config.handlers.slice()
    current = next
}

export function getConfig(): LogConfig {
    let out: LogConfig = {}
    if (current.level !== undefined) out.level = current.level
    if (current.subsystems !== undefined) out.subsystems = { ...current.subsystems }
    if (current.handlers !== undefined) out.handlers = current.handlers.slice()
    return out
}

export function snapshotHandlers(): LogHandler[] {
    return current.handlers ? current.handlers.slice() : []
}

function effectiveMin(subsystem: string, category: string): LogLevel {
    let sub: LogLevelFilter | undefined = current.subsystems?.[subsystem]
    let catLevel = sub?.categories?.[category]?.level
    return catLevel ?? sub?.level ?? current.level ?? "trace"
}

export function isLevelEnabled(subsystem: string, category: string, level: LogLevel): boolean {
    if ((current.handlers?.length ?? 0) === 0) return false
    return rank(level) >= rank(effectiveMin(subsystem, category))
}
