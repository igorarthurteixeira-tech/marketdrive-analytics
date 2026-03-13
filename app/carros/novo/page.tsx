"use client"

import { useAuth } from "@/components/AuthProvider"
import BrandLogo from "@/components/BrandLogo"
import { supabase } from "@/lib/supabaseClient"
import Link from "next/link"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react"

const VERSION_TIERS = [
  "entrada",
  "entrada intermediaria",
  "intermediaria",
  "intermediaria luxo",
  "luxo",
  "topo de linha",
  "esportivo",
  "esportivo de luxo",
] as const

const FUEL_OPTIONS = ["gasolina", "etanol", "diesel", "gnv", "eletrico", "hibrido"] as const
type FuelOption = (typeof FUEL_OPTIONS)[number]
const BODY_STYLE_OPTIONS = [
  "hatch",
  "sedan",
  "suv",
  "picape",
  "cupe",
  "perua",
  "van",
  "outro",
] as const
type BodyStyleOption = (typeof BODY_STYLE_OPTIONS)[number]

type Brand = {
  id: string
  name: string
  logo_path?: string | null
}

type VehicleOption = {
  id: string
  name: string
  brandName: string
}

type VehicleQueryRow = {
  id: string
  name: string
  brands: { name: string | null }[] | { name: string | null } | null
}

type DraftPayload = {
  mode: "model" | "version"
  brandId: string
  name: string
  vehicleId: string
  versionName: string
  bodyStyle: BodyStyleOption
  versionTier: (typeof VERSION_TIERS)[number]
  year: string
  engine: string
  transmission: string
  fuelTypes: FuelOption[]
  powerText: string
  powerSingleCv: string
  powerAlcoholCv: string
  powerGasolineCv: string
  powerRpm: string
  torqueText: string
  torqueSingleKgfm: string
  torqueAlcoholKgfm: string
  torqueGasolineKgfm: string
  torqueRpm: string
  consumptionSingleCity: string
  consumptionSingleHighway: string
  consumptionGasCity: string
  consumptionGasHighway: string
  consumptionAlcoholCity: string
  consumptionAlcoholHighway: string
  tankCapacityL: string
  rangeGasCityKm: string
  rangeGasHighwayKm: string
  rangeAlcoholCityKm: string
  rangeAlcoholHighwayKm: string
  airbagsCount: string
  stabilityControl: "" | "sim" | "nao"
  safetyAssistants: string
  frontPowerWindows: "" | "sim" | "nao"
  rearPowerWindows: "" | "sim" | "nao"
  acType: string
  trunkCapacityL: string
  wheelbaseMm: string
  weightKg: string
  acceleration0100: string
  maxSpeedKmh: string
  latinNcapPre2021: string
  latinNcapPost2021: string
  chronicDefects: string[]
  pontualDefects: string[]
  positivePoints: string[]
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function detectTransmissionType(transmission: string) {
  const normalized = transmission
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  if (normalized.includes("manual")) return "manual"
  if (normalized.includes("automatizad")) return "automatizada"
  if (normalized.includes("automatic")) return "automatica"
  return normalize(transmission) || "sem-transmissao"
}

function detectBodyStyleType(bodyStyle: string) {
  const normalized = bodyStyle
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

  if (normalized.includes("hatch")) return "hatch"
  if (normalized.includes("sedan")) return "sedan"
  if (normalized.includes("suv")) return "suv"
  if (normalized.includes("crossover")) return "crossover"
  if (normalized.includes("picape") || normalized.includes("pickup")) return "picape"
  if (normalized.includes("coupe") || normalized.includes("cupe")) return "cupe"
  if (normalized.includes("perua") || normalized.includes("wagon")) return "perua"
  if (normalized.includes("van") || normalized.includes("minivan")) return "van"
  return normalize(bodyStyle) || "sem-carroceria"
}

function normalizeVersionName(value: string) {
  return value.trim().toLowerCase()
}

function generateModelSlug(brand: string, model: string) {
  return `${normalize(brand)}-${normalize(model)}`
}

function generateVersionSlug(
  brand: string,
  model: string,
  versionName: string,
  year: string,
  transmission: string,
  bodyStyle: string
) {
  const transmissionType = detectTransmissionType(transmission)
  const bodyStyleType = detectBodyStyleType(bodyStyle)
  return `${normalize(brand)}-${normalize(model)}-${normalize(versionName)}-${bodyStyleType}-${transmissionType}-${year}`
}

function toBrandLogoSrc(brand: Brand | null) {
  if (!brand) return null
  const raw = brand.logo_path?.trim()
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw
    return `/brands/${raw}`
  }
  return `/brands/${normalize(brand.name)}.png`
}

