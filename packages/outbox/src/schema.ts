import type { CollectionDef } from "@yorozu/db"

export function outboxCollectionDef(name: string = "outbox"): CollectionDef {
    return {
        name,
        keyPath: "id",
        indexes: [
            { name: "by-claim", keyPath: ["reservedTo", "createdAt"] },
            { name: "by-failed", keyPath: ["failedAt", "createdAt"] },
        ],
    }
}
