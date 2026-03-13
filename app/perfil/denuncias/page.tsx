"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import { MODERATION_REASON_LABEL, MODERATION_STATUS_LABEL, type ModerationReason } from "@/lib/moderation"

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

type MyReportRow = Omit<RawMyReportRow, "moderation_cases"> & {
  moderation_cases: MyReportCase | null
}

type SanctionCaseRow = {
  id: string
  status: string
  sanction_applied: boolean
  content_href: string
  content_preview: string
  resolution_summary: string | null
}

type AppealRow = {
  id: string
  case_id: string
  status: string
  summary: string | null
  resolution_summary: string | null
}

export default function ProfileReportsPage() {
  const { session, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [reports, setReports] = useState<MyReportRow[]>([])
  const [sanctionCases, setSanctionCases] = useState<SanctionCaseRow[]>([])
  const [appealsByCaseId, setAppealsByCaseId] = useState<Record<string, AppealRow>>({})
  const [submittingAppealCaseId, setSubmittingAppealCaseId] = useState<string | null>(null)

  const loadData = async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setErrorMessage("")

    const [reportsRes, sanctionsRes, appealsRes] = await Promise.all([
      supabase
        .from("moderation_case_reports")
        .select("id,details,created_at,case_id")
        .eq("reporter_user_id", session.user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("moderation_cases")
        .select("id,status,sanction_applied,content_href,content_preview,resolution_summary")
        .eq("content_author_user_id", session.user.id)
        .eq("status", "finalizada")
        .eq("sanction_applied", true)
        .order("updated_at", { ascending: false }),
      supabase
        .from("moderation_appeals")
        .select("id,case_id,status,summary,resolution_summary")
        .eq("appellant_user_id", session.user.id),
    ])

    if (reportsRes.error || sanctionsRes.error || appealsRes.error) {
      setErrorMessage(
        reportsRes.error?.message || sanctionsRes.error?.message || appealsRes.error?.message || "Falha ao carregar denúncias."
      )
      setLoading(false)
      return
    }

    const rawReports = (reportsRes.data as RawMyReportRow[] | null) ?? []
    const reportCaseIds = Array.from(new Set(rawReports.map((row) => row.case_id).filter(Boolean)))

    let casesById: Record<string, MyReportCase> = {}
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

    const normalizedReports: MyReportRow[] = rawReports.map((row) => ({
      ...row,
      moderation_cases: casesById[row.case_id] ?? null,
    }))

    setReports(normalizedReports)
    setSanctionCases((sanctionsRes.data as SanctionCaseRow[] | null) ?? [])
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
    if (!session?.user?.id) return
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
    <main className="mx-auto max-w-5xl px-6 pt-28 pb-16 space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Painel de denúncias</h1>
            <p className="mt-1 text-sm text-gray-600">
              Acompanhe suas denúncias e recursos em andamento.
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
                  <p className="text-xs text-gray-500">
                    {new Date(card.createdAt).toLocaleString("pt-BR")}
                  </p>
                  <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                    {card.statusLabel}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-800">{card.preview}</p>
                <p className="mt-2 text-xs text-gray-600">Motivo: {card.reasonLabel}</p>
                {card.resolution ? (
                  <p className="mt-2 text-xs text-gray-700">Parecer: {card.resolution}</p>
                ) : null}
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
        <h2 className="text-lg font-semibold text-gray-900">Sanções e recursos</h2>
        {!sanctionCases.length ? (
          <p className="mt-3 text-sm text-gray-600">
            Você não possui conteúdos sancionados no momento.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {sanctionCases.map((item) => {
              const appeal = appealsByCaseId[item.id]
              const canAppeal = !appeal
              return (
                <article key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <p className="text-sm text-gray-800">{item.content_preview || "Conteúdo sem prévia."}</p>
                  {item.resolution_summary ? (
                    <p className="mt-2 text-xs text-gray-700">Parecer: {item.resolution_summary}</p>
                  ) : null}

                  {appeal ? (
                    <p className="mt-3 text-xs text-gray-700">
                      Status do recurso:{" "}
                      <span className="font-medium">
                        {MODERATION_STATUS_LABEL[appeal.status] ?? appeal.status}
                      </span>
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Link
                      href={item.content_href || "/feed"}
                      className="text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-black"
                    >
                      Abrir conteúdo
                    </Link>
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
