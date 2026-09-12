export type LoadDirection = "forwards" | "backwards"

export const DEFAULT_LIST_SLICE: number = 30
export const DEFAULT_MAX_MOUNTED_FACTOR: number = 3

export type ViewportSliceResult<Id extends string | number> = {
    viewportIds: Id[]
    fromOffset: number
    isOnTop: boolean
    areSomeLocal: boolean
    areAllLocal: boolean
}

export function areIdArraysEqual<Id extends string | number>(a: Id[] | undefined, b: Id[] | undefined): boolean {
    if (a === b) return true
    if (a === undefined || b === undefined) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false
    }
    return true
}

export function reuseIfEqual<Id extends string | number>(prev: Id[] | undefined, next: Id[]): Id[] {
    return areIdArraysEqual(prev, next) && prev !== undefined ? prev : next
}

export function getViewportSlice<Id extends string | number>(
    sourceIds: Id[],
    direction: LoadDirection,
    listSlice: number,
    offsetId?: Id,
): ViewportSliceResult<Id> {
    let length = sourceIds.length
    let index = offsetId !== undefined ? sourceIds.indexOf(offsetId) : 0
    let indexForDirection = direction === "forwards" ? index : index + 1 || length
    let from = Math.max(0, indexForDirection - listSlice)
    let to = indexForDirection + listSlice - 1
    let viewportIds = sourceIds.slice(Math.max(0, from), to + 1)
    let isOnTop = viewportIds[0] === sourceIds[0]
    let areSomeLocal: boolean
    let areAllLocal: boolean
    if (direction === "forwards") {
        areSomeLocal = indexForDirection >= 0
        areAllLocal = from >= 0
    } else {
        areSomeLocal = indexForDirection < length
        areAllLocal = to <= length - 1
    }
    return {
        viewportIds,
        fromOffset: from,
        isOnTop,
        areSomeLocal,
        areAllLocal,
    }
}

export type ViewportIdSliceControllerOptions<Id extends string | number> = {
    listSlice?: number
    loadMoreBackwards?: (args: { offsetId?: Id }) => void
}

function pickStillPresentOffset<Id extends string | number>(
    sourceIds: Id[],
    viewportIds: Id[] | undefined,
): Id | undefined {
    if (viewportIds === undefined || viewportIds.length === 0) {
        return sourceIds[0]
    }
    let mid = viewportIds[Math.round(viewportIds.length / 2)]
    if (mid !== undefined && sourceIds.includes(mid)) {
        return mid
    }
    for (let id of viewportIds) {
        if (sourceIds.includes(id)) return id
    }
    return sourceIds[0]
}

export class ViewportIdSliceController<Id extends string | number> {
    #listSlice: number
    #loadMoreBackwards: ((args: { offsetId?: Id }) => void) | undefined
    #viewportIds: Id[] | undefined
    #fromOffset: number = 0
    #isOnTop: boolean = true
    #isDisabled: boolean = false
    #sourceIds: Id[] | undefined

    constructor(options?: ViewportIdSliceControllerOptions<Id>) {
        this.#listSlice = options?.listSlice ?? DEFAULT_LIST_SLICE
        this.#loadMoreBackwards = options?.loadMoreBackwards
    }

    get viewportIds(): Id[] | undefined {
        return this.#viewportIds
    }

    get fromOffset(): number {
        return this.#fromOffset
    }

    get isOnTop(): boolean {
        return this.#isOnTop
    }

    setListSlice(n: number): void {
        if (n <= 0) return
        this.#listSlice = n
    }

