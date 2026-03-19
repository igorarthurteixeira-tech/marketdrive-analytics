"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import {
  MODERATION_REASON_LABEL,
  MODERATION_SANCTION_TYPE_LABEL,
  MODERATION_STATUS_LABEL,
  MODERATION_WORKFLOW_STAGE_LABEL,
  type ModerationReason,
} from "@/lib/moderation"

type ModerationCaseRow = {
  id: string
  reason: ModerationReason
  status: string
  workflow_stage: string
  priority_score: number
  total_reports: number
  unique_reporters: number
  content_href: string
  content_preview: string
  resolution_summary: string | null
  sanction_applied: boolean
  sanction_type: SanctionType | null
  sanction_duration_days: number | null
  sanction_reason_code: string | null
  appeal_deadline_at: string | null
  author_response_due_at: string | null
  correction_due_at: string | null
  correction_attempt_count: number
  correction_attempt_limit: number
  last_author_request: string | null
  last_author_response: string | null
  interim_hidden: boolean
  latest_reported_at: string
}

type SanctionType =
  | "suspensao_temporaria"
  | "suspensao_ate_regularizacao"
  | "exclusao_com_prazo"
  | "exclusao_imediata"

const SANCTION_OPTIONS: Array<{ value: SanctionType; label: string }> = [
  { value: "suspensao_temporaria", label: "Suspensão temporária" },
  { value: "suspensao_ate_regularizacao", label: "Suspensão até regularização" },
  { value: "exclusao_com_prazo", label: "Exclusão com prazo" },
  { value: "exclusao_imediata", label: "Exclusão imediata" },
]

const IMMEDIATE_REASON_OPTIONS = [
  { value: "", label: "Motivo grave (se exclusão imediata)" },
  { value: "violacao_direitos_autorais", label: "Violação de direitos autorais" },
  { value: "pornografia", label: "Pornografia" },
  { value: "apologia_crime", label: "Apologia a crime" },
  { value: "conteudo_ilegal_grave", label: "Conteúdo ilegal grave" },
  { value: "risco_iminente", label: "Risco iminente a terceiros" },
]

type ModerationAppealRow = {
  id: string
  case_id: string
  status: string
  summary: string | null
  resolution_summary: string | null
  created_at: string
}

type ModerationCaseDetail = {
  id: string
  reason: ModerationReason
  priority_score: number
  total_reports: number
  unique_reporters: number
  content_href: string
  content_preview: string
  latest_reported_at: string
}

type UnifiedQueueItem =
  | {
      queueType: "case"
      id: string
      status: string
      preview: string
      href: string
      reason: ModerationReason
      priority: number
      totalReports: number
      uniqueReporters: number
      happenedAt: string
    }
  | {
      queueType: "appeal"
      id: string
      status: string
      preview: string
      href: string
      reason: ModerationReason | null
      priority: number
      totalReports: number
      uniqueReporters: number
      happenedAt: string
    }

type AdminRow = {
  user_id: string
  role: "admin" | "master"
  is_active: boolean
  created_at: string
}

type ProfileMini = {
  id: string
  name: string | null
  username: string | null
  is_consultant_verified?: boolean | null
  is_founder?: boolean | null
  launch_bonus_expires_at?: string | null
}

