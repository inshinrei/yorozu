import { reverseBits15 } from "./tables"

export function buildEncodeMap(lengths: Uint8Array, maxBits: number): Uint16Array {
    return buildCodeMap(lengths, maxBits, false)
}

export function buildDecodeMap(lengths: Uint8Array, maxBits: number): Uint16Array {
    return buildCodeMap(lengths, maxBits, true)
}

function buildCodeMap(lengths: Uint8Array, maxBits: number, decode: boolean): Uint16Array {
    let count = new Uint16Array(maxBits)
    for (let i = 0; i < lengths.length; i++) {
        if (lengths[i]) count[lengths[i] - 1]++
    }
    let nextCode = new Uint16Array(maxBits)
    for (let i = 1; i < maxBits; i++) nextCode[i] = (nextCode[i - 1] + count[i - 1]) << 1

    if (decode) {
        let map = new Uint16Array(1 << maxBits)
        let drop = 15 - maxBits
        for (let symbol = 0; symbol < lengths.length; symbol++) {
            let bits = lengths[symbol]
            if (!bits) continue
            let packed = (symbol << 4) | bits
            let pad = maxBits - bits
            let value = nextCode[bits - 1]++ << pad
            let last = value | ((1 << pad) - 1)
            for (; value <= last; value++) map[reverseBits15[value] >> drop] = packed
        }
        return map
    }

    let map = new Uint16Array(lengths.length)
    for (let symbol = 0; symbol < lengths.length; symbol++) {
        let bits = lengths[symbol]
        if (bits) map[symbol] = reverseBits15[nextCode[bits - 1]++] >> (15 - bits)
    }
    return map
}

type HuffNode = {
    symbol: number
    freq: number
    left?: HuffNode
    right?: HuffNode
}

export function buildLengthLimitedTree(freqs: Uint16Array, maxBits: number): { lengths: Uint8Array; maxBits: number } {
    let nodes: HuffNode[] = []
    for (let i = 0; i < freqs.length; i++) {
        if (freqs[i]) nodes.push({ symbol: i, freq: freqs[i] })
    }
    let n = nodes.length
    let leaves = nodes.slice()
    if (!n) return { lengths: new Uint8Array(0), maxBits: 0 }
    if (n === 1) {
        let lengths = new Uint8Array(nodes[0].symbol + 1)
        lengths[nodes[0].symbol] = 1
        return { lengths, maxBits: 1 }
    }

    nodes.sort((a, b) => a.freq - b.freq)
    nodes.push({ symbol: -1, freq: 25001 })
    let left = nodes[0]
    let right = nodes[1]
    let lookbehind = 0
    let write = 1
    let lookahead = 2
    nodes[0] = { symbol: -1, freq: left.freq + right.freq, left, right }
    while (write !== n - 1) {
        left = nodes[nodes[lookbehind].freq < nodes[lookahead].freq ? lookbehind++ : lookahead++]
        right =
            nodes[lookbehind !== write && nodes[lookbehind].freq < nodes[lookahead].freq ? lookbehind++ : lookahead++]
        nodes[write++] = { symbol: -1, freq: left.freq + right.freq, left, right }
    }

    let maxSymbol = leaves[0].symbol
    for (let i = 1; i < n; i++) {
        if (leaves[i].symbol > maxSymbol) maxSymbol = leaves[i].symbol
    }
    let bitLengths = new Uint16Array(maxSymbol + 1)
    let treeBits = assignLengths(nodes[write - 1], bitLengths, 0)

    if (treeBits > maxBits) {
        let debt = 0
        let overflow = treeBits - maxBits
        let cost = 1 << overflow
        leaves.sort((a, b) => bitLengths[b.symbol] - bitLengths[a.symbol] || a.freq - b.freq)
        let i = 0
        for (; i < n; i++) {
            let symbol = leaves[i].symbol
            if (bitLengths[symbol] > maxBits) {
                debt += cost - (1 << (treeBits - bitLengths[symbol]))
                bitLengths[symbol] = maxBits
            } else break
        }
        debt >>= overflow
        while (debt > 0) {
            let symbol = leaves[i].symbol
            if (bitLengths[symbol] < maxBits) debt -= 1 << (maxBits - bitLengths[symbol]++ - 1)
            else i++
        }
        for (; i >= 0 && debt; i--) {
            let symbol = leaves[i].symbol
            if (bitLengths[symbol] === maxBits) {
                bitLengths[symbol]--
                debt++
            }
        }
        treeBits = maxBits
    }

    return { lengths: new Uint8Array(bitLengths), maxBits: treeBits }
}

function assignLengths(node: HuffNode, lengths: Uint16Array, depth: number): number {
    if (node.symbol === -1) {
        return Math.max(assignLengths(node.left!, lengths, depth + 1), assignLengths(node.right!, lengths, depth + 1))
    }
    lengths[node.symbol] = depth
    return depth
}
