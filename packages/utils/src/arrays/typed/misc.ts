import { TypedArray } from "./types"

export function toDataView(buf: TypedArray): DataView {
    return new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
}

export function view<R extends TypedArray>(
    ctor: { new (buffer: ArrayBufferLike, byteOffset: number, byteLength: number): R; BYTES_PER_ELEMENT: number },
    buf: ArrayBufferView,
): R {
    let byteLength = buf.byteLength
    let bytesPerElement = ctor.BYTES_PER_ELEMENT

    if (byteLength % bytesPerElement !== 0) {
        throw new RangeError(`byteLength (${byteLength}) is not a multiple of ${bytesPerElement} for ${ctor.name}`)
    }

    let length = byteLength / bytesPerElement
    return new ctor(buf.buffer, buf.byteOffset, length)
}

export function getPlatformByteOrder(): "little" | "big" {
    if (getPlatformByteOrder._cachedByteOrder === null) {
        let buffer = new ArrayBuffer(2)
        let view = new DataView(buffer)
        view.setUint16(0, 0x1234, true)
        getPlatformByteOrder._cachedByteOrder = new Uint16Array(buffer)[0] === 0x1234
    }
    return getPlatformByteOrder._cachedByteOrder ? "little" : "big"
}
export declare namespace getPlatformByteOrder {
    export var _cachedByteOrder: boolean | null
}

getPlatformByteOrder._cachedByteOrder = null
