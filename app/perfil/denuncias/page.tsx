"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import {
  MODERATION_REASON_LABEL,
  MODERATION_SANCTION_TYPE_LABEL,
  MODERATION_STATUS_LABEL,
  MODERATION_WORKFLOW_STAGE_LABEL,
  type ModerationReason,
} from "@/lib/moderation"

type MyReportCase = {
  id: string
  reason: ModerationReason
  status: string
  content_href: string
  content_preview: string
  resolution_summary: string | null
}

type RawMyReportRow = {
  id: string
  details: string | null
  created_at: string
  case_id: string
}

type MyReportRow = RawMyReportRow & {
  moderation_cases: MyReportCase | null
}

type SanctionCaseRow = {
  id: string
  status: string
  workflow_stage: string
  sanction_applied: boolean
  sanction_type: string | null
  appeal_allowed: boolean
  appeal_deadline_at: string | null
  author_response_due_at: string | null
  correction_due_at: string | null
  correction_attempt_count: number
  correction_attempt_limit: number
  content_href: string
  content_preview: string
  resolution_summary: string | null
  last_author_request: string | null
  last_author_response: string | null
}

type AppealRow = {
  id: string
  case_id: string
  status: string
  summary: string | null
  resolution_summary: string | null
}

const formatDateTime = (value: string | null) => {
  if (!value) return null
  return new Date(value).toLocaleString("pt-BR")
}

