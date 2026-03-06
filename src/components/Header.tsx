"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [profileName, setProfileName] = useState<string | null>(null)

  const { session, signOut } = useAuth()
  const user = session?.user

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

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
        scrolled ? "bg-white/90 shadow-md" : "bg-white/95"
      }`}
    >
      <div
        className={`max-w-7xl mx-auto px-8 flex items-center justify-between transition-all duration-300 ease-out ${
          scrolled ? "py-2" : "py-3"
        }`}
      >
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="Base Automotiva"
            width={300}
            height={88}
            className={`w-auto transition-all duration-300 ease-out ${
              scrolled ? "h-10" : "h-14"
            }`}
            priority
          />
        </Link>

        <nav
          className={`flex items-center gap-10 text-sm font-medium tracking-wide transition-all duration-300 ${
            scrolled ? "opacity-90" : "opacity-100"
          }`}
        >
          <Link
            href="/carros"
            className="text-gray-700 hover:text-black transition"
          >
            Modelos
          </Link>

          <Link
            href="/assinatura"
            className="text-gray-700 hover:text-black transition"
          >
            Assinatura
          </Link>

          {!user && (
            <Link
              href="/login"
              className="bg-black text-white px-5 py-2 rounded-lg hover:bg-gray-900 transition"
            >
              Login
            </Link>
          )}

          {user && (
            <div className="flex items-center gap-4">
              <span className="text-gray-700 text-sm">
                {profileName ?? user.email}
              </span>

              <button
                onClick={signOut}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition"
              >
                Logout
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
