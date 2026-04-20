export function bitLength(n: bigint): number {
    if (n === 0n) return 0
    if (n < 0n) n = -n

    let hex = n.toString(16)
    let len = hex.length
    let leadingDigit = parseInt(hex[0], 16)

    return (len - 1) * 4 + (32 - Math.clz32(leadingDigit))
}

export function twoMultiplicity(n: bigint): bigint {
    if (n === 0n) return 0n
    let m = 0n
    let pow = 1n
    while (true) {
        if ((n & pow) !== 0n) return m
        m += 1n
        pow <<= 1n
    }
}

export function min2(a: bigint, b: bigint): bigint {
    return a < b ? a : b
}

export function min(...args: Array<bigint>): bigint {
    let m = args[0]
    for (let i = 1; i < args.length; i++) {
        if (args[i] < m) m = args[i]
    }
    return m
}

export function max2(a: bigint, b: bigint): bigint {
    return a > b ? a : b
}

export function max(...args: Array<bigint>): bigint {
    let m = args[0]
    for (let i = 1; i < args.length; i++) {
        if (args[i] > m) m = args[i]
    }
    return m
}

export function abs(a: bigint): bigint {
    return a < 0n ? -a : a
}

export function euclideanGcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) {
        let t = b
        b = a % b
        a = t
    }
    return a
}

export function modPowBinary(base: bigint, exp: bigint, mod: bigint): bigint {
    base %= mod
    let result = 1n
    while (exp > 0n) {
        if (exp % 2n === 1n) result = (result * base) % mod
        exp >>= 1n
        base = base ** 2n % mod
    }
    return result
}

export function modInv(a: bigint, n: bigint): bigint {
    let [g, x] = eGcd(toZn(a, n), n)
    if (g !== 1n) throw new RangeError(`${a.toString()} does not have inverse modulo ${n.toString()}`)
    else return toZn(x, n)
}

function eGcd(a: bigint, b: bigint): [bigint, bigint, bigint] {
    let x = 0n
    let y = 1n
    let u = 1n
    let v = 0n
    while (a !== 0n) {
        let q = b / a
        let r: bigint = b % a
        let m = x - u * q
        let n = y - v * q
        b = a
        a = r
        x = u
        y = v
        u = m
        v = n
    }
    return [b, x, y]
}

function toZn(a: number | bigint, n: number | bigint): bigint {
    if (typeof a === "number") a = BigInt(a)
    if (typeof n === "number") n = BigInt(n)
    if (n <= 0n) throw new RangeError("n must be greater than 0.")
    let aZn = a % n
    return aZn < 0n ? aZn + n : aZn
}
