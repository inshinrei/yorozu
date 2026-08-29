import { capture, createHalua, Level, NewTextDispatcher, spanFlow } from "halua"
import type { CaptureApi, CapturedRecord } from "halua"
import type { Logger } from "./types"

export type TestLog = Logger & CaptureApi

export function createTestLog(): TestLog {
    return createHalua()
        .dispatchers(NewTextDispatcher(() => {}))
        .use(spanFlow())
        .use(capture())
        .level(Level.Trace)
        .build() as TestLog
}

const LDD_EVENTS = ["start", "skip", "retry", "done", "never-happen", "error"] as const
export type LddEvent = (typeof LDD_EVENTS)[number]

function argsHasPair(args: unknown[], key: string, value?: string): boolean {
    for (let i = 0; i < args.length - 1; i++) {
        if (args[i] === key && (value === undefined || args[i + 1] === value)) return true
    }
    return false
}

/** Flow-child records only. Span children inherit `flow <name>` but are not the story. */
function flowRecords(records: CapturedRecord[], name: string): CapturedRecord[] {
    return records.filter((r) => {
        let args = r.args ?? []
        if (argsHasPair(args, "span")) return false
        return argsHasPair(args, "flow", name)
    })
}

function storyEvent(r: CapturedRecord): LddEvent | null {
    if (r.level === "ERROR" || r.errorMeta != null) return "error"
    let e = r.args?.[0]
    if (typeof e === "string" && (LDD_EVENTS as readonly string[]).includes(e)) return e as LddEvent
    return null
}

/** Exact match on LDD events for one flow name. Extra events, skip+done, or a second child fail. */
export function expectFlowStory(records: CapturedRecord[], name: string, events: LddEvent[]): void {
    let story = flowRecords(records, name)
        .map(storyEvent)
        .filter((e): e is LddEvent => e != null)
    let same = story.length === events.length && story.every((ev, i) => ev === events[i])
    if (!same) {
        throw new Error(`flow ${name}: expected ${events.join("→")}, got ${story.join("→")}`)
    }
}
