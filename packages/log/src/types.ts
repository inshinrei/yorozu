import type { HaluaLogger, SpanFlowApi } from "halua"

export type Logger = HaluaLogger<Record<string, unknown>, SpanFlowApi> & SpanFlowApi
