export const LOG_COLLECTION: "logs" = "logs"

export const logPersistSchema: {
    readonly name: "yorozu-log-persist"
    readonly version: 1
    readonly collections: readonly [
        {
            readonly name: "logs"
            readonly keyPath: "id"
            readonly indexes: readonly [
                { readonly name: "by-time"; readonly keyPath: "timestamp" },
                { readonly name: "by-subsystem"; readonly keyPath: readonly ["subsystem", "timestamp"] },
                {
                    readonly name: "by-subsystem-category"
                    readonly keyPath: readonly ["subsystem", "category", "timestamp"]
                },
            ]
        },
    ]
} = {
    name: "yorozu-log-persist",
    version: 1,
    collections: [
        {
            name: "logs",
            keyPath: "id",
            indexes: [
                { name: "by-time", keyPath: "timestamp" },
                { name: "by-subsystem", keyPath: ["subsystem", "timestamp"] },
                {
                    name: "by-subsystem-category",
                    keyPath: ["subsystem", "category", "timestamp"],
                },
            ],
        },
    ],
}
