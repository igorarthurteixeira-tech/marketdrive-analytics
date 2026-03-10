"use client"

import { useAuth } from "@/components/AuthProvider"
import BrandLogo from "@/components/BrandLogo"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

type BrandRow = {
  id: string
  name: string
  slug: string
  logo_path: string | null
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function toLogoPreviewSrc(raw: string | null | undefined) {
  if (!raw) return null
  const value = raw.trim()
  if (!value) return null
  if (value.startsWith("http://") || value.startsWith("https://")) return value
  return `/brands/${value}`
}

export default function AdminMarcasPage() {
  const { session, loading: authLoading } = useAuth()
  const router = useRouter()

  const [plan, setPlan] = useState<string | null>(null)
  const [brands, setBrands] = useState<BrandRow[]>([])
  const [loadingBrands, setLoadingBrands] = useState(true)

  const [search, setSearch] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [logoPath, setLogoPath] = useState("")
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const loadBrands = async () => {
    setLoadingBrands(true)
    const { data, error } = await supabase
      .from("brands")
      .select("id,name,slug,logo_path")
      .order("name")

    if (error) {
      setErrorMessage(`Falha ao carregar marcas: ${error.message}`)
      setLoadingBrands(false)
      return
    }

    setBrands((data as BrandRow[] | null) ?? [])
    setLoadingBrands(false)
  }

  useEffect(() => {
    if (authLoading) return

    const checkAccess = async () => {
      if (!session?.user) {
        router.replace("/login")
        return
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .single()

      if (error) {
        setErrorMessage("Não foi possível validar permissões.")
        return
      }

      if (data?.plan !== "profissional") {
        router.replace("/assinatura")
        return
      }

      setPlan(data.plan)
      await loadBrands()
    }

    void checkAccess()
  }, [session, authLoading, router])

  const filteredBrands = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return brands
    return brands.filter((brand) => {
      const haystack = `${brand.name} ${brand.slug} ${brand.logo_path ?? ""}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [brands, search])

  const resetForm = () => {
    setEditingId(null)
    setName("")
    setLogoPath("")
    setLogoFile(null)
  }

  const startEditing = (brand: BrandRow) => {
    setEditingId(brand.id)
    setName(brand.name)
    setLogoPath(brand.logo_path ?? "")
    setLogoFile(null)
    setErrorMessage("")
    setSuccessMessage("")
  }

  const uploadLogoIfNeeded = async (slug: string) => {
    if (!logoFile) return null

    const extension = logoFile.name.includes(".")
      ? logoFile.name.split(".").pop()?.toLowerCase() || "png"
      : "png"
    const fileName = `${slug}-${Date.now()}.${extension}`

    const upload = await supabase.storage
      .from("brand-logos")
      .upload(fileName, logoFile, { upsert: true })

    if (upload.error) {
      throw new Error(
        `Falha no upload da logo: ${upload.error.message}. Verifique se o bucket "brand-logos" existe e as policies estão configuradas.`
      )
    }

    const publicUrlData = supabase.storage.from("brand-logos").getPublicUrl(fileName)
    return publicUrlData.data.publicUrl
  }

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setErrorMessage("")
    setSuccessMessage("")

    const trimmedName = name.trim()
    if (!trimmedName) {
      setErrorMessage("Informe o nome da marca.")
      return
    }

    setSaving(true)

    try {
      const slug = normalize(trimmedName)
      if (!slug) throw new Error("Não foi possível gerar slug da marca.")

      const uploadedLogoUrl = await uploadLogoIfNeeded(slug)
      const manualLogoPath = logoPath.trim()
      const finalLogoPath = uploadedLogoUrl ?? (manualLogoPath || null)

      if (editingId) {
        const { error } = await supabase
          .from("brands")
          .update({
            name: trimmedName,
            slug,
            logo_path: finalLogoPath,
          })
          .eq("id", editingId)

        if (error) throw new Error(`Falha ao atualizar marca: ${error.message}`)
        setSuccessMessage("Marca atualizada com sucesso.")
      } else {
        const { error } = await supabase
          .from("brands")
          .insert({
            name: trimmedName,
            slug,
            logo_path: finalLogoPath,
          })

        if (error) throw new Error(`Falha ao criar marca: ${error.message}`)
        setSuccessMessage("Marca criada com sucesso.")
      }

      resetForm()
      await loadBrands()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Erro inesperado.")
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || plan === null) return null

  const previewLogoSrc = toLogoPreviewSrc(logoPath)

  return (
    <main className="mx-auto max-w-6xl px-6 pt-28 pb-10">
      <section className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Gerenciar Marcas</h1>
        <p className="mt-2 text-sm text-gray-600">
          Cadastre novas marcas e atualize fotos das marcas existentes.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-4 h-fit"
        >
          <h2 className="text-lg font-semibold">
            {editingId ? "Editar marca" : "Nova marca"}
          </h2>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Acura"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Logo (URL ou nome de arquivo)</label>
            <input
              type="text"
              value={logoPath}
              onChange={(e) => setLogoPath(e.target.value)}
              placeholder="https://... ou marca.png"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            />
            <p className="text-xs text-gray-500">
              Se você enviar arquivo abaixo, ele substitui este campo no salvamento.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Upload de logo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <BrandLogo
              src={previewLogoSrc}
              brandName={name || "?"}
              className="h-10 w-10 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{name || "Prévia da marca"}</p>
              <p className="text-xs text-gray-500 truncate">{previewLogoSrc ?? "Sem logo definida"}</p>
            </div>
          </div>

          {errorMessage ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              {successMessage}
            </p>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar marca"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Limpar
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Marcas cadastradas</h2>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar marca..."
              className="w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </div>

          {loadingBrands ? (
            <p className="text-sm text-gray-600">Carregando marcas...</p>
          ) : filteredBrands.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma marca encontrada.</p>
          ) : (
            <div className="max-h-[620px] overflow-auto space-y-2 pr-1">
              {filteredBrands.map((brand) => (
                <button
                  key={brand.id}
                  type="button"
                  onClick={() => startEditing(brand)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <BrandLogo
                      src={toLogoPreviewSrc(brand.logo_path)}
                      brandName={brand.name}
                      className="h-9 w-9 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 truncate">{brand.name}</p>
                      <p className="text-xs text-gray-500 truncate">{brand.logo_path ?? "Sem logo"}</p>
                    </div>
                    <span className="text-xs font-medium text-gray-500">Editar</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
