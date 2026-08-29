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
            for (let key of plan.keys) {
                let rec = await col.get(key)
                if (!rec) continue
                let { blob: _blob, ...rest } = rec
                await col.put({ ...rest, bytes: 0, storedAt: rec.storedAt })
            }
        },
    }
}
