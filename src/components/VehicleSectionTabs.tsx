"use client"

import { useEffect, useRef, useState } from "react"

type Shortcut = {
  id: string
  label: string
}

type VehicleSectionTabsProps = {
  shortcuts: Shortcut[]
}

const BOTTOM_DOCK_GAP_PX = 12

export default function VehicleSectionTabs({ shortcuts }: VehicleSectionTabsProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [headerOffset, setHeaderOffset] = useState(84)
  const [isVisible, setIsVisible] = useState(false)
  const [tabsHeight, setTabsHeight] = useState(60)
  const [visibleShortcuts, setVisibleShortcuts] = useState<Shortcut[]>([])
  const tabsRef = useRef<HTMLDivElement | null>(null)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const manualActiveIdRef = useRef<string | null>(null)
  const manualActiveUntilRef = useRef(0)

  useEffect(() => {
    const updateVisibleShortcuts = () => {
      const next = shortcuts.filter((shortcut) => Boolean(document.getElementById(shortcut.id)))
      setVisibleShortcuts(next)
    }

    updateVisibleShortcuts()
    const timer = window.setTimeout(updateVisibleShortcuts, 200)
    const observer = new MutationObserver(() => updateVisibleShortcuts())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [shortcuts])

  useEffect(() => {
    const updateHeaderOffset = () => {
      const header = document.querySelector<HTMLElement>('header[data-site-header="true"]')
      setHeaderOffset((header?.offsetHeight ?? 76) + 6)
    }

    updateHeaderOffset()
    window.addEventListener("resize", updateHeaderOffset)
    return () => {
      window.removeEventListener("resize", updateHeaderOffset)
    }
  }, [])

  useEffect(() => {
    let frame = 0

    const updateVisibility = () => {
      if (!anchorRef.current || !tabsRef.current) return

      const anchorRect = anchorRef.current.getBoundingClientRect()
      const nextHeight = tabsRef.current.offsetHeight || 60
      if (Math.abs(nextHeight - tabsHeight) > 1) {
        setTabsHeight(nextHeight)
      }

      const dockLine = window.innerHeight - BOTTOM_DOCK_GAP_PX - nextHeight
      const hysteresis = 8
      const shouldShow = isVisible
        ? anchorRect.top <= dockLine + hysteresis
        : anchorRect.top <= dockLine - hysteresis
      if (shouldShow !== isVisible) {
        setIsVisible(shouldShow)
      }
    }

    const scheduleDockUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updateVisibility()
      })
    }

    updateVisibility()
    window.addEventListener("scroll", scheduleDockUpdate, { passive: true })
    window.addEventListener("resize", scheduleDockUpdate)

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", scheduleDockUpdate)
      window.removeEventListener("resize", scheduleDockUpdate)
    }
  }, [isVisible, tabsHeight, visibleShortcuts])

  useEffect(() => {
    if (!visibleShortcuts.length) {
      setActiveSection(null)
      return
    }

    const elements = visibleShortcuts
      .map((shortcut) => document.getElementById(shortcut.id))
      .filter((element): element is HTMLElement => Boolean(element))

    if (!elements.length) return

    const resolveActiveByScroll = () => {
      const now = Date.now()
      if (manualActiveIdRef.current && now < manualActiveUntilRef.current) {
        setActiveSection(manualActiveIdRef.current)
        return
      }
      if (manualActiveIdRef.current && now >= manualActiveUntilRef.current) {
        manualActiveIdRef.current = null
      }

      // Linha de ativação: imediatamente abaixo da navbar.
      const triggerLine = headerOffset + 2
      let candidate = elements[0]

      for (const element of elements) {
        const heading =
          element.matches("h1,h2,h3,h4,h5,h6")
            ? element
            : element.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6")
        const anchor = heading ?? element
        if (anchor.getBoundingClientRect().top <= triggerLine) {
          candidate = element
        } else {
          break
        }
      }

      if (candidate?.id) setActiveSection(candidate.id)
    }
    window.addEventListener("scroll", resolveActiveByScroll, { passive: true })
    window.addEventListener("resize", resolveActiveByScroll)
    const frame = window.requestAnimationFrame(resolveActiveByScroll)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", resolveActiveByScroll)
      window.removeEventListener("resize", resolveActiveByScroll)
    }
  }, [headerOffset, visibleShortcuts])

  const scrollToShortcut = (id: string) => {
    const target = document.getElementById(id)
    if (!target) return

    const heading =
      target.matches("h1,h2,h3,h4,h5,h6")
        ? target
        : target.querySelector<HTMLElement>("h1,h2,h3,h4,h5,h6")
    const anchor = heading ?? target
    const targetTop = anchor.getBoundingClientRect().top + window.scrollY - (headerOffset + 6)
    manualActiveIdRef.current = id
    manualActiveUntilRef.current = Date.now() + 700
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" })
    setActiveSection(id)
  }

  if (!visibleShortcuts.length) return null

  return (
    <div ref={anchorRef} className="mb-8 h-px">
      <div
        className="fixed inset-x-0 z-50 px-3 transition-transform duration-500 ease-in-out"
        style={{
          bottom: `${BOTTOM_DOCK_GAP_PX}px`,
          transform: isVisible ? "translateY(0%)" : "translateY(140%)",
          pointerEvents: isVisible ? "auto" : "none",
        }}
        aria-live="polite"
      >
        <div ref={tabsRef} className="max-w-7xl mx-auto w-full">
          <div className="min-h-[50px] rounded-xl border border-gray-300 bg-white/95 px-2 py-2.5 shadow-lg backdrop-blur">
            <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {visibleShortcuts.map((shortcut) => (
                <button
                  key={shortcut.id}
                  type="button"
                  onClick={() => scrollToShortcut(shortcut.id)}
                  className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase leading-none tracking-[0.08em] transition-colors ${
                    activeSection === shortcut.id
                      ? "border-gray-600 bg-gray-800 text-white"
                      : "border-gray-300 bg-white text-gray-600 hover:border-gray-500 hover:text-black"
                  }`}
                >
                  {shortcut.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
