export type ModerationReason =
  | "spam"
  | "ofensa"
  | "assedio"
  | "desinformacao"
  | "conteudo_ilegal"
  | "odio_discriminacao"
  | "violencia_ameaca"
  | "outro"

export type ModerationContentType =
  | "user_post"
  | "user_post_comment"
  | "vehicle_comment"
  | "positive"
  | "defect"

export const MODERATION_REASON_OPTIONS: Array<{ value: ModerationReason; label: string }> = [
  { value: "spam", label: "Spam" },
  { value: "ofensa", label: "Ofensa" },
  { value: "assedio", label: "Assédio" },
  { value: "desinformacao", label: "Desinformação" },
  { value: "conteudo_ilegal", label: "Conteúdo ilegal" },
  { value: "odio_discriminacao", label: "Ódio ou discriminação" },
  { value: "violencia_ameaca", label: "Violência ou ameaça" },
  { value: "outro", label: "Outro" },
]

export const MODERATION_REASON_LABEL: Record<ModerationReason, string> = Object.fromEntries(
  MODERATION_REASON_OPTIONS.map((item) => [item.value, item.label])
) as Record<ModerationReason, string>

export const MODERATION_STATUS_LABEL: Record<string, string> = {
  enviada: "Enviada",
  em_analise: "Em análise",
  finalizada: "Finalizada",
  recurso_enviado: "Recurso enviado",
  recurso_em_analise: "Recurso em análise",
  recurso_analisado: "Recurso analisado",
}
