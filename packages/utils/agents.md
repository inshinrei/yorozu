# Yorozu Utils - Agent Reference

This document provides a quick reference for the `@yorozu/utils` package, intended for AI coding agents and developers. It covers all exported utilities organized by module.

## Overview

`packages/utils` exports a collection of lightweight, zero-dependency TypeScript utilities:
- Arrays (typed + Uint8Array helpers)
- BigInt operations
- Encoding (base64, hex, utf8)
- Iteration helpers
- Misc utilities (assert, guards, objects, strings, composition)
- Async primitives (locks, queues, emitters, etc.)
- Data structures (LRU, Deque, custom maps/sets)
- Advanced TypeScript types

All modules are re-exported from the package root.

---

## arrays

### typed
- `TypedArray`: Union type for all typed arrays (including BigInt variants).
- `compare(a, b)`: Lexicographic comparison returning -1 | 0 | 1.
- `equal(a, b)`: Deep equality check for TypedArrays.
- `indexOf`, `lastIndexOf`, `includes`: Overloaded search functions.
- `indexOfArray`, `lastIndexOfArray`, `includesArray`: Search for sub-arrays.
- `toDataView`, `view(ctor, buf)`: Conversion helpers.
- `getPlatformByteOrder()`: Cached endianness detection.

### u8 (Uint8Array utilities)
- `concat(bufs)`: Concatenate Uint8Arrays (fast path for Node Buffers).
- `clone`, `empty`: Cloning and empty buffer constant.
- `readNthBit`: Bit-level reading.
- `allocate(n)`, `free(buf)`: Pooled allocator for Uint8Arrays.
- `reverse(buf)`: In-place reversal.
- `swap(a, b, i, j)`: Byte swapping between buffers.
- `xor(a, b, out?)`: XOR operation with optional output buffer.

---

## bigint
- `fromBytes`, `toBytes`: Big-endian byte conversion.
- `bitLength`, `byteLength`.
- Math: `divCeil`, `min`, `max`, `abs`, `gcd`, `lcm`, `mod`, `pow`.
- Predicates: `isOdd`, `isEven`.
- Bitwise: `and`, `or`, `xor`, `not`, shifts.

---

## encoding
Namespaces: `base64`, `hex`, `utf8`

Each provides:
- `encode(input: Uint8Array): string`
- `decode(input: string): Uint8Array`

---

## iterate
- `enumerate<T>(iterable, start = 0)`: Yields `[index, value]` pairs.

---

## misc
- **assert**: `assert(cond, msg?)`, `assertEqual`, `fail`.
- **composer**: `compose`, `pipe` for function composition.
- **guards**: Type guards (`isString`, `isNumber`, `isObject`, `isArray`, `isFunction`, `isPromise`, `isDefined`, etc.).
- **noop**: `noop()`, `asyncNoop()`.
- **objects**: `deepEqual`, `deepClone`, `pick`, `omit`, `mapValues`, `hasOwn`.
- **string**: `capitalize`, `camelCase`, `snakeCase`, `kebabCase`, `truncate`.

---

## not-sync (Async Primitives)
- `sleep(ms)`
- `AsyncLock`: Mutex with queuing.
- `AsyncQueue<T>`: Bounded/unbounded async queue.
- `AsyncResource<T>`: Acquire/release resource pattern.
- `ConditionVariable`: Wait/notify.
- `Deferred<T>`: Promise with external resolve/reject.
- `Emitter`: Typed event emitter.
- `Pool<T>`: Generic resource pool.
- Timers: `setInterval`, `clearInterval` wrappers.

---

## structures
- `CustomMap<K, V>`, `CustomSet<T>`: With custom equality/hash functions.
- `Deque<T>`: Double-ended queue.
- `LRUMap<K, V>`, `LRUSet<T>`: Size-limited LRU caches.

---

## types (Type Utilities)
- `Brand<T, B>`: Nominal typing / branded types.
- `Equal<A, B>`: Type-level equality check.
- `UnknownToError`, `isError`.
- `Maybe`, `NonEmptyArray`, `DeepPartial`, `AnyToNever`.
- Union helpers: `UnionToIntersection`, `UnionToTuple`, `DistributiveOmit`, etc.

---

All utilities are designed to be small, focused, and tree-shakeable. Use them directly via named imports from the package.