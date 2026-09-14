import type { CollectionDef, DbSchema } from "@yorozu/db"

export const BY_EVICT_INDEX: string = "by-evict"
export const BY_EVICT_CLASS_INDEX: string = "by-evict-class"

export type ResourceClass = "thumb" | "original" | (string & {})

export type ResourceRow<Meta = unknown> = {
    key: string
    storedAt: number
    bytes: number
    blob?: Blob
    class?: ResourceClass
    meta: Meta
}

export function resourceCollectionDef(name: string): CollectionDef {
    return {
        name,
        keyPath: "key",
        indexes: [
            { name: BY_EVICT_INDEX, keyPath: ["storedAt", "bytes"] },
            { name: BY_EVICT_CLASS_INDEX, keyPath: ["storedAt", "bytes", "class"] },
        ],
    }
}

export function resourceSchema(dbName: string, collectionNames: string[], version: number = 2): DbSchema {
    return { name: dbName, version, collections: collectionNames.map(resourceCollectionDef) }
}
