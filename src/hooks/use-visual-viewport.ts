"use client"

import * as React from "react"

export interface ViewportBox {
  /** The visible height, in px: on a phone, what the on-screen keyboard leaves. */
  height: number
  /** How far the visible area's bottom edge sits above the window's bottom edge, in px. */
  bottom: number
}

/**
 * The part of the window that's actually visible, while `active`. iOS doesn't shrink the
 * layout for its keyboard, so `bottom: 0` lands behind it; this says where to sit
 * instead. Null where the browser has no visual viewport, or while inactive.
 */
export function useVisualViewport(active: boolean): ViewportBox | null {
  const [box, setBox] = React.useState<ViewportBox | null>(null)

  React.useEffect(() => {
    const view = window.visualViewport
    if (!active || !view) {
      setBox(null)
      return
    }
    const update = () => {
      const height = Math.round(view.height)
      const bottom = Math.max(0, Math.round(window.innerHeight - view.offsetTop - view.height))
      setBox((last) => (last && last.height === height && last.bottom === bottom ? last : { height, bottom }))
    }
    update()
    view.addEventListener("resize", update)
    view.addEventListener("scroll", update)
    return () => {
      view.removeEventListener("resize", update)
      view.removeEventListener("scroll", update)
    }
  }, [active])

  return box
}
