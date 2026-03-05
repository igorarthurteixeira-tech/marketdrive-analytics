"use client"

import Link from "next/link"
import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setLoading(false)
    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center flex-col">

      <form
        onSubmit={handleLogin}
        className="w-full max-w-md space-y-4 p-8 border rounded-xl"
      >
        <h1 className="text-2xl font-bold">Login</h1>

        <input
          type="email"
          placeholder="Seu email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-3 rounded"
          required
        />

        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border p-3 rounded"
          required
        />

        <button
          type="submit"
          className="w-full bg-black text-white py-3 rounded-lg"
          disabled={loading}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="text-sm text-center mt-4">
        Não tem conta?{" "}
        <Link
          href="/register"
          className="text-blue-600 hover:underline"
        >
          Criar conta
        </Link>
      </p>

    </div>
  )
}