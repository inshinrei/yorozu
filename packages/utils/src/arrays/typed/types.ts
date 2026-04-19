import { AnyToNever } from "../../types"

export type TypedArray =
    | Uint8Array
    | Uint16Array
    | Uint32Array
    | Int8Array
    | Int16Array
    | Int32Array
    | Float32Array
    | Float64Array
    | AnyToNever<BigInt64Array>
    | AnyToNever<BigUint64Array>
