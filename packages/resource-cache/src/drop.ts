import type { Collection } from "@yorozu/db"
import type { ResourceRow } from "./row"

export type DropReason = "ttl" | "count" | "bytes"
export type DropPlan = { keys: string[]; reason: DropReason }

export type DropHandler<Meta = unknown> = {
    apply(col: Collection<ResourceRow<Meta>>, plan: DropPlan): Promise<void>
}

export let dropDelete: DropHandler<unknown> = {
    async apply(col: Collection<ResourceRow<unknown>>, plan: DropPlan): Promise<void> {
        if (plan.keys.length === 0) return
        await col.delete(plan.keys)
    },
}

export function dropStripBlob<Meta = unknown>(): DropHandler<Meta> {
    return {
        async apply(col: Collection<ResourceRow<Meta>>, plan: DropPlan): Promise<void> {
            if (plan.keys.length === 0) return
            let rows = await col.getMany(plan.keys)
            let next: Array<ResourceRow<Meta>> = []
            for (let rec of rows) {
                if (!rec) continue
                if (rec.bytes === 0 && rec.blob == null) continue
                let { blob: _blob, ...rest } = rec
                next.push({ ...rest, bytes: 0, storedAt: rec.storedAt })
            }
            if (next.length === 0) return
            await col.putMany(next)
        },
    }
}