    sync(sourceIds: Id[] | undefined, isDisabled: boolean = false): boolean {
        if (sourceIds === undefined) {
            let changed = this.#viewportIds !== undefined || this.#fromOffset !== 0 || this.#isOnTop !== true
            this.#viewportIds = undefined
            this.#fromOffset = 0
            this.#isOnTop = true
            this.#isDisabled = false
            this.#sourceIds = undefined
            return changed
        }

        if (
            areIdArraysEqual(this.#sourceIds, sourceIds) &&
            this.#isDisabled === isDisabled &&
            this.#viewportIds !== undefined
        ) {
            return false
        }

        let prevIds = this.#viewportIds
        let prevFrom = this.#fromOffset
        let prevOnTop = this.#isOnTop

        this.#sourceIds = sourceIds
        this.#isDisabled = isDisabled

        if (isDisabled) {
            this.#viewportIds = reuseIfEqual(prevIds, sourceIds)
            this.#fromOffset = 0
            this.#isOnTop = true
            return (
                !areIdArraysEqual(prevIds, this.#viewportIds) ||
                prevFrom !== this.#fromOffset ||
                prevOnTop !== this.#isOnTop
            )
        }

        let offsetId: Id | undefined
        if (prevIds === undefined) {
            offsetId = sourceIds[0]
        } else {
            offsetId = pickStillPresentOffset(sourceIds, prevIds)
        }

        let result = getViewportSlice(sourceIds, "forwards", this.#listSlice, offsetId)
        this.#viewportIds = reuseIfEqual(prevIds, result.viewportIds)
        this.#fromOffset = result.fromOffset
        this.#isOnTop = result.isOnTop

        return (
            !areIdArraysEqual(prevIds, this.#viewportIds) ||
            prevFrom !== this.#fromOffset ||
            prevOnTop !== this.#isOnTop
        )
    }

    getMore(sourceIds: Id[] | undefined, args: { direction: LoadDirection; noScroll?: boolean }): boolean {
        if (sourceIds === undefined || sourceIds.length === 0) {
            this.#loadMoreBackwards?.({ offsetId: undefined })
            return false
        }

        let from = this.#fromOffset
        let length = this.#viewportIds?.length ?? 0
        let end = from + length
        let maxMounted = this.#listSlice * DEFAULT_MAX_MOUNTED_FACTOR
        let nextFrom = from
        let nextEnd = end
        let direction = args.direction

        if (direction === "backwards") {
            nextEnd = Math.min(sourceIds.length, end + this.#listSlice)
            if (nextEnd - nextFrom > maxMounted) {
                nextFrom = nextEnd - maxMounted
            }
        } else {
            nextFrom = Math.max(0, from - this.#listSlice)
            if (nextEnd - nextFrom > maxMounted) {
                nextEnd = nextFrom + maxMounted
            }
        }

        nextFrom = Math.max(0, nextFrom)
        nextEnd = Math.min(sourceIds.length, Math.max(nextFrom, nextEnd))

        let nextIds = sourceIds.slice(nextFrom, nextEnd)
        let grewPastLocal = direction === "backwards" && end + this.#listSlice > sourceIds.length
        if (grewPastLocal) {
            let offsetId = sourceIds[sourceIds.length - 1]
            this.#loadMoreBackwards?.({ offsetId })
        }

        let prevIds = this.#viewportIds
        let prevFrom = this.#fromOffset
        let prevOnTop = this.#isOnTop

        this.#viewportIds = reuseIfEqual(prevIds, nextIds)
        this.#fromOffset = nextFrom
        this.#isOnTop = nextIds[0] === sourceIds[0]

        return (
            !areIdArraysEqual(prevIds, this.#viewportIds) ||
            prevFrom !== this.#fromOffset ||
            prevOnTop !== this.#isOnTop
        )
    }

    reanchorAtIndex(sourceIds: Id[], index: number): boolean {
        let clamped = Math.max(0, Math.min(index, sourceIds.length - 1))
        let offsetId = sourceIds[clamped]
        let result = getViewportSlice(sourceIds, "forwards", this.#listSlice, offsetId)

        let prevIds = this.#viewportIds
        let prevFrom = this.#fromOffset
        let prevOnTop = this.#isOnTop

        this.#viewportIds = reuseIfEqual(prevIds, result.viewportIds)
        this.#fromOffset = result.fromOffset
        this.#isOnTop = result.isOnTop
        this.#sourceIds = sourceIds

        return (
            !areIdArraysEqual(prevIds, this.#viewportIds) ||
            prevFrom !== this.#fromOffset ||
            prevOnTop !== this.#isOnTop
        )
    }

    trimToSlice(sourceIds: Id[], firstVisibleIndex: number): boolean {
        return this.reanchorAtIndex(sourceIds, firstVisibleIndex)
    }

    resetToTop(sourceIds: Id[]): void {
        let result = getViewportSlice(sourceIds, "forwards", this.#listSlice, sourceIds[0])
        this.#viewportIds = reuseIfEqual(this.#viewportIds, result.viewportIds)
        this.#fromOffset = result.fromOffset
        this.#isOnTop = result.isOnTop
        this.#sourceIds = sourceIds
    }
}
