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
    let viewportIds = sourceIds.slice(from, to + 1)
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
    protected _listSlice: number
    protected _loadMoreBackwards: ((args: { offsetId?: Id }) => void) | undefined
    protected _viewportIds: Id[] | undefined
    protected _fromOffset: number = 0
    protected _isOnTop: boolean = true
    protected _isDisabled: boolean = false
    protected _sourceIds: Id[] | undefined

    constructor(options?: ViewportIdSliceControllerOptions<Id>) {
        this._listSlice = options?.listSlice ?? DEFAULT_LIST_SLICE
        this._loadMoreBackwards = options?.loadMoreBackwards
    }

    get viewportIds(): Id[] | undefined {
        return this._viewportIds
    }

    get fromOffset(): number {
        return this._fromOffset
    }

    get isOnTop(): boolean {
        return this._isOnTop
    }

    setListSlice(n: number): void {
        if (n <= 0) return
        this._listSlice = n
    }

    sync(sourceIds: Id[] | undefined, isDisabled: boolean = false): boolean {
        if (sourceIds === undefined) {
            let changed = this._viewportIds !== undefined || this._fromOffset !== 0 || this._isOnTop !== true
            this._viewportIds = undefined
            this._fromOffset = 0
            this._isOnTop = true
            this._isDisabled = false
            this._sourceIds = undefined
            return changed
        }

        if (
            areIdArraysEqual(this._sourceIds, sourceIds) &&
            this._isDisabled === isDisabled &&
            this._viewportIds !== undefined
        ) {
            return false
        }

        this._sourceIds = sourceIds
        this._isDisabled = isDisabled

        if (isDisabled) {
            return this._commitWindow(sourceIds, 0, true)
        }

        let offsetId: Id | undefined
        if (this._viewportIds === undefined) {
            offsetId = sourceIds[0]
        } else {
            offsetId = pickStillPresentOffset(sourceIds, this._viewportIds)
        }

        let result = getViewportSlice(sourceIds, "forwards", this._listSlice, offsetId)
        return this._commitWindow(result.viewportIds, result.fromOffset, result.isOnTop)
    }

    getMore(sourceIds: Id[] | undefined, args: { direction: LoadDirection; noScroll?: boolean }): boolean {
        if (sourceIds === undefined || sourceIds.length === 0) {
            this._loadMoreBackwards?.({ offsetId: undefined })
            return false
        }

        this._sourceIds = sourceIds

        let from = this._fromOffset
        let length = this._viewportIds?.length ?? 0
        let end = from + length
        let maxMounted = this._listSlice * DEFAULT_MAX_MOUNTED_FACTOR
        let nextFrom = from
        let nextEnd = end
        let direction = args.direction

        if (direction === "backwards") {
            nextEnd = Math.min(sourceIds.length, end + this._listSlice)
            if (nextEnd - nextFrom > maxMounted) {
                nextFrom = nextEnd - maxMounted
            }
        } else {
            nextFrom = Math.max(0, from - this._listSlice)
            if (nextEnd - nextFrom > maxMounted) {
                nextEnd = nextFrom + maxMounted
            }
        }

        nextFrom = Math.max(0, nextFrom)
        nextEnd = Math.min(sourceIds.length, Math.max(nextFrom, nextEnd))

        let nextIds = sourceIds.slice(nextFrom, nextEnd)
        let grewPastLocal = direction === "backwards" && end + this._listSlice > sourceIds.length
        if (grewPastLocal) {
            let offsetId = sourceIds[sourceIds.length - 1]
            this._loadMoreBackwards?.({ offsetId })
        }

        return this._commitWindow(nextIds, nextFrom, nextIds[0] === sourceIds[0])
    }

    reanchorAtIndex(sourceIds: Id[], index: number): boolean {
        let clamped = Math.max(0, Math.min(index, sourceIds.length - 1))
        let offsetId = sourceIds[clamped]
        let result = getViewportSlice(sourceIds, "forwards", this._listSlice, offsetId)
        this._sourceIds = sourceIds
        return this._commitWindow(result.viewportIds, result.fromOffset, result.isOnTop)
    }

    trimToSlice(sourceIds: Id[], firstVisibleIndex: number): boolean {
        return this.reanchorAtIndex(sourceIds, firstVisibleIndex)
    }

    resetToTop(sourceIds: Id[]): void {
        let result = getViewportSlice(sourceIds, "forwards", this._listSlice, sourceIds[0])
        this._sourceIds = sourceIds
        this._commitWindow(result.viewportIds, result.fromOffset, result.isOnTop)
    }

    protected _commitWindow(ids: Id[], from: number, isOnTop: boolean): boolean {
        let prevIds = this._viewportIds
        let prevFrom = this._fromOffset
        let prevOnTop = this._isOnTop
        this._viewportIds = reuseIfEqual(prevIds, ids)
        this._fromOffset = from
        this._isOnTop = isOnTop
        return !areIdArraysEqual(prevIds, this._viewportIds) || prevFrom !== from || prevOnTop !== isOnTop
    }
}