export default function AdminModeracaoPage() {
  const { session, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isMaster, setIsMaster] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const [openCases, setOpenCases] = useState<ModerationCaseRow[]>([])
  const [appeals, setAppeals] = useState<ModerationAppealRow[]>([])
  const [appealCaseDetailsById, setAppealCaseDetailsById] = useState<Record<string, ModerationCaseDetail>>({})
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const [appealResolutions, setAppealResolutions] = useState<Record<string, string>>({})
  const [sanctionTypeByCaseId, setSanctionTypeByCaseId] = useState<Record<string, SanctionType>>({})
  const [sanctionDaysByCaseId, setSanctionDaysByCaseId] = useState<Record<string, string>>({})
  const [sanctionReasonByCaseId, setSanctionReasonByCaseId] = useState<Record<string, string>>({})
  const [interimNoteByCaseId, setInterimNoteByCaseId] = useState<Record<string, string>>({})
  const [clarificationNoteByCaseId, setClarificationNoteByCaseId] = useState<Record<string, string>>({})
  const [clarificationDaysByCaseId, setClarificationDaysByCaseId] = useState<Record<string, string>>({})
  const [clarificationSuspendByCaseId, setClarificationSuspendByCaseId] = useState<Record<string, boolean>>({})
  const [correctionDaysByCaseId, setCorrectionDaysByCaseId] = useState<Record<string, string>>({})
  const [correctionAttemptsByCaseId, setCorrectionAttemptsByCaseId] = useState<Record<string, string>>({})
  const [loadingActionKey, setLoadingActionKey] = useState<string | null>(null)
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [adminRows, setAdminRows] = useState<AdminRow[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, ProfileMini>>({})
  const [targetAdminQuery, setTargetAdminQuery] = useState("")
  const [targetAdminId, setTargetAdminId] = useState("")
  const [targetAdminLabel, setTargetAdminLabel] = useState("")
  const [resolvingProfile, setResolvingProfile] = useState(false)
  const [targetAdminRole, setTargetAdminRole] = useState<"admin" | "master">("admin")
  const [incentiveVerified, setIncentiveVerified] = useState(false)
  const [incentiveFounder, setIncentiveFounder] = useState(false)
  const [incentiveBonusDays, setIncentiveBonusDays] = useState("")

  useEffect(() => {
    if (!errorMessage && !successMessage) return

    const timeout = window.setTimeout(() => {
      setErrorMessage("")
      setSuccessMessage("")
    }, 7000)

    return () => window.clearTimeout(timeout)
  }, [errorMessage, successMessage])

  const loadData = async () => {
    if (!session?.user?.id) return
    setLoading(true)
    setErrorMessage("")

    const adminCheck = await supabase.rpc("is_moderation_admin", {
      p_user_id: session.user.id,
    })

    if (adminCheck.error) {
      setErrorMessage(`Falha ao validar acesso de admin: ${adminCheck.error.message}`)
      setLoading(false)
      return
    }

    const hasAdminAccess = Boolean(adminCheck.data)
    setIsAdmin(hasAdminAccess)
    if (!hasAdminAccess) {
      setLoading(false)
      return
    }

    const masterCheck = await supabase.rpc("is_moderation_master", {
      p_user_id: session.user.id,
    })
    if (masterCheck.error) {
      setErrorMessage(`Falha ao validar papel master: ${masterCheck.error.message}`)
      setLoading(false)
      return
    }
    const hasMasterAccess = Boolean(masterCheck.data)
    setIsMaster(hasMasterAccess)

    const [casesRes, appealsRes] = await Promise.all([
      supabase
        .from("moderation_cases")
        .select(
          "id,reason,status,workflow_stage,priority_score,total_reports,unique_reporters,content_href,content_preview,resolution_summary,sanction_applied,sanction_type,sanction_duration_days,sanction_reason_code,appeal_deadline_at,author_response_due_at,correction_due_at,correction_attempt_count,correction_attempt_limit,last_author_request,last_author_response,interim_hidden,latest_reported_at"
        )
        .in("status", ["enviada", "em_analise"])
        .order("priority_score", { ascending: false })
        .order("latest_reported_at", { ascending: false }),
      supabase
        .from("moderation_appeals")
        .select("id,case_id,status,summary,resolution_summary,created_at")
        .in("status", ["recurso_enviado", "recurso_em_analise"])
        .order("created_at", { ascending: false }),
    ])

    if (casesRes.error || appealsRes.error) {
      const message =
        casesRes.error?.message || appealsRes.error?.message || "Falha ao carregar moderação."
      setErrorMessage(`Falha ao carregar moderação: ${message}`)
      setLoading(false)
      return
    }

    setOpenCases((casesRes.data as ModerationCaseRow[] | null) ?? [])
    const appealRows = (appealsRes.data as ModerationAppealRow[] | null) ?? []
    setAppeals(appealRows)

    const caseIds = Array.from(new Set(appealRows.map((item) => item.case_id).filter(Boolean)))
    if (caseIds.length > 0) {
      const detailsRes = await supabase
        .from("moderation_cases")
        .select(
          "id,reason,priority_score,total_reports,unique_reporters,content_href,content_preview,latest_reported_at"
        )
        .in("id", caseIds)

      if (!detailsRes.error) {
        const map: Record<string, ModerationCaseDetail> = {}
        for (const row of (detailsRes.data as ModerationCaseDetail[] | null) ?? []) {
          map[row.id] = row
        }
        setAppealCaseDetailsById(map)
      } else {
        setAppealCaseDetailsById({})
      }
    } else {
      setAppealCaseDetailsById({})
    }

    if (hasMasterAccess) {
      const adminsRes = await supabase
        .from("moderation_admins")
        .select("user_id,role,is_active,created_at")
        .order("created_at", { ascending: false })

      if (adminsRes.error) {
        setErrorMessage(`Falha ao carregar administradores: ${adminsRes.error.message}`)
      } else {
        const rows = (adminsRes.data as AdminRow[] | null) ?? []
        setAdminRows(rows)
        const ids = rows.map((row) => row.user_id)
        if (ids.length > 0) {
          const profileRes = await supabase
            .from("profiles")
            .select("id,name,username,is_consultant_verified,is_founder,launch_bonus_expires_at")
            .in("id", ids)
          if (!profileRes.error) {
            const map: Record<string, ProfileMini> = {}
            for (const p of (profileRes.data as ProfileMini[] | null) ?? []) {
              map[p.id] = p
            }
            setProfilesById(map)
          }
        } else {
          setProfilesById({})
        }
      }
    } else {
      setAdminRows([])
      setProfilesById({})
    }

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

  const startCaseAnalysis = async (caseId: string) => {
    setLoadingActionKey(`case-analyze:${caseId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_transition_case", {
      p_case_id: caseId,
      p_next_status: "em_analise",
      p_resolution: null,
      p_apply_sanction: false,
    })
    if (result.error) {
      setErrorMessage(`Falha ao iniciar análise: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Caso movido para em análise.")
    await loadData()
    setLoadingActionKey(null)
  }

  const finishCase = async (caseId: string, applySanction: boolean) => {
    const resolution = resolutions[caseId]?.trim() ?? ""
    if (!resolution) {
      setErrorMessage("Preencha o parecer da administração antes de finalizar o caso.")
      setSuccessMessage("")
      return
    }

    setLoadingActionKey(`case-finish:${caseId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const selectedType = (sanctionTypeByCaseId[caseId] ?? "suspensao_temporaria") as SanctionType
    if (applySanction && selectedType === "exclusao_imediata") {
      const confirmed = window.confirm(
        "Você está prestes a aplicar EXCLUSÃO IMEDIATA. O conteúdo será removido de forma irreversível. Deseja realmente continuar?"
      )

      if (!confirmed) {
        return
      }
    }
    const parsedDays = Number(sanctionDaysByCaseId[caseId] ?? "")
    const result = await supabase.rpc("moderation_transition_case", {
      p_case_id: caseId,
      p_next_status: "finalizada",
      p_resolution: resolution,
      p_apply_sanction: applySanction,
      p_sanction_type: applySanction ? selectedType : null,
      p_sanction_duration_days:
        applySanction && Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null,
      p_sanction_reason_code: applySanction ? sanctionReasonByCaseId[caseId] ?? null : null,
    })
    if (result.error) {
      setErrorMessage(`Falha ao finalizar caso: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Caso finalizado com sucesso.")
    await loadData()
    setLoadingActionKey(null)
  }

  const toggleInterimSuspension = async (caseId: string, suspend: boolean) => {
    setLoadingActionKey(`case-interim:${caseId}:${suspend ? "on" : "off"}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_set_interim_post_suspension", {
      p_case_id: caseId,
      p_suspend: suspend,
      p_note: interimNoteByCaseId[caseId] ?? null,
    })
    if (result.error) {
      setErrorMessage(`Falha na suspensão preventiva: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage(suspend ? "Publicação suspensa preventivamente." : "Suspensão preventiva removida.")
    await loadData()
    setLoadingActionKey(null)
  }

  const requestClarification = async (caseId: string) => {
    const clarificationNote = clarificationNoteByCaseId[caseId]?.trim() ?? ""
    if (!clarificationNote) {
      setErrorMessage("Descreva o que precisa ser explicado antes de solicitar esclarecimento.")
      setSuccessMessage("")
      return
    }

    setLoadingActionKey(`case-clarification:${caseId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const parsedDays = Number(clarificationDaysByCaseId[caseId] ?? "")
    const result = await supabase.rpc("moderation_start_author_clarification", {
      p_case_id: caseId,
      p_note: clarificationNote,
      p_due_days: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null,
      p_suspend_content: clarificationSuspendByCaseId[caseId] ?? false,
    })
    if (result.error) {
      setErrorMessage(`Falha ao solicitar explicação: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Explicação solicitada ao autor.")
    await loadData()
    setLoadingActionKey(null)
  }

  const requestRevision = async (caseId: string) => {
    setLoadingActionKey(`case-revision:${caseId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const parsedDays = Number(correctionDaysByCaseId[caseId] ?? "")
    const parsedAttempts = Number(correctionAttemptsByCaseId[caseId] ?? "")
    const result = await supabase.rpc("moderation_apply_revision_sanction", {
      p_case_id: caseId,
      p_resolution: resolutions[caseId] ?? null,
      p_due_days: Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : null,
      p_attempt_limit: Number.isFinite(parsedAttempts) && parsedAttempts > 0 ? parsedAttempts : 3,
    })
    if (result.error) {
      setErrorMessage(`Falha ao solicitar correção: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Correção solicitada ao autor.")
    await loadData()
    setLoadingActionKey(null)
  }

  const reviewRevision = async (caseId: string, approve: boolean) => {
    const resolution = resolutions[caseId]?.trim() ?? ""
    if (!resolution) {
      setErrorMessage("Preencha o parecer da administração antes de revisar a correção.")
      setSuccessMessage("")
      return
    }

    setLoadingActionKey(`case-review:${caseId}:${approve ? "approve" : "reject"}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_review_post_revision", {
      p_case_id: caseId,
      p_approve: approve,
      p_resolution: resolution,
    })
    if (result.error) {
      setErrorMessage(`Falha ao revisar correção: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage(approve ? "Correção aprovada." : "Correção devolvida ao autor.")
    await loadData()
    setLoadingActionKey(null)
  }

  const startAppealAnalysis = async (appealId: string) => {
    setLoadingActionKey(`appeal-analyze:${appealId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_transition_appeal", {
      p_appeal_id: appealId,
      p_next_status: "recurso_em_analise",
      p_resolution: null,
      p_keep_sanction: true,
    })
    if (result.error) {
      setErrorMessage(`Falha ao iniciar análise do recurso: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Recurso movido para em análise.")
    await loadData()
    setLoadingActionKey(null)
  }

  const finishAppeal = async (appealId: string, keepSanction: boolean) => {
    const resolution = appealResolutions[appealId]?.trim() ?? ""
    if (!resolution) {
      setErrorMessage("Preencha o parecer da administração antes de finalizar o recurso.")
      setSuccessMessage("")
      return
    }

    setLoadingActionKey(`appeal-finish:${appealId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_transition_appeal", {
      p_appeal_id: appealId,
      p_next_status: "recurso_analisado",
      p_resolution: resolution,
      p_keep_sanction: keepSanction,
    })
    if (result.error) {
      setErrorMessage(`Falha ao finalizar recurso: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Recurso finalizado com sucesso.")
    await loadData()
    setLoadingActionKey(null)
  }

  const toggleCardExpanded = (cardKey: string) => {
    setExpandedCards((prev) => ({
      ...prev,
      [cardKey]: !prev[cardKey],
    }))
  }

  const sortedCases = useMemo(
    () =>
      [...openCases]
        .filter((item) => item.status === "em_analise")
        .sort((a, b) => b.priority_score - a.priority_score),
    [openCases]
  )

  const caseById = useMemo(
    () => Object.fromEntries(openCases.map((item) => [item.id, item])),
    [openCases]
  )

  const getBlindStatusLabel = (status: string) => {
    if (status === "enviada" || status === "recurso_enviado") return "Enviada"
    if (status === "em_analise" || status === "recurso_em_analise") return "Em análise"
    return "Pendente"
  }

  const unifiedQueue = useMemo<UnifiedQueueItem[]>(() => {
    const fromCases: UnifiedQueueItem[] = openCases.map((item) => ({
      queueType: "case",
      id: item.id,
      status: item.status,
      preview: item.content_preview || "Sem prévia do conteúdo.",
      href: item.content_href || "/feed",
      reason: item.reason,
      priority: item.priority_score ?? 0,
      totalReports: item.total_reports ?? 0,
      uniqueReporters: item.unique_reporters ?? 0,
      happenedAt: item.latest_reported_at,
    }))

    const fromAppeals: UnifiedQueueItem[] = appeals.map((item) => {
      const detail = appealCaseDetailsById[item.case_id]
      return {
        queueType: "appeal",
        id: item.id,
        status: item.status,
        preview: detail?.content_preview || item.summary || "Sem prévia do conteúdo.",
        href: detail?.content_href || "/feed",
        reason: detail?.reason ?? null,
        priority: detail?.priority_score ?? 0,
        totalReports: detail?.total_reports ?? 0,
        uniqueReporters: detail?.unique_reporters ?? 0,
        happenedAt: item.created_at,
      }
    })

    return [...fromCases, ...fromAppeals].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime()
    })
  }, [appeals, appealCaseDetailsById, openCases])

  const masterPendingQueue = useMemo(
    () =>
      unifiedQueue.filter(
        (item) => item.queueType === "appeal" || (item.queueType === "case" && item.status === "enviada")
      ),
    [unifiedQueue]
  )

  const upsertAdmin = async () => {
    const userId = targetAdminId.trim()
    if (!userId) {
      setErrorMessage("Informe o user_id para adicionar administrador.")
      return
    }
    setLoadingActionKey("admin-upsert")
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_upsert_admin", {
      p_target_user_id: userId,
      p_role: targetAdminRole,
      p_is_active: true,
    })
    if (result.error) {
      setErrorMessage(`Falha ao salvar admin: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Administrador atualizado com sucesso.")
    setTargetAdminLabel("")
    setTargetAdminId("")
    await loadData()
    setLoadingActionKey(null)
  }

  const resolveProfileByUsername = async () => {
    const query = targetAdminQuery.trim()
    if (query.length < 2) {
      setErrorMessage("Informe o @username para resolver o usuário.")
      return
    }

    setResolvingProfile(true)
    setErrorMessage("")
    const result = await supabase.rpc("moderation_resolve_profile_by_username", {
      p_username: query,
    })

    if (result.error) {
      setErrorMessage(`Falha ao resolver username: ${result.error.message}`)
      setResolvingProfile(false)
      return
    }

    const row = ((result.data as ProfileMini[] | null) ?? [])[0]
    if (!row) {
      setErrorMessage("Username não encontrado.")
      setResolvingProfile(false)
      return
    }

    setTargetAdminId(row.id)
    setTargetAdminLabel(row.username ? `${row.name ?? "Usuário"} (@${row.username})` : (row.name ?? row.id))
    const profileRes = await supabase
      .from("profiles")
      .select("is_consultant_verified,is_founder,launch_bonus_expires_at")
      .eq("id", row.id)
      .maybeSingle()
    if (!profileRes.error && profileRes.data) {
      setIncentiveVerified(profileRes.data.is_consultant_verified === true)
      setIncentiveFounder(profileRes.data.is_founder === true)
      if (profileRes.data.launch_bonus_expires_at) {
        const days = Math.max(
          0,
          Math.ceil(
            (new Date(profileRes.data.launch_bonus_expires_at).getTime() - Date.now()) /
              (1000 * 60 * 60 * 24)
          )
        )
        setIncentiveBonusDays(days > 0 ? String(days) : "")
      } else {
        setIncentiveBonusDays("")
      }
    } else {
      setIncentiveVerified(false)
      setIncentiveFounder(false)
      setIncentiveBonusDays("")
    }
    setResolvingProfile(false)
  }

  const applyIncentives = async () => {
    const userId = targetAdminId.trim()
    if (!userId) {
      setErrorMessage("Selecione um usuário antes de aplicar incentivos.")
      return
    }

    setLoadingActionKey("admin-incentives")
    setErrorMessage("")
    setSuccessMessage("")

    const parsedDays = Number(incentiveBonusDays)
    const hasDays = Number.isFinite(parsedDays) && parsedDays > 0
    const bonusUntil = hasDays
      ? new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    const result = await supabase.rpc("moderation_set_profile_incentives", {
      p_target_user_id: userId,
      p_is_consultant_verified: incentiveVerified,
      p_is_founder: incentiveFounder,
      p_launch_bonus_expires_at: bonusUntil,
    })

    if (result.error) {
      setErrorMessage(`Falha ao aplicar incentivos: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }

    setSuccessMessage("Incentivos do perfil atualizados com sucesso.")
    await loadData()
    setLoadingActionKey(null)
  }

  const setAdminRole = async (userId: string, role: "admin" | "master") => {
    setLoadingActionKey(`admin-role:${userId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_set_admin_role", {
      p_target_user_id: userId,
      p_role: role,
    })
    if (result.error) {
      setErrorMessage(`Falha ao alterar papel: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Papel do administrador atualizado.")
    await loadData()
    setLoadingActionKey(null)
  }

  const setAdminStatus = async (userId: string, active: boolean) => {
    setLoadingActionKey(`admin-status:${userId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_set_admin_status", {
      p_target_user_id: userId,
      p_is_active: active,
    })
    if (result.error) {
      setErrorMessage(`Falha ao alterar status: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage(active ? "Administrador ativado." : "Administrador desativado.")
    await loadData()
    setLoadingActionKey(null)
  }

  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-600">
          Carregando moderação...
        </div>
      </main>
    )
  }

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-700">Faça login para acessar a moderação.</p>
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

  if (!isAdmin) {
    return (
      <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-700">
          Acesso restrito ao time de moderação.
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-6 pt-28 pb-16 space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Painel de moderação</h1>
        <p className="mt-1 text-sm text-gray-600">
          Priorize casos com múltiplas denúncias e registre parecer objetivo.
        </p>
      </section>

      {errorMessage || successMessage ? (
        <div className="fixed right-4 top-[86px] z-[70] w-[360px] max-w-[calc(100vw-2rem)]">
          <div
            className={`rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur-sm ${
              successMessage ? "border-green-200" : "border-red-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p
                className={`text-sm font-medium ${
                  successMessage ? "text-green-800" : "text-red-700"
                }`}
              >
                {successMessage || errorMessage}
              </p>
              <button
                type="button"
                onClick={() => {
                  setErrorMessage("")
                  setSuccessMessage("")
                }}
                className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Fechar aviso"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                key={successMessage || errorMessage}
                className={`toast-timer-bar h-full w-full rounded-full ${
                  successMessage ? "bg-green-500" : "bg-red-500"
                }`}
                style={{ animationDuration: "7000ms" }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {isMaster ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Casos em aberto</h2>
          <p className="mt-1 text-xs text-gray-500">
            Aqui ficam apenas os casos que já tiveram a análise iniciada.
          </p>
          {!sortedCases.length ? (
            <p className="mt-3 text-sm text-gray-600">Nenhum caso em análise.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {sortedCases.map((item) => {
                const cardKey = `open-case:${item.id}`
                const isExpanded = Boolean(expandedCards[cardKey])

                return (
                <article key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">
                        Última denúncia: {new Date(item.latest_reported_at).toLocaleString("pt-BR")}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-gray-900">
                        {item.content_preview || "Sem prévia do conteúdo."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                        {MODERATION_STATUS_LABEL[item.status] ?? item.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCardExpanded(cardKey)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {isExpanded ? "Recolher" : "Expandir"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-700">
                    <span className="rounded-full border border-gray-300 px-2 py-1">
                      Motivo: {MODERATION_REASON_LABEL[item.reason] ?? item.reason}
                    </span>
                    <span className="rounded-full border border-gray-300 px-2 py-1">
                      Denúncias: {item.total_reports}
                    </span>
                    <span className="rounded-full border border-gray-300 px-2 py-1">
                      Usuários únicos: {item.unique_reporters}
                    </span>
                    <span className="rounded-full border border-gray-300 px-2 py-1">
                      Prioridade: {item.priority_score}
                    </span>
                    <span className="rounded-full border border-gray-300 px-2 py-1">
                      Etapa: {MODERATION_WORKFLOW_STAGE_LABEL[item.workflow_stage] ?? item.workflow_stage}
                    </span>
                  </div>

                  <div
                    className={`grid overflow-hidden transition-all duration-300 ease-out ${
                      isExpanded ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="min-h-0">
                  {item.last_author_request ? (
                    <p className="mt-2 text-xs text-gray-700">Pedido ao autor: {item.last_author_request}</p>
                  ) : null}
                  {item.last_author_response ? (
                    <p className="mt-2 text-xs text-gray-700">Resposta do autor: {item.last_author_response}</p>
                  ) : null}
                  {item.author_response_due_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Prazo da explicação: {new Date(item.author_response_due_at).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                  {item.correction_due_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Prazo da correção: {new Date(item.correction_due_at).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                  {item.sanction_type === "suspensao_ate_regularizacao" ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Tentativas de correção: {item.correction_attempt_count}/{item.correction_attempt_limit}
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                        Finalização
                      </p>
                      <textarea
                        value={resolutions[item.id] ?? ""}
                        onChange={(event) =>
                          setResolutions((prev) => ({
                            ...prev,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder="Parecer da administração"
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />
                      <div className="grid gap-2 md:grid-cols-3">
                        <select
                          value={sanctionTypeByCaseId[item.id] ?? "suspensao_temporaria"}
                          onChange={(event) =>
                            setSanctionTypeByCaseId((prev) => ({
                              ...prev,
                              [item.id]: event.target.value as SanctionType,
                            }))
                          }
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                        >
                          {SANCTION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          value={sanctionDaysByCaseId[item.id] ?? ""}
                          onChange={(event) =>
                            setSanctionDaysByCaseId((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Dias (temp/prazo)"
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                        />
                        <select
                          value={sanctionReasonByCaseId[item.id] ?? ""}
                          onChange={(event) =>
                            setSanctionReasonByCaseId((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                        >
                          {IMMEDIATE_REASON_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={item.content_href || "/feed"}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Abrir conteúdo
                        </Link>
                        <button
                          type="button"
                          onClick={() => void finishCase(item.id, false)}
                          disabled={loadingActionKey === `case-finish:${item.id}`}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          Finalizar sem sanção
                        </button>
                        <button
                          type="button"
                          onClick={() => void finishCase(item.id, true)}
                          disabled={loadingActionKey === `case-finish:${item.id}`}
                          className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                        >
                          Finalizar com sanção
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                          Explicação
                        </p>
                        <textarea
                          value={clarificationNoteByCaseId[item.id] ?? ""}
                          onChange={(event) =>
                            setClarificationNoteByCaseId((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                          placeholder="Descreva o que precisa ser explicado ou esclarecido"
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="number"
                            min={1}
                            value={clarificationDaysByCaseId[item.id] ?? ""}
                            onChange={(event) =>
                              setClarificationDaysByCaseId((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Dias para explicação"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                          <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={clarificationSuspendByCaseId[item.id] ?? false}
                              onChange={(event) =>
                                setClarificationSuspendByCaseId((prev) => ({
                                  ...prev,
                                  [item.id]: event.target.checked,
                                }))
                              }
                            />
                            Suspender ao pedir explicação
                          </label>
                          <button
                            type="button"
                            onClick={() => void requestClarification(item.id)}
                            disabled={loadingActionKey === `case-clarification:${item.id}`}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Pedir explicação
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                          Correção
                        </p>
                        <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="number"
                            min={1}
                            value={correctionDaysByCaseId[item.id] ?? ""}
                            onChange={(event) =>
                              setCorrectionDaysByCaseId((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Dias para correção"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                          <input
                            type="number"
                            min={1}
                            value={correctionAttemptsByCaseId[item.id] ?? ""}
                            onChange={(event) =>
                              setCorrectionAttemptsByCaseId((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Limite de tentativas"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => void requestRevision(item.id)}
                            disabled={loadingActionKey === `case-revision:${item.id}`}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Solicitar correção
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                          Suspensão
                        </p>
                        <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                          <input
                            type="text"
                            value={interimNoteByCaseId[item.id] ?? ""}
                            onChange={(event) =>
                              setInterimNoteByCaseId((prev) => ({
                                ...prev,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Nota da suspensão preventiva"
                            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => void toggleInterimSuspension(item.id, true)}
                            disabled={loadingActionKey === `case-interim:${item.id}:on`}
                            className="rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                          >
                            Suspender agora
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleInterimSuspension(item.id, false)}
                            disabled={loadingActionKey === `case-interim:${item.id}:off`}
                            className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Retirar suspensão
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                    </div>
                  </div>
                </article>
                )
              })}
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Análises pendentes</h2>
        <p className="mt-1 text-xs text-gray-500">
          {isMaster
            ? "Aqui ficam apenas denúncias ainda não iniciadas e recursos pendentes."
            : "Todos os itens pendentes aparecem nesta fila."}
        </p>
        {!(isMaster ? masterPendingQueue : unifiedQueue).length ? (
          <p className="mt-3 text-sm text-gray-600">Nenhum item pendente.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {(isMaster ? masterPendingQueue : unifiedQueue).map((item) => {
              const caseData = item.queueType === "case" ? caseById[item.id] : null
              const canModerateCase = item.queueType === "case" && item.status === "em_analise"
              const cardKey = `${item.queueType}:${item.id}`
              const isExpanded = Boolean(expandedCards[cardKey])

              return (
                <article key={`${item.queueType}:${item.id}`} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">
                        Última atualização: {new Date(item.happenedAt).toLocaleString("pt-BR")}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-gray-900">{item.preview}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                        {getBlindStatusLabel(item.status)}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCardExpanded(cardKey)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {isExpanded ? "Recolher" : "Expandir"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-700">
                    {item.reason ? (
                      <span className="rounded-full border border-gray-300 px-2 py-1">
                        Motivo: {MODERATION_REASON_LABEL[item.reason] ?? item.reason}
                      </span>
                    ) : null}
                    <span className="rounded-full border border-gray-300 px-2 py-1">Denúncias: {item.totalReports}</span>
                    <span className="rounded-full border border-gray-300 px-2 py-1">Usuários únicos: {item.uniqueReporters}</span>
                    <span className="rounded-full border border-gray-300 px-2 py-1">Prioridade: {item.priority}</span>
                    {caseData ? (
                      <span className="rounded-full border border-gray-300 px-2 py-1">
                        Etapa: {MODERATION_WORKFLOW_STAGE_LABEL[caseData.workflow_stage] ?? caseData.workflow_stage}
                      </span>
                    ) : null}
                    {caseData?.sanction_type ? (
                      <span className="rounded-full border border-gray-300 px-2 py-1">
                        Fluxo: {MODERATION_SANCTION_TYPE_LABEL[caseData.sanction_type] ?? caseData.sanction_type}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={`grid overflow-hidden transition-all duration-300 ease-out ${
                      isExpanded ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="min-h-0">
                  {caseData?.last_author_request ? (
                    <p className="mt-2 text-xs text-gray-700">Pedido ao autor: {caseData.last_author_request}</p>
                  ) : null}
                  {caseData?.last_author_response ? (
                    <p className="mt-2 text-xs text-gray-700">Resposta do autor: {caseData.last_author_response}</p>
                  ) : null}
                  {caseData?.author_response_due_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Prazo da explicação: {new Date(caseData.author_response_due_at).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                  {caseData?.correction_due_at ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Prazo da correção: {new Date(caseData.correction_due_at).toLocaleString("pt-BR")}
                    </p>
                  ) : null}
                  {caseData?.sanction_type === "suspensao_ate_regularizacao" ? (
                    <p className="mt-2 text-xs text-gray-600">
                      Tentativas de correção: {caseData.correction_attempt_count}/{caseData.correction_attempt_limit}
                    </p>
                  ) : null}

                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                        {item.queueType === "appeal" ? "Recurso" : "Finalização"}
                      </p>
                      <textarea
                        value={item.queueType === "case" ? (resolutions[item.id] ?? "") : (appealResolutions[item.id] ?? "")}
                        onChange={(event) => {
                          if (item.queueType === "case") {
                            setResolutions((prev) => ({ ...prev, [item.id]: event.target.value }))
                          } else {
                            setAppealResolutions((prev) => ({ ...prev, [item.id]: event.target.value }))
                          }
                        }}
                        placeholder="Parecer da administração"
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                      />

                      {item.queueType === "case" && canModerateCase ? (
                        <div className="grid gap-2 md:grid-cols-3">
                          <select
                            value={sanctionTypeByCaseId[item.id] ?? "suspensao_temporaria"}
                            onChange={(event) =>
                              setSanctionTypeByCaseId((prev) => ({ ...prev, [item.id]: event.target.value as SanctionType }))
                            }
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            {SANCTION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min={1}
                            value={sanctionDaysByCaseId[item.id] ?? ""}
                            onChange={(event) =>
                              setSanctionDaysByCaseId((prev) => ({ ...prev, [item.id]: event.target.value }))
                            }
                            placeholder="Dias (temp/prazo)"
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          />
                          <select
                            value={sanctionReasonByCaseId[item.id] ?? ""}
                            onChange={(event) =>
                              setSanctionReasonByCaseId((prev) => ({ ...prev, [item.id]: event.target.value }))
                            }
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                          >
                            {IMMEDIATE_REASON_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={item.href} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                          Abrir conteúdo
                        </Link>
                        {((item.queueType === "case" && item.status === "enviada") ||
                          (item.queueType === "appeal" && item.status === "recurso_enviado")) ? (
                          <button
                            type="button"
                            onClick={() => void (item.queueType === "case" ? startCaseAnalysis(item.id) : startAppealAnalysis(item.id))}
                            disabled={loadingActionKey === `${item.queueType === "case" ? "case" : "appeal"}-analyze:${item.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Iniciar análise
                          </button>
                        ) : null}
                        {item.queueType === "case" && canModerateCase && caseData?.workflow_stage === "correcao_recebida" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void reviewRevision(item.id, true)}
                              disabled={loadingActionKey === `case-review:${item.id}:approve`}
                              className="rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                            >
                              Aprovar correção
                            </button>
                            <button
                              type="button"
                              onClick={() => void reviewRevision(item.id, false)}
                              disabled={loadingActionKey === `case-review:${item.id}:reject`}
                              className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                            >
                              Devolver correção
                            </button>
                          </>
                        ) : null}
                        {item.queueType === "appeal" || canModerateCase ? (
                          <button
                            type="button"
                            onClick={() => void (item.queueType === "case" ? finishCase(item.id, false) : finishAppeal(item.id, false))}
                            disabled={loadingActionKey === `${item.queueType === "case" ? "case" : "appeal"}-finish:${item.id}`}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                          >
                            Finalizar sem sanção
                          </button>
                        ) : null}
                        {item.queueType === "appeal" || canModerateCase ? (
                          <button
                            type="button"
                            onClick={() => void (item.queueType === "case" ? finishCase(item.id, true) : finishAppeal(item.id, true))}
                            disabled={loadingActionKey === `${item.queueType === "case" ? "case" : "appeal"}-finish:${item.id}`}
                            className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                          >
                            Finalizar com sanção
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {item.queueType === "case" && canModerateCase ? (
                      <div className="grid gap-3">
                        <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Explicação</p>
                          <textarea
                            value={clarificationNoteByCaseId[item.id] ?? ""}
                            onChange={(event) =>
                              setClarificationNoteByCaseId((prev) => ({ ...prev, [item.id]: event.target.value }))
                            }
                            placeholder="Descreva o que precisa ser explicado ou esclarecido"
                            rows={3}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                          />
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                            <input
                              type="number"
                              min={1}
                              value={clarificationDaysByCaseId[item.id] ?? ""}
                              onChange={(event) => setClarificationDaysByCaseId((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              placeholder="Dias para explicação"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                            <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                              <input
                                type="checkbox"
                                checked={clarificationSuspendByCaseId[item.id] ?? false}
                                onChange={(event) => setClarificationSuspendByCaseId((prev) => ({ ...prev, [item.id]: event.target.checked }))}
                              />
                              Suspender ao pedir explicação
                            </label>
                            <button
                              type="button"
                              onClick={() => void requestClarification(item.id)}
                              disabled={loadingActionKey === `case-clarification:${item.id}`}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              Pedir explicação
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Correção</p>
                          <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                            <input
                              type="number"
                              min={1}
                              value={correctionDaysByCaseId[item.id] ?? ""}
                              onChange={(event) => setCorrectionDaysByCaseId((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              placeholder="Dias para correção"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                            <input
                              type="number"
                              min={1}
                              value={correctionAttemptsByCaseId[item.id] ?? ""}
                              onChange={(event) => setCorrectionAttemptsByCaseId((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              placeholder="Limite de tentativas"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => void requestRevision(item.id)}
                              disabled={loadingActionKey === `case-revision:${item.id}`}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              Solicitar correção
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 rounded-xl border border-gray-200 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">Suspensão</p>
                          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                            <input
                              type="text"
                              value={interimNoteByCaseId[item.id] ?? ""}
                              onChange={(event) => setInterimNoteByCaseId((prev) => ({ ...prev, [item.id]: event.target.value }))}
                              placeholder="Nota da suspensão preventiva"
                              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => void toggleInterimSuspension(item.id, true)}
                              disabled={loadingActionKey === `case-interim:${item.id}:on`}
                              className="rounded-lg border border-amber-300 px-3 py-2 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-60"
                            >
                              Suspender agora
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleInterimSuspension(item.id, false)}
                              disabled={loadingActionKey === `case-interim:${item.id}:off`}
                              className="rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                            >
                              Retirar suspensão
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Fila de recursos</h2>
          <p className="mt-1 text-xs text-gray-500">
            Recurso deve ser analisado por administrador diferente do primeiro julgamento.
          </p>
          {!appeals.length ? (
            <p className="mt-3 text-sm text-gray-600">Nenhum recurso pendente.</p>
          ) : (
            <div className="mt-4 space-y-4">
              {appeals.map((item) => {
                const cardKey = `appeal:${item.id}`
                const isExpanded = Boolean(expandedCards[cardKey])

                return (
                <article key={item.id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-gray-500">
                        {new Date(item.created_at).toLocaleString("pt-BR")}
                      </p>
                      {item.summary ? <p className="mt-2 line-clamp-2 text-sm text-gray-800">{item.summary}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                        {MODERATION_STATUS_LABEL[item.status] ?? item.status}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleCardExpanded(cardKey)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        {isExpanded ? "Recolher" : "Expandir"}
                      </button>
                    </div>
                  </div>

                  <div
                    className={`grid overflow-hidden transition-all duration-300 ease-out ${
                      isExpanded ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="min-h-0">
                  <div className="mt-3">
                    <textarea
                      value={appealResolutions[item.id] ?? ""}
                      onChange={(event) =>
                        setAppealResolutions((prev) => ({
                          ...prev,
                          [item.id]: event.target.value,
                        }))
                      }
                      placeholder="Parecer da administração no recurso"
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.status === "recurso_enviado" ? (
                      <button
                        type="button"
                        onClick={() => void startAppealAnalysis(item.id)}
                        disabled={loadingActionKey === `appeal-analyze:${item.id}`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Iniciar análise
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void finishAppeal(item.id, false)}
                      disabled={loadingActionKey === `appeal-finish:${item.id}`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Reverter sanção
                    </button>
                    <button
                      type="button"
                      onClick={() => void finishAppeal(item.id, true)}
                      disabled={loadingActionKey === `appeal-finish:${item.id}`}
                      className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                    >
                      Manter sanção
                    </button>
                  </div>
                    </div>
                  </div>
                </article>
                )
              })}
            </div>
          )}
      </section>

      {isMaster ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Gestão de administradores</h2>
          <p className="mt-1 text-xs text-gray-500">
            Somente master pode adicionar, remover e promover administradores.
          </p>

          <div className="mt-4 rounded-xl border border-gray-200 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                type="text"
                value={targetAdminQuery}
                onChange={(event) => setTargetAdminQuery(event.target.value)}
                placeholder="@username (exato)"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void resolveProfileByUsername()}
                disabled={resolvingProfile}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                {resolvingProfile ? "Resolvendo..." : "Resolver"}
              </button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto]">
              <div className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {targetAdminId ? `Selecionado: ${targetAdminLabel || targetAdminId}` : "Nenhum usuário selecionado"}
              </div>
              <select
                value={targetAdminRole}
                onChange={(event) => setTargetAdminRole(event.target.value as "admin" | "master")}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="master">Master</option>
              </select>
              <button
                type="button"
                onClick={() => void upsertAdmin()}
                disabled={loadingActionKey === "admin-upsert" || !targetAdminId}
                className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
              >
                {loadingActionKey === "admin-upsert" ? "Salvando..." : "Adicionar/Atualizar"}
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-600">
                Incentivos de lançamento
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={incentiveVerified}
                    onChange={(event) => setIncentiveVerified(event.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Consultor verificado
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={incentiveFounder}
                    onChange={(event) => setIncentiveFounder(event.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Fundador
                </label>
                <input
                  type="number"
                  min={0}
                  value={incentiveBonusDays}
                  onChange={(event) => setIncentiveBonusDays(event.target.value)}
                  placeholder="Bônus em dias"
                  className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void applyIncentives()}
                  disabled={!targetAdminId || loadingActionKey === "admin-incentives"}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {loadingActionKey === "admin-incentives" ? "Aplicando..." : "Aplicar incentivos"}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {adminRows.map((row) => {
              const profile = profilesById[row.user_id]
              const displayName =
                profile?.name || (profile?.username ? `@${profile.username}` : row.user_id)
              return (
                <article key={row.user_id} className="rounded-xl border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{displayName}</p>
                      <p className="text-xs text-gray-500">{row.user_id}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full border border-gray-300 px-2 py-1 text-gray-700">
                        {row.role === "master" ? "Master" : "Admin"}
                      </span>
                      <span className="rounded-full border border-gray-300 px-2 py-1 text-gray-700">
                        {row.is_active ? "Ativo" : "Inativo"}
                      </span>
                      {profile?.is_consultant_verified ? (
                        <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-700">
                          Verificado
                        </span>
                      ) : null}
                      {profile?.is_founder ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-amber-700">
                          Fundador
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.role !== "master" ? (
                      <button
                        type="button"
                        onClick={() => void setAdminRole(row.user_id, "master")}
                        disabled={loadingActionKey === `admin-role:${row.user_id}`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Tornar master
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void setAdminRole(row.user_id, "admin")}
                        disabled={loadingActionKey === `admin-role:${row.user_id}`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Rebaixar para admin
                      </button>
                    )}

                    {row.is_active ? (
                      <button
                        type="button"
                        onClick={() => void setAdminStatus(row.user_id, false)}
                        disabled={loadingActionKey === `admin-status:${row.user_id}`}
                        className="rounded-lg border border-red-300 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Desativar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void setAdminStatus(row.user_id, true)}
                        disabled={loadingActionKey === `admin-status:${row.user_id}`}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        Ativar
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
            {!adminRows.length ? (
              <p className="text-sm text-gray-600">Nenhum administrador cadastrado.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  )
}


