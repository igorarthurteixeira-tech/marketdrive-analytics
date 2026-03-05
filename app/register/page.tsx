"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import Link from "next/link"

export default function RegisterPage() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
        },
        emailRedirectTo:
          process.env.NEXT_PUBLIC_SITE_URL + "/login",
      },
    })

    if (error) {
      setMessage(error.message)
      setLoading(false)
      return
    }

    setMessage("Conta criada! Verifique seu email para confirmar.")
    setLoading(false)

    setTimeout(() => {
      router.push("/login")
    }, 2000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center flex-col px-6">
      <form
        onSubmit={handleRegister}
        className="w-full max-w-md space-y-4 p-8 border rounded-xl shadow-sm bg-white"
      >
        <h1 className="text-2xl font-bold text-center">
          Criar Conta
        </h1>

        <input
          type="text"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border p-3 rounded"
          required
        />

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
          minLength={6}
        />

        <button
          type="submit"
          className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-900 transition"
          disabled={loading}
        >
          {loading ? "Criando..." : "Criar Conta"}
        </button>

        {message && (
          <p className="text-sm text-center text-gray-600">
            {message}
          </p>
        )}
      </form>

      <p className="text-sm mt-6">
        Já tem conta?{" "}
        <Link
          href="/login"
          className="text-blue-600 hover:underline"
        >
          Fazer login
        </Link>
      </p>
    </div>
  )
}