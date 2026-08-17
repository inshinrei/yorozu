export interface CompressOptions {
    level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
    mem?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
    dictionary?: Uint8Array
}

export interface DecompressOptions {
    dictionary?: Uint8Array
    out?: Uint8Array
    check?: boolean
}

export interface GzipCompressOptions extends CompressOptions {
    mtime?: Date | string | number
    filename?: string
}
