"use client"

import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react"

const STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

const VERSION_TIERS = [
  "entrada",
  "entrada intermediaria",
  "intermediaria",
  "intermediaria luxo",
  "luxo",
  "esportivo",
  "esportivo de luxo",
] as const

type Brand = {
  id: string
  name: string
}

type EditableItem = {
  id: string | null
  value: string
  owned: boolean
}

type VersionVehicle = {
  id: string
  name: string | null
  brand_id: string | null
  image_url: string | null
}

type EditableVersionRow = {
  id: string
  vehicle_id: string
  image_url?: string | null
  year: number | null
  engine: string | null
  transmission: string | null
  potencia_cv: number | null
  potencia_texto?: string | null
  potencia_alcool_cv?: number | null
  potencia_gasolina_cv?: number | null
  potencia_rpm?: number | null
  torque_kgfm: number | null
  torque_texto?: string | null
  torque_alcool_kgfm?: number | null
  torque_gasolina_kgfm?: number | null
  torque_rpm?: number | null
  consumo_gasolina_urbano_kml?: number | null
  consumo_gasolina_estrada_kml?: number | null
  consumo_etanol_urbano_kml?: number | null
  consumo_etanol_estrada_kml?: number | null
  latin_ncap_pre_2021?: string | null
  latin_ncap_post_2021?: string | null
  peso_kg: number | null
  peso_potencia_kgcv: number | null
  aceleracao_texto?: string | null
  aceleracao_0_100_s: number | null
  velocidade_maxima_kmh: number | null
  version_name: string | null
  version_tier: string | null
  vehicles: VersionVehicle[] | VersionVehicle | null
}

type DefectEditableRow = {
  id: string
  title: string | null
  severity: number | null
  created_by: string | null
}

