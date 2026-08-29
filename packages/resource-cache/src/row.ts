import type { CollectionDef, DbSchema } from "@yorozu/db"

export const BY_EVICT_INDEX: string = "by-evict"

export type ResourceRow<Meta = unknown> = {
    key: string
    storedAt: number
    bytes: number
    blob?: Blob
    meta: Meta
}

export function resourceCollectionDef(name: string): CollectionDef {
    return {
        name,
        keyPath: "key",
        indexes: [{ name: BY_EVICT_INDEX, keyPath: ["storedAt", "bytes"] }],
    }
}

export function resourceSchema(dbName: string, collectionNames: string[], version: number = 1): DbSchema {
    return { name: dbName, version, collections: collectionNames.map(resourceCollectionDef) }
}