export default function ProfileReportsPage() {
  const { session, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [reports, setReports] = useState<MyReportRow[]>([])
  const [authoredCases, setAuthoredCases] = useState<SanctionCaseRow[]>([])
  const [appealsByCaseId, setAppealsByCaseId] = useState<Record<string, AppealRow>>({})
  const [submittingAppealCaseId, setSubmittingAppealCaseId] = useState<string | null>(null)
  const [respondingCaseId, setRespondingCaseId] = useState<string | null>(null)
  const [authorResponses, setAuthorResponses] = useState<Record<string, string>>({})

  const loadData = async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setErrorMessage("")

    const [reportsRes, authoredCasesRes, appealsRes] = await Promise.all([
      supabase
        .from("moderation_case_reports")
        .select("id,details,created_at,case_id")
        .eq("reporter_user_id", session.user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("moderation_cases")
        .select(
          "id,status,workflow_stage,sanction_applied,sanction_type,appeal_allowed,appeal_deadline_at,author_response_due_at,correction_due_at,correction_attempt_count,correction_attempt_limit,content_href,content_preview,resolution_summary,last_author_request,last_author_response"
        )
        .eq("content_author_user_id", session.user.id)
        .order("updated_at", { ascending: false }),
      supabase
        .from("moderation_appeals")
        .select("id,case_id,status,summary,resolution_summary")
        .eq("appellant_user_id", session.user.id),
    ])

    if (reportsRes.error || authoredCasesRes.error || appealsRes.error) {
      setErrorMessage(
        reportsRes.error?.message ||
          authoredCasesRes.error?.message ||
          appealsRes.error?.message ||
          "Falha ao carregar denúncias."
      )
      setLoading(false)
      return
    }

    const rawReports = (reportsRes.data as RawMyReportRow[] | null) ?? []
    const reportCaseIds = Array.from(new Set(rawReports.map((row) => row.case_id).filter(Boolean)))

    const casesById: Record<string, MyReportCase> = {}
    if (reportCaseIds.length > 0) {
      const reportCasesRes = await supabase
        .from("moderation_cases")
        .select("id,reason,status,content_href,content_preview,resolution_summary")
        .in("id", reportCaseIds)

      if (reportCasesRes.error) {
        setErrorMessage(reportCasesRes.error.message || "Falha ao carregar casos das denúncias.")
        setLoading(false)
        return
      }

      for (const row of (reportCasesRes.data as MyReportCase[] | null) ?? []) {
        casesById[row.id] = row
      }
    }

    setReports(
      rawReports.map((row) => ({
        ...row,
        moderation_cases: casesById[row.case_id] ?? null,
      }))
    )

    setAuthoredCases((authoredCasesRes.data as SanctionCaseRow[] | null) ?? [])

    const appealsMap: Record<string, AppealRow> = {}
    for (const appeal of (appealsRes.data as AppealRow[] | null) ?? []) {
      appealsMap[appeal.case_id] = appeal
    }
    setAppealsByCaseId(appealsMap)
    setLoading(false)
  }

  useEffect(() => {
    if (authLoading) return
    if (!session?.user?.id) {
      setLoading(false)
      return
    }
    void loadData()
  }, [authLoading, session?.user?.id])

  const handleSubmitAppeal = async (caseId: string) => {
    setSubmittingAppealCaseId(caseId)
    setErrorMessage("")
    setSuccessMessage("")

    const result = await supabase.rpc("moderation_submit_appeal", {
      p_case_id: caseId,
      p_summary: null,
    })

    if (result.error) {
      setErrorMessage(`Falha ao enviar recurso: ${result.error.message}`)
      setSubmittingAppealCaseId(null)
      return
    }

    setSuccessMessage("Recurso enviado com sucesso.")
    await loadData()
    setSubmittingAppealCaseId(null)
  }

  const handleSubmitAuthorResponse = async (caseId: string) => {
    const response = authorResponses[caseId]?.trim()
    if (!response) {
      setErrorMessage("Escreva a explicação antes de enviar.")
      return
    }

    setRespondingCaseId(caseId)
    setErrorMessage("")
    setSuccessMessage("")

    const result = await supabase.rpc("moderation_submit_author_response", {
      p_case_id: caseId,
      p_response: response,
    })

    if (result.error) {
      setErrorMessage(`Falha ao enviar explicação: ${result.error.message}`)
      setRespondingCaseId(null)
      return
    }

    setSuccessMessage("Explicação enviada para análise.")
    setAuthorResponses((prev) => ({ ...prev, [caseId]: "" }))
    await loadData()
    setRespondingCaseId(null)
  }

  const reportCards = useMemo(() => {
    return reports.map((report) => {
      const caseData = report.moderation_cases
      const reason = caseData?.reason
      const status = caseData?.status ?? "enviada"
      return {
        id: report.id,
        href: caseData?.content_href ?? "/feed",
        preview: caseData?.content_preview ?? "Conteúdo indisponível",
        reasonLabel: reason ? MODERATION_REASON_LABEL[reason] : "Motivo não identificado",
        statusLabel: MODERATION_STATUS_LABEL[status] ?? status,
        resolution: caseData?.resolution_summary,
        createdAt: report.created_at,
      }
    })
  }, [reports])

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-5xl px-6 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          Carregando painel de denúncias...
        </div>
      </main>
    )
  }

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-5xl px-6 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-700">Faça login para acompanhar denúncias.</p>
          <Link
            href="/login"
            className="mt-4 inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
          >
            Ir para login
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 pt-28 pb-16">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Painel de denúncias</h1>
            <p className="mt-1 text-sm text-gray-600">
              Acompanhe denúncias enviadas, solicitações da moderação, correções e recursos.
            </p>
          </div>
          <Link
            href="/perfil"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Voltar ao perfil
          </Link>
        </div>
      </section>

      {errorMessage ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </section>
      ) : null}

      {successMessage ? (
        <section className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          {successMessage}
        </section>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Suas denúncias</h2>
        {!reportCards.length ? (
          <p className="mt-3 text-sm text-gray-600">Você ainda não enviou denúncias.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {reportCards.map((card) => (
              <article key={card.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">{new Date(card.createdAt).toLocaleString("pt-BR")}</p>
                  <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                    {card.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-800">{card.preview}</p>
                <p className="mt-2 text-xs text-gray-600">Motivo: {card.reasonLabel}</p>
                {card.resolution ? <p className="mt-2 text-xs text-gray-700">Parecer: {card.resolution}</p> : null}
                <Link
                  href={card.href}
                  className="mt-3 inline-flex text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-black"
                >
                  Abrir conteúdo
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Casos sobre seus conteúdos</h2>
        {!authoredCases.length ? (
          <p className="mt-3 text-sm text-gray-600">Nenhum caso envolvendo seus conteúdos no momento.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {authoredCases.map((item) => {
              const appeal = appealsByCaseId[item.id]
              const deadlineExpired =
                item.appeal_deadline_at ? new Date(item.appeal_deadline_at).getTime() < Date.now() : false
              const canAppeal = item.appeal_allowed && !appeal && !deadlineExpired
              const canRespond = item.workflow_stage === "aguardando_autor"
              const canEditForReview =
                item.workflow_stage === "aguardando_correcao" && item.sanction_type === "suspensao_ate_regularizacao"

              return (
                <article key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                      {MODERATION_STATUS_LABEL[item.status] ?? item.status}
                    </span>
                    <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                      {MODERATION_WORKFLOW_STAGE_LABEL[item.workflow_stage] ?? item.workflow_stage}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-gray-800">{item.content_preview || "Conteúdo sem prévia."}</p>

                  {item.sanction_type ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Penalidade: {MODERATION_SANCTION_TYPE_LABEL[item.sanction_type] ?? item.sanction_type}
                    </p>
                  ) : null}
                  {item.resolution_summary ? (
                    <p className="mt-2 text-xs text-gray-700">Parecer: {item.resolution_summary}</p>
                  ) : null}
                  {item.last_author_request ? (
                    <p className="mt-2 text-xs text-gray-700">Pedido da moderação: {item.last_author_request}</p>
                  ) : null}
                  {item.last_author_response ? (
                    <p className="mt-2 text-xs text-gray-700">Sua última resposta: {item.last_author_response}</p>
                  ) : null}
                  {item.author_response_due_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Prazo para explicação: {formatDateTime(item.author_response_due_at)}
                    </p>
                  ) : null}
                  {item.correction_due_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Prazo para correção: {formatDateTime(item.correction_due_at)}
                    </p>
                  ) : null}
                  {item.sanction_type === "suspensao_ate_regularizacao" ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Tentativas de correção: {item.correction_attempt_count}/{item.correction_attempt_limit}
                    </p>
                  ) : null}
                  {item.appeal_deadline_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Prazo para recurso: {formatDateTime(item.appeal_deadline_at)}
                    </p>
                  ) : null}

                  {appeal ? (
                    <p className="mt-2 text-xs text-gray-700">
                      Status do recurso: {MODERATION_STATUS_LABEL[appeal.status] ?? appeal.status}
                    </p>
                  ) : null}

                  {canRespond ? (
                    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
                        Responder à moderação
                      </p>
                      <textarea
                        value={authorResponses[item.id] ?? ""}
                        onChange={(event) =>
                          setAuthorResponses((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                        rows={4}
                        placeholder="Escreva sua explicação..."
                        className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSubmitAuthorResponse(item.id)}
                        disabled={respondingCaseId === item.id}
                        className="mt-3 rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                      >
                        {respondingCaseId === item.id ? "Enviando..." : "Enviar explicação"}
                      </button>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link
                      href={item.content_href || "/feed"}
                      className="text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-black"
                    >
                      Abrir conteúdo
                    </Link>
                    {canEditForReview ? (
                      <Link
                        href={`/postagens/editar?caseId=${item.id}`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Corrigir publicação
                      </Link>
                    ) : null}
                    {canAppeal ? (
                      <button
                        type="button"
                        onClick={() => void handleSubmitAppeal(item.id)}
                        disabled={submittingAppealCaseId === item.id}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {submittingAppealCaseId === item.id ? "Enviando recurso..." : "Recorrer"}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
