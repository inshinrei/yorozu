import { SyncReadable } from "../types"
import { u8 } from "@yorozu/utils"
import { exactly } from "../read"

export class BitReader implements SyncReadable {
    #readable: SyncReadable
    #currentByte = 0
    #currentBitIndex = 0

    constructor(readable: SyncReadable) {
        this.#readable = readable
    }

    get isAligned(): boolean {
        return this.#currentBitIndex === 0
    }

    get bitPosition(): number {
        return this.#currentBitIndex
    }

    align(): void {
        this.#currentBitIndex = 0
    }

    readSync(bytes: number): Uint8Array {
        if (this.#currentBitIndex === 0) return this.#readable.readSync(bytes)
        if (bytes === 1) return u8.allocateWith([this.readBits(8)])
        let bit = this.#currentBitIndex
        let nbit = 8 - bit
        let mask1 = (1 << nbit) - 1
        let result = u8.allocate(bytes)
        let tmp = this.#readable.readSync(bytes)
        for (let i = 0; i < bytes; i++) {
            let byte1 = this.#currentByte
            let byte2 = tmp[i]
            result[i] = ((byte1 & mask1) << bit) | (byte2 >> nbit)
            this.#currentByte = byte2
        }
        return result
    }

    readBits(size: number): number {
        let result = 0
        if (this.#currentBitIndex !== 0) {
            let bitsLeft = 8 - this.#currentBitIndex
            if (size <= bitsLeft) {
                result = this.#currentByte & ((1 << size) - 1)
                this.#currentBitIndex += size
                if (this.#currentBitIndex === 8) this.#currentBitIndex = 0
                return result
            }

            result = this.#currentByte & ((1 << bitsLeft) - 1)
            size -= bitsLeft
            this.#currentBitIndex = 0
        }

        let bytes = Math.ceil(size / 8)
        let data = exactly(this.#readable, bytes)
        let byteIdx = 0
        while (size >= 8) {
            result = (result << 8) | data[byteIdx++]
            size -= 8
        }

        if (size > 0) {
            this.#currentByte = data[byteIdx]
            this.#currentBitIndex = size
            result = (result << size) | (this.#currentByte >> (8 - size))
        }
        return result
    }

    readBitsBig(size: number): bigint {
        let result = 0n
        if (this.#currentBitIndex !== 0) {
            let bitsLeft = 8 - this.#currentBitIndex
            if (size <= bitsLeft) {
                result = BigInt(this.#currentByte) & ((1n << BigInt(size)) - 1n)
                this.#currentBitIndex += Number(size)
                if (this.#currentBitIndex === 8) this.#currentBitIndex = 0
                return result
            }

            result = BigInt(this.#currentByte) & ((1n << BigInt(bitsLeft)) - 1n)
            size -= bitsLeft
            this.#currentBitIndex = 0
        }

        let bytes = Math.ceil(size / 8)
        let data = exactly(this.#readable, bytes)
        let sizeBig = BigInt(size)
        let byteIdx = 0
        while (sizeBig >= 8n) {
            result = (result << 8n) | BigInt(data[byteIdx++])
            sizeBig -= 8n
        }

        if (sizeBig > 0n) {
            this.#currentByte = data[byteIdx]
            this.#currentBitIndex = size
            result = (result << sizeBig) | (BigInt(this.#currentByte) >> (8n - sizeBig))
        }

        return result
    }

    skipBits(size: number): void {
        if (size % 8 === 0) {
            let buf = exactly(this.#readable, size / 8)
            this.#currentByte = buf[buf.length - 1]
            return
        }

        let bytesToRead = Math.ceil(size / 8)
        if (this.#currentBitIndex !== 0) bytesToRead -= 1
        if (bytesToRead > 0) {
            let buf = exactly(this.#readable, bytesToRead)
            this.#currentByte = buf[bytesToRead - 1]
        }
        this.#currentBitIndex = (this.#currentBitIndex + size) % 8
    }
}
