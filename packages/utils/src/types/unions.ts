export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never
export type LastOfUnion<U> = UnionToIntersection<U extends any ? () => U : never> extends () => infer R ? R : never
export type UnionToTuple<U, Acc extends Array<any> = [], L = LastOfUnion<U>> = [U] extends [never] ? Acc : UnionToTuple<Exclude<U, L>, [L, ...Acc]>
