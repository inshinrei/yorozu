import type { LogArgs } from "@yorozu/log"

function replacer(_key: string, value: unknown): unknown {
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack }
    }
    if (typeof value === "function" || typeof value === "bigint" || value === undefined) {
        return undefined
    }
    return value
}

export function serializeArgs(input: LogArgs): LogArgs {
    try {
        return JSON.parse(JSON.stringify(input, replacer)) as LogArgs
    } catch {
        return { _unserializable: true }
    }
}
