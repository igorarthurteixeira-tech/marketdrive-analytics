"use client"

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

type CommentRow = {
  id: string
  content: string
  created_by: string | null
  created_at: string
  parent_comment_id: string | null
  reply_to_user_id: string | null
  is_pinned?: boolean | null
  pinned_at?: string | null
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

type ProfileRow = {
  id: string
  name: string | null
}

type QuotedPoint = {
  pointId: string
  text: string
  authorName: string
}

type CommentCard = {
  comment: CommentRow
  commentStats: VoteStats
  authorName: string
  replyToAuthorName: string | null
}

type CommentSortMode = "visibility" | "recency"
const REPLIES_PAGE_SIZE = 16

const getInitialSortMode = (vehicleVersionId: string): CommentSortMode => {
  if (typeof window === "undefined") return "visibility"
  const saved = window.localStorage.getItem(`comment-sort:${vehicleVersionId}`)
  return saved === "recency" || saved === "visibility" ? saved : "visibility"
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
  vehicleOwnerId,
}: {
  vehicleVersionId: string
  vehicleOwnerId?: string | null
}) {
  const { session } = useAuth()

  const [comments, setComments] = useState<CommentRow[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, VoteStats>>({})
  const [newComment, setNewComment] = useState("")
  const [quotedPoint, setQuotedPoint] = useState<QuotedPoint | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingComment, setSavingComment] = useState(false)
  const [savingReply, setSavingReply] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)
  const [threadEnabled, setThreadEnabled] = useState(true)
  const [pinEnabled, setPinEnabled] = useState(true)
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({})
  const [visibleRepliesByThread, setVisibleRepliesByThread] = useState<Record<string, number>>({})
  const [sortMode, setSortMode] = useState<CommentSortMode>(() =>
    getInitialSortMode(vehicleVersionId)
  )
  const [errorMessage, setErrorMessage] = useState("")

  const canInteract = Boolean(session?.user?.id)
  const canPinComments = Boolean(session?.user?.id && vehicleOwnerId && session.user.id === vehicleOwnerId)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    const fullSelect =
      "id,content,created_by,created_at,parent_comment_id,reply_to_user_id,is_pinned,pinned_at"
    const legacySelect = "id,content,created_by,created_at,parent_comment_id,reply_to_user_id"
    const minimalSelect = "id,content,created_by,created_at"

    const fullRes = await supabase
      .from("vehicle_comments")
      .select(fullSelect)
      .eq("vehicle_version_id", vehicleVersionId)
      .order("created_at", { ascending: false })

    let mappedComments: CommentRow[] = []

    if (fullRes.error) {
      if (/column|schema cache/i.test(fullRes.error.message ?? "")) {
        setPinEnabled(false)
        const legacyRes = await supabase
          .from("vehicle_comments")
          .select(legacySelect)
          .eq("vehicle_version_id", vehicleVersionId)
          .order("created_at", { ascending: false })

        if (legacyRes.error) {
          setThreadEnabled(false)
          const minimalRes = await supabase
            .from("vehicle_comments")
            .select(minimalSelect)
            .eq("vehicle_version_id", vehicleVersionId)
            .order("created_at", { ascending: false })

          if (minimalRes.error) {
            setErrorMessage("Falha ao carregar comentarios.")
            setLoading(false)
            return
          }

          mappedComments = (
            (minimalRes.data as Omit<
              CommentRow,
              "parent_comment_id" | "reply_to_user_id" | "is_pinned" | "pinned_at"
            >[]) ?? []
          ).map((item) => ({
            ...item,
            parent_comment_id: null,
            reply_to_user_id: null,
            is_pinned: false,
            pinned_at: null,
          }))
        } else {
          setThreadEnabled(true)
          mappedComments = ((legacyRes.data as Omit<CommentRow, "is_pinned" | "pinned_at">[]) ?? []).map(
            (item) => ({
              ...item,
              is_pinned: false,
              pinned_at: null,
            })
          )
        }
      } else {
        setErrorMessage("Falha ao carregar comentarios.")
        setLoading(false)
        return
      }
    } else {
      setThreadEnabled(true)
      setPinEnabled(true)
      mappedComments = (fullRes.data as CommentRow[]) ?? []
    }

    setComments(mappedComments)

    const authorIds = Array.from(
      new Set(
        mappedComments
          .flatMap((item) => [item.created_by, item.reply_to_user_id])
          .filter(Boolean)
      )
    ) as string[]

    if (authorIds.length) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", authorIds)

      const mappedNames: Record<string, string> = {}
      for (const row of (profilesData as ProfileRow[] | null) ?? []) {
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
        const nextStats: Record<string, VoteStats> = {}
        for (const row of (votesData as VoteRow[]) ?? []) {
          if (!nextStats[row.comment_id]) {
            nextStats[row.comment_id] = { confirmed: 0, denied: 0, userVote: null }
          }

          if (row.is_confirmed) {
            nextStats[row.comment_id].confirmed += 1
          } else {
            nextStats[row.comment_id].denied += 1
          }

          if (session?.user?.id && row.user_id === session.user.id) {
            nextStats[row.comment_id].userVote = row.is_confirmed
          }
        }
        setStats(nextStats)
      }
    } else {
      setStats({})
    }

    setLoading(false)
  }, [vehicleVersionId, session])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchData])

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        pointId?: string
        text?: string
        authorName?: string
      }>
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
    return () => window.removeEventListener("quote-positive-point", handler as EventListener)
  }, [])

  useEffect(() => {
    const storageKey = `comment-sort:${vehicleVersionId}`
    window.localStorage.setItem(storageKey, sortMode)
  }, [sortMode, vehicleVersionId])

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

    const content = quotedPoint ? `${serializeQuote(quotedPoint)}\n${body}` : body

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

  const togglePin = async (rootComment: CommentRow) => {
    if (!canPinComments || !session?.user?.id) {
      setErrorMessage("Somente o autor do veiculo pode fixar comentarios.")
      return
    }
    if (!pinEnabled) {
      setErrorMessage("Fixacao de comentarios sera liberada apos a migracao do banco.")
      return
    }

    const targetValue = !rootComment.is_pinned

    if (targetValue) {
      const pinnedCount = comments.filter(
        (item) => item.parent_comment_id === null && item.is_pinned
      ).length
      if (pinnedCount >= 3) {
        setErrorMessage("Voce pode fixar no maximo 3 comentarios.")
        return
      }
    }

    const { error } = await supabase
      .from("vehicle_comments")
      .update({
        is_pinned: targetValue,
        pinned_at: targetValue ? new Date().toISOString() : null,
      })
      .eq("id", rootComment.id)

    if (error) {
      setErrorMessage(`Falha ao atualizar fixacao: ${error.message}`)
      return
    }

    setErrorMessage("")
    await fetchData()
  }

  const submitReply = async (e: FormEvent, rootComment: CommentRow) => {
    e.preventDefault()
    if (!canInteract) {
      setErrorMessage("Faca login para responder comentarios.")
      return
    }
    if (!threadEnabled) {
      setErrorMessage("Respostas em discussao serao liberadas apos a migracao do banco.")
      return
    }
    const rootId = rootComment.id
    const body = (replyDrafts[rootId] ?? "").trim()
    if (!body) return

    setSavingReply(true)
    setErrorMessage("")

    const { error } = await supabase
      .from("vehicle_comments")
      .insert({
        vehicle_version_id: vehicleVersionId,
        content: body,
        created_by: session?.user?.id,
        parent_comment_id: rootId,
        reply_to_user_id: rootComment.created_by,
      })

    if (error) {
      setErrorMessage(`Falha ao publicar resposta: ${error.message}`)
      setSavingReply(false)
      return
    }

    setReplyDrafts((prev) => ({ ...prev, [rootId]: "" }))
    await fetchData()
    setSavingReply(false)
  }

  const handleRepliesToggle = (threadId: string, totalReplies: number) => {
    const isExpanded = Boolean(expandedThreads[threadId])
    const currentVisible = visibleRepliesByThread[threadId] ?? REPLIES_PAGE_SIZE

    if (!isExpanded) {
      setExpandedThreads((prev) => ({ ...prev, [threadId]: true }))
      setVisibleRepliesByThread((prev) => ({
        ...prev,
        [threadId]: Math.min(REPLIES_PAGE_SIZE, totalReplies),
      }))
      return
    }

    if (currentVisible < totalReplies) {
      setVisibleRepliesByThread((prev) => ({
        ...prev,
        [threadId]: Math.min(currentVisible + REPLIES_PAGE_SIZE, totalReplies),
      }))
      return
    }

    setExpandedThreads((prev) => ({ ...prev, [threadId]: false }))
    setVisibleRepliesByThread((prev) => ({ ...prev, [threadId]: REPLIES_PAGE_SIZE }))
  }

  const cards = useMemo(() => {
    return comments.map((comment) => {
      const commentStats = stats[comment.id] ?? { confirmed: 0, denied: 0, userVote: null }
      return {
        comment,
        commentStats,
        authorName: comment.created_by ? authorNames[comment.created_by] ?? "Autor" : "Autor",
        replyToAuthorName: comment.reply_to_user_id
          ? authorNames[comment.reply_to_user_id] ?? "Autor"
          : null,
      } satisfies CommentCard
    })
  }, [comments, stats, authorNames])

  const { rootCards, repliesByRootId } = useMemo(() => {
    const cardById = new Map(cards.map((card) => [card.comment.id, card]))
    const roots: CommentCard[] = []
    const repliesByRoot: Record<string, CommentCard[]> = {}

    for (const card of cards) {
      const parentId = card.comment.parent_comment_id
      const parentExists = parentId ? cardById.has(parentId) : false
      if (!parentId || !parentExists) roots.push(card)
    }

    const rootIds = new Set(roots.map((card) => card.comment.id))
    for (const card of cards) {
      const parentId = card.comment.parent_comment_id
      if (!parentId || !rootIds.has(parentId)) continue
      if (!repliesByRoot[parentId]) repliesByRoot[parentId] = []
      repliesByRoot[parentId].push(card)
    }

    for (const key of Object.keys(repliesByRoot)) {
      repliesByRoot[key].sort(
        (a, b) => new Date(b.comment.created_at).getTime() - new Date(a.comment.created_at).getTime()
      )
    }

    return { rootCards: roots, repliesByRootId: repliesByRoot }
  }, [cards])

  const sortedRootCards = useMemo(() => {
    const getTime = (value: string) => new Date(value).getTime()
    const getVotes = (card: CommentCard) => card.commentStats.confirmed + card.commentStats.denied
    const pinnedPriority = (card: CommentCard) => (card.comment.is_pinned ? 1 : 0)
    const pinTime = (card: CommentCard) =>
      card.comment.pinned_at ? new Date(card.comment.pinned_at).getTime() : 0

    const list = [...rootCards]
    if (sortMode === "recency") {
      list.sort((a, b) => {
        if (pinnedPriority(b) !== pinnedPriority(a)) return pinnedPriority(b) - pinnedPriority(a)
        if (pinnedPriority(a) === 1) return pinTime(b) - pinTime(a)
        return getTime(b.comment.created_at) - getTime(a.comment.created_at)
      })
      return list
    }

    // Visibilidade: mistura volume de respostas + volume de votos na thread.
    list.sort((a, b) => {
      if (pinnedPriority(b) !== pinnedPriority(a)) return pinnedPriority(b) - pinnedPriority(a)
      if (pinnedPriority(a) === 1) return pinTime(b) - pinTime(a)

      const repliesA = repliesByRootId[a.comment.id] ?? []
      const repliesB = repliesByRootId[b.comment.id] ?? []

      const scoreA =
        repliesA.length * 2 +
        getVotes(a) +
        repliesA.reduce((acc, item) => acc + getVotes(item), 0)
      const scoreB =
        repliesB.length * 2 +
        getVotes(b) +
        repliesB.reduce((acc, item) => acc + getVotes(item), 0)

      if (scoreB !== scoreA) return scoreB - scoreA
      return getTime(b.comment.created_at) - getTime(a.comment.created_at)
    })

    return list
  }, [rootCards, repliesByRootId, sortMode])

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleCommentSubmit}
        className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white"
      >
        <label className="block text-sm font-medium text-gray-700">Deixe um comentario</label>

        {quotedPoint ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-300 px-3 py-1.5 text-xs">
            <Link
              href={`#positive-point-${quotedPoint.pointId}`}
              className="text-gray-700 hover:text-black underline-offset-2 hover:underline"
            >
              Citando: {quotedPoint.authorName}
            </Link>
            <span className="text-gray-500">&quot;{quotedPoint.text}&quot;</span>
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
      {!loading && !rootCards.length ? (
        <p className="text-gray-600">Nenhum comentario ainda. Seja o primeiro a comentar.</p>
      ) : null}

      {!loading && rootCards.length ? (
        <div className="flex items-center justify-end gap-2">
          <label htmlFor="comment-sort" className="text-xs text-gray-500">
            Ordenar por
          </label>
          <select
            id="comment-sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as CommentSortMode)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="visibility">Mais comentado</option>
            <option value="recency">Mais novo para mais antigo</option>
          </select>
        </div>
      ) : null}

      {sortedRootCards.map((rootCard) => {
        const rootId = rootCard.comment.id
        const replies = repliesByRootId[rootId] ?? []
        const expanded = Boolean(expandedThreads[rootId])
        const visibleCount = visibleRepliesByThread[rootId] ?? REPLIES_PAGE_SIZE
        const visibleReplies = expanded ? replies.slice(0, visibleCount) : []
        const parsedRoot = parseCommentContent(rootCard.comment.content)

        return (
          <section key={rootId}>
            <article className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm">
              {rootCard.comment.is_pinned ? (
                <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                  Comentário fixado pelo autor
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  {rootCard.comment.created_by ? (
                    <Link
                      href={`/perfil/${rootCard.comment.created_by}`}
                      className="text-sm font-medium text-gray-700 hover:text-black underline-offset-2 hover:underline"
                    >
                      {rootCard.authorName}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium text-gray-700">{rootCard.authorName}</span>
                  )}
                  {rootCard.comment.is_pinned ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700">
                      Fixado
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(rootCard.comment.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>

              {parsedRoot.quote ? (
                <Link
                  href={`#positive-point-${parsedRoot.quote.pointId}`}
                  className="inline-flex items-center rounded-full bg-gray-100 border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:text-black hover:bg-gray-50 mb-2"
                >
                  Citou ponto de {parsedRoot.quote.authorName}: &quot;{parsedRoot.quote.text}&quot;
                </Link>
              ) : null}

              {parsedRoot.body ? <p className="text-gray-900">{parsedRoot.body}</p> : null}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => vote(rootCard.comment.id, true)}
                  disabled={!canInteract || submittingVoteId === rootCard.comment.id}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    rootCard.commentStats.userVote === true
                      ? "bg-green-600 border-green-600 text-white"
                      : "border-green-300 text-green-700 hover:bg-green-50"
                  }`}
                >
                  Confirmar ({rootCard.commentStats.confirmed})
                </button>
                <button
                  type="button"
                  onClick={() => vote(rootCard.comment.id, false)}
                  disabled={!canInteract || submittingVoteId === rootCard.comment.id}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    rootCard.commentStats.userVote === false
                      ? "bg-red-600 border-red-600 text-white"
                      : "border-red-300 text-red-700 hover:bg-red-50"
                  }`}
                >
                  Negar ({rootCard.commentStats.denied})
                </button>
                {session?.user?.id && rootCard.comment.created_by === session.user.id ? (
                  <button
                    type="button"
                    onClick={() => deleteComment(rootCard.comment.id)}
                    disabled={deletingCommentId === rootCard.comment.id}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deletingCommentId === rootCard.comment.id ? "Apagando..." : "Apagar"}
                  </button>
                ) : null}
                {canPinComments ? (
                  <button
                    type="button"
                    onClick={() => void togglePin(rootCard.comment)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                      rootCard.comment.is_pinned
                        ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {rootCard.comment.is_pinned ? "Desafixar" : "Fixar"}
                  </button>
                ) : null}
              </div>

              {replies.length ? (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => handleRepliesToggle(rootId, replies.length)}
                    className="text-xs text-gray-600 hover:text-black underline-offset-2 hover:underline cursor-pointer"
                  >
                    {!expanded
                      ? `Exibir respostas (${replies.length})`
                      : visibleCount < replies.length
                        ? "Exibir mais 16 comentários"
                        : "Ocultar respostas"}
                  </button>

                  {expanded ? (
                    <div className="mt-2 space-y-2">
                      {visibleReplies.map((reply) => {
                        const parsedReply = parseCommentContent(reply.comment.content)
                        return (
                          <div key={reply.comment.id} className="rounded-md bg-gray-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-3 mb-1">
                              {reply.comment.created_by ? (
                                <Link
                                  href={`/perfil/${reply.comment.created_by}`}
                                  className="text-xs font-medium text-gray-700 hover:text-black underline-offset-2 hover:underline"
                                >
                                  {reply.authorName}
                                </Link>
                              ) : (
                                <span className="text-xs font-medium text-gray-700">{reply.authorName}</span>
                              )}
                              <span className="text-[11px] text-gray-500">
                                {new Date(reply.comment.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>

                            {reply.replyToAuthorName ? (
                              <p className="text-[11px] text-gray-500 mb-1">@{reply.replyToAuthorName}</p>
                            ) : null}

                            {parsedReply.body ? <p className="text-sm text-gray-900">{parsedReply.body}</p> : null}

                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => vote(reply.comment.id, true)}
                                disabled={!canInteract || submittingVoteId === reply.comment.id}
                                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                  reply.commentStats.userVote === true
                                    ? "bg-green-600 border-green-600 text-white"
                                    : "border-green-300 text-green-700 hover:bg-green-50"
                                }`}
                              >
                                Confirmar ({reply.commentStats.confirmed})
                              </button>
                              <button
                                type="button"
                                onClick={() => vote(reply.comment.id, false)}
                                disabled={!canInteract || submittingVoteId === reply.comment.id}
                                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                  reply.commentStats.userVote === false
                                    ? "bg-red-600 border-red-600 text-white"
                                    : "border-red-300 text-red-700 hover:bg-red-50"
                                }`}
                              >
                                Negar ({reply.commentStats.denied})
                              </button>
                              {session?.user?.id && reply.comment.created_by === session.user.id ? (
                                <button
                                  type="button"
                                  onClick={() => deleteComment(reply.comment.id)}
                                  disabled={deletingCommentId === reply.comment.id}
                                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {deletingCommentId === reply.comment.id ? "Apagando..." : "Apagar"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canInteract && threadEnabled ? (
                <form onSubmit={(e) => void submitReply(e, rootCard.comment)} className="mt-3">
                  <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-white">
                    <textarea
                      value={replyDrafts[rootId] ?? ""}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [rootId]: e.target.value }))
                      }
                      rows={2}
                      placeholder="Escreva sua resposta..."
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={!canInteract || savingReply}
                        className="bg-black text-white px-3 py-1.5 text-sm rounded-lg hover:bg-gray-900 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {savingReply ? "Publicando..." : "Responder"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}
            </article>
          </section>
        )
      })}
    </div>
  )
}
