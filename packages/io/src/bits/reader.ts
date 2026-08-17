import { SyncReadable } from "../types"
import { u8 } from "@yorozu/utils"
import { exactly } from "../read"

export class BitReader implements SyncReadable {
    protected _readable: SyncReadable
    protected _currentByte = 0
    protected _currentBitIndex = 0

    constructor(readable: SyncReadable) {
        this._readable = readable
    }

    get isAligned(): boolean {
        return this._currentBitIndex === 0
    }

    get bitPosition(): number {
        return this._currentBitIndex
    }

    align(): void {
        this._currentBitIndex = 0
    }

    readSync(bytes: number): Uint8Array {
        if (this._currentBitIndex === 0) return this._readable.readSync(bytes)
        if (bytes === 1) return u8.allocateWith([this.readBits(8)])
        let bit = this._currentBitIndex
        let nbit = 8 - bit
        let mask1 = (1 << nbit) - 1
        let result = u8.allocate(bytes)
        let tmp = this._readable.readSync(bytes)
        for (let i = 0; i < bytes; i++) {
            let byte1 = this._currentByte
            let byte2 = tmp[i]
            result[i] = ((byte1 & mask1) << bit) | (byte2 >> nbit)
            this._currentByte = byte2
        }
        return result
    }

    readBits(size: number): number {
        let result = 0
        if (this._currentBitIndex !== 0) {
            let bitsLeft = 8 - this._currentBitIndex
            if (size <= bitsLeft) {
                result = this._currentByte & ((1 << size) - 1)
                this._currentBitIndex += size
                if (this._currentBitIndex === 8) this._currentBitIndex = 0
                return result
            }

            result = this._currentByte & ((1 << bitsLeft) - 1)
            size -= bitsLeft
            this._currentBitIndex = 0
        }

        let bytes = Math.ceil(size / 8)
        let data = exactly(this._readable, bytes)
        let byteIdx = 0
        while (size >= 8) {
            result = (result << 8) | data[byteIdx++]
            size -= 8
        }

        if (size > 0) {
            this._currentByte = data[byteIdx]
            this._currentBitIndex = size
            result = (result << size) | (this._currentByte >> (8 - size))
        }
        return result
    }

    readBitsBig(size: number): bigint {
        let result = 0n
        if (this._currentBitIndex !== 0) {
            let bitsLeft = 8 - this._currentBitIndex
            if (size <= bitsLeft) {
                result = BigInt(this._currentByte) & ((1n << BigInt(size)) - 1n)
                this._currentBitIndex += Number(size)
                if (this._currentBitIndex === 8) this._currentBitIndex = 0
                return result
            }

            result = BigInt(this._currentByte) & ((1n << BigInt(bitsLeft)) - 1n)
            size -= bitsLeft
            this._currentBitIndex = 0
        }

        let bytes = Math.ceil(size / 8)
        let data = exactly(this._readable, bytes)
        let sizeBig = BigInt(size)
        let byteIdx = 0
        while (sizeBig >= 8n) {
            result = (result << 8n) | BigInt(data[byteIdx++])
            sizeBig -= 8n
        }

        if (sizeBig > 0n) {
            this._currentByte = data[byteIdx]
            this._currentBitIndex = size
            result = (result << sizeBig) | (BigInt(this._currentByte) >> (8n - sizeBig))
        }

        return result
    }

    skipBits(size: number): void {
        if (size % 8 === 0) {
            let buf = exactly(this._readable, size / 8)
            this._currentByte = buf[buf.length - 1]
            return
        }

        let bytesToRead = Math.ceil(size / 8)
        if (this._currentBitIndex !== 0) bytesToRead -= 1
        if (bytesToRead > 0) {
            let buf = exactly(this._readable, bytesToRead)
            this._currentByte = buf[bytesToRead - 1]
        }
        this._currentBitIndex = (this._currentBitIndex + size) % 8
    }
}
