"use client"

import Link from "next/link"
import { FormEvent, Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuth } from "@/components/AuthProvider"
import { formatPostMediaUploadError, validatePostMediaFile } from "@/lib/postMedia"
import { supabase } from "@/lib/supabaseClient"

type EditablePost = {
  id: string
  author_user_id: string
  type: "noticia" | "publicacao"
  title: string | null
  description: string
  media_path: string | null
  media_kind: "image" | "video" | null
  related_vehicle_version_id: string | null
  moderation_state: string
  moderation_last_case_id: string | null
}

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

function EditarPostagemPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { session, loading } = useAuth()

  const caseId = searchParams.get("caseId")
  const postIdParam = searchParams.get("postId")

  const [post, setPost] = useState<EditablePost | null>(null)
  const [postType, setPostType] = useState<"noticia" | "publicacao">("publicacao")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [mediaKind, setMediaKind] = useState<"image" | "video" | "">("")
  const [mediaFile, setMediaFile] = useState<File | null>(null)
  const [removeCurrentMedia, setRemoveCurrentMedia] = useState(false)
  const [relatedVersionId, setRelatedVersionId] = useState("")
  const [ownVersions, setOwnVersions] = useState<OwnVersionOption[]>([])
  const [revisionNote, setRevisionNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const fetchContext = async () => {
      if (!session?.user?.id) return
      setPageLoading(true)
      setErrorMessage("")

      const versionsRes = await supabase
        .from("vehicle_versions")
        .select("id,slug,year,version_name,vehicles(name,brands(name))")
        .eq("created_by", session.user.id)
        .order("created_at", { ascending: false })
        .limit(60)

      setOwnVersions((versionsRes.data as OwnVersionOption[] | null) ?? [])

      let resolvedPostId = postIdParam

      if (!resolvedPostId && caseId) {
        const caseRes = await supabase
          .from("moderation_cases")
          .select("id,content_id,content_type,content_author_user_id")
          .eq("id", caseId)
          .maybeSingle()

        if (caseRes.error) {
          setErrorMessage(`Falha ao localizar caso: ${caseRes.error.message}`)
          setPageLoading(false)
          return
        }

        if (!caseRes.data || caseRes.data.content_type !== "user_post") {
          setErrorMessage("Caso de moderação inválido para edição de publicação.")
          setPageLoading(false)
          return
        }

        if (caseRes.data.content_author_user_id !== session.user.id) {
          setErrorMessage("Apenas o autor pode corrigir esta publicação.")
          setPageLoading(false)
          return
        }

        resolvedPostId = caseRes.data.content_id
      }

      if (!resolvedPostId) {
        setErrorMessage("Nenhuma publicação foi informada para edição.")
        setPageLoading(false)
        return
      }

      const postRes = await supabase
        .from("user_posts")
        .select(
          "id,author_user_id,type,title,description,media_path,media_kind,related_vehicle_version_id,moderation_state,moderation_last_case_id"
        )
        .eq("id", resolvedPostId)
        .maybeSingle()

      if (postRes.error) {
        setErrorMessage(`Falha ao carregar publicação: ${postRes.error.message}`)
        setPageLoading(false)
        return
      }

      if (!postRes.data || postRes.data.author_user_id !== session.user.id) {
        setErrorMessage("Publicação não encontrada ou sem permissão de edição.")
        setPageLoading(false)
        return
      }

      const postData = postRes.data as EditablePost
      setPost(postData)
      setPostType(postData.type)
      setTitle(postData.title ?? "")
      setDescription(postData.description)
      setMediaKind(postData.media_kind ?? "")
      setRelatedVersionId(postData.related_vehicle_version_id ?? "")
      setPageLoading(false)
    }

    void fetchContext()
  }, [caseId, postIdParam, session?.user?.id])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!session?.user?.id || !post) {
      setErrorMessage("Faça login para editar a publicação.")
      return
    }

    const text = description.trim()
    if (!text) {
      setErrorMessage("Escreva uma descrição para a publicação.")
      return
    }

    setSubmitting(true)
    setErrorMessage("")

    let nextMediaPath = post.media_path
    let nextMediaKind: "image" | "video" | null = mediaKind || null

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

      nextMediaPath = fileName
      if (mediaFile.type.startsWith("video/")) nextMediaKind = "video"
      if (mediaFile.type.startsWith("image/")) nextMediaKind = "image"

      if (post.media_path) {
        await supabase.storage.from("posts-media").remove([post.media_path])
      }
    } else if (removeCurrentMedia) {
      if (post.media_path) {
        await supabase.storage.from("posts-media").remove([post.media_path])
      }
      nextMediaPath = null
      nextMediaKind = null
    }

    const updateRes = await supabase
      .from("user_posts")
      .update({
        type: postType,
        title: title.trim() || null,
        description: text,
        media_path: nextMediaPath,
        media_kind: nextMediaKind,
        related_vehicle_version_id: relatedVersionId || null,
      })
      .eq("id", post.id)
      .eq("author_user_id", session.user.id)

    if (updateRes.error) {
      setErrorMessage(`Falha ao salvar publicação: ${updateRes.error.message}`)
      setSubmitting(false)
      return
    }

    const shouldSubmitRevision =
      post.moderation_state === "suspended_revision" && (caseId || post.moderation_last_case_id)

    if (shouldSubmitRevision) {
      const revisionRes = await supabase.rpc("moderation_submit_post_revision", {
        p_case_id: caseId ?? post.moderation_last_case_id,
        p_summary: revisionNote.trim() || null,
      })

      if (revisionRes.error) {
        setErrorMessage(`Publicação salva, mas falhou ao reenviar para análise: ${revisionRes.error.message}`)
        setSubmitting(false)
        return
      }
    }

    router.push("/perfil/denuncias")
    router.refresh()
  }

  if (loading || pageLoading) {
    return (
      <main className="min-h-screen max-w-3xl mx-auto px-6 md:px-8 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
          Carregando edição...
        </div>
      </main>
    )
  }

  if (!session?.user?.id || !post) {
    return (
      <main className="min-h-screen max-w-3xl mx-auto px-6 md:px-8 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-sm text-gray-700">{errorMessage || "Publicação indisponível para edição."}</p>
          <Link href="/perfil/denuncias" className="mt-3 inline-block text-sm text-black underline underline-offset-4">
            Voltar ao painel
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen max-w-3xl mx-auto px-6 md:px-8 pt-28 pb-16">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Editar publicação</h1>
          <Link
            href="/perfil/denuncias"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Voltar ao painel
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
            rows={5}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Atualize sua publicação..."
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

          {post.media_path ? (
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={removeCurrentMedia}
                onChange={(event) => setRemoveCurrentMedia(event.target.checked)}
                className="h-4 w-4"
              />
              Remover mídia atual
            </label>
          ) : null}

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

          {post.moderation_state === "suspended_revision" ? (
            <textarea
              rows={3}
              value={revisionNote}
              onChange={(event) => setRevisionNote(event.target.value)}
              placeholder="Explique brevemente o que foi corrigido (opcional)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          ) : null}

          {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
          >
            {submitting
              ? "Salvando..."
              : post.moderation_state === "suspended_revision"
                ? "Salvar e reenviar para análise"
                : "Salvar alterações"}
          </button>
        </form>
      </section>
    </main>
  )
}

export default function EditarPostagemPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen max-w-3xl mx-auto px-6 md:px-8 pt-28 pb-16">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
            Carregando edição...
          </div>
        </main>
      }
    >
      <EditarPostagemPageContent />
    </Suspense>
  )
}
