import {
    defaultAnimationLevel,
    parseAnimationLevel,
    prefersReducedMotion,
    type AnimationLevel,
} from "@yorozu/animations"

export let LEVEL_KEY = "yorozu-animations-level"

type Listener = (level: AnimationLevel) => void

let listeners = new Set<Listener>()
let current: AnimationLevel = readStored()

function readStored(): AnimationLevel {
    let parsed = parseAnimationLevel(localStorage.getItem(LEVEL_KEY))
    if (parsed) return parsed
    let seeded = defaultAnimationLevel(prefersReducedMotion())
    localStorage.setItem(LEVEL_KEY, seeded)
    return seeded
}

function applyDocument(level: AnimationLevel): void {
    document.documentElement.dataset.animationLevel = level
}

export function getAnimationLevel(): AnimationLevel {
    return current
}

export function setAnimationLevel(next: AnimationLevel): void {
    if (next === current) return
    current = next
    localStorage.setItem(LEVEL_KEY, next)
    applyDocument(next)
    for (let listener of listeners) listener(next)
}

export function subscribeAnimationLevel(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

applyDocument(current)
