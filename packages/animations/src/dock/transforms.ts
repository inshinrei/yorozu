export type DockMode = "none" | "fade" | "slide"
export type DockEdge = "right" | "left" | "top" | "bottom"
export type DockPanelState = { transform: string; opacity: string }
export type DockTransforms = { closed: DockPanelState; open: DockPanelState }

export const DOCK_FADE_OFFSET: string = "1.5rem"
export const DOCK_MS: number = 300
export const DOCK_EASING: string = "cubic-bezier(0.25, 1, 0.5, 1)"

function isVertical(edge: DockEdge): boolean {
    return edge === "top" || edge === "bottom"
}

function isNegative(edge: DockEdge): boolean {
    return edge === "left" || edge === "top"
}

function translate(edge: DockEdge, value: string): string {
    let axis = isVertical(edge) ? "Y" : "X"
    return `translate${axis}(${value})`
}

export function dockTransforms(mode: Exclude<DockMode, "none">, edge: DockEdge): DockTransforms {
    let axisZero = translate(edge, "0")
    if (mode === "fade") {
        let offset = isNegative(edge) ? `-${DOCK_FADE_OFFSET}` : DOCK_FADE_OFFSET
        return {
            closed: { transform: translate(edge, offset), opacity: "0" },
            open: { transform: axisZero, opacity: "1" },
        }
    }
    let full = isNegative(edge) ? "-100%" : "100%"
    return {
        closed: { transform: translate(edge, full), opacity: "1" },
        open: { transform: axisZero, opacity: "1" },
    }
}
