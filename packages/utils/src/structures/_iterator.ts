let _hasIteratorFrom: boolean | null = null

export function maybeWrapIterator<T>(iter: IterableIterator<T>): IterableIterator<T> {
    if (_hasIteratorFrom === null) {
        _hasIteratorFrom = typeof globalThis.Iterator !== "undefined" && "from" in globalThis.Iterator
    }

    if (_hasIteratorFrom) {
        return (globalThis.Iterator as any).from(iter)
    }

    return iter
}

export function resetIteratorDetectionForTests(): void {
    _hasIteratorFrom = null
}
