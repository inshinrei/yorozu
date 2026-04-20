import { Brand } from "../types/brand"

export type Timer = Brand<object, "Timer">
export type Interval = Brand<object, "Interval">

const setTimeoutWrap = ((...args: Parameters<typeof setTimeout>) => setTimeout(...args)) as unknown as <
    T extends (...args: any[]) => any,
>(
    fn: T,
    ms: number,
    ...args: Parameters<T>
) => Timer
const setIntervalWrap = ((...args: Parameters<typeof setInterval>) => setInterval(...args)) as unknown as <
    T extends (...args: any[]) => any,
>(
    fn: T,
    ms: number,
    ...args: Parameters<T>
) => Interval

const clearTimeoutWrap = ((...args: Parameters<typeof clearTimeout>) => clearTimeout(...args)) as unknown as (
    timer?: Timer,
) => void
const clearIntervalWrap = ((...args: Parameters<typeof clearInterval>) => clearInterval(...args)) as unknown as (
    timer?: Interval,
) => void

export {
    clearIntervalWrap as clearInterval,
    clearTimeoutWrap as clearTimeout,
    setIntervalWrap as setInterval,
    setTimeoutWrap as setTimeout,
}
