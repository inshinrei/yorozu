import {
    ANIMATION_LEVELS,
    pickAnimationLevelFromRatio,
    stepAnimationLevel,
    type AnimationLevel,
} from "@yorozu/animations"
import { getAnimationLevel, setAnimationLevel, subscribeAnimationLevel } from "./level"

function valueText(level: AnimationLevel): string {
    if (level === "low") return "Low"
    if (level === "med") return "Medium"
    return "High"
}

export function mountLevelSwitch(host: HTMLElement): () => void {
    let root = document.createElement("div")
    root.className = "pg-level"
    root.setAttribute("role", "slider")
    root.tabIndex = 0
    root.setAttribute("aria-valuemin", "0")
    root.setAttribute("aria-valuemax", "2")
    root.setAttribute("aria-label", "Animation level")

    let filler = document.createElement("i")
    filler.className = "pg-level-filler"

    let widget = document.createElement("i")
    widget.className = "pg-level-widget"

    root.append(filler, widget)

    function sync(level: AnimationLevel): void {
        root.dataset.level = level
        filler.dataset.level = level
        widget.dataset.level = level
        root.classList.toggle("no-motion", level === "low")
        root.setAttribute("aria-valuenow", String(ANIMATION_LEVELS.indexOf(level)))
        root.setAttribute("aria-valuetext", valueText(level))
    }

    function pickFromClientX(clientX: number): void {
        let rect = root.getBoundingClientRect()
        if (rect.width <= 0) return
        let t = (clientX - rect.left) / rect.width
        setAnimationLevel(pickAnimationLevelFromRatio(t))
    }

    function onPointerDown(event: PointerEvent): void {
        event.stopPropagation()
        if (event.button !== 0) return
        pickFromClientX(event.clientX)
    }

    function onClick(event: MouseEvent): void {
        event.stopPropagation()
        event.preventDefault()
    }

    function onKeydown(event: KeyboardEvent): void {
        let level = getAnimationLevel()
        if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault()
            event.stopPropagation()
            setAnimationLevel(stepAnimationLevel(level, 1))
            return
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault()
            event.stopPropagation()
            setAnimationLevel(stepAnimationLevel(level, -1))
            return
        }
        if (event.key === "Home") {
            event.preventDefault()
            event.stopPropagation()
            setAnimationLevel("low")
            return
        }
        if (event.key === "End") {
            event.preventDefault()
            event.stopPropagation()
            setAnimationLevel("high")
        }
    }

    root.addEventListener("pointerdown", onPointerDown)
    root.addEventListener("click", onClick)
    root.addEventListener("keydown", onKeydown)

    sync(getAnimationLevel())
    let unsub = subscribeAnimationLevel(sync)
    host.append(root)

    return () => {
        unsub()
        root.removeEventListener("pointerdown", onPointerDown)
        root.removeEventListener("click", onClick)
        root.removeEventListener("keydown", onKeydown)
        root.remove()
    }
}