export default function NovoCarro() {
  const { session, loading: authLoading } = useAuth()
  const router = useRouter()

  const [plan, setPlan] = useState<string | null>(null)

  const [brands, setBrands] = useState<Brand[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])

  const [mode, setMode] = useState<"model" | "version">("model")

  const [brandId, setBrandId] = useState("")
  const [selectedBrandMeta, setSelectedBrandMeta] = useState<Brand | null>(null)
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)
  const [brandSearch, setBrandSearch] = useState("")
  const [searchingBrands, setSearchingBrands] = useState(false)
  const brandDropdownRef = useRef<HTMLDivElement | null>(null)
  const [name, setName] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const [vehicleId, setVehicleId] = useState("")

  const [versionName, setVersionName] = useState("")
  const [bodyStyle, setBodyStyle] = useState<BodyStyleOption>("hatch")
  const [versionTier, setVersionTier] = useState<(typeof VERSION_TIERS)[number]>("intermediaria")
  const [year, setYear] = useState("")
  const [engine, setEngine] = useState("")
  const [transmission, setTransmission] = useState("")
  const [fuelTypes, setFuelTypes] = useState<FuelOption[]>(["gasolina", "etanol"])
  const [powerText, setPowerText] = useState("")
  const [powerSingleCv, setPowerSingleCv] = useState("")
  const [powerAlcoholCv, setPowerAlcoholCv] = useState("")
  const [powerGasolineCv, setPowerGasolineCv] = useState("")
  const [powerRpm, setPowerRpm] = useState("")
  const [torqueText, setTorqueText] = useState("")
  const [torqueSingleKgfm, setTorqueSingleKgfm] = useState("")
  const [torqueAlcoholKgfm, setTorqueAlcoholKgfm] = useState("")
  const [torqueGasolineKgfm, setTorqueGasolineKgfm] = useState("")
  const [torqueRpm, setTorqueRpm] = useState("")
  const [consumptionSingleCity, setConsumptionSingleCity] = useState("")
  const [consumptionSingleHighway, setConsumptionSingleHighway] = useState("")
  const [consumptionGasCity, setConsumptionGasCity] = useState("")
  const [consumptionGasHighway, setConsumptionGasHighway] = useState("")
  const [consumptionAlcoholCity, setConsumptionAlcoholCity] = useState("")
  const [consumptionAlcoholHighway, setConsumptionAlcoholHighway] = useState("")
  const [tankCapacityL, setTankCapacityL] = useState("")
  const [rangeGasCityKm, setRangeGasCityKm] = useState("")
  const [rangeGasHighwayKm, setRangeGasHighwayKm] = useState("")
  const [rangeAlcoholCityKm, setRangeAlcoholCityKm] = useState("")
  const [rangeAlcoholHighwayKm, setRangeAlcoholHighwayKm] = useState("")
  const [airbagsCount, setAirbagsCount] = useState("")
  const [stabilityControl, setStabilityControl] = useState<"" | "sim" | "nao">("")
  const [safetyAssistants, setSafetyAssistants] = useState("")
  const [frontPowerWindows, setFrontPowerWindows] = useState<"" | "sim" | "nao">("")
  const [rearPowerWindows, setRearPowerWindows] = useState<"" | "sim" | "nao">("")
  const [acType, setAcType] = useState("")
  const [trunkCapacityL, setTrunkCapacityL] = useState("")
  const [wheelbaseMm, setWheelbaseMm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [acceleration0100, setAcceleration0100] = useState("")
  const [maxSpeedKmh, setMaxSpeedKmh] = useState("")
  const [latinNcapPre2021, setLatinNcapPre2021] = useState("")
  const [latinNcapPost2021, setLatinNcapPost2021] = useState("")
  const [chronicDefects, setChronicDefects] = useState<string[]>([])
  const [pontualDefects, setPontualDefects] = useState<string[]>([])
  const [positivePoints, setPositivePoints] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [loadingDraft, setLoadingDraft] = useState(false)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [removingImage, setRemovingImage] = useState(false)
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
    const fetchInitialData = async () => {
      const { data: vehiclesData } = await supabase
        .from("vehicles")
        .select(`
          id,
          name,
          brands ( name )
        `)
        .order("name")

      if (vehiclesData) {
        const mapped = (vehiclesData as VehicleQueryRow[]).map((v) => {
          const brandRaw = Array.isArray(v.brands) ? v.brands[0] : v.brands
          return {
            id: v.id,
            name: v.name,
            brandName: brandRaw?.name ?? "",
          }
        })
        setVehicles(mapped)
      }
    }

    fetchInitialData()
  }, [])

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  const selectedVehicle = useMemo(
    () => vehicles.find((v) => v.id === vehicleId) ?? null,
    [vehicles, vehicleId]
  )
  const selectedBrand = useMemo(() => {
    if (selectedBrandMeta && selectedBrandMeta.id === brandId) return selectedBrandMeta
    return brands.find((brand) => brand.id === brandId) ?? selectedBrandMeta
  }, [brands, brandId, selectedBrandMeta])
  const hasMinimumBrandSearch = useMemo(() => brandSearch.trim().length >= 3, [brandSearch])
  const filteredBrands = useMemo(() => brands, [brands])
  const isFlexFuel = useMemo(
    () => fuelTypes.includes("gasolina") && fuelTypes.includes("etanol"),
    [fuelTypes]
  )

  useEffect(() => {
    let cancelled = false

    const term = brandSearch.trim()
    if (term.length < 3) {
      setBrands([])
      setSearchingBrands(false)
      return
    }

    setSearchingBrands(true)
    const timer = window.setTimeout(async () => {
      const { data } = await supabase
        .from("brands")
        .select("id,name,logo_path")
        .ilike("name", `%${term}%`)
        .order("name")
        .limit(40)

      if (cancelled) return
      setBrands((data as Brand[] | null) ?? [])
      setSearchingBrands(false)
    }, 260)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [brandSearch])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!brandDropdownOpen) return
      const target = event.target as Node | null
      if (brandDropdownRef.current && target && !brandDropdownRef.current.contains(target)) {
        setBrandDropdownOpen(false)
      }
    }
    window.addEventListener("mousedown", handlePointerDown)
    return () => window.removeEventListener("mousedown", handlePointerDown)
  }, [brandDropdownOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    const draft = new URLSearchParams(window.location.search).get("draft")
    if (!draft || !session?.user?.id) return

    const loadDraft = async () => {
      setLoadingDraft(true)
      const { data, error } = await supabase
        .from("vehicle_drafts")
        .select("id,payload")
        .eq("id", draft)
        .eq("user_id", session.user.id)
        .single()

      if (error || !data) {
        setLoadingDraft(false)
        return
      }

      const payload = (data.payload ?? {}) as Partial<DraftPayload>
      setDraftId(data.id)
      setMode(payload.mode === "version" ? "version" : "model")
      setBrandId(payload.brandId ?? "")
      setName(payload.name ?? "")
      setVehicleId(payload.vehicleId ?? "")
      setVersionName(payload.versionName ?? "")
      setBodyStyle(
        payload.bodyStyle && BODY_STYLE_OPTIONS.includes(payload.bodyStyle)
          ? payload.bodyStyle
          : "hatch"
      )
      setVersionTier(
        payload.versionTier && VERSION_TIERS.includes(payload.versionTier)
          ? payload.versionTier
          : "intermediaria"
      )
      setYear(payload.year ?? "")
      setEngine(payload.engine ?? "")
      setTransmission(payload.transmission ?? "")
      setFuelTypes(
        Array.isArray(payload.fuelTypes)
          ? payload.fuelTypes.filter((item): item is FuelOption => FUEL_OPTIONS.includes(item))
          : ["gasolina", "etanol"]
      )
      setPowerText(payload.powerText ?? "")
      setPowerSingleCv(payload.powerSingleCv ?? "")
      setPowerAlcoholCv(payload.powerAlcoholCv ?? "")
      setPowerGasolineCv(payload.powerGasolineCv ?? "")
      setPowerRpm(payload.powerRpm ?? "")
      setTorqueText(payload.torqueText ?? "")
      setTorqueSingleKgfm(payload.torqueSingleKgfm ?? "")
      setTorqueAlcoholKgfm(payload.torqueAlcoholKgfm ?? "")
      setTorqueGasolineKgfm(payload.torqueGasolineKgfm ?? "")
      setTorqueRpm(payload.torqueRpm ?? "")
      setConsumptionSingleCity(payload.consumptionSingleCity ?? "")
      setConsumptionSingleHighway(payload.consumptionSingleHighway ?? "")
      setConsumptionGasCity(payload.consumptionGasCity ?? "")
      setConsumptionGasHighway(payload.consumptionGasHighway ?? "")
      setConsumptionAlcoholCity(payload.consumptionAlcoholCity ?? "")
      setConsumptionAlcoholHighway(payload.consumptionAlcoholHighway ?? "")
      setTankCapacityL(payload.tankCapacityL ?? "")
      setRangeGasCityKm(payload.rangeGasCityKm ?? "")
      setRangeGasHighwayKm(payload.rangeGasHighwayKm ?? "")
      setRangeAlcoholCityKm(payload.rangeAlcoholCityKm ?? "")
      setRangeAlcoholHighwayKm(payload.rangeAlcoholHighwayKm ?? "")
      setAirbagsCount(payload.airbagsCount ?? "")
      setStabilityControl(payload.stabilityControl ?? "")
      setSafetyAssistants(payload.safetyAssistants ?? "")
      setFrontPowerWindows(payload.frontPowerWindows ?? "")
      setRearPowerWindows(payload.rearPowerWindows ?? "")
      setAcType(payload.acType ?? "")
      setTrunkCapacityL(payload.trunkCapacityL ?? "")
      setWheelbaseMm(payload.wheelbaseMm ?? "")
      setWeightKg(payload.weightKg ?? "")
      setAcceleration0100(payload.acceleration0100 ?? "")
      setMaxSpeedKmh(payload.maxSpeedKmh ?? "")
      setLatinNcapPre2021(payload.latinNcapPre2021 ?? "")
      setLatinNcapPost2021(payload.latinNcapPost2021 ?? "")
      setChronicDefects(Array.isArray(payload.chronicDefects) ? payload.chronicDefects : [""])
      setPontualDefects(Array.isArray(payload.pontualDefects) ? payload.pontualDefects : [""])
      setPositivePoints(Array.isArray(payload.positivePoints) ? payload.positivePoints : [""])
      setSuccessMessage("Rascunho carregado com sucesso.")
      setLoadingDraft(false)
    }

    void loadDraft()
  }, [session?.user?.id])

  const buildDraftPayload = (): DraftPayload => ({
    mode,
    brandId,
    name,
    vehicleId,
    versionName,
    bodyStyle,
    versionTier,
    year,
    engine,
    transmission,
    fuelTypes,
    powerText,
    powerSingleCv,
    powerAlcoholCv,
    powerGasolineCv,
    powerRpm,
    torqueText,
    torqueSingleKgfm,
    torqueAlcoholKgfm,
    torqueGasolineKgfm,
    torqueRpm,
    consumptionSingleCity,
    consumptionSingleHighway,
    consumptionGasCity,
    consumptionGasHighway,
    consumptionAlcoholCity,
    consumptionAlcoholHighway,
    tankCapacityL,
    rangeGasCityKm,
    rangeGasHighwayKm,
    rangeAlcoholCityKm,
    rangeAlcoholHighwayKm,
    airbagsCount,
    stabilityControl,
    safetyAssistants,
    frontPowerWindows,
    rearPowerWindows,
    acType,
    trunkCapacityL,
    wheelbaseMm,
    weightKg,
    acceleration0100,
    maxSpeedKmh,
    latinNcapPre2021,
    latinNcapPost2021,
    chronicDefects,
    pontualDefects,
    positivePoints,
  })

  const handleSaveDraft = async () => {
    resetMessages()
    const userId = session?.user?.id
    if (!userId) {
      setErrorMessage("Faça login para salvar rascunhos.")
      return
    }

    setSavingDraft(true)
    const payload = buildDraftPayload()
    const titleBase =
      payload.mode === "model"
        ? `${name || "Novo modelo"} - ${versionName || "Nova versão"}`
        : `${selectedVehicle?.brandName ?? "Modelo"} ${selectedVehicle?.name ?? ""} - ${versionName || "Nova versão"}`

    if (draftId) {
      const { error } = await supabase
        .from("vehicle_drafts")
        .update({
          mode: payload.mode,
          title: titleBase.trim(),
          payload,
        })
        .eq("id", draftId)
        .eq("user_id", userId)

      if (error) {
        setErrorMessage(`Falha ao salvar rascunho: ${error.message}`)
      } else {
        setSuccessMessage("Rascunho atualizado com sucesso.")
      }
      setSavingDraft(false)
      return
    }

    const { data, error } = await supabase
      .from("vehicle_drafts")
      .insert({
        user_id: userId,
        mode: payload.mode,
        title: titleBase.trim(),
        payload,
      })
      .select("id")
      .single()

    if (error || !data) {
      setErrorMessage(`Falha ao salvar rascunho: ${error?.message ?? "erro desconhecido"}`)
    } else {
      setDraftId(data.id)
      setSuccessMessage("Rascunho salvo com sucesso.")
    }
    setSavingDraft(false)
  }

  const resetMessages = () => {
    setErrorMessage("")
    setSuccessMessage("")
  }

  const handleImageChange = (file: File | null) => {
    setImage(file)

    if (imagePreview) URL.revokeObjectURL(imagePreview)

    if (file) {
      const previewUrl = URL.createObjectURL(file)
      setImagePreview(previewUrl)
    } else {
      setImagePreview(null)
    }
  }

  const handleRemoveImage = async () => {
    if (!imagePreview || removingImage) return

    setRemovingImage(true)
    await new Promise((resolve) => setTimeout(resolve, 320))

    URL.revokeObjectURL(imagePreview)
    setImage(null)
    setImagePreview(null)
    if (imageInputRef.current) {
      imageInputRef.current.value = ""
    }
    setRemovingImage(false)
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

  const sanitizeList = (items: string[]) =>
    items.map((item) => item.trim()).filter((item) => item.length > 0)

  const parseOptionalNumber = (raw: string) => {
    const normalized = raw.trim().replace(",", ".")
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  const parseOptionalBoolean = (raw: "" | "sim" | "nao") => {
    if (raw === "sim") return true
    if (raw === "nao") return false
    return null
  }

  const updateListItem = (
    setter: Dispatch<SetStateAction<string[]>>,
    index: number,
    value: string
  ) => {
    setter((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  const addListItem = (setter: Dispatch<SetStateAction<string[]>>) => {
    setter((prev) => [...prev, ""])
  }

  const removeListItem = (
    setter: Dispatch<SetStateAction<string[]>>,
    index: number
  ) => {
    setter((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    resetMessages()
    let createdVersionId = ""
    let uploadedImagePath: string | null = null
    let createdVehicleId: string | null = null
    const currentUserId = session?.user?.id ?? null

    try {
      if (!currentUserId) {
        throw new Error("Sessão inválida. Faça login novamente.")
      }

      if (!year || !engine || !transmission || !versionName) {
        throw new Error("Preencha todos os campos da versão.")
      }
      if (!bodyStyle.trim()) {
        throw new Error("Informe a carroceria da versão.")
      }
      if (!fuelTypes.length) {
        throw new Error("Selecione ao menos um combustível para a versão.")
      }

      const selectedFuelLabel = fuelTypes.length
        ? fuelTypes.map((fuel) => fuel.charAt(0).toUpperCase() + fuel.slice(1)).join(", ")
        : "não informado"
      const confirmation = window.confirm(
        `Confirmar criação?\n\nModelo: ${name || "não informado"}\nVersão: ${versionName || "não informada"}\nAno: ${year || "não informado"}\nCombustível: ${selectedFuelLabel}`
      )

      if (!confirmation) {
        return
      }

      setLoading(true)

      const chronicList = sanitizeList(chronicDefects)
      const pontualList = sanitizeList(pontualDefects)
      const positivesList = sanitizeList(positivePoints)
      const incomingVersionName = normalizeVersionName(versionName)
      const incomingTransmissionType = detectTransmissionType(transmission)
      const incomingBodyStyleType = detectBodyStyleType(bodyStyle)
      const potenciaSingle = parseOptionalNumber(powerSingleCv)
      const potenciaAlcool = isFlexFuel ? parseOptionalNumber(powerAlcoholCv) : null
      const potenciaGasolina = isFlexFuel ? parseOptionalNumber(powerGasolineCv) : null
      const potenciaCv = potenciaSingle ?? potenciaAlcool ?? potenciaGasolina ?? null
      const potenciaRpm = parseOptionalNumber(powerRpm)
      const torqueSingle = parseOptionalNumber(torqueSingleKgfm)
      const torqueAlcool = isFlexFuel ? parseOptionalNumber(torqueAlcoholKgfm) : null
      const torqueGasolina = isFlexFuel ? parseOptionalNumber(torqueGasolineKgfm) : null
      const torque = torqueSingle ?? torqueAlcool ?? torqueGasolina ?? null
      const torqueRefRpm = parseOptionalNumber(torqueRpm)
      const consumoSingleUrbano = parseOptionalNumber(consumptionSingleCity)
      const consumoSingleEstrada = parseOptionalNumber(consumptionSingleHighway)
      const consumoGasolinaUrbano = isFlexFuel ? parseOptionalNumber(consumptionGasCity) : null
      const consumoGasolinaEstrada = isFlexFuel ? parseOptionalNumber(consumptionGasHighway) : null
      const consumoEtanolUrbano = isFlexFuel ? parseOptionalNumber(consumptionAlcoholCity) : null
      const consumoEtanolEstrada = isFlexFuel ? parseOptionalNumber(consumptionAlcoholHighway) : null
      const capacidadeTanqueL = parseOptionalNumber(tankCapacityL)
      const autonomiaGasolinaUrbanoKm = parseOptionalNumber(rangeGasCityKm)
      const autonomiaGasolinaEstradaKm = parseOptionalNumber(rangeGasHighwayKm)
      const autonomiaEtanolUrbanoKm = parseOptionalNumber(rangeAlcoholCityKm)
      const autonomiaEtanolEstradaKm = parseOptionalNumber(rangeAlcoholHighwayKm)
      const airbags = parseOptionalNumber(airbagsCount)
      const controleEstabilidade = parseOptionalBoolean(stabilityControl)
      const assistentesSeguranca = safetyAssistants.trim() || null
      const vidroEletricoDianteiro = parseOptionalBoolean(frontPowerWindows)
      const vidroEletricoTraseiro = parseOptionalBoolean(rearPowerWindows)
      const arCondicionadoTipo = acType.trim() || null
      const portaMalasL = parseOptionalNumber(trunkCapacityL)
      const entreEixosMm = parseOptionalNumber(wheelbaseMm)
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
      const latinNcapAte2021 = latinNcapPre2021.trim() || null
      const latinNcapPos2021 = latinNcapPost2021.trim() || null

      if (mode === "model") {
        if (!brandId || !name) {
          throw new Error("Selecione marca e informe o nome do modelo.")
        }
        if (!image) {
          throw new Error("A imagem do modelo é obrigatória.")
        }

        const brand = brands.find((b) => b.id === brandId)
        if (!brand) throw new Error("Marca inválida.")

        const imagePath = await uploadImageIfNeeded()
        uploadedImagePath = imagePath

        const modelSlug = generateModelSlug(brand.name, name)

        let { data: vehicle, error: vehicleError } = await supabase
          .from("vehicles")
          .insert({
            brand_id: brandId,
            created_by: currentUserId,
            name,
            slug: modelSlug,
            image_url: imagePath,
          })
          .select("id")
          .single()

        if (vehicleError && /column|schema cache/i.test(vehicleError.message ?? "")) {
          const fallbackVehicle = await supabase
            .from("vehicles")
            .insert({
              brand_id: brandId,
              name,
              slug: modelSlug,
              image_url: imagePath,
            })
            .select("id")
            .single()

          vehicle = fallbackVehicle.data
          vehicleError = fallbackVehicle.error
        }

        if (vehicleError || !vehicle) {
          const duplicateModel =
            vehicleError?.code === "23505" ||
            /vehicles_slug_key|duplicate key/i.test(vehicleError?.message ?? "")

          if (duplicateModel) {
            throw new Error(
              "Esse modelo já existe. Troque para 'Apenas nova versão' e selecione o modelo existente."
            )
          }

          throw new Error(
            `Não foi possível criar o modelo. ${
              vehicleError?.message ?? "Verifique duplicidade."
            }`
          )
        }
        createdVehicleId = vehicle.id

        const { data: possibleDuplicates } = await supabase
          .from("vehicle_versions")
          .select("version_name,year,transmission,body_style")
          .eq("vehicle_id", vehicle.id)
          .eq("year", Number(year))

        const duplicated = ((possibleDuplicates as {
          version_name: string | null
          year: number | null
          transmission: string | null
          body_style?: string | null
        }[] | null) ?? []).some((row) => {
          const existingVersionName = normalizeVersionName(row.version_name ?? "")
          const existingTransmissionType = detectTransmissionType(row.transmission ?? "")
          const existingBodyStyleType = detectBodyStyleType(row.body_style ?? "")
          return (
            existingVersionName === incomingVersionName &&
            existingTransmissionType === incomingTransmissionType &&
            existingBodyStyleType === incomingBodyStyleType
          )
        })

        if (duplicated) {
          throw new Error(
            "Já existe uma versão com este nome, ano, transmissão e carroceria para esse modelo."
          )
        }

        const versionSlug = generateVersionSlug(
          brand.name,
          name,
          versionName,
          year,
          transmission,
          bodyStyle
        )

        let { data: createdVersion, error: versionError } = await supabase
          .from("vehicle_versions")
          .insert({
            vehicle_id: vehicle.id,
            created_by: currentUserId,
            image_url: imagePath,
            year: Number(year),
            engine,
            transmission,
            body_style: bodyStyle,
            fuel_types: fuelTypes,
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
            consumo_urbano_kml: consumoSingleUrbano,
            consumo_estrada_kml: consumoSingleEstrada,
            consumo_gasolina_urbano_kml: consumoGasolinaUrbano,
            consumo_gasolina_estrada_kml: consumoGasolinaEstrada,
            consumo_etanol_urbano_kml: consumoEtanolUrbano,
            consumo_etanol_estrada_kml: consumoEtanolEstrada,
            capacidade_tanque_l: capacidadeTanqueL,
            autonomia_gasolina_urbano_km: autonomiaGasolinaUrbanoKm,
            autonomia_gasolina_estrada_km: autonomiaGasolinaEstradaKm,
            autonomia_etanol_urbano_km: autonomiaEtanolUrbanoKm,
            autonomia_etanol_estrada_km: autonomiaEtanolEstradaKm,
            airbags: airbags,
            controle_estabilidade: controleEstabilidade,
            assistentes_seguranca: assistentesSeguranca,
            vidro_eletrico_dianteiro: vidroEletricoDianteiro,
            vidro_eletrico_traseiro: vidroEletricoTraseiro,
            ar_condicionado_tipo: arCondicionadoTipo,
            porta_malas_l: portaMalasL,
            entre_eixos_mm: entreEixosMm,
            peso_kg: pesoKg,
            peso_potencia_alcool_kgcv: pesoPotenciaAlcool,
            peso_potencia_gasolina_kgcv: pesoPotenciaGasolina,
            peso_potencia_kgcv: pesoPotencia,
            aceleracao_texto: aceleracaoTexto,
            aceleracao_0_100_s: aceleracao,
            velocidade_maxima_kmh: velocidadeMaxima,
            latin_ncap_pre_2021: latinNcapAte2021,
            latin_ncap_post_2021: latinNcapPos2021,
            version_name: versionName,
            version_tier: versionTier,
            slug: versionSlug,
          })
          .select("id")
          .single()

        if (versionError && /column|schema cache/i.test(versionError.message ?? "")) {
          const fallback = await supabase
            .from("vehicle_versions")
            .insert({
              vehicle_id: vehicle.id,
              created_by: currentUserId,
              image_url: imagePath,
              year: Number(year),
              engine,
              transmission,
              body_style: bodyStyle,
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
              peso_kg: pesoKg,
              peso_potencia_alcool_kgcv: pesoPotenciaAlcool,
              peso_potencia_gasolina_kgcv: pesoPotenciaGasolina,
              peso_potencia_kgcv: pesoPotencia,
              aceleracao_0_100_s: aceleracao,
              velocidade_maxima_kmh: velocidadeMaxima,
              version_name: versionName,
              version_tier: versionTier,
              slug: versionSlug,
            })
            .select("id")
            .single()

          createdVersion = fallback.data
          versionError = fallback.error
        }

        if (versionError || !createdVersion) {
          const duplicateVersion =
              versionError?.code === "23505" ||
            /duplicate key|uq_vehicle_versions_vehicle_version_year_ci|uq_vehicle_versions_vehicle_version_year_transmission_ci|uq_vehicle_versions_vehicle_version_year_transmission_body_style_ci|uq_vehicle_versions_vehicle_version_year_transmission_type_body_style_type_ci/i.test(
              versionError?.message ?? ""
            )
          if (duplicateVersion) {
            throw new Error(
              "Já existe uma versão com este nome, ano, transmissão e carroceria para esse modelo."
            )
          }
          throw new Error(
            `Modelo criado, mas falhou ao criar a versão. ${
              versionError?.message ?? "Verifique duplicidade e campos obrigatórios."
            }`
          )
        }

        createdVersionId = createdVersion.id
        setSuccessMessage("Modelo e versão criados com sucesso.")
      } else {
        if (!vehicleId || !selectedVehicle) {
          throw new Error("Selecione um modelo existente.")
        }

        const { data: possibleDuplicates } = await supabase
          .from("vehicle_versions")
          .select("version_name,year,transmission,body_style")
          .eq("vehicle_id", vehicleId)
          .eq("year", Number(year))

        const duplicated = ((possibleDuplicates as {
          version_name: string | null
          year: number | null
          transmission: string | null
          body_style?: string | null
        }[] | null) ?? []).some((row) => {
          const existingVersionName = normalizeVersionName(row.version_name ?? "")
          const existingTransmissionType = detectTransmissionType(row.transmission ?? "")
          const existingBodyStyleType = detectBodyStyleType(row.body_style ?? "")
          return (
            existingVersionName === incomingVersionName &&
            existingTransmissionType === incomingTransmissionType &&
            existingBodyStyleType === incomingBodyStyleType
          )
        })

        if (duplicated) {
          throw new Error(
            "Já existe uma versão com este nome, ano, transmissão e carroceria para esse modelo."
          )
        }

        const versionSlug = generateVersionSlug(
          selectedVehicle.brandName,
          selectedVehicle.name,
          versionName,
          year,
          transmission,
          bodyStyle
        )

        const versionImagePath = await uploadImageIfNeeded()
        uploadedImagePath = versionImagePath

        let { data: createdVersion, error: versionError } = await supabase
          .from("vehicle_versions")
          .insert({
            vehicle_id: vehicleId,
            created_by: currentUserId,
            year: Number(year),
            engine,
            transmission,
            body_style: bodyStyle,
            fuel_types: fuelTypes,
            image_url: versionImagePath,
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
            consumo_urbano_kml: consumoSingleUrbano,
            consumo_estrada_kml: consumoSingleEstrada,
            consumo_gasolina_urbano_kml: consumoGasolinaUrbano,
            consumo_gasolina_estrada_kml: consumoGasolinaEstrada,
            consumo_etanol_urbano_kml: consumoEtanolUrbano,
            consumo_etanol_estrada_kml: consumoEtanolEstrada,
            capacidade_tanque_l: capacidadeTanqueL,
            autonomia_gasolina_urbano_km: autonomiaGasolinaUrbanoKm,
            autonomia_gasolina_estrada_km: autonomiaGasolinaEstradaKm,
            autonomia_etanol_urbano_km: autonomiaEtanolUrbanoKm,
            autonomia_etanol_estrada_km: autonomiaEtanolEstradaKm,
            airbags: airbags,
            controle_estabilidade: controleEstabilidade,
            assistentes_seguranca: assistentesSeguranca,
            vidro_eletrico_dianteiro: vidroEletricoDianteiro,
            vidro_eletrico_traseiro: vidroEletricoTraseiro,
            ar_condicionado_tipo: arCondicionadoTipo,
            porta_malas_l: portaMalasL,
            entre_eixos_mm: entreEixosMm,
            peso_kg: pesoKg,
            peso_potencia_alcool_kgcv: pesoPotenciaAlcool,
            peso_potencia_gasolina_kgcv: pesoPotenciaGasolina,
            peso_potencia_kgcv: pesoPotencia,
            aceleracao_texto: aceleracaoTexto,
            aceleracao_0_100_s: aceleracao,
            velocidade_maxima_kmh: velocidadeMaxima,
            latin_ncap_pre_2021: latinNcapAte2021,
            latin_ncap_post_2021: latinNcapPos2021,
            version_name: versionName,
            version_tier: versionTier,
            slug: versionSlug,
          })
          .select("id")
          .single()

        if (versionError && /column|schema cache/i.test(versionError.message ?? "")) {
          const fallback = await supabase
            .from("vehicle_versions")
            .insert({
              vehicle_id: vehicleId,
              created_by: currentUserId,
              year: Number(year),
              engine,
              transmission,
              body_style: bodyStyle,
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
              peso_kg: pesoKg,
              peso_potencia_alcool_kgcv: pesoPotenciaAlcool,
              peso_potencia_gasolina_kgcv: pesoPotenciaGasolina,
              peso_potencia_kgcv: pesoPotencia,
              aceleracao_0_100_s: aceleracao,
              velocidade_maxima_kmh: velocidadeMaxima,
              version_name: versionName,
              version_tier: versionTier,
              slug: versionSlug,
            })
            .select("id")
            .single()

          createdVersion = fallback.data
          versionError = fallback.error
        }

        if (versionError || !createdVersion) {
          const duplicateVersion =
              versionError?.code === "23505" ||
            /duplicate key|uq_vehicle_versions_vehicle_version_year_ci|uq_vehicle_versions_vehicle_version_year_transmission_ci|uq_vehicle_versions_vehicle_version_year_transmission_body_style_ci|uq_vehicle_versions_vehicle_version_year_transmission_type_body_style_type_ci/i.test(
              versionError?.message ?? ""
            )
          if (duplicateVersion) {
            throw new Error(
              "Já existe uma versão com este nome, ano, transmissão e carroceria para esse modelo."
            )
          }
          throw new Error(
            `Não foi possível criar a versão. ${
              versionError?.message ?? "Verifique duplicidade."
            }`
          )
        }

        createdVersionId = createdVersion.id
        setSuccessMessage("Versão criada com sucesso.")
      }

      if (createdVersionId && (chronicList.length || pontualList.length)) {
        const defectsPayload = [
          ...chronicList.map((title) => ({
            vehicle_version_id: createdVersionId,
            title,
            severity: 2,
            created_by: currentUserId,
          })),
          ...pontualList.map((title) => ({
            vehicle_version_id: createdVersionId,
            title,
            severity: 1,
            created_by: currentUserId,
          })),
        ]

        const { error: defectsError } = await supabase
          .from("defects")
          .insert(defectsPayload)

        if (defectsError) {
          throw new Error(`Versão salva, mas falhou ao salvar os defeitos: ${defectsError.message}`)
        }
      }

      if (createdVersionId && positivesList.length) {
        const positivesPayload = positivesList.map((description) => ({
          vehicle_version_id: createdVersionId,
          description,
          created_by: currentUserId,
        }))

        const { error: positivesError } = await supabase
          .from("positives")
          .insert(positivesPayload)

        if (positivesError) {
          throw new Error(`Versão salva, mas falhou ao salvar os pontos positivos: ${positivesError.message}`)
        }
      }

      setTimeout(() => router.push("/carros"), 700)
    } catch (err: unknown) {
      // Reverte tudo que foi criado nesta submissão para não deixar dados incompletos.
      const rollbackIssues: string[] = []
      if (createdVersionId) {
        const { error } = await supabase
          .from("vehicle_versions")
          .delete()
          .eq("id", createdVersionId)
        if (error) rollbackIssues.push(`Falha ao reverter versão: ${error.message}`)
      }

      if (createdVehicleId) {
        const { error } = await supabase.from("vehicles").delete().eq("id", createdVehicleId)
        if (error) rollbackIssues.push(`Falha ao reverter modelo: ${error.message}`)
      }

      if (uploadedImagePath) {
        const { error } = await supabase.storage.from("vehicle-images").remove([uploadedImagePath])
        if (error) rollbackIssues.push(`Falha ao reverter imagem: ${error.message}`)
      }

      setErrorMessage(
        err instanceof Error
          ? `Falha ao salvar. Detalhe: ${err.message}${
              rollbackIssues.length ? ` | Rollback: ${rollbackIssues.join(" | ")}` : ""
            }`
          : "Falha ao salvar. Erro inesperado."
      )
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || plan === null) return null

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-10 pt-28 pb-10">
      <div className="mb-8 flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight">Cadastro de Veículos</h1>
        <Link
          href="/carros/rascunhos"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Ver rascunhos
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm p-6 shadow-sm transition-all duration-300">
        <div className="flex gap-6">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "model"}
              onChange={() => setMode("model")}
              className="cursor-pointer"
            />
            Novo modelo + versão
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "version"}
              onChange={() => setMode("version")}
              className="cursor-pointer"
            />
            Apenas nova versão
          </label>
        </div>

        {mode === "model" ? (
          <>
            <div ref={brandDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setBrandDropdownOpen((prev) => !prev)}
                className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50 text-left flex items-center justify-between gap-3"
              >
                <span className="inline-flex items-center gap-2 text-sm text-gray-800">
                  {selectedBrand ? (
                    <BrandLogo
                      src={toBrandLogoSrc(selectedBrand)}
                      brandName={selectedBrand.name}
                      className="h-7 w-7 shrink-0"
                    />
                  ) : null}
                  {selectedBrand?.name ?? "Selecione a marca"}
                </span>
                <span className="text-xs text-gray-500">{brandDropdownOpen ? "▲" : "▼"}</span>
              </button>

              {brandDropdownOpen ? (
                <div className="absolute z-30 mt-2 w-full rounded-lg border border-gray-200 bg-white shadow-lg p-2">
                  <input
                    type="text"
                    value={brandSearch}
                    onChange={(e) => setBrandSearch(e.target.value)}
                    placeholder="Digite ao menos 3 letras..."
                    className="w-full border border-gray-300 p-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
                  />
                  <div className="mt-2 max-h-56 overflow-y-auto">
                    {!hasMinimumBrandSearch ? (
                      <p className="px-2 py-2 text-sm text-gray-500">
                        Digite 3 ou mais caracteres para buscar.
                      </p>
                    ) : searchingBrands ? (
                      <p className="px-2 py-2 text-sm text-gray-500">Buscando marcas...</p>
                    ) : filteredBrands.map((brand) => (
                      <button
                        key={brand.id}
                        type="button"
                        onClick={() => {
                          setBrandId(brand.id)
                          setSelectedBrandMeta(brand)
                          setBrandDropdownOpen(false)
                        }}
                        className={`w-full px-2 py-2 rounded-md text-left text-sm flex items-center gap-2 hover:bg-gray-100 transition-colors ${
                          brand.id === brandId ? "bg-gray-100" : ""
                        }`}
                      >
                        <BrandLogo
                          src={toBrandLogoSrc(brand)}
                          brandName={brand.name}
                          className="h-7 w-7 shrink-0"
                        />
                        <span>{brand.name}</span>
                      </button>
                    ))}
                    {hasMinimumBrandSearch && !searchingBrands && !filteredBrands.length ? (
                      <p className="px-2 py-2 text-sm text-gray-500">Nenhuma marca encontrada.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <input
              type="text"
              placeholder="Modelo (ex: Polo)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
              required
            />

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
                <div className="border rounded-lg p-3 w-fit bg-white shadow-sm transition-all duration-300">
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
                    disabled={removingImage}
                    className="mt-3 text-sm text-red-600 hover:text-red-700 transition-colors duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {removingImage ? (
                      <span className="animate-pulse">Removendo...</span>
                    ) : (
                      "Remover imagem"
                    )}
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
            required
          >
            <option value="">Selecione o modelo</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.brandName} {vehicle.name}
              </option>
            ))}
          </select>
        )}

        {mode === "version" ? (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Imagem da versão (opcional)
            </label>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(e.target.files?.[0] ?? null)}
              className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50 cursor-pointer"
            />

            {imagePreview ? (
              <div className="border rounded-lg p-3 w-fit bg-white shadow-sm transition-all duration-300">
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
                  disabled={removingImage}
                  className="mt-3 text-sm text-red-600 hover:text-red-700 transition-colors duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {removingImage ? <span className="animate-pulse">Removendo...</span> : "Remover imagem"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <input
          type="text"
          placeholder="Nome da versão (ex: Highline, GTS, Track)"
          value={versionName}
          onChange={(e) => setVersionName(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        />

        <select
          value={bodyStyle}
          onChange={(e) => setBodyStyle(e.target.value as BodyStyleOption)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        >
          {BODY_STYLE_OPTIONS.map((style) => (
            <option key={style} value={style}>
              {style}
            </option>
          ))}
        </select>

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

        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Combustível da versão</p>
          <div className="flex flex-wrap gap-3">
            {FUEL_OPTIONS.map((fuel) => (
              <label key={fuel} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={fuelTypes.includes(fuel)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFuelTypes((prev) => Array.from(new Set([...prev, fuel])))
                    } else {
                      setFuelTypes((prev) => prev.filter((item) => item !== fuel))
                    }
                  }}
                  className="cursor-pointer"
                />
                <span className="capitalize">{fuel}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Se selecionar gasolina e etanol, os campos serão separados por combustível.
          </p>
        </div>

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

        {isFlexFuel ? (
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
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Potência (cv)"
              value={powerSingleCv}
              onChange={(e) => setPowerSingleCv(e.target.value)}
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
        )}

        <input
          type="text"
          placeholder="Torque (texto completo) - ex: 16,8 kgfm (E/G) a 4.000 rpm"
          value={torqueText}
          onChange={(e) => setTorqueText(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        {isFlexFuel ? (
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
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Torque (kgfm)"
              value={torqueSingleKgfm}
              onChange={(e) => setTorqueSingleKgfm(e.target.value)}
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
        )}

        <h4 className="text-base font-semibold text-gray-900 mt-1">
          Consumo (km/l)
        </h4>
        {isFlexFuel ? (
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
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Consumo urbano (km/l)"
              value={consumptionSingleCity}
              onChange={(e) => setConsumptionSingleCity(e.target.value)}
              className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
            />
            <input
              type="text"
              placeholder="Consumo estrada (km/l)"
              value={consumptionSingleHighway}
              onChange={(e) => setConsumptionSingleHighway(e.target.value)}
              className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
            />
          </div>
        )}

        <h4 className="text-base font-semibold text-gray-900 mt-1">
          Autonomia e abastecimento
        </h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Capacidade do tanque (L) - ex: 47"
            value={tankCapacityL}
            onChange={(e) => setTankCapacityL(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Autonomia gasolina urbano (km)"
            value={rangeGasCityKm}
            onChange={(e) => setRangeGasCityKm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Autonomia gasolina estrada (km)"
            value={rangeGasHighwayKm}
            onChange={(e) => setRangeGasHighwayKm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Autonomia etanol urbano (km)"
            value={rangeAlcoholCityKm}
            onChange={(e) => setRangeAlcoholCityKm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Autonomia etanol estrada (km)"
            value={rangeAlcoholHighwayKm}
            onChange={(e) => setRangeAlcoholHighwayKm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
        </div>

        <h4 className="text-base font-semibold text-gray-900 mt-1">Segurança</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Quantidade de airbags - ex: 6"
            value={airbagsCount}
            onChange={(e) => setAirbagsCount(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <select
            value={stabilityControl}
            onChange={(e) => setStabilityControl(e.target.value as "" | "sim" | "nao")}
            className="w-full border border-gray-300 p-3 rounded-lg bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          >
            <option value="">Controle de estabilidade: não informado</option>
            <option value="sim">Controle de estabilidade: sim</option>
            <option value="nao">Controle de estabilidade: não</option>
          </select>
        </div>
        <textarea
          placeholder="Assistentes de segurança (frenagem autônoma, ACC, alerta de faixa...)"
          value={safetyAssistants}
          onChange={(e) => setSafetyAssistants(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <h4 className="text-base font-semibold text-gray-900 mt-1">Conforto e uso diário</h4>
        <div className="grid sm:grid-cols-2 gap-3">
          <select
            value={frontPowerWindows}
            onChange={(e) => setFrontPowerWindows(e.target.value as "" | "sim" | "nao")}
            className="w-full border border-gray-300 p-3 rounded-lg bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          >
            <option value="">Vidro elétrico dianteiro: não informado</option>
            <option value="sim">Vidro elétrico dianteiro: sim</option>
            <option value="nao">Vidro elétrico dianteiro: não</option>
          </select>
          <select
            value={rearPowerWindows}
            onChange={(e) => setRearPowerWindows(e.target.value as "" | "sim" | "nao")}
            className="w-full border border-gray-300 p-3 rounded-lg bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          >
            <option value="">Vidro elétrico traseiro: não informado</option>
            <option value="sim">Vidro elétrico traseiro: sim</option>
            <option value="nao">Vidro elétrico traseiro: não</option>
          </select>
          <input
            type="text"
            placeholder="Ar-condicionado (manual, digital, dual zone...)"
            value={acType}
            onChange={(e) => setAcType(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Porta-malas (L) - ex: 521"
            value={trunkCapacityL}
            onChange={(e) => setTrunkCapacityL(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Entre-eixos (mm) - ex: 2600"
            value={wheelbaseMm}
            onChange={(e) => setWheelbaseMm(e.target.value)}
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
            Defeitos crônicos
          </label>
          {chronicDefects.map((item, index) => (
            <div key={`chronic-${index}`} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateListItem(setChronicDefects, index, e.target.value)}
                placeholder="Ex: Consumo elevado em uso urbano"
                className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
              />
              <button
                type="button"
                onClick={() => removeListItem(setChronicDefects, index)}
                className="px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
              >
                -
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addListItem(setChronicDefects)}
            className="text-sm text-gray-700 hover:text-black transition-colors duration-200 cursor-pointer"
          >
            + Adicionar defeito crônico
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Defeitos pontuais
          </label>
          {pontualDefects.map((item, index) => (
            <div key={`pontual-${index}`} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateListItem(setPontualDefects, index, e.target.value)}
                placeholder="Ex: Ruido interno em piso irregular"
                className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
              />
              <button
                type="button"
                onClick={() => removeListItem(setPontualDefects, index)}
                className="px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
              >
                -
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addListItem(setPontualDefects)}
            className="text-sm text-gray-700 hover:text-black transition-colors duration-200 cursor-pointer"
          >
            + Adicionar defeito pontual
          </button>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Pontos positivos
          </label>
          {positivePoints.map((item, index) => (
            <div key={`positive-${index}`} className="flex gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => updateListItem(setPositivePoints, index, e.target.value)}
                placeholder="Ex: Bom consumo na estrada"
                className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
              />
              <button
                type="button"
                onClick={() => removeListItem(setPositivePoints, index)}
                className="px-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
              >
                -
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => addListItem(setPositivePoints)}
            className="text-sm text-gray-700 hover:text-black transition-colors duration-200 cursor-pointer"
          >
            + Adicionar ponto positivo
          </button>
        </div>

        {loadingDraft ? <p className="text-sm text-gray-600">Carregando rascunho...</p> : null}
        {errorMessage ? <p className="text-red-600">{errorMessage}</p> : null}
        {successMessage ? <p className="text-green-700">{successMessage}</p> : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={savingDraft || loading}
            className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 hover:bg-gray-50 transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {savingDraft ? "Salvando rascunho..." : "Salvar como rascunho"}
          </button>
          <button
            type="submit"
            disabled={loading || savingDraft}
            className="bg-black text-white px-6 py-3 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 cursor-pointer disabled:opacity-60 disabled:transform-none disabled:cursor-not-allowed"
          >
            {loading ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  )
}


