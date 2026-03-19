export const POST_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const POST_VIDEO_MAX_BYTES = 50 * 1024 * 1024

export const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
}

export const inferPostMediaKind = (file: File): "image" | "video" | null => {
  if (file.type.startsWith("image/")) return "image"
  if (file.type.startsWith("video/")) return "video"
  return null
}

export const validatePostMediaFile = (
  file: File,
  selectedKind?: "image" | "video" | ""
) => {
  const inferredKind = inferPostMediaKind(file)
  const effectiveKind = selectedKind || inferredKind

  if (!effectiveKind) {
    return "Formato de mídia inválido. Envie uma imagem ou um vídeo."
  }

  if (selectedKind === "image" && inferredKind === "video") {
    return "O arquivo selecionado é um vídeo. Troque o tipo de mídia para vídeo antes de enviar."
  }

  if (selectedKind === "video" && inferredKind === "image") {
    return "O arquivo selecionado é uma imagem. Troque o tipo de mídia para foto antes de enviar."
  }

  const maxBytes = effectiveKind === "video" ? POST_VIDEO_MAX_BYTES : POST_IMAGE_MAX_BYTES
  if (file.size > maxBytes) {
    return `Arquivo muito grande. ${effectiveKind === "video" ? "Vídeos" : "Fotos"} aceitam até ${formatBytes(maxBytes)}.`
  }

  return null
}

export const formatPostMediaUploadError = (
  errorMessage: string,
  file?: File | null,
  selectedKind?: "image" | "video" | ""
) => {
  const normalized = errorMessage.toLowerCase()
  const effectiveKind = (selectedKind || (file ? inferPostMediaKind(file) : null) || "image")
  const maxBytes = effectiveKind === "video" ? POST_VIDEO_MAX_BYTES : POST_IMAGE_MAX_BYTES

  if (
    normalized.includes("maximum allowed size") ||
    normalized.includes("object exceeded") ||
    normalized.includes("file too large")
  ) {
    return `Falha no upload da mídia: o arquivo excede o limite permitido. ${effectiveKind === "video" ? "Vídeos" : "Fotos"} aceitam até ${formatBytes(maxBytes)}. Se o bucket "posts-media" estiver com um limite menor no Supabase, ajuste esse valor lá também.`
  }

  return `Falha no upload da mídia: ${errorMessage}`
}
