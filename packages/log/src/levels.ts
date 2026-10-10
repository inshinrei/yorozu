export type LogLevel = "trace" | "debug" | "info" | "notice" | "warning" | "error" | "fault" | "critical"

export const Level: {
    readonly trace: "trace"
    readonly debug: "debug"
    readonly info: "info"
    readonly notice: "notice"
    readonly warning: "warning"
    readonly error: "error"
    readonly fault: "fault"
    readonly critical: "critical"
} = {
    trace: "trace",
    debug: "debug",
    info: "info",
    notice: "notice",
    warning: "warning",
    error: "error",
    fault: "fault",
    critical: "critical",
}

const RANK: Record<LogLevel, number> = {
    trace: 0,
    debug: 1,
    info: 2,
    notice: 3,
    warning: 4,
    error: 5,
    fault: 6,
    critical: 7,
}

export function rank(level: LogLevel): number {
    return RANK[level]
}

export function isLogLevel(value: unknown): value is LogLevel {
    return typeof value === "string" && Object.hasOwn(RANK, value)
}
