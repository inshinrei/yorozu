export type NoneToVoidFunction = () => void
export type AnyFunction = (...args: any[]) => any
export type AnyToVoidFunction = (...args: any[]) => void

export type AnyToNever<T> = any extends T ? never : T

export type MaybePromise<T> = Promise<T> | T

export type MaybeArray<T> = Array<T> | T

export type Values<T> = T[keyof T]

export type Truthy<T> = T extends false | "" | 0 | null | undefined ? never : T
export type UnsafeMutate<T> = {
    -readonly [P in keyof T]: T[P]
}
