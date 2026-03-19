"use client"

import { FormEvent, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/AuthProvider"
import { formatPostMediaUploadError, validatePostMediaFile } from "@/lib/postMedia"
import { supabase } from "@/lib/supabaseClient"

type OwnVersionOption = {
  id: string
  slug: string
  year: number | null
  version_name: string | null
  vehicles:
    | {
        name: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }[]
    | {
        name: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }
    | null
}

const toVehicleLabel = (version: OwnVersionOption) => {
  const vehicle = Array.isArray(version.vehicles) ? version.vehicles[0] : version.vehicles
  const brandData = Array.isArray(vehicle?.brands) ? vehicle.brands[0] : vehicle?.brands
  const brand = brandData?.name ?? ""
  const model = vehicle?.name ?? ""
  const versionName = version.version_name ?? ""
  const year = version.year ?? ""
  return [brand, model, versionName, year].filter(Boolean).join(" ")
}

export default function NovaPostagemPage() {
  const router = useRouter()
  const { session, loading } = useAuth()

  const [postType, setPostType] = useState<"noticia" | "publicacao">("publicacao")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "">("")
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [relatedVersionId, setRelatedVersionId] = useState("")
  const [ownVersions, setOwnVersions] = useState<OwnVersionOption[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const fetchOwnVersions = async () => {
      if (!session?.user?.id) return

      const res = await supabase
        .from("vehicle_versions")
        .select("id,slug,year,version_name,vehicles(name,brands(name))")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false })
        .limit(60)

      setOwnVersions((res.data as OwnVersionOption[] | null) ?? [])
    }

    void fetchOwnVersions()
  }, [session?.user?.id])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!session?.user?.id) {
      setErrorMessage("Faça login para publicar.")
      return
    }

    const text = description.trim()
    if (!text) {
      setErrorMessage("Escreva uma descrição para a postagem.")
      return
    }

    setSubmitting(true)
    setErrorMessage("")

    let mediaPath: string | null = null
    if (mediaFile) {
      const mediaValidationError = validatePostMediaFile(mediaFile, mediaKind)
      if (mediaValidationError) {
        setErrorMessage(mediaValidationError)
        setSubmitting(false)
        return
      }

      const extension = mediaFile.name.split(".").pop()?.toLowerCase() ?? "bin"
      const fileName = `${Date.now()}-${session.user.id}.${extension}`
      const upload = await supabase.storage.from("posts-media").upload(fileName, mediaFile)
      if (upload.error) {
        setErrorMessage(formatPostMediaUploadError(upload.error.message, mediaFile, mediaKind))
        setSubmitting(false)
        return
      }
      mediaPath = fileName
    }

    const insert = await supabase.from("user_posts").insert({
      author_user_id: session.user.id,
      type: postType,
      title: title.trim() || null,
      description: text,
      media_path: mediaPath,
      media_kind: mediaKind || null,
      related_vehicle_version_id: relatedVersionId || null,
    })

    if (insert.error) {
      setErrorMessage(`Falha ao publicar: ${insert.error.message}`)
      setSubmitting(false)
      return
    }

    router.push("/feed")
    router.refresh()
  }

  if (loading) {
    return (
      <main className="min-h-screen max-w-3xl mx-auto px-6 md:px-8 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Carregando...
        </div>
      </main>
    )
  }

  if (!session?.user?.id) {
    return (
      <main className="min-h-screen max-w-3xl mx-auto px-6 md:px-8 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-700">Faça login para criar uma postagem.</p>
          <Link href="/login" className="mt-3 inline-block text-sm text-black underline underline-offset-4">
            Ir para login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-6 md:px-8 pt-28 pb-16">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Nova postagem</h1>
          <Link
            href="/feed"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Voltar ao feed
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <select
              value={postType}
              onChange={(event) => setPostType(event.target.value as "noticia" | "publicacao")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="publicacao">Publicação</option>
              <option value="noticia">Notícia</option>
            </select>

            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Título (opcional)"
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <textarea
            rows={4}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Escreva sua publicação..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />

          <div className="grid md:grid-cols-[170px_1fr] gap-3">
            <select
              value={mediaKind}
              onChange={(event) => setMediaKind(event.target.value as "image" | "video" | "")}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Sem mídia</option>
              <option value="image">Foto</option>
              <option value="video">Vídeo</option>
            </select>

            <input
              type="file"
              accept={mediaKind === "video" ? "video/*" : "image/*,video/*"}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                setMediaFile(file)
                if (!file) return
                if (file.type.startsWith("video/")) setMediaKind("video")
                if (file.type.startsWith("image/")) setMediaKind("image")
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Limites de upload: fotos ate 10 MB e videos ate 50 MB.
          </div>

          <select
            value={relatedVersionId}
            onChange={(event) => setRelatedVersionId(event.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
          >
            <option value="">Sem vínculo com veículo</option>
            {ownVersions.map((version) => (
              <option key={version.id} value={version.id}>
                {toVehicleLabel(version)}
              </option>
            ))}
          </select>

          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
          >
            {submitting ? "Publicando..." : "Publicar"}
          </button>
        </form>
      </section>
    </main>
  )
}

