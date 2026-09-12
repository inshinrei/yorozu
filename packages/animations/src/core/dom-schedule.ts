type Phase = "idle" | "measure" | "mutate" | "after"

let measures: Array<() => void> = []
let mutates: Array<() => void> = []
let afterMutate: Array<() => void | (() => void)> = []
let scheduled = 0
let phase: Phase = "idle"

let schedule = (): void => {
    if (scheduled || phase !== "idle") return
    scheduled = requestAnimationFrame(() => {
        runTick(false)
    })
}

let runTick = (cancelPending: boolean): void => {
    if (cancelPending && scheduled) {
        cancelAnimationFrame(scheduled)
    }
    scheduled = 0
    phase = "measure"
    while (measures.length) measures.shift()!()
    phase = "mutate"
    while (mutates.length) mutates.shift()!()
    phase = "after"
    let follow: Array<() => void> = []
    while (afterMutate.length) {
        let result = afterMutate.shift()!()
        if (typeof result === "function") follow.push(result)
    }
    phase = "mutate"
    for (let fn of follow) fn()
    while (mutates.length) mutates.shift()!()
    phase = "idle"
    if (measures.length || mutates.length || afterMutate.length) schedule()
}

export function queueMeasure(fn: () => void): void {
    measures.push(fn)
    schedule()
}

export function queueMutate(fn: () => void): void {
    mutates.push(fn)
    schedule()
}

export function queueMeasureAfterMutate(fn: () => void | (() => void)): void {
    afterMutate.push(fn)
    schedule()
}

export function flushDomSchedule(): void {
    if (!measures.length && !mutates.length && !afterMutate.length && !scheduled) return
    runTick(true)
}
