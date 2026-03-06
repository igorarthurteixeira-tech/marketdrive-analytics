"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Menu } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

const SECTION_SHORTCUTS: Record<string, { id: string; label: string }[]> = {
  "/": [
    { id: "posicionamento", label: "Posicionamento" },
    { id: "base-destaque", label: "Base em destaque" },
    { id: "proximo-passo", label: "Decisão" },
  ],
}

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [profileName, setProfileName] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const { session, signOut } = useAuth()
  const user = session?.user
  const pathname = usePathname()
  const shortcuts = useMemo(() => SECTION_SHORTCUTS[pathname] ?? [], [pathname])
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour >= 18) return "Boa noite"
    if (hour >= 12) return "Boa tarde"
    return "Bom dia"
  }, [])

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40)
      if (menuOpen) setMenuOpen(false)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [menuOpen])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuOpen) return
      const target = event.target as Node | null
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false)
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    return () => window.removeEventListener("mousedown", handlePointerDown)
  }, [menuOpen])

  useEffect(() => {
    if (!shortcuts.length) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visible[0]) {
          setActiveSection(visible[0].target.id)
        }
      },
      {
        root: null,
        threshold: [0.25, 0.5, 0.75],
        rootMargin: "-40% 0px -45% 0px",
      }
    )

    const elements = shortcuts
      .map((shortcut) => document.getElementById(shortcut.id))
      .filter((element): element is HTMLElement => Boolean(element))

    elements.forEach((element) => observer.observe(element))

    return () => {
      elements.forEach((element) => observer.unobserve(element))
      observer.disconnect()
    }
  }, [shortcuts])

  // Buscar nome do perfil
  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) {
        setProfileName(null)
        return
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single()

      if (!error && data) {
        setProfileName(data.name)
      }
    }

    fetchProfile()
  }, [user])

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 backdrop-blur-md shadow-sm transition-all duration-300 ease-out ${
        scrolled
          ? "bg-gradient-to-b from-gray-300/96 via-gray-100/94 to-white/92 shadow-md"
          : "bg-gradient-to-b from-gray-300/94 via-gray-100/92 to-white/90"
      }`}
    >
      <div
        className={`max-w-7xl mx-auto px-8 flex items-center justify-between transition-all duration-300 ease-out ${
          scrolled ? "py-1.5" : "py-2"
        }`}
      >
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Base Automotiva"
            width={300}
            height={88}
            className={`w-auto transition-all duration-300 ease-out ${
              scrolled ? "h-9" : "h-12"
            }`}
            priority
          />
        </Link>

        <nav
          className={`flex items-center gap-6 lg:gap-8 text-sm font-medium tracking-wide transition-all duration-300 ${
            scrolled ? "opacity-90" : "opacity-100"
          }`}
        >
          {shortcuts.length > 0 && (
            <div className="hidden lg:flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.08em]">
              {shortcuts.map((shortcut) => (
                pathname === "/" ? (
                  <a
                    key={shortcut.id}
                    href={`#${shortcut.id}`}
                    className={`transition-colors ${
                      activeSection === shortcut.id
                        ? "text-black"
                        : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {shortcut.label}
                  </a>
                ) : (
                  <Link
                    key={shortcut.id}
                    href={`/#${shortcut.id}`}
                    className={`transition-colors ${
                      activeSection === shortcut.id
                        ? "text-black"
                        : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {shortcut.label}
                  </Link>
                )
              ))}
            </div>
          )}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-200 cursor-pointer ${
                menuOpen
                  ? "border-gray-500 bg-gray-100 text-black"
                  : "border-gray-300 text-gray-700 hover:text-black hover:border-gray-400 hover:bg-gray-50"
              }`}
              aria-label="Abrir menu de navegação"
            >
              <Menu
                size={16}
                className={`transition-transform duration-200 ${menuOpen ? "rotate-90" : "rotate-0"}`}
              />
              <span className="text-xs uppercase tracking-[0.08em]">Menu</span>
            </button>

            <div
              className={`absolute right-0 mt-2 w-52 rounded-xl border border-gray-200 backdrop-blur-sm shadow-lg p-2 origin-top-right transition-all duration-200 ${
                scrolled
                  ? "bg-gradient-to-b from-gray-300/96 via-gray-100/94 to-white/92"
                  : "bg-gradient-to-b from-gray-300/94 via-gray-100/92 to-white/90"
              } ${
                menuOpen
                  ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                  : "opacity-0 -translate-y-1 scale-95 pointer-events-none"
              }`}
            >
              {user ? (
                <p className="px-3 py-2 text-sm text-gray-600 border-b border-gray-200">
                  {greeting}, {profileName ?? user.email}
                </p>
              ) : null}

              <Link
                href="/carros"
                onClick={() => setMenuOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5 ${
                  user ? "mt-1" : ""
                }`}
              >
                Modelos
              </Link>
              <Link
                href="/assinatura"
                onClick={() => setMenuOpen(false)}
                className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5"
              >
                Assinatura
              </Link>

              {!user ? (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5"
                >
                  Login
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void signOut()
                  }}
                  className="mt-1 block w-full text-left rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-150"
                >
                  Logout
                </button>
              )}
            </div>
          </div>

        </nav>
      </div>
    </header>
  )
}