type PositiveEditableRow = {
  id: string
  description: string | null
  created_by: string | null
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function generateModelSlug(brand: string, model: string) {
  return `${normalize(brand)}-${normalize(model)}`
}

function generateVersionSlug(
  brand: string,
  model: string,
  versionName: string,
  year: string
) {
  return `${normalize(brand)}-${normalize(model)}-${normalize(versionName)}-${year}`
}

export default function Page() {
  const { session, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const slug = params?.slug

  const [plan, setPlan] = useState<string | null>(null)
  const [brands, setBrands] = useState<Brand[]>([])

  const [versionId, setVersionId] = useState("")
  const [vehicleId, setVehicleId] = useState("")

  const [brandId, setBrandId] = useState("")
  const [name, setName] = useState("")
  const [versionName, setVersionName] = useState("")
  const [versionTier, setVersionTier] = useState<(typeof VERSION_TIERS)[number]>("intermediaria")
  const [year, setYear] = useState("")
  const [engine, setEngine] = useState("")
  const [transmission, setTransmission] = useState("")
  const [powerText, setPowerText] = useState("")
  const [powerAlcoholCv, setPowerAlcoholCv] = useState("")
  const [powerGasolineCv, setPowerGasolineCv] = useState("")
  const [powerRpm, setPowerRpm] = useState("")
  const [torqueText, setTorqueText] = useState("")
  const [torqueAlcoholKgfm, setTorqueAlcoholKgfm] = useState("")
  const [torqueGasolineKgfm, setTorqueGasolineKgfm] = useState("")
  const [torqueRpm, setTorqueRpm] = useState("")
  const [consumptionGasCity, setConsumptionGasCity] = useState("")
  const [consumptionGasHighway, setConsumptionGasHighway] = useState("")
  const [consumptionAlcoholCity, setConsumptionAlcoholCity] = useState("")
  const [consumptionAlcoholHighway, setConsumptionAlcoholHighway] = useState("")
  const [latinNcapPre2021, setLatinNcapPre2021] = useState("")
  const [latinNcapPost2021, setLatinNcapPost2021] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [acceleration0100, setAcceleration0100] = useState("")
  const [maxSpeedKmh, setMaxSpeedKmh] = useState("")

  const [existingImagePath, setExistingImagePath] = useState<string | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isObjectPreview, setIsObjectPreview] = useState(false)
  const [removeExistingImage, setRemoveExistingImage] = useState(false)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const [chronicDefects, setChronicDefects] = useState<EditableItem[]>([])
  const [pontualDefects, setPontualDefects] = useState<EditableItem[]>([])
  const [positivePoints, setPositivePoints] = useState<EditableItem[]>([])
  const [deletedDefectIds, setDeletedDefectIds] = useState<string[]>([])
  const [deletedPositiveIds, setDeletedPositiveIds] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  useEffect(() => {
    if (authLoading) return

    const checkAccess = async () => {
      if (!session?.user) {
        router.replace("/login")
        return
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .single()

      if (error) return

      if (data?.plan !== "profissional") {
        router.replace("/assinatura")
        return
      }

      setPlan(data.plan)
    }

    checkAccess()
  }, [session, authLoading, router])

  useEffect(() => {
    const fetchBrands = async () => {
      const { data } = await supabase
        .from("brands")
        .select("id,name")
        .order("name")

      if (data) setBrands(data as Brand[])
    }

    fetchBrands()
  }, [])

  useEffect(() => {
    const fetchCurrentData = async () => {
      if (!slug || !session?.user?.id) return

      setLoadingData(true)
      setErrorMessage("")

      const fullSelect = `
          id,
          vehicle_id,
          image_url,
          year,
          engine,
          transmission,
          potencia_cv,
          potencia_texto,
          potencia_alcool_cv,
          potencia_gasolina_cv,
          potencia_rpm,
          torque_kgfm,
          torque_texto,
          torque_alcool_kgfm,
          torque_gasolina_kgfm,
          torque_rpm,
          consumo_gasolina_urbano_kml,
          consumo_gasolina_estrada_kml,
          consumo_etanol_urbano_kml,
          consumo_etanol_estrada_kml,
          latin_ncap_pre_2021,
          latin_ncap_post_2021,
          peso_kg,
          peso_potencia_kgcv,
          aceleracao_texto,
          aceleracao_0_100_s,
          velocidade_maxima_kmh,
          version_name,
          version_tier,
          vehicles (
            id,
            name,
            brand_id,
            image_url
          )
        `

      const fallbackSelect = `
          id,
          vehicle_id,
          year,
          engine,
          transmission,
          potencia_cv,
          torque_kgfm,
          peso_kg,
          peso_potencia_kgcv,
          aceleracao_0_100_s,
          velocidade_maxima_kmh,
          version_name,
          version_tier,
          vehicles (
            id,
            name,
            brand_id,
            image_url
          )
        `

      const initialVersion = await supabase
        .from("vehicle_versions")
        .select(fullSelect)
        .eq("slug", slug)
        .single()
      let version = initialVersion.data as EditableVersionRow | null
      let error = initialVersion.error

      // Fallback: permite abrir a edição mesmo se colunas novas ainda não existirem no banco.
      if (error && /column|schema cache/i.test(error.message ?? "")) {
        const fallback = await supabase
          .from("vehicle_versions")
          .select(fallbackSelect)
          .eq("slug", slug)
          .single()

        version = fallback.data as EditableVersionRow | null
        error = fallback.error
      }

      if (error || !version) {
        setErrorMessage(`Não foi possível carregar os dados para edição: ${error?.message ?? "erro desconhecido"}`)
        setLoadingData(false)
        return
      }

      const typedVersion = version as EditableVersionRow
      const vehicleData = Array.isArray(typedVersion.vehicles)
        ? typedVersion.vehicles[0]
        : typedVersion.vehicles

      setVersionId(typedVersion.id)
      setVehicleId(typedVersion.vehicle_id)
      setBrandId(vehicleData?.brand_id ?? "")
      setName(vehicleData?.name ?? "")
      setVersionName(typedVersion.version_name ?? "")
      setVersionTier((typedVersion.version_tier ?? "intermediaria") as (typeof VERSION_TIERS)[number])
      setYear(String(typedVersion.year ?? ""))
      setEngine(typedVersion.engine ?? "")
      setTransmission(typedVersion.transmission ?? "")
      setPowerText(typedVersion.potencia_texto ?? "")
      setPowerAlcoholCv(typedVersion.potencia_alcool_cv != null ? String(typedVersion.potencia_alcool_cv) : "")
      setPowerGasolineCv(typedVersion.potencia_gasolina_cv != null ? String(typedVersion.potencia_gasolina_cv) : "")
      setPowerRpm(typedVersion.potencia_rpm != null ? String(typedVersion.potencia_rpm) : "")
      setTorqueText(typedVersion.torque_texto ?? "")
      setTorqueAlcoholKgfm(typedVersion.torque_alcool_kgfm != null ? String(typedVersion.torque_alcool_kgfm) : "")
      setTorqueGasolineKgfm(typedVersion.torque_gasolina_kgfm != null ? String(typedVersion.torque_gasolina_kgfm) : "")
      setTorqueRpm(typedVersion.torque_rpm != null ? String(typedVersion.torque_rpm) : "")
      setConsumptionGasCity(
        typedVersion.consumo_gasolina_urbano_kml != null ? String(typedVersion.consumo_gasolina_urbano_kml) : ""
      )
      setConsumptionGasHighway(
        typedVersion.consumo_gasolina_estrada_kml != null ? String(typedVersion.consumo_gasolina_estrada_kml) : ""
      )
      setConsumptionAlcoholCity(
        typedVersion.consumo_etanol_urbano_kml != null ? String(typedVersion.consumo_etanol_urbano_kml) : ""
      )
      setConsumptionAlcoholHighway(
        typedVersion.consumo_etanol_estrada_kml != null ? String(typedVersion.consumo_etanol_estrada_kml) : ""
      )
      setLatinNcapPre2021(typedVersion.latin_ncap_pre_2021 ?? "")
      setLatinNcapPost2021(typedVersion.latin_ncap_post_2021 ?? "")
      setWeightKg(typedVersion.peso_kg != null ? String(typedVersion.peso_kg) : "")
      setAcceleration0100(
        typedVersion.aceleracao_texto ??
          (typedVersion.aceleracao_0_100_s != null ? String(typedVersion.aceleracao_0_100_s) : "")
      )
      setMaxSpeedKmh(typedVersion.velocidade_maxima_kmh != null ? String(typedVersion.velocidade_maxima_kmh) : "")

      const currentImagePath = typedVersion.image_url ?? vehicleData?.image_url ?? null
      setExistingImagePath(currentImagePath)
      if (currentImagePath) {
        setImagePreview(`${STORAGE_URL}${currentImagePath}`)
        setIsObjectPreview(false)
      } else {
        setImagePreview(null)
      }

      const { data: defects, error: defectsError } = await supabase
        .from("defects")
        .select("id,title,severity,created_by")
        .eq("vehicle_version_id", typedVersion.id)

      if (defectsError) {
        setErrorMessage("A coluna created_by em defects é obrigatória para editar por autoria.")
        setLoadingData(false)
        return
      }

      const { data: positives, error: positivesError } = await supabase
        .from("positives")
        .select("id,description,created_by")
        .eq("vehicle_version_id", typedVersion.id)

      if (positivesError) {
        setErrorMessage("A coluna created_by em positives é obrigatória para editar por autoria.")
        setLoadingData(false)
        return
      }

      const uid = session.user.id

      const chronic = ((defects as DefectEditableRow[] | null) ?? [])
        .filter((item) => (item.severity ?? 0) >= 2)
        .map((item) => ({
          id: item.id,
          value: item.title ?? "",
          owned: item.created_by === uid,
        }))

      const pontual = ((defects as DefectEditableRow[] | null) ?? [])
        .filter((item) => (item.severity ?? 0) < 2)
        .map((item) => ({
          id: item.id,
          value: item.title ?? "",
          owned: item.created_by === uid,
        }))

      const positivesMapped = ((positives as PositiveEditableRow[] | null) ?? []).map((item) => ({
        id: item.id,
        value: item.description ?? "",
        owned: item.created_by === uid,
      }))

      setChronicDefects(chronic)
      setPontualDefects(pontual)
      setPositivePoints(positivesMapped)

      setLoadingData(false)
    }

    fetchCurrentData()
  }, [slug, session?.user?.id])

  useEffect(() => {
    return () => {
      if (isObjectPreview && imagePreview) {
        URL.revokeObjectURL(imagePreview)
      }
    }
  }, [imagePreview, isObjectPreview])

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === brandId) ?? null,
    [brands, brandId]
  )
  const hasOnlyNewChronic = chronicDefects.every((item) => item.id === null)
  const hasOnlyNewPontual = pontualDefects.every((item) => item.id === null)
  const hasOnlyNewPositives = positivePoints.every((item) => item.id === null)

  const resetMessages = () => {
    setErrorMessage("")
    setSuccessMessage("")
  }

  const handleImageChange = (file: File | null) => {
    if (isObjectPreview && imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }

    setImage(file)
    setRemoveExistingImage(false)

    if (file) {
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)
      setIsObjectPreview(true)
    } else if (existingImagePath) {
      setImagePreview(`${STORAGE_URL}${existingImagePath}`)
      setIsObjectPreview(false)
    } else {
      setImagePreview(null)
      setIsObjectPreview(false)
    }
  }

  const handleRemoveImage = () => {
    if (isObjectPreview && imagePreview) {
      URL.revokeObjectURL(imagePreview)
    }

    setImage(null)
    setImagePreview(null)
    setIsObjectPreview(false)
    setRemoveExistingImage(true)

    if (imageInputRef.current) {
      imageInputRef.current.value = ""
    }
  }

  const uploadImageIfNeeded = async () => {
    if (!image) return null

    const fileName = `${Date.now()}-${image.name}`

    const { error } = await supabase.storage
      .from("vehicle-images")
      .upload(fileName, image)

    if (error) {
      throw new Error("Falha no upload da imagem.")
    }

    return fileName
  }

  const parseOptionalNumber = (raw: string) => {
    const normalized = raw.trim().replace(",", ".")
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  const updateEditableItem = (
    setter: Dispatch<SetStateAction<EditableItem[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => prev.map((item, i) => (i === index ? { ...item, value } : item)))
  }

  const addEditableItem = (setter: Dispatch<SetStateAction<EditableItem[]>>) => {
    setter((prev) => [...prev, { id: null, value: "", owned: true }])
  }

  const removeEditableItem = (
    list: EditableItem[],
    setter: Dispatch<SetStateAction<EditableItem[]>>,
    index: number,
    markDeleted: Dispatch<SetStateAction<string[]>>
  ) => {
    const target = list[index]
    if (!target || !target.owned) return

    if (target.id) {
      markDeleted((prev) => [...prev, target.id as string])
    }

    setter((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    setLoading(true)

    try {
      const userId = session?.user?.id
      if (!userId) {
        throw new Error("Sessão inválida.")
      }

      if (!selectedBrand) {
        throw new Error("Selecione uma marca válida.")
      }

      if (!name || !versionName || !year || !engine || !transmission) {
        throw new Error("Preencha todos os campos obrigatorios.")
      }

      const uploadedImagePath = await uploadImageIfNeeded()
      const potenciaAlcool = parseOptionalNumber(powerAlcoholCv)
      const potenciaGasolina = parseOptionalNumber(powerGasolineCv)
      const potenciaCv = potenciaAlcool ?? potenciaGasolina ?? null
      const potenciaRpm = parseOptionalNumber(powerRpm)
      const torqueAlcool = parseOptionalNumber(torqueAlcoholKgfm)
      const torqueGasolina = parseOptionalNumber(torqueGasolineKgfm)
      const torque = torqueAlcool ?? torqueGasolina ?? null
      const torqueRefRpm = parseOptionalNumber(torqueRpm)
      const consumoGasolinaUrbano = parseOptionalNumber(consumptionGasCity)
      const consumoGasolinaEstrada = parseOptionalNumber(consumptionGasHighway)
      const consumoEtanolUrbano = parseOptionalNumber(consumptionAlcoholCity)
      const consumoEtanolEstrada = parseOptionalNumber(consumptionAlcoholHighway)
      const latinNcapAte2021 = latinNcapPre2021.trim() || null
      const latinNcapPos2021 = latinNcapPost2021.trim() || null
      const pesoKg = parseOptionalNumber(weightKg)
      const pesoPotenciaAlcool =
        potenciaAlcool && pesoKg
          ? Number((pesoKg / potenciaAlcool).toFixed(2))
          : null
      const pesoPotenciaGasolina =
        potenciaGasolina && pesoKg
          ? Number((pesoKg / potenciaGasolina).toFixed(2))
          : null
      const pesoPotencia =
        pesoPotenciaAlcool && !pesoPotenciaGasolina
          ? pesoPotenciaAlcool
          : (!pesoPotenciaAlcool && pesoPotenciaGasolina ? pesoPotenciaGasolina : null)
      const aceleracaoTexto = acceleration0100.trim() || null
      const aceleracao = parseOptionalNumber(acceleration0100)
      const velocidadeMaxima = parseOptionalNumber(maxSpeedKmh)

      let nextImagePath: string | null = existingImagePath
      if (uploadedImagePath) nextImagePath = uploadedImagePath
      if (removeExistingImage && !uploadedImagePath) nextImagePath = null
      if (!nextImagePath) {
        throw new Error("A imagem do modelo é obrigatória.")
      }

      const modelSlug = generateModelSlug(selectedBrand.name, name)
      const generatedVersionSlug = generateVersionSlug(
        selectedBrand.name,
        name,
        versionName,
        year
      )
      // Preserve current URL slug to avoid breaking existing links.
      const versionSlug = slug || generatedVersionSlug

      const { error: vehicleError } = await supabase
        .from("vehicles")
        .update({
          brand_id: brandId,
          name,
          slug: modelSlug,
          image_url: nextImagePath,
        })
        .eq("id", vehicleId)

      if (vehicleError) {
        throw new Error("Falha ao atualizar o modelo.")
      }

      const fullVersionPayload = {
        image_url: nextImagePath,
        year: Number(year),
        engine,
        transmission,
        potencia_cv: potenciaCv,
        potencia_texto: powerText.trim() || null,
        potencia_alcool_cv: potenciaAlcool,
        potencia_gasolina_cv: potenciaGasolina,
        potencia_rpm: potenciaRpm,
        torque_kgfm: torque,
        torque_texto: torqueText.trim() || null,
        torque_alcool_kgfm: torqueAlcool,
        torque_gasolina_kgfm: torqueGasolina,
        torque_rpm: torqueRefRpm,
        consumo_gasolina_urbano_kml: consumoGasolinaUrbano,
        consumo_gasolina_estrada_kml: consumoGasolinaEstrada,
        consumo_etanol_urbano_kml: consumoEtanolUrbano,
        consumo_etanol_estrada_kml: consumoEtanolEstrada,
        latin_ncap_pre_2021: latinNcapAte2021,
        latin_ncap_post_2021: latinNcapPos2021,
        peso_kg: pesoKg,
        peso_potencia_alcool_kgcv: pesoPotenciaAlcool,
        peso_potencia_gasolina_kgcv: pesoPotenciaGasolina,
        peso_potencia_kgcv: pesoPotencia,
        aceleracao_texto: aceleracaoTexto,
        aceleracao_0_100_s: aceleracao,
        velocidade_maxima_kmh: velocidadeMaxima,
        version_name: versionName,
        version_tier: versionTier,
        slug: versionSlug,
      }

      const fallbackVersionPayload = {
        year: Number(year),
        engine,
        transmission,
        potencia_cv: potenciaCv,
        torque_kgfm: torque,
        peso_kg: pesoKg,
        peso_potencia_kgcv: pesoPotencia,
        aceleracao_0_100_s: aceleracao,
        velocidade_maxima_kmh: velocidadeMaxima,
        version_name: versionName,
        version_tier: versionTier,
        slug: versionSlug,
      }

      let { error: versionError } = await supabase
        .from("vehicle_versions")
        .update(fullVersionPayload)
        .eq("id", versionId)

      if (versionError && /column|schema cache/i.test(versionError.message ?? "")) {
        const fallbackUpdate = await supabase
          .from("vehicle_versions")
          .update(fallbackVersionPayload)
          .eq("id", versionId)

        versionError = fallbackUpdate.error
      }

      if (versionError) {
        throw new Error("Falha ao atualizar a versão.")
      }

      if (deletedDefectIds.length) {
        const { error: deleteDefectsError } = await supabase
          .from("defects")
          .delete()
          .in("id", deletedDefectIds)
          .eq("created_by", userId)

        if (deleteDefectsError) {
          throw new Error("Falha ao remover defeitos.")
        }
      }

      if (deletedPositiveIds.length) {
        const { error: deletePositivesError } = await supabase
          .from("positives")
          .delete()
          .in("id", deletedPositiveIds)
          .eq("created_by", userId)

        if (deletePositivesError) {
          throw new Error("Falha ao remover pontos positivos.")
        }
      }

      const syncDefects = async (items: EditableItem[], severity: number) => {
        for (const item of items) {
          const title = item.value.trim()

          if (!title) continue

          if (item.id) {
            if (!item.owned) continue

            const { error } = await supabase
              .from("defects")
              .update({ title, severity })
              .eq("id", item.id)
              .eq("created_by", userId)

            if (error) throw new Error(`Falha ao atualizar defeitos: ${error.message}`)
          } else {
            const { error } = await supabase
              .from("defects")
              .insert({
                vehicle_version_id: versionId,
                title,
                severity,
                created_by: userId,
              })

            if (error) throw new Error(`Falha ao inserir defeitos: ${error.message}`)
          }
        }
      }

      const syncPositives = async (items: EditableItem[]) => {
        for (const item of items) {
          const description = item.value.trim()

          if (!description) continue

          if (item.id) {
            if (!item.owned) continue

            const { error } = await supabase
              .from("positives")
              .update({ description })
              .eq("id", item.id)
              .eq("created_by", userId)

            if (error) throw new Error(`Falha ao atualizar pontos positivos: ${error.message}`)
          } else {
            const { error } = await supabase
              .from("positives")
              .insert({
                vehicle_version_id: versionId,
                description,
                created_by: userId,
              })

            if (error) throw new Error(`Falha ao inserir pontos positivos: ${error.message}`)
          }
        }
      }

      await syncDefects(chronicDefects, 2)
      await syncDefects(pontualDefects, 1)
      await syncPositives(positivePoints)

      setSuccessMessage("Edição salva com sucesso.")
      setTimeout(() => router.push(`/carros/${versionSlug}?v=${Date.now()}`), 700)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Erro inesperado ao salvar.")
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || plan === null || loadingData) {
    return null
  }

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-10 pt-32 pb-10">
      <h1 className="text-3xl font-bold mb-8 tracking-tight">Editar Veículo</h1>

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
      >
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Se o item já existir e for seu, ele será atualizado. Se não existir, ele será criado como novo ao salvar.
        </div>

        <select
          value={brandId}
          onChange={(e) => setBrandId(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        >
          <option value="">Selecione a marca</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Modelo (ex: Polo)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        />

        <input
          type="text"
          placeholder="Nome da versão (ex: Highline, GTS, Track)"
          value={versionName}
          onChange={(e) => setVersionName(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        />

        <select
          value={versionTier}
          onChange={(e) => setVersionTier(e.target.value as (typeof VERSION_TIERS)[number])}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        >
          {VERSION_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Ano (ex: 2025)"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        />

        <input
          type="text"
          placeholder="Motor (ex: 1.0 TSI)"
          value={engine}
          onChange={(e) => setEngine(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        />

        <input
          type="text"
          placeholder="Transmissão (ex: AT6)"
          value={transmission}
          onChange={(e) => setTransmission(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        />

        <h3 className="text-lg font-semibold text-gray-900 mt-2">
          Especificações da versão (opcional)
        </h3>
        <p className="text-sm text-gray-500">
          Você pode preencher em texto completo ou em campos separados por combustível + rpm.
        </p>

        <input
          type="text"
          placeholder="Potência (texto completo) - ex: 116 cv (E) / 109 cv (G) a 5.000 rpm"
          value={powerText}
          onChange={(e) => setPowerText(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <div className="grid sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Potência E (cv)"
            value={powerAlcoholCv}
            onChange={(e) => setPowerAlcoholCv(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Potência G (cv)"
            value={powerGasolineCv}
            onChange={(e) => setPowerGasolineCv(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Potência rpm"
            value={powerRpm}
            onChange={(e) => setPowerRpm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
        </div>

        <input
          type="text"
          placeholder="Torque (texto completo) - ex: 16,8 kgfm (E/G) a 4.000 rpm"
          value={torqueText}
          onChange={(e) => setTorqueText(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <div className="grid sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Torque E (kgfm)"
            value={torqueAlcoholKgfm}
            onChange={(e) => setTorqueAlcoholKgfm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Torque G (kgfm)"
            value={torqueGasolineKgfm}
            onChange={(e) => setTorqueGasolineKgfm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Torque rpm"
            value={torqueRpm}
            onChange={(e) => setTorqueRpm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
        </div>

        <h4 className="text-base font-semibold text-gray-900 mt-1">
          Consumo (km/l)
        </h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Gasolina urbano (km/l)"
            value={consumptionGasCity}
            onChange={(e) => setConsumptionGasCity(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Gasolina estrada (km/l)"
            value={consumptionGasHighway}
            onChange={(e) => setConsumptionGasHighway(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Etanol urbano (km/l)"
            value={consumptionAlcoholCity}
            onChange={(e) => setConsumptionAlcoholCity(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Etanol estrada (km/l)"
            value={consumptionAlcoholHighway}
            onChange={(e) => setConsumptionAlcoholHighway(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
        </div>

        <input
          type="text"
          placeholder="Peso (kg) - ex: 1168"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <input
          type="text"
          placeholder="Aceleração 0-100 (texto completo) - ex: 10,3 s (E) / 10,8 s (G)"
          value={acceleration0100}
          onChange={(e) => setAcceleration0100(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <input
          type="text"
          placeholder="Velocidade máxima (km/h) - ex: 190"
          value={maxSpeedKmh}
          onChange={(e) => setMaxSpeedKmh(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Latin NCAP (até 2021) - ex: 5 estrelas"
            value={latinNcapPre2021}
            onChange={(e) => setLatinNcapPre2021(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Latin NCAP (a partir de 2021) - ex: 3 estrelas"
            value={latinNcapPost2021}
            onChange={(e) => setLatinNcapPost2021(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Imagem do modelo
          </label>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50 cursor-pointer"
          />

          {imagePreview ? (
            <div className="border rounded-lg p-3 w-fit bg-white shadow-sm">
              <p className="text-xs text-gray-500 mb-2">Prévia</p>
              <Image
                src={imagePreview}
                alt="Prévia da imagem selecionada"
                width={256}
                height={160}
                unoptimized
                className="h-40 w-64 object-contain rounded bg-gray-50"
              />
              <button
                type="button"
                onClick={handleRemoveImage}
                className="mt-3 text-sm text-red-600 hover:text-red-700 transition-colors duration-200 cursor-pointer"
              >
                Remover imagem
              </button>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Defeitos crônicos</label>
          {hasOnlyNewChronic ? (
            <p className="text-xs text-gray-500">
              Nenhum defeito crônico existente para você. O que preencher abaixo será inserido como novo.
            </p>
          ) : null}
          {chronicDefects.map((item, index) => (
            <div key={`edit-chronic-${item.id ?? index}`} className="space-y-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={item.value}
                  onChange={(e) => updateEditableItem(setChronicDefects, index, e.target.value)}
                  disabled={!item.owned}
                  className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50 disabled:bg-gray-100 disabled:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => removeEditableItem(chronicDefects, setChronicDefects, index, setDeletedDefectIds)}
                  disabled={!item.owned}
                  className="px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  -
                </button>
              </div>
              {!item.owned ? (
                <p className="text-xs text-gray-500">Somente o autor deste registro pode editar.</p>
              ) : null}
              {item.owned && item.id ? (
                <p className="text-xs text-green-700">Este registro será atualizado ao salvar.</p>
              ) : null}
              {item.owned && !item.id ? (
                <p className="text-xs text-blue-700">Este registro será criado como novo ao salvar.</p>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => addEditableItem(setChronicDefects)}
            className="text-sm text-gray-700 hover:text-black transition-colors duration-200 cursor-pointer"
          >
            + Adicionar defeito crônico
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Defeitos pontuais</label>
          {hasOnlyNewPontual ? (
            <p className="text-xs text-gray-500">
              Nenhum defeito pontual existente para você. O que preencher abaixo será inserido como novo.
            </p>
          ) : null}
          {pontualDefects.map((item, index) => (
            <div key={`edit-pontual-${item.id ?? index}`} className="space-y-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={item.value}
                  onChange={(e) => updateEditableItem(setPontualDefects, index, e.target.value)}
                  disabled={!item.owned}
                  className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50 disabled:bg-gray-100 disabled:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => removeEditableItem(pontualDefects, setPontualDefects, index, setDeletedDefectIds)}
                  disabled={!item.owned}
                  className="px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  -
                </button>
              </div>
              {!item.owned ? (
                <p className="text-xs text-gray-500">Somente o autor deste registro pode editar.</p>
              ) : null}
              {item.owned && item.id ? (
                <p className="text-xs text-green-700">Este registro será atualizado ao salvar.</p>
              ) : null}
              {item.owned && !item.id ? (
                <p className="text-xs text-blue-700">Este registro será criado como novo ao salvar.</p>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => addEditableItem(setPontualDefects)}
            className="text-sm text-gray-700 hover:text-black transition-colors duration-200 cursor-pointer"
          >
            + Adicionar defeito pontual
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">Pontos positivos</label>
          {hasOnlyNewPositives ? (
            <p className="text-xs text-gray-500">
              Nenhum ponto positivo existente para você. O que preencher abaixo será inserido como novo.
            </p>
          ) : null}
          {positivePoints.map((item, index) => (
            <div key={`edit-positive-${item.id ?? index}`} className="space-y-1">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={item.value}
                  onChange={(e) => updateEditableItem(setPositivePoints, index, e.target.value)}
                  disabled={!item.owned}
                  className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50 disabled:bg-gray-100 disabled:text-gray-500"
                />
                <button
                  type="button"
                  onClick={() => removeEditableItem(positivePoints, setPositivePoints, index, setDeletedPositiveIds)}
                  disabled={!item.owned}
                  className="px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  -
                </button>
              </div>
              {!item.owned ? (
                <p className="text-xs text-gray-500">Somente o autor deste registro pode editar.</p>
              ) : null}
              {item.owned && item.id ? (
                <p className="text-xs text-green-700">Este registro será atualizado ao salvar.</p>
              ) : null}
              {item.owned && !item.id ? (
                <p className="text-xs text-blue-700">Este registro será criado como novo ao salvar.</p>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() => addEditableItem(setPositivePoints)}
            className="text-sm text-gray-700 hover:text-black transition-colors duration-200 cursor-pointer"
          >
            + Adicionar ponto positivo
          </button>
        </div>

        {errorMessage ? <p className="text-red-600">{errorMessage}</p> : null}
        {successMessage ? <p className="text-green-700">{successMessage}</p> : null}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Salvando..." : "Salvar alterações"}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}


