let crcTable = new Int32Array(256)
for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = (c & 1 ? -306674912 : 0) ^ (c >>> 1)
    crcTable[i] = c
}

export class Crc32 {
    #c: number

    constructor(seed = 0) {
        this.#c = ~seed
    }

    update(data: Uint8Array): this {
        let c = this.#c
        for (let i = 0; i < data.length; i++) c = crcTable[(c & 255) ^ data[i]] ^ (c >>> 8)
        this.#c = c
        return this
    }

    digest(): number {
        return ~this.#c >>> 0
    }
}

export function crc32(data: Uint8Array, seed = 0): number {
    return new Crc32(seed).update(data).digest()
}

export class Adler32 {
    #a: number
    #b: number

    constructor(seed = 1) {
        this.#a = seed & 0xffff
        this.#b = (seed >>> 16) & 0xffff
    }

    update(data: Uint8Array): this {
        let a = this.#a
        let b = this.#b
        let i = 0
        let n = data.length
        while (i < n) {
            let end = Math.min(i + 2654, n)
            for (; i < end; i++) {
                a += data[i]
                b += a
            }
            a %= 65521
            b %= 65521
        }
        this.#a = a
        this.#b = b
        return this
    }

    digest(): number {
        return ((this.#b << 16) | this.#a) >>> 0
    }
}

export function adler32(data: Uint8Array, seed = 1): number {
    return new Adler32(seed).update(data).digest()
}
