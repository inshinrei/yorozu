export type BlobBytesLedgerItem = { key: string; bytes: number }

/** In-memory blob-byte running total. Rebuilds from a covering-index snapshot when cold. */
export class BlobBytesLedger {
    protected _total: number | null = null
    protected _bytesByKey: Map<string, number> = new Map()
    protected _epoch: number = 0

    note(key: string, next: number): void {
        this._epoch++
        let prev = this._bytesByKey.get(key) ?? 0
        this._bytesByKey.set(key, next)
        if (this._total != null) this._total += next - prev
    }

    forget(key: string): void {
        this._epoch++
        let prev = this._bytesByKey.get(key) ?? 0
        this._bytesByKey.delete(key)
        if (this._total != null) this._total -= prev
    }

    invalidate(): void {
        this._epoch++
        this._total = null
        this._bytesByKey.clear()
    }

    async getTotal(listItems: () => Promise<readonly BlobBytesLedgerItem[]>): Promise<number> {
        if (this._total != null) return this._total
        for (;;) {
            let epoch = this._epoch
            let items = await listItems()
            // note/forget/invalidate during the await bump _epoch; do not clear or assign.
            if (this._epoch !== epoch) continue
            this._bytesByKey.clear()
            let total = 0
            for (let it of items) {
                this._bytesByKey.set(it.key, it.bytes)
                total += it.bytes
            }
            this._total = total
            return total
        }
    }
}
