"use client"

import Link from "next/link"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

type CommentRow = {
  id: string
  content: string
  created_by: string | null
  created_at: string
}

type VoteRow = {
  comment_id: string
  user_id: string
  is_confirmed: boolean
}

type VoteStats = {
  confirmed: number
  denied: number
  userVote: boolean | null
}

type QuotedPoint = {
  pointId: string
  text: string
  authorName: string
}

const QUOTE_PREFIX = "[[QUOTE|"

const serializeQuote = (quote: QuotedPoint) =>
  `${QUOTE_PREFIX}${quote.pointId}|${encodeURIComponent(quote.text)}|${encodeURIComponent(quote.authorName)}]]`

const parseCommentContent = (content: string): { quote: QuotedPoint | null; body: string } => {
  if (!content.startsWith(QUOTE_PREFIX)) {
    return { quote: null, body: content }
  }

  const endIndex = content.indexOf("]]")
  if (endIndex === -1) {
    return { quote: null, body: content }
  }

  const header = content.slice(QUOTE_PREFIX.length, endIndex)
  const [pointId, rawText, rawAuthor] = header.split("|")
  if (!pointId || !rawText || !rawAuthor) {
    return { quote: null, body: content }
  }

  const body = content.slice(endIndex + 2).trimStart()
  return {
    quote: {
      pointId,
      text: decodeURIComponent(rawText),
      authorName: decodeURIComponent(rawAuthor),
    },
    body,
  }
}

