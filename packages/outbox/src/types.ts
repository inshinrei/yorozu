export type OutboxEntry = {
    id: string
    createdAt: number
    reservedTo: number
    type: string
    payload: unknown
    rollbackType?: string
    rollbackPayload?: unknown
    attempts: number
    lastError?: string
    failedAt?: number
}

export type Clock = { now(): number }

export interface OutboxStore {
    enqueue(params: {
        type: string
        payload: unknown
        rollbackType?: string
        rollbackPayload?: unknown
    }): Promise<string>
    get(id: string): Promise<OutboxEntry | null>
    claim(leaseDurationMs: number): Promise<OutboxEntry | null>
    delete(id: string): Promise<void>
    release(id: string): Promise<void>
    updateAfterFailure(id: string, error: string, nextReservedTo?: number): Promise<void>
    markFailed(id: string, error?: string): Promise<void>
    listFailed(): Promise<OutboxEntry[]>
    retry(id: string): Promise<void>
    releaseUncounted(id: string, error?: string, nextReservedTo?: number): Promise<void>
    deleteAll(): Promise<void>
    count(): Promise<number>
    subscribe(listener: () => void): () => void
    nextDueAt(): Promise<number | null>
}
