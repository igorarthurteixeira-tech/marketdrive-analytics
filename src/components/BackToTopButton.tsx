"use client"

import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"
import { usePathname } from "next/navigation"

export default function BackToTopButton() {
  const [visible, setVisible] = useState(false)
  const pathname = usePathname()
  const isVehicleSlugPage = /^\/carros\/[^/]+$/.test(pathname)

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 420)
    }

    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`fixed right-6 z-[60] inline-flex h-11 w-11 items-center justify-center rounded-full bg-black text-white shadow-lg transition-all duration-300 ease-out hover:bg-gray-800 cursor-pointer ${
        isVehicleSlugPage ? "bottom-20" : "bottom-6"
      } ${
        visible
          ? "translate-y-0 opacity-100 pointer-events-auto"
          : "translate-y-2 opacity-0 pointer-events-none"
      }`}
      aria-label="Voltar ao topo"
    >
      <ArrowUp size={18} />
    </button>
  )
}
