"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import { MODERATION_REASON_LABEL, MODERATION_STATUS_LABEL, type ModerationReason } from "@/lib/moderation"

type ModerationCaseRow = {
  id: string
  reason: ModerationReason
  status: string
  priority_score: number
  total_reports: number
  unique_reporters: number
  content_href: string
  content_preview: string
  resolution_summary: string | null
  sanction_applied: boolean
  latest_reported_at: string
}

type ModerationAppealRow = {
  id: string
  case_id: string
  status: string
  summary: string | null
  resolution_summary: string | null
  created_at: string
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
  const [resolutions, setResolutions] = useState<Record<string, string>>({})
  const [appealResolutions, setAppealResolutions] = useState<Record<string, string>>({})
  const [loadingActionKey, setLoadingActionKey] = useState<string | null>(null)
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
          "id,reason,status,priority_score,total_reports,unique_reporters,content_href,content_preview,resolution_summary,sanction_applied,latest_reported_at"
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
        casesRes.error?.message || appealsRes.error?.message || "Falha ao carregar moderaÃ§Ã£o."
      setErrorMessage(`Falha ao carregar moderaÃ§Ã£o: ${message}`)
      setLoading(false)
      return
    }

    setOpenCases((casesRes.data as ModerationCaseRow[] | null) ?? [])
    setAppeals((appealsRes.data as ModerationAppealRow[] | null) ?? [])

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
      setErrorMessage(`Falha ao iniciar anÃ¡lise: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Caso movido para em anÃ¡lise.")
    await loadData()
    setLoadingActionKey(null)
  }

  const finishCase = async (caseId: string, applySanction: boolean) => {
    setLoadingActionKey(`case-finish:${caseId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_transition_case", {
      p_case_id: caseId,
      p_next_status: "finalizada",
      p_resolution: resolutions[caseId] ?? null,
      p_apply_sanction: applySanction,
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
      setErrorMessage(`Falha ao iniciar anÃ¡lise do recurso: ${result.error.message}`)
      setLoadingActionKey(null)
      return
    }
    setSuccessMessage("Recurso movido para em anÃ¡lise.")
    await loadData()
    setLoadingActionKey(null)
  }

  const finishAppeal = async (appealId: string, keepSanction: boolean) => {
    setLoadingActionKey(`appeal-finish:${appealId}`)
    setErrorMessage("")
    setSuccessMessage("")
    const result = await supabase.rpc("moderation_transition_appeal", {
      p_appeal_id: appealId,
      p_next_status: "recurso_analisado",
      p_resolution: appealResolutions[appealId] ?? null,
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

  const sortedCases = useMemo(
    () => [...openCases].sort((a, b) => b.priority_score - a.priority_score),
    [openCases]
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
      setErrorMessage("Informe o @username para resolver o usuÃ¡rio.")
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
      setErrorMessage("Username nÃ£o encontrado.")
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
          Carregando moderaÃ§Ã£o...
        </div>
      </main>
    )
  }

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-6xl px-6 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-700">FaÃ§a login para acessar a moderaÃ§Ã£o.</p>
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
          Acesso restrito ao time de moderaÃ§Ã£o.
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-6 pt-28 pb-16 space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Painel de moderaÃ§Ã£o</h1>
        <p className="mt-1 text-sm text-gray-600">
          Priorize casos com mÃºltiplas denÃºncias e registre parecer objetivo.
        </p>
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
        <h2 className="text-lg font-semibold text-gray-900">Casos abertos</h2>
        {!sortedCases.length ? (
          <p className="mt-3 text-sm text-gray-600">Nenhum caso pendente.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {sortedCases.map((item) => (
              <article key={item.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">
                    Ãšltima denÃºncia: {new Date(item.latest_reported_at).toLocaleString("pt-BR")}
                  </p>
                  <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                    {MODERATION_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>

                <p className="mt-2 text-sm text-gray-900">{item.content_preview || "Sem prÃ©via do conteÃºdo."}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-700">
                  <span className="rounded-full border border-gray-300 px-2 py-1">
                    Motivo: {MODERATION_REASON_LABEL[item.reason] ?? item.reason}
                  </span>
                  <span className="rounded-full border border-gray-300 px-2 py-1">
                    DenÃºncias: {item.total_reports}
                  </span>
                  <span className="rounded-full border border-gray-300 px-2 py-1">
                    UsuÃ¡rios Ãºnicos: {item.unique_reporters}
                  </span>
                  <span className="rounded-full border border-gray-300 px-2 py-1">
                    Prioridade: {item.priority_score}
                  </span>
                </div>

                <div className="mt-3">
                  <textarea
                    value={resolutions[item.id] ?? ""}
                    onChange={(event) =>
                      setResolutions((prev) => ({
                        ...prev,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Parecer da administraÃ§Ã£o"
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    href={item.content_href || "/feed"}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Abrir conteÃºdo
                  </Link>
                  {item.status === "enviada" ? (
                    <button
                      type="button"
                      onClick={() => void startCaseAnalysis(item.id)}
                      disabled={loadingActionKey === `case-analyze:${item.id}`}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Iniciar anÃ¡lise
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void finishCase(item.id, false)}
                    disabled={loadingActionKey === `case-finish:${item.id}`}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Finalizar sem sanÃ§Ã£o
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishCase(item.id, true)}
                    disabled={loadingActionKey === `case-finish:${item.id}`}
                    className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                  >
                    Finalizar com sanÃ§Ã£o
                  </button>
                </div>
              </article>
            ))}
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
            {appeals.map((item) => (
              <article key={item.id} className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-gray-500">
                    {new Date(item.created_at).toLocaleString("pt-BR")}
                  </p>
                  <span className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-700">
                    {MODERATION_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </div>

                {item.summary ? <p className="mt-2 text-sm text-gray-800">{item.summary}</p> : null}

                <div className="mt-3">
                  <textarea
                    value={appealResolutions[item.id] ?? ""}
                    onChange={(event) =>
                      setAppealResolutions((prev) => ({
                        ...prev,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Parecer da administraÃ§Ã£o no recurso"
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
                      Iniciar anÃ¡lise
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void finishAppeal(item.id, false)}
                    disabled={loadingActionKey === `appeal-finish:${item.id}`}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Reverter sanÃ§Ã£o
                  </button>
                  <button
                    type="button"
                    onClick={() => void finishAppeal(item.id, true)}
                    disabled={loadingActionKey === `appeal-finish:${item.id}`}
                    className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                  >
                    Manter sanÃ§Ã£o
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {isMaster ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">GestÃ£o de administradores</h2>
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
                {targetAdminId ? `Selecionado: ${targetAdminLabel || targetAdminId}` : "Nenhum usuÃ¡rio selecionado"}
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


