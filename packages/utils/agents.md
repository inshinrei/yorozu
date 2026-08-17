# Yorozu Utils - Agent Reference

Quick reference for `@yorozu/utils`. Names and behaviors match what is exported from `src/**` (re-exported from the package root).

Import as namespaces where the package does (`typed`, `u8`, `base64`, `hex`, `utf8`, `timers`, `compress`, `decompress`) or as named exports.

---

## arrays

Root exports: `TypedArray`, namespaces `typed` and `u8`.

### typed

- `TypedArray` — union of standard typed arrays (BigInt variants via `AnyToNever`).
- `compare(a, b)` — length first, then element-wise; returns `-1 | 0 | 1`.
- `equal(a, b)` — `compare(a, b) === 0`.
- `indexOf` / `lastIndexOf` — scalar search; optional `start` with native-style negative/clamp handling.
- `indexOfArray` / `lastIndexOfArray` / `includesArray` — subarray search.
- `includes` — SameValueZero (NaN matches NaN).
- `toDataView(buf)`, `view(ctor, buf)`, `getPlatformByteOrder()` (`"little" | "big"`, cached).

### u8

- Pool: `BufferPool` (`allocate`, `reset`; ctor `size` default 16KiB, max single pooled alloc = size/2), `setDefaultPool(size)`, `allocate(size)`, `allocateWith(init)` — **no `free`**.
- `empty`, `clone(buf)`, `readNthBit(byte, bit)`.
- `concat(bufs)` — empty → `allocate(0)`; single element returns that buffer (alias, not a copy); multi uses `Buffer.concat` when available.
- `concat2(a, b)`, `concat3(a, b, c)`.
- `reverse(buffer)` in-place; `toReversed(buffer)` new buffer.
- `xor(data, key)` (new buffer), `xorInPlace(data, key)` — key must be at least as long as data.
- Endian/nibble: `swap16` / `swap32` / `swap64` / `swapNibbles` (in-place; length must be multiple of width where applicable).

---

## bigint

- Bytes: `toBytes(value, length = 0, le = false)`, `fromBytes(buffer, le = false)`.
- `bitLength(n)`, `twoMultiplicity(n)`.
- `min` / `max` (variadic), `min2` / `max2`, `abs`.
- `euclideanGcd(a, b)` (non-negative result), `modPowBinary(base, exp, mod)`, `modInv(a, n)`.

---

## encoding

Namespaces only: `base64`, `hex`, `utf8`.

### base64

- `encode(bytes, url = false)`, `decode(data, url = false)`.
- `encodedLength(n)`, `decodedLength(n)`.
- Tables: `lookup`, `encodeLookup`.

### hex

- `encode(buf)`, `decode(data)`.
- `encodedLength(n)`, `decodedLength(n)`.

### utf8

- `encoder` (`TextEncoder`), `decoder` (`TextDecoder`).
- `encodedLength(data: string)` — UTF-8 byte length (no `encode`/`decode` helpers on the namespace).

---

## iterate

- `enumerate(iterable)` — yields `[index, value]` from `0`; **no `start` parameter**.

---

## misc

### assert

- `assert(condition, message?)`
- `assertHashKey(obj, key)`
- `unsafeCastType<T>(value)`
- `assertNotNull(value)`, `asNonNull(value)`
- `assertMatches(str, regex)` → `RegExpMatchArray`

### composer

- Types: `Middleware<C, R>`, `ComposedMiddleware<C, R>`
- `composeMiddlewares(middlewares, final?)` — onion middleware chain (not `compose`/`pipe`).

### guards

- `isNotUndefined`, `isNotNull`, `isBoolean`, `isTruthy`, `isFalsy`
- `isFunction`, `isNumber`, `isString`, `isSymbol`, `isBigInt`, `isObject`

### noop

- `noop()` only (no `asyncNoop`).

### objects

- `objectKeys`, `objectEntries`
- `clearUndefinedInPlace`
- Types: `MergeInsertions`, `DeepMerge`, `DeepMergeOptions`
- `deepMerge(into, from, options?)` — mutates `into`; strategies for undefined / properties / arrays / objects

### string

- `splitOnce(str, separator)`
- `assertStartsWith(str, prefix)`, `assertEndsWith(str, suffix)`
- Alias: `assertsEndsWith` → `assertEndsWith`

---

## async

