import { NextRequest } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const getAuthenticatedUser = async (request: NextRequest) => {
  const authHeader = request.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return { user: null, error: "Token de autenticação ausente." }
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data, error } = await supabaseAdmin.auth.getUser(token)

  if (error || !data.user) {
    return { user: null, error: "Sessão inválida." }
  }

  return { user: data.user, error: null }
}