export default function CommentDiscussionSection({
  vehicleVersionId,
}: {
  vehicleVersionId: string
}) {
  const { session } = useAuth()

  const [comments, setComments] = useState<CommentRow[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, VoteStats>>({})
  const [newComment, setNewComment] = useState("")
  const [quotedPoint, setQuotedPoint] = useState<QuotedPoint | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingComment, setSavingComment] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState("")

  const canInteract = Boolean(session?.user?.id)

  const getStatsFromRows = (rows: VoteRow[]) => {
    const next: Record<string, VoteStats> = {}

    for (const row of rows) {
      if (!next[row.comment_id]) {
        next[row.comment_id] = { confirmed: 0, denied: 0, userVote: null }
      }

      if (row.is_confirmed) {
        next[row.comment_id].confirmed += 1
      } else {
        next[row.comment_id].denied += 1
      }

      if (session?.user?.id && row.user_id === session.user.id) {
        next[row.comment_id].userVote = row.is_confirmed
      }
    }

    return next
  }

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage("")

    const { data: commentsData, error: commentsError } = await supabase
      .from("vehicle_comments")
      .select("id,content,created_by,created_at")
      .eq("vehicle_version_id", vehicleVersionId)
      .order("created_at", { ascending: false })

    if (commentsError) {
      setErrorMessage("Falha ao carregar comentarios.")
      setLoading(false)
      return
    }

    const mappedComments = (commentsData as CommentRow[]) ?? []
    setComments(mappedComments)

    const authorIds = Array.from(
      new Set(mappedComments.map((item) => item.created_by).filter(Boolean))
    ) as string[]

    if (authorIds.length) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", authorIds)

      const mappedNames: Record<string, string> = {}
      for (const row of (profilesData as any[]) ?? []) {
        mappedNames[row.id] = row.name ?? "Autor"
      }
      setAuthorNames(mappedNames)
    } else {
      setAuthorNames({})
    }

    const commentIds = mappedComments.map((item) => item.id)
    if (commentIds.length) {
      const { data: votesData, error: votesError } = await supabase
        .from("vehicle_comment_votes")
        .select("comment_id,user_id,is_confirmed")
        .in("comment_id", commentIds)

      if (votesError) {
        setErrorMessage("Falha ao carregar avaliacoes dos comentarios.")
      } else {
        setStats(getStatsFromRows((votesData as VoteRow[]) ?? []))
      }
    } else {
      setStats({})
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [vehicleVersionId, session?.user?.id])

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ pointId?: string; text?: string; authorName?: string }>
      const pointId = customEvent.detail?.pointId?.trim()
      const quotedText = customEvent.detail?.text?.trim()
      const authorName = customEvent.detail?.authorName?.trim() ?? "Autor"
      if (!pointId || !quotedText) return

      setQuotedPoint({
        pointId,
        text: quotedText,
        authorName,
      })
    }

    window.addEventListener("quote-positive-point", handler as EventListener)
    return () => {
      window.removeEventListener("quote-positive-point", handler as EventListener)
    }
  }, [])

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canInteract) {
      setErrorMessage("Faca login para comentar.")
      return
    }

    const body = newComment.trim()
    if (!body && !quotedPoint) return

    setSavingComment(true)
    setErrorMessage("")

    const content = quotedPoint
      ? `${serializeQuote(quotedPoint)}\n${body}`
      : body

    const { error } = await supabase
      .from("vehicle_comments")
      .insert({
        vehicle_version_id: vehicleVersionId,
        content,
        created_by: session?.user?.id,
      })

    if (error) {
      setErrorMessage(`Falha ao publicar comentario: ${error.message}`)
      setSavingComment(false)
      return
    }

    setNewComment("")
    setQuotedPoint(null)
    await fetchData()
    setSavingComment(false)
  }

  const vote = async (commentId: string, isConfirmed: boolean) => {
    if (!canInteract || !session?.user?.id) {
      setErrorMessage("Faca login para avaliar comentarios.")
      return
    }

    setSubmittingVoteId(commentId)
    setErrorMessage("")

    const currentVote = stats[commentId]?.userVote

    const { error } =
      currentVote === isConfirmed
        ? await supabase
            .from("vehicle_comment_votes")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", session.user.id)
        : await supabase
            .from("vehicle_comment_votes")
            .upsert(
              {
                comment_id: commentId,
                user_id: session.user.id,
                is_confirmed: isConfirmed,
              },
              { onConflict: "comment_id,user_id" }
            )

    if (error) {
      setErrorMessage(`Falha ao registrar avaliacao: ${error.message}`)
      setSubmittingVoteId(null)
      return
    }

    await fetchData()
    setSubmittingVoteId(null)
  }

  const deleteComment = async (commentId: string) => {
    if (!session?.user?.id) {
      setErrorMessage("Faca login para apagar seu comentario.")
      return
    }

    setDeletingCommentId(commentId)
    setErrorMessage("")

    const { error } = await supabase
      .from("vehicle_comments")
      .delete()
      .eq("id", commentId)
      .eq("created_by", session.user.id)

    if (error) {
      setErrorMessage(`Falha ao apagar comentario: ${error.message}`)
      setDeletingCommentId(null)
      return
    }

    await fetchData()
    setDeletingCommentId(null)
  }

  const cards = useMemo(() => {
    return comments.map((comment) => {
      const commentStats = stats[comment.id] ?? { confirmed: 0, denied: 0, userVote: null }
      return {
        comment,
        commentStats,
        authorName: comment.created_by ? authorNames[comment.created_by] ?? "Autor" : "Autor",
      }
    })
  }, [comments, stats, authorNames])

  return (
    <div className="space-y-4">
      <form onSubmit={handleCommentSubmit} className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white">
        <label className="block text-sm font-medium text-gray-700">Deixe um comentario</label>

        {quotedPoint ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-300 px-3 py-1.5 text-xs">
            <Link
              href={`#positive-point-${quotedPoint.pointId}`}
              className="text-gray-700 hover:text-black underline-offset-2 hover:underline"
            >
              Citando: {quotedPoint.authorName}
            </Link>
            <span className="text-gray-500">"{quotedPoint.text}"</span>
            <button
              type="button"
              onClick={() => setQuotedPoint(null)}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
              aria-label="Remover citacao"
            >
              x
            </button>
          </div>
        ) : null}

        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
          placeholder="Escreva sua opiniao sobre esta versao..."
          className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />
        <button
          type="submit"
          disabled={!canInteract || savingComment}
          className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {savingComment ? "Publicando..." : "Publicar"}
        </button>
      </form>

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {loading ? <p className="text-gray-500">Carregando comentarios...</p> : null}
      {!loading && !cards.length ? (
        <p className="text-gray-600">Nenhum comentario ainda. Seja o primeiro a comentar.</p>
      ) : null}

      {cards.map(({ comment, commentStats, authorName }) => {
        const parsed = parseCommentContent(comment.content)

        return (
        <article key={comment.id} className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-2">
            {comment.created_by ? (
              <Link
                href={`/perfil/${comment.created_by}`}
                className="text-sm font-medium text-gray-700 hover:text-black underline-offset-2 hover:underline"
              >
                {authorName}
              </Link>
            ) : (
              <span className="text-sm font-medium text-gray-700">{authorName}</span>
            )}
            <span className="text-xs text-gray-500">
              {new Date(comment.created_at).toLocaleDateString("pt-BR")}
            </span>
          </div>

          {parsed.quote ? (
            <Link
              href={`#positive-point-${parsed.quote.pointId}`}
              className="inline-flex items-center rounded-full bg-gray-100 border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:text-black hover:bg-gray-50 mb-2"
            >
              Citou ponto de {parsed.quote.authorName}: "{parsed.quote.text}"
            </Link>
          ) : null}

          {parsed.body ? <p className="text-gray-900">{parsed.body}</p> : null}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => vote(comment.id, true)}
              disabled={!canInteract || submittingVoteId === comment.id}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                commentStats.userVote === true
                  ? "bg-green-600 border-green-600 text-white"
                  : "border-green-300 text-green-700 hover:bg-green-50"
              }`}
            >
              Confirmar ({commentStats.confirmed})
            </button>

            <button
              type="button"
              onClick={() => vote(comment.id, false)}
              disabled={!canInteract || submittingVoteId === comment.id}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                commentStats.userVote === false
                  ? "bg-red-600 border-red-600 text-white"
                  : "border-red-300 text-red-700 hover:bg-red-50"
              }`}
            >
              Negar ({commentStats.denied})
            </button>

            {session?.user?.id && comment.created_by === session.user.id ? (
              <button
                type="button"
                onClick={() => deleteComment(comment.id)}
                disabled={deletingCommentId === comment.id}
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {deletingCommentId === comment.id ? "Apagando..." : "Apagar"}
              </button>
            ) : null}
          </div>
        </article>
      )})}
    </div>
  )
}
