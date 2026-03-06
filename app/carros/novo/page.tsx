"use client"

import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react"

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

export default function NovoCarro() {
  const { session, loading: authLoading } = useAuth()
  const router = useRouter()

  const [plan, setPlan] = useState<string | null>(null)

  const [brands, setBrands] = useState<Brand[]>([])
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])

  const [mode, setMode] = useState<"model" | "version">("model")

  const [brandId, setBrandId] = useState("")
  const [name, setName] = useState("")
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const [vehicleId, setVehicleId] = useState("")

  const [versionName, setVersionName] = useState("")
  const [versionTier, setVersionTier] = useState<(typeof VERSION_TIERS)[number]>("intermediaria")
  const [year, setYear] = useState("")
  const [engine, setEngine] = useState("")
  const [transmission, setTransmission] = useState("")
  const [powerCv, setPowerCv] = useState("")
  const [powerText, setPowerText] = useState("")
  const [powerAlcoholCv, setPowerAlcoholCv] = useState("")
  const [powerGasolineCv, setPowerGasolineCv] = useState("")
  const [powerRpm, setPowerRpm] = useState("")
  const [torqueKgfm, setTorqueKgfm] = useState("")
  const [torqueText, setTorqueText] = useState("")
  const [torqueAlcoholKgfm, setTorqueAlcoholKgfm] = useState("")
  const [torqueGasolineKgfm, setTorqueGasolineKgfm] = useState("")
  const [torqueRpm, setTorqueRpm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [acceleration0100, setAcceleration0100] = useState("")
  const [maxSpeedKmh, setMaxSpeedKmh] = useState("")
  const [chronicDefects, setChronicDefects] = useState<string[]>([])
  const [pontualDefects, setPontualDefects] = useState<string[]>([])
  const [positivePoints, setPositivePoints] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
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
      const { data: brandsData } = await supabase
        .from("brands")
        .select("id,name")
        .order("name")

      const { data: vehiclesData } = await supabase
        .from("vehicles")
        .select(`
          id,
          name,
          brands ( name )
        `)
        .order("name")

      if (brandsData) setBrands(brandsData as Brand[])

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
    setLoading(true)

    try {
      if (!year || !engine || !transmission || !versionName) {
        throw new Error("Preencha todos os campos da versao.")
      }

      const chronicList = sanitizeList(chronicDefects)
      const pontualList = sanitizeList(pontualDefects)
      const positivesList = sanitizeList(positivePoints)
      const potenciaCv = parseOptionalNumber(powerCv)
      const potenciaAlcool = parseOptionalNumber(powerAlcoholCv)
      const potenciaGasolina = parseOptionalNumber(powerGasolineCv)
      const potenciaRpm = parseOptionalNumber(powerRpm)
      const torque = parseOptionalNumber(torqueKgfm)
      const torqueAlcool = parseOptionalNumber(torqueAlcoholKgfm)
      const torqueGasolina = parseOptionalNumber(torqueGasolineKgfm)
      const torqueRefRpm = parseOptionalNumber(torqueRpm)
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
        potenciaCv && pesoKg
          ? Number((pesoKg / potenciaCv).toFixed(2))
          : null
      const aceleracao = parseOptionalNumber(acceleration0100)
      const velocidadeMaxima = parseOptionalNumber(maxSpeedKmh)

      let createdVersionId = ""

      if (mode === "model") {
        if (!brandId || !name) {
          throw new Error("Selecione marca e informe o nome do modelo.")
        }

        const brand = brands.find((b) => b.id === brandId)
        if (!brand) throw new Error("Marca invalida.")

        const imagePath = await uploadImageIfNeeded()

        const modelSlug = generateModelSlug(brand.name, name)

        const { data: vehicle, error: vehicleError } = await supabase
          .from("vehicles")
          .insert({
            brand_id: brandId,
            name,
            slug: modelSlug,
            image_url: imagePath,
          })
          .select("id")
          .single()

        if (vehicleError || !vehicle) {
          throw new Error("Nao foi possivel criar o modelo. Verifique duplicidade.")
        }

        const versionSlug = generateVersionSlug(
          brand.name,
          name,
          versionName,
          year
        )

        const { data: createdVersion, error: versionError } = await supabase
          .from("vehicle_versions")
          .insert({
            vehicle_id: vehicle.id,
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

        if (versionError || !createdVersion) {
          throw new Error("Modelo criado, mas falhou ao criar a versao.")
        }

        createdVersionId = createdVersion.id
        setSuccessMessage("Modelo e versao criados com sucesso.")
      } else {
        if (!vehicleId || !selectedVehicle) {
          throw new Error("Selecione um modelo existente.")
        }

        const versionSlug = generateVersionSlug(
          selectedVehicle.brandName,
          selectedVehicle.name,
          versionName,
          year
        )

        const { data: createdVersion, error: versionError } = await supabase
          .from("vehicle_versions")
          .insert({
            vehicle_id: vehicleId,
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

        if (versionError || !createdVersion) {
          throw new Error("Nao foi possivel criar a versao. Verifique duplicidade.")
        }

        createdVersionId = createdVersion.id
        setSuccessMessage("Versao criada com sucesso.")
      }

      if (createdVersionId && (chronicList.length || pontualList.length)) {
        const defectsPayload = [
          ...chronicList.map((title) => ({
            vehicle_version_id: createdVersionId,
            title,
            severity: 2,
            created_by: session?.user?.id ?? null,
          })),
          ...pontualList.map((title) => ({
            vehicle_version_id: createdVersionId,
            title,
            severity: 1,
            created_by: session?.user?.id ?? null,
          })),
        ]

        const { error: defectsError } = await supabase
          .from("defects")
          .insert(defectsPayload)

        if (defectsError) {
          throw new Error(`Versao salva, mas falhou ao salvar os defeitos: ${defectsError.message}`)
        }
      }

      if (createdVersionId && positivesList.length) {
        const positivesPayload = positivesList.map((description) => ({
          vehicle_version_id: createdVersionId,
          description,
          created_by: session?.user?.id ?? null,
        }))

        const { error: positivesError } = await supabase
          .from("positives")
          .insert(positivesPayload)

        if (positivesError) {
          throw new Error(`Versao salva, mas falhou ao salvar os pontos positivos: ${positivesError.message}`)
        }
      }

      setTimeout(() => router.push("/carros"), 700)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Erro inesperado.")
    } finally {
      setLoading(false)
    }
  }

  if (authLoading || plan === null) return null

  return (
    <div className="min-h-screen max-w-3xl mx-auto p-10">
      <h1 className="text-3xl font-bold mb-8 tracking-tight">Cadastro de Veiculos</h1>

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
            Novo modelo + versao
          </label>

          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === "version"}
              onChange={() => setMode("version")}
              className="cursor-pointer"
            />
            Apenas nova versao
          </label>
        </div>

        {mode === "model" ? (
          <>
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
                  <p className="text-xs text-gray-500 mb-2">Previa</p>
                  <Image
                    src={imagePreview}
                    alt="Previa da imagem selecionada"
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

        <input
          type="text"
          placeholder="Nome da versao (ex: Highline, GTS, Track)"
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
          placeholder="Transmissao (ex: AT6)"
          value={transmission}
          onChange={(e) => setTransmission(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          required
        />

        <h3 className="text-lg font-semibold text-gray-900 mt-2">
          Especificacoes da versao (opcional)
        </h3>
        <p className="text-sm text-gray-500">
          Voce pode preencher em texto completo ou em campos separados por combustivel + rpm.
        </p>

        <input
          type="text"
          placeholder="Potencia de referencia (cv) - usada para calcular peso/potencia"
          value={powerCv}
          onChange={(e) => setPowerCv(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <input
          type="text"
          placeholder="Potencia (texto completo) - ex: 116 cv (E) / 109 cv (G) a 5.000 rpm"
          value={powerText}
          onChange={(e) => setPowerText(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <div className="grid sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Potencia E (cv)"
            value={powerAlcoholCv}
            onChange={(e) => setPowerAlcoholCv(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Potencia G (cv)"
            value={powerGasolineCv}
            onChange={(e) => setPowerGasolineCv(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
          <input
            type="text"
            placeholder="Potencia rpm"
            value={powerRpm}
            onChange={(e) => setPowerRpm(e.target.value)}
            className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
          />
        </div>

        <input
          type="text"
          placeholder="Torque de referencia (kgfm) - ex: 16.8"
          value={torqueKgfm}
          onChange={(e) => setTorqueKgfm(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

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

        <input
          type="text"
          placeholder="Peso (kg) - ex: 1168"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <input
          type="text"
          placeholder="Aceleracao 0-100 (s) - ex: 10.3"
          value={acceleration0100}
          onChange={(e) => setAcceleration0100(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <input
          type="text"
          placeholder="Velocidade maxima (km/h) - ex: 190"
          value={maxSpeedKmh}
          onChange={(e) => setMaxSpeedKmh(e.target.value)}
          className="w-full border border-gray-300 p-3 rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Defeitos cronicos
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
            + Adicionar defeito cronico
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

        {errorMessage ? <p className="text-red-600">{errorMessage}</p> : null}
        {successMessage ? <p className="text-green-700">{successMessage}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white px-6 py-3 rounded-lg shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 cursor-pointer disabled:opacity-60 disabled:transform-none disabled:cursor-not-allowed"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  )
}

