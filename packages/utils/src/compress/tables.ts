// RFC 1951 §3.2.5: length extra bits. Slot 28 is 258 with no extra bits.
export const fixedLengthExtraBits: Uint8Array = new Uint8Array([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0, 0, 0,
])

// RFC 1951 §3.2.5: distance extra bits.
export const fixedDistanceExtraBits: Uint8Array = new Uint8Array([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 0, 0,
])

// RFC 1951 §3.2.7: code-length alphabet permutation.
export const codeLengthOrder: Uint8Array = new Uint8Array([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15])

function basesFromExtra(extraBits: Uint8Array, start: number): { bases: Uint16Array; reverse: Int32Array } {
    let bases = new Uint16Array(31)
    for (let i = 0; i < 31; i++) {
        start += 1 << (i === 0 ? 0 : extraBits[i - 1])
        bases[i] = start
    }
    let reverse = new Int32Array(bases[30])
    for (let i = 1; i < 30; i++) {
        for (let value = bases[i]; value < bases[i + 1]; value++) {
            reverse[value] = ((value - bases[i]) << 5) | i
        }
    }
    return { bases, reverse }
}

let lengthTables = basesFromExtra(fixedLengthExtraBits, 2)
lengthTables.bases[28] = 258
lengthTables.reverse[258] = 28
export const lengthBase: Uint16Array = lengthTables.bases
export const lengthReverse: Int32Array = lengthTables.reverse

let distanceTables = basesFromExtra(fixedDistanceExtraBits, 0)
export const distanceBase: Uint16Array = distanceTables.bases
export const distanceReverse: Int32Array = distanceTables.reverse

export const reverseBits15: Uint16Array = new Uint16Array(32768)
for (let i = 0; i < 32768; i++) {
    let x = ((i & 0xaaaa) >> 1) | ((i & 0x5555) << 1)
    x = ((x & 0xcccc) >> 2) | ((x & 0x3333) << 2)
    x = ((x & 0xf0f0) >> 4) | ((x & 0x0f0f) << 4)
    reverseBits15[i] = (((x & 0xff00) >> 8) | ((x & 0x00ff) << 8)) >> 1
}

export const fixedLiteralLengths: Uint8Array = new Uint8Array(288)
for (let i = 0; i < 144; i++) fixedLiteralLengths[i] = 8
for (let i = 144; i < 256; i++) fixedLiteralLengths[i] = 9
for (let i = 256; i < 280; i++) fixedLiteralLengths[i] = 7
for (let i = 280; i < 288; i++) fixedLiteralLengths[i] = 8

export const fixedDistanceLengths: Uint8Array = new Uint8Array(32)
fixedDistanceLengths.fill(5)
