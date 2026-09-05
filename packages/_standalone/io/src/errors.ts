export class PartialReadError extends Error {
    constructor(
        readonly part: Uint8Array,
        expectedLength: number,
    ) {
        super(`Expected to read ${expectedLength} bytes, but only ${part.length} are available.`)
    }
}
