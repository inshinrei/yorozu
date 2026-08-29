import { createHalua, spanFlow } from "halua"
import type { Logger } from "./types"

export function makeSilentLog(): Logger {
    return createHalua().use(spanFlow()).build() as Logger
}
