"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabaseClient"

type AuthContextType = {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  signOut: async () => {},
})

export default function AuthProvider({ children }: { children: React.ReactNode }) {

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const initSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!isMounted) return
        setSession(data.session)
      } catch {
        if (!isMounted) return
        setSession(null)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setLoading(false)
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }

  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }

  return (
    <AuthContext.Provider value={{ session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
