export type Key = string | number

export type Playback = {
    readonly done: Promise<boolean>
    cancel: () => void
}

export type AttachHandle = {
    update: (next: Key) => void
    destroy: () => void
}