- `sleep(ms, signal?)` — optional `AbortSignal`.
- `AsyncLock` — `acquire` / `release` / `with`.
- `AsyncQueue<T>` — bounded optional `maxSize`; `enqueue` / `tryEnqueue` / `next` / `nextOrWait` / `peek` / `end` / async iterator.
- `AsyncResource<T>` — **SWR-style cache** (`fetcher` + `expiresIn`), not acquire/release pooling. Options: `autoReload`, `autoReloadAfter`, `swr`, `swrValidator`, `fetcher`, `onError`. Methods: `setData`, `update`, `get`, `getCached`, `destroy`, `isStale`; `onUpdated` emitter. Types: `AsyncResourceContext`, `AsyncResourceOptions`.
- Concurrency “pool”: `asyncPool(iterable, executor, options?)`, `parallelMap(iterable, executor, options?)`, `AsyncPoolOptions`, `AggregateError`.
- `ConditionVariable` — `wait()`, `notify()` **broadcasts** all waiters (no `notifyOne`).
- `Deferred<T>`, `DeferredTracked<T>` (status / result / error).
- `Emitter<T>` — `add` / `remove` / `once` / `emit` / `forwardTo` / `listeners` / `clear` / `length`.
- `AsyncInterval` — `start` / `startNow` / `stop` / `onError` (handler receives `AbortSignal`).
- Namespace `timers`: `Timer`, `Interval`, `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval` (branded handles).

---

## structures

- `CustomMap<ExternalKey, InternalKey, V>` — Map with **external↔internal key mappers** (not hash/equality callbacks). Implements Map API + `getInternalMap`, `getOrInsert`, `getOrInsertComputed`.
- `CustomSet<ExternalKey, InternalKey>` — Set with the same mapper pattern.
- `Deque<T>` — double-ended queue; `DequeOptions.capacity`; front/back push/pop/peek, `at`, etc.
- `LruMap<K, V>` / `LruSet<T>` — capacity-limited LRU (**class names are `LruMap` / `LruSet`**, not `LRU*`). Optional custom `Map`/`Set` impl in ctor.

(`maybeWrapIterator` in `_iterator.ts` is internal, not re-exported from the package.)

---

## types

- `Brand<T, Name extends string>` — nominal branding.
- `TypesAreEqual<X, Y>` — type-level equality (type-challenges style).
- Errors: `unknownToError(err)`, `NotImplementedError`, `throwNotImplemented`, `throwUnreachable`.
- Misc: `NoneToVoidFunction`, `AnyFunction`, `AnyToVoidFunction`, `AnyToNever`, `MaybePromise`, `MaybeArray`, `Values`, `Truthy`, `UnsafeMutate`.
- Unions: `UnionToIntersection`, `LastOfUnion`, `UnionToTuple`.

---

## compress / decompress

Namespaces `compress` and `decompress` for RFC 1951 (raw DEFLATE), RFC 1952 (gzip), and RFC 1950 (zlib).

### compress

- `deflate(data, options?)` / `gzip(data, options?)` / `zlib(data, options?)` → `Uint8Array`
- Classes `Deflate`, `Gzip`, `Zlib`: `push(chunk, final?)` returns output bytes (empty if none yet); `flush(sync?)` on compressors
- `CompressOptions`: `level` 0–9 (default 6), `mem` 0–12, `dictionary`
- `GzipCompressOptions` also: `mtime` (`0` writes zeros), `filename`

### decompress

- `deflate` / `gzip` / `zlib` — format-specific
- `auto(data, options?)` — gzip if `1f 8b`, else zlib if CMF/FLG is valid (CM=8, CINFO≤7, 31-check), else raw DEFLATE
- Classes `Deflate`, `Gzip`, `Zlib` with `push(chunk, final?)`
- `DecompressOptions`: `dictionary`, `out` (truncates if short), `check` (default true; gzip CRC32+ISIZE, zlib Adler-32)
- gzip `push` continues across concatenated members

### checksums

- `crc32(data, seed?)`, `adler32(data, seed?)`
- Classes `Crc32` / `Adler32`: `update` / `digest`

### errors

`FlateError` and: `UnexpectedEofError`, `InvalidBlockTypeError`, `InvalidLengthLiteralError`, `InvalidDistanceError`, `InvalidHeaderError`, `StreamFinishedError`, `ChecksumMismatchError`.

---

Small, focused, tree-shakeable. Prefer named imports from `@yorozu/utils` (or the namespaces above).
