"use client"

import Image from "next/image"
import Link from "next/link"
import { SquarePen, Star } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

type ProfilePageContentProps = {
  forcedProfileId?: string
  editMode?: boolean
}

type ProfileData = {
  id: string
  name: string | null
  username: string | null
  avatar_url: string | null
  banner_url: string | null
  bio: string | null
  city: string | null
  state: string | null
  plan: string | null
  created_at: string | null
  profession: string | null
  interests: string[]
  profile_level: string | null
  focus: string | null
  favorite_brands: string[]
  reference_vehicles: string[]
  is_consultant_verified: boolean
  is_founder: boolean
  launch_bonus_expires_at: string | null
}

type ProfileRowExtended = {
  id: string
  name: string | null
  username?: string | null
  avatar_url?: string | null
  banner_url?: string | null
  bio?: string | null
  city?: string | null
  state?: string | null
  plan?: string | null
  created_at?: string | null
  profession?: string | null
  interests?: string[] | null
  profile_level?: string | null
  focus?: string | null
  favorite_brands?: string[] | null
  reference_vehicles?: string[] | null
  is_consultant_verified?: boolean | null
  is_founder?: boolean | null
  launch_bonus_expires_at?: string | null
}

type ProfileRowFallback = {
  id: string
  name: string | null
  username?: string | null
  avatar_url?: string | null
  banner_url?: string | null
  bio?: string | null
  city?: string | null
  state?: string | null
  plan?: string | null
  created_at?: string | null
}

type UserRatingRow = {
  rater_user_id: string
  rating: number
}

type CreatedEntityRow = {
  id: string
}

type ConfirmationVoteRow = {
  is_confirmed: boolean
}

const profileMemoryCache = new Map<string, ProfileData>()

function isProfileRow(value: unknown): value is ProfileRowExtended | ProfileRowFallback {
  if (!value || typeof value !== "object") return false
  const candidate = value as { id?: unknown; name?: unknown }
  return typeof candidate.id === "string" && ("name" in candidate)
}

const BANNER_PATTERNS = [
  "bg-gradient-to-r from-slate-900 via-slate-700 to-slate-600",
  "bg-gradient-to-r from-zinc-900 via-zinc-700 to-stone-500",
  "bg-gradient-to-r from-neutral-900 via-neutral-700 to-neutral-500",
  "bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500",
  "bg-gradient-to-r from-slate-800 via-gray-700 to-slate-500",
]

function hashToIndex(value: string, size: number) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash) % size
}

function parseCsvToList(text: string) {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function listToCsv(list: string[]) {
  return list.join(", ")
}

function getProfileDraftKey(userId: string) {
  return `profile-edit-draft:${userId}`
}

const POSTS_STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/posts-media/"
const VEHICLE_STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

type UserVehicleRow = {
  id: string
  slug: string
  year: number | null
  version_name: string | null
  image_url?: string | null
  vehicles:
    | {
        name: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }[]
    | {
        name: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }
    | null
}

type UserPostRow = {
  id: string
  type: "noticia" | "publicacao"
  title: string | null
  description: string
  media_path: string | null
  media_kind: "image" | "video" | null
  created_at: string
}

type VehicleStats = {
  comments: number
  confirmed: number
  denied: number
}

export default function ProfilePageContent({ forcedProfileId, editMode = false }: ProfilePageContentProps) {
  const { session, loading: authLoading } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [successMessage, setSuccessMessage] = useState("")

  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [avgRating, setAvgRating] = useState(0)
  const [ratingCount, setRatingCount] = useState(0)
  const [myRating, setMyRating] = useState(0)
  const [savingRating, setSavingRating] = useState(false)
  const [confirmationRate, setConfirmationRate] = useState<number | null>(null)
  const [confirmationVotes, setConfirmationVotes] = useState(0)
  const [activeTab, setActiveTab] = useState<"vehicles" | "posts">("vehicles")
  const [registeredVehicles, setRegisteredVehicles] = useState<UserVehicleRow[]>([])
  const [vehicleStatsByVersion, setVehicleStatsByVersion] = useState<Record<string, VehicleStats>>({})
  const [userPosts, setUserPosts] = useState<UserPostRow[]>([])
  const [loadingContributions, setLoadingContributions] = useState(true)
  const [postsTableAvailable, setPostsTableAvailable] = useState(true)
  const [followTableAvailable, setFollowTableAvailable] = useState(true)
  const [followersCount, setFollowersCount] = useState(0)
  const [followingCount, setFollowingCount] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  const profileId = forcedProfileId ?? session?.user?.id ?? null
  const isOwnProfile = Boolean(session?.user?.id && profileId === session.user.id)
  const canManageOwnProfile = isOwnProfile && !forcedProfileId

  const [nameInput, setNameInput] = useState("")
  const [usernameInput, setUsernameInput] = useState("")
  const [bioInput, setBioInput] = useState("")
  const [cityInput, setCityInput] = useState("")
  const [stateInput, setStateInput] = useState("")
  const [professionInput, setProfessionInput] = useState("")
  const [interestsInput, setInterestsInput] = useState("")
  const [profileLevelInput, setProfileLevelInput] = useState("")
  const [focusInput, setFocusInput] = useState("")
  const [favoriteBrandsInput, setFavoriteBrandsInput] = useState("")
  const [referenceVehiclesInput, setReferenceVehiclesInput] = useState("")
  const draftLoadedRef = useRef(false)
  const draftReadyToPersistRef = useRef(false)

  const hydrateInputsFromProfile = useCallback((data: ProfileData) => {
    setNameInput(data.name ?? "")
    setUsernameInput(data.username ?? "")
    setBioInput(data.bio ?? "")
    setCityInput(data.city ?? "")
    setStateInput(data.state ?? "")
    setProfessionInput(data.profession ?? "")
    setInterestsInput(listToCsv(data.interests))
    setProfileLevelInput(data.profile_level ?? "")
    setFocusInput(data.focus ?? "")
    setFavoriteBrandsInput(listToCsv(data.favorite_brands))
    setReferenceVehiclesInput(listToCsv(data.reference_vehicles))
    draftReadyToPersistRef.current = true
  }, [])

  const hydrateInputsFromDraft = useCallback((draft: Record<string, unknown>) => {
    setNameInput(typeof draft.nameInput === "string" ? draft.nameInput : "")
    setUsernameInput(typeof draft.usernameInput === "string" ? draft.usernameInput : "")
    setBioInput(typeof draft.bioInput === "string" ? draft.bioInput : "")
    setCityInput(typeof draft.cityInput === "string" ? draft.cityInput : "")
    setStateInput(typeof draft.stateInput === "string" ? draft.stateInput : "")
    setProfessionInput(typeof draft.professionInput === "string" ? draft.professionInput : "")
    setInterestsInput(typeof draft.interestsInput === "string" ? draft.interestsInput : "")
    setProfileLevelInput(typeof draft.profileLevelInput === "string" ? draft.profileLevelInput : "")
    setFocusInput(typeof draft.focusInput === "string" ? draft.focusInput : "")
    setFavoriteBrandsInput(typeof draft.favoriteBrandsInput === "string" ? draft.favoriteBrandsInput : "")
    setReferenceVehiclesInput(
      typeof draft.referenceVehiclesInput === "string" ? draft.referenceVehiclesInput : ""
    )
    draftReadyToPersistRef.current = true
  }, [])

  useEffect(() => {
    const fetchProfile = async () => {
      if (authLoading) return
      if (!profileId) {
        setLoading(false)
        return
      }

      const cachedProfile = profileMemoryCache.get(profileId)
      if (cachedProfile) {
        setProfile(cachedProfile)
        if (!editMode || !isOwnProfile || !session?.user?.id || draftLoadedRef.current) {
          hydrateInputsFromProfile(cachedProfile)
        } else {
          const rawDraft = window.sessionStorage.getItem(getProfileDraftKey(session.user.id))
          if (!rawDraft) {
            hydrateInputsFromProfile(cachedProfile)
            draftLoadedRef.current = true
          } else {
            try {
              const parsed = JSON.parse(rawDraft) as Record<string, unknown>
              hydrateInputsFromDraft(parsed)
              draftLoadedRef.current = true
            } catch {
              hydrateInputsFromProfile(cachedProfile)
              draftLoadedRef.current = true
            }
          }
        }
        setLoading(false)
      } else {
        setLoading(true)
      }
      setErrorMessage("")

      const selectAttempts = [
        `
          id,
          name,
          username,
          avatar_url,
          banner_url,
          bio,
          city,
          state,
          plan,
          created_at,
          profession,
          interests,
          profile_level,
          focus,
          favorite_brands,
          reference_vehicles,
          is_consultant_verified,
          is_founder,
          launch_bonus_expires_at
        `,
        `
          id,
          name,
          username,
          avatar_url,
          banner_url,
          bio,
          city,
          state,
          plan,
          created_at
        `,
        "id,name,avatar_url,banner_url,bio,plan,created_at",
        "id,name,plan,created_at",
        "id,name",
      ]

      let row: ProfileRowExtended | ProfileRowFallback | null = null
      let noRowFound = false

      for (const selectQuery of selectAttempts) {
        const res = await supabase
          .from("profiles")
          .select(selectQuery)
          .eq("id", profileId)
          .single()

        if (!res.error && isProfileRow(res.data)) {
          row = res.data
          break
        }

        if (/PGRST116|no rows|multiple \(or no\) rows/i.test(res.error?.message ?? "")) {
          noRowFound = true
          break
        }

        if (/column|schema cache/i.test(res.error?.message ?? "")) {
          continue
        }

        break
      }

      if (!row && noRowFound && isOwnProfile && session?.user?.id) {
        const metadata = session.user.user_metadata as Record<string, unknown> | undefined
        const fallbackName =
          typeof metadata?.name === "string" && metadata.name.trim()
            ? metadata.name.trim()
            : (session.user.email?.split("@")[0] ?? "Usuario")
        const fallbackUsername =
          typeof metadata?.username === "string" && metadata.username.trim()
            ? metadata.username.trim()
            : null

        const createWithUsername = await supabase.from("profiles").upsert(
          {
            id: session.user.id,
            name: fallbackName,
            username: fallbackUsername,
          },
          { onConflict: "id" }
        )

        if (createWithUsername.error && /column|schema cache/i.test(createWithUsername.error.message ?? "")) {
          await supabase.from("profiles").upsert(
            {
              id: session.user.id,
              name: fallbackName,
            },
            { onConflict: "id" }
          )
        }

        for (const selectQuery of ["id,name,username,avatar_url,banner_url,bio,city,state,plan,created_at", "id,name,plan,created_at", "id,name"]) {
          const retry = await supabase
            .from("profiles")
            .select(selectQuery)
            .eq("id", profileId)
            .single()
          if (!retry.error && isProfileRow(retry.data)) {
            row = retry.data
            break
          }
          if (!/column|schema cache/i.test(retry.error?.message ?? "")) {
            break
          }
        }
      }

      if (!row) {
        setErrorMessage("Não foi possível carregar o perfil.")
        setProfile(null)
        setLoading(false)
        return
      }

      const previousCached = profileMemoryCache.get(profileId)

      const normalized: ProfileData = {
        id: row.id,
        name: row.name ?? null,
        username: "username" in row ? (row.username ?? null) : (previousCached?.username ?? null),
        avatar_url: "avatar_url" in row ? (row.avatar_url ?? null) : (previousCached?.avatar_url ?? null),
        banner_url: "banner_url" in row ? (row.banner_url ?? null) : (previousCached?.banner_url ?? null),
        bio: "bio" in row ? (row.bio ?? null) : (previousCached?.bio ?? null),
        city: "city" in row ? (row.city ?? null) : (previousCached?.city ?? null),
        state: "state" in row ? (row.state ?? null) : (previousCached?.state ?? null),
        plan: "plan" in row ? (row.plan ?? null) : (previousCached?.plan ?? null),
        created_at: "created_at" in row ? (row.created_at ?? null) : (previousCached?.created_at ?? null),
        profession: "profession" in row ? (row.profession ?? null) : (previousCached?.profession ?? null),
        interests:
          "interests" in row && Array.isArray(row.interests)
            ? row.interests.filter(Boolean)
            : (previousCached?.interests ?? []),
        profile_level: "profile_level" in row ? (row.profile_level ?? null) : (previousCached?.profile_level ?? null),
        focus: "focus" in row ? (row.focus ?? null) : (previousCached?.focus ?? null),
        favorite_brands:
          "favorite_brands" in row && Array.isArray(row.favorite_brands)
            ? row.favorite_brands.filter(Boolean)
            : (previousCached?.favorite_brands ?? []),
        reference_vehicles:
          "reference_vehicles" in row && Array.isArray(row.reference_vehicles)
            ? row.reference_vehicles.filter(Boolean)
            : (previousCached?.reference_vehicles ?? []),
        is_consultant_verified:
          "is_consultant_verified" in row
            ? row.is_consultant_verified === true
            : (previousCached?.is_consultant_verified ?? false),
        is_founder:
          "is_founder" in row ? row.is_founder === true : (previousCached?.is_founder ?? false),
        launch_bonus_expires_at:
          "launch_bonus_expires_at" in row
            ? (row.launch_bonus_expires_at ?? null)
            : (previousCached?.launch_bonus_expires_at ?? null),
      }

      profileMemoryCache.set(profileId, normalized)
      setProfile(normalized)
      if (!editMode || !isOwnProfile || !session?.user?.id || draftLoadedRef.current) {
        hydrateInputsFromProfile(normalized)
      } else {
        const rawDraft = window.sessionStorage.getItem(getProfileDraftKey(session.user.id))
        if (!rawDraft) {
          hydrateInputsFromProfile(normalized)
          draftLoadedRef.current = true
        } else {
          try {
            const parsed = JSON.parse(rawDraft) as Record<string, unknown>
            hydrateInputsFromDraft(parsed)
            draftLoadedRef.current = true
          } catch {
            hydrateInputsFromProfile(normalized)
            draftLoadedRef.current = true
          }
        }
      }

      const ratingsRes = await supabase
        .from("user_profile_ratings")
        .select("rater_user_id,rating")
        .eq("rated_user_id", profileId)

      const ratingRows: UserRatingRow[] =
        ratingsRes.error && /relation|table|schema cache|does not exist/i.test(ratingsRes.error.message ?? "")
          ? []
          : ((ratingsRes.data as UserRatingRow[] | null) ?? [])

      if (ratingRows.length > 0) {
        const total = ratingRows.reduce((acc, rowItem) => acc + rowItem.rating, 0)
        setRatingCount(ratingRows.length)
        setAvgRating(Number((total / ratingRows.length).toFixed(1)))
      } else {
        setRatingCount(0)
        setAvgRating(0)
      }

      if (session?.user?.id) {
        const mine = ratingRows.find((rowItem) => rowItem.rater_user_id === session.user.id)
        setMyRating(mine?.rating ?? 0)
      } else {
        setMyRating(0)
      }

      const [positivesRes, defectsRes, commentsRes] = await Promise.all([
        supabase.from("positives").select("id").eq("created_by", profileId),
        supabase.from("defects").select("id").eq("created_by", profileId),
        supabase.from("vehicle_comments").select("id").eq("created_by", profileId),
      ])

      const positiveIds = ((positivesRes.data as CreatedEntityRow[] | null) ?? []).map((rowItem) => rowItem.id)
      const defectIds = ((defectsRes.data as CreatedEntityRow[] | null) ?? []).map((rowItem) => rowItem.id)
      const commentIds = ((commentsRes.data as CreatedEntityRow[] | null) ?? []).map((rowItem) => rowItem.id)

      let confirmedTotal = 0
      let deniedTotal = 0

      if (positiveIds.length > 0) {
        const positiveVotesRes = await supabase
          .from("positive_votes")
          .select("is_confirmed")
          .in("positive_id", positiveIds)

        if (!positiveVotesRes.error) {
          for (const vote of (positiveVotesRes.data as ConfirmationVoteRow[] | null) ?? []) {
            if (vote.is_confirmed) confirmedTotal += 1
            else deniedTotal += 1
          }
        }
      }

      if (defectIds.length > 0) {
        const defectVotesRes = await supabase
          .from("defect_votes")
          .select("is_confirmed")
          .in("defect_id", defectIds)

        if (!defectVotesRes.error) {
          for (const vote of (defectVotesRes.data as ConfirmationVoteRow[] | null) ?? []) {
            if (vote.is_confirmed) confirmedTotal += 1
            else deniedTotal += 1
          }
        }
      }

      if (commentIds.length > 0) {
        const commentVotesRes = await supabase
          .from("vehicle_comment_votes")
          .select("is_confirmed")
          .in("comment_id", commentIds)

        if (!commentVotesRes.error) {
          for (const vote of (commentVotesRes.data as ConfirmationVoteRow[] | null) ?? []) {
            if (vote.is_confirmed) confirmedTotal += 1
            else deniedTotal += 1
          }
        }
      }

      const totalVotes = confirmedTotal + deniedTotal
      setConfirmationVotes(totalVotes)
      setConfirmationRate(
        totalVotes > 0 ? Number(((confirmedTotal * 100) / totalVotes).toFixed(1)) : null
      )

      setLoading(false)
    }

    fetchProfile()
  }, [
    authLoading,
    editMode,
    hydrateInputsFromDraft,
    hydrateInputsFromProfile,
    isOwnProfile,
    profileId,
    session?.user?.email,
    session?.user?.id,
    session?.user?.user_metadata,
  ])

  useEffect(() => {
    if (!editMode || !isOwnProfile || !session?.user?.id) return
    if (!draftLoadedRef.current || !draftReadyToPersistRef.current) return

    const payload = {
      nameInput,
      usernameInput,
      bioInput,
      cityInput,
      stateInput,
      professionInput,
      interestsInput,
      profileLevelInput,
      focusInput,
      favoriteBrandsInput,
      referenceVehiclesInput,
    }

    window.sessionStorage.setItem(getProfileDraftKey(session.user.id), JSON.stringify(payload))
  }, [
    editMode,
    isOwnProfile,
    session?.user?.id,
    nameInput,
    usernameInput,
    bioInput,
    cityInput,
    stateInput,
    professionInput,
    interestsInput,
    profileLevelInput,
    focusInput,
    favoriteBrandsInput,
    referenceVehiclesInput,
  ])

  const dynamicBannerClass = useMemo(() => {
    const key = profile?.id ?? profile?.name ?? "marketdrive"
    return BANNER_PATTERNS[hashToIndex(key, BANNER_PATTERNS.length)]
  }, [profile?.id, profile?.name])

  const createdAtLabel = (() => {
    if (!profile?.created_at) return null
    const date = new Date(profile.created_at)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleDateString("pt-BR")
  })()

  const displayName = profile?.name ?? "Usuario"
  const avatarFallback = (profile?.name ?? session?.user?.email ?? "U").charAt(0).toUpperCase()

  const locationLabel = [profile?.city, profile?.state].filter(Boolean).join(" - ")

  const toPostMediaSrc = (mediaPath: string | null) => {
    if (!mediaPath) return null
    if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) return mediaPath
    return `${POSTS_STORAGE_URL}${mediaPath}`
  }

  const toVehicleLabel = (vehicleVersion: UserVehicleRow) => {
    const vehicle = Array.isArray(vehicleVersion.vehicles)
      ? vehicleVersion.vehicles[0]
      : vehicleVersion.vehicles
    const brandData = Array.isArray(vehicle?.brands)
      ? vehicle.brands[0]
      : vehicle?.brands
    const brand = brandData?.name ?? ""
    const model = vehicle?.name ?? ""
    const versionName = vehicleVersion.version_name ?? ""
    const year = vehicleVersion.year ?? ""
    return [brand, model, versionName, year].filter(Boolean).join(" ")
  }

  const toVehicleImageSrc = (imagePath?: string | null) => {
    if (!imagePath) return null
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath
    return `${VEHICLE_STORAGE_URL}${imagePath}`
  }

  useEffect(() => {
    const fetchContributions = async () => {
      if (!profileId) return
      setLoadingContributions(true)

      const vehiclesRes = await supabase
        .from("vehicle_versions")
        .select("id,slug,year,version_name,image_url,vehicles(name,brands(name))")
        .eq("created_by", profileId)
        .order("created_at", { ascending: false })

      let resolvedVehicles: UserVehicleRow[] = []

      if (
        vehiclesRes.error &&
        /column|schema cache|does not exist/i.test(vehiclesRes.error.message ?? "")
      ) {
        const fallbackVehiclesRes = await supabase
          .from("vehicle_versions")
          .select("id,slug,year,version_name,image_url,vehicles(name,brands(name))")
          .eq("created_by", profileId)
          .order("year", { ascending: false })
        resolvedVehicles = (fallbackVehiclesRes.data as UserVehicleRow[] | null) ?? []
        setRegisteredVehicles(resolvedVehicles)
      } else {
        resolvedVehicles = (vehiclesRes.data as UserVehicleRow[] | null) ?? []
        setRegisteredVehicles(resolvedVehicles)
      }

      const vehicleVersionIds = resolvedVehicles.map((item) => item.id)

      if (vehicleVersionIds.length > 0) {
        const [commentsRes, positivesRes, defectsRes] = await Promise.all([
          supabase
            .from("vehicle_comments")
            .select("id,vehicle_version_id")
            .in("vehicle_version_id", vehicleVersionIds),
          supabase
            .from("positives")
            .select("id,vehicle_version_id")
            .in("vehicle_version_id", vehicleVersionIds),
          supabase
            .from("defects")
            .select("id,vehicle_version_id")
            .in("vehicle_version_id", vehicleVersionIds),
        ])

        const comments =
          (commentsRes.data as { id: string; vehicle_version_id: string }[] | null) ?? []
        const positives =
          (positivesRes.data as { id: string; vehicle_version_id: string }[] | null) ?? []
        const defects =
          (defectsRes.data as { id: string; vehicle_version_id: string }[] | null) ?? []

        const commentIds = comments.map((item) => item.id)
        const positiveIds = positives.map((item) => item.id)
        const defectIds = defects.map((item) => item.id)

        const [commentVotesRes, positiveVotesRes, defectVotesRes] = await Promise.all([
          commentIds.length > 0
            ? supabase
                .from("vehicle_comment_votes")
                .select("comment_id,is_confirmed")
                .in("comment_id", commentIds)
            : Promise.resolve({ data: [] }),
          positiveIds.length > 0
            ? supabase
                .from("positive_votes")
                .select("positive_id,is_confirmed")
                .in("positive_id", positiveIds)
            : Promise.resolve({ data: [] }),
          defectIds.length > 0
            ? supabase
                .from("defect_votes")
                .select("defect_id,is_confirmed")
                .in("defect_id", defectIds)
            : Promise.resolve({ data: [] }),
        ])

        const statsMap: Record<string, VehicleStats> = {}
        for (const id of vehicleVersionIds) {
          statsMap[id] = { comments: 0, confirmed: 0, denied: 0 }
        }

        const commentToVersion: Record<string, string> = {}
        for (const item of comments) {
          commentToVersion[item.id] = item.vehicle_version_id
          if (!statsMap[item.vehicle_version_id]) {
            statsMap[item.vehicle_version_id] = { comments: 0, confirmed: 0, denied: 0 }
          }
          statsMap[item.vehicle_version_id].comments += 1
        }

        const positiveToVersion: Record<string, string> = {}
        for (const item of positives) {
          positiveToVersion[item.id] = item.vehicle_version_id
          if (!statsMap[item.vehicle_version_id]) {
            statsMap[item.vehicle_version_id] = { comments: 0, confirmed: 0, denied: 0 }
          }
        }

        const defectToVersion: Record<string, string> = {}
        for (const item of defects) {
          defectToVersion[item.id] = item.vehicle_version_id
          if (!statsMap[item.vehicle_version_id]) {
            statsMap[item.vehicle_version_id] = { comments: 0, confirmed: 0, denied: 0 }
          }
        }

        for (const vote of
          (commentVotesRes.data as { comment_id: string; is_confirmed: boolean }[] | null) ?? []) {
          const versionId = commentToVersion[vote.comment_id]
          if (!versionId) continue
          if (vote.is_confirmed) statsMap[versionId].confirmed += 1
          else statsMap[versionId].denied += 1
        }

        for (const vote of
          (positiveVotesRes.data as { positive_id: string; is_confirmed: boolean }[] | null) ?? []) {
          const versionId = positiveToVersion[vote.positive_id]
          if (!versionId) continue
          if (vote.is_confirmed) statsMap[versionId].confirmed += 1
          else statsMap[versionId].denied += 1
        }

        for (const vote of
          (defectVotesRes.data as { defect_id: string; is_confirmed: boolean }[] | null) ?? []) {
          const versionId = defectToVersion[vote.defect_id]
          if (!versionId) continue
          if (vote.is_confirmed) statsMap[versionId].confirmed += 1
          else statsMap[versionId].denied += 1
        }

        setVehicleStatsByVersion(statsMap)
      } else {
        setVehicleStatsByVersion({})
      }

      const postsRes = await supabase
        .from("user_posts")
        .select("id,type,title,description,media_path,media_kind,created_at")
        .eq("author_user_id", profileId)
        .order("created_at", { ascending: false })

      if (
        postsRes.error &&
        /relation|table|schema cache|does not exist/i.test(postsRes.error.message ?? "")
      ) {
        setPostsTableAvailable(false)
        setUserPosts([])
      } else {
        setPostsTableAvailable(true)
        setUserPosts((postsRes.data as UserPostRow[] | null) ?? [])
      }

      setLoadingContributions(false)
    }

    void fetchContributions()
  }, [profileId])

  useEffect(() => {
    const fetchFollowState = async () => {
      if (!profileId) {
        setFollowersCount(0)
        setFollowingCount(0)
        setIsFollowing(false)
        return
      }

      const currentUserId = session?.user?.id ?? null

      const [followersRes, followingRes, myFollowRes] = await Promise.all([
        supabase
          .from("user_follows")
          .select("follower_id", { head: true, count: "exact" })
          .eq("following_id", profileId),
        supabase
          .from("user_follows")
          .select("following_id", { head: true, count: "exact" })
          .eq("follower_id", profileId),
        currentUserId && !isOwnProfile
          ? supabase
              .from("user_follows")
              .select("following_id")
              .eq("follower_id", currentUserId)
              .eq("following_id", profileId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

      const hasMissingTableError = [followersRes.error, followingRes.error, myFollowRes.error].some((error) =>
        /relation|table|schema cache|does not exist/i.test(error?.message ?? "")
      )

      if (hasMissingTableError) {
        setFollowTableAvailable(false)
        setFollowersCount(0)
        setFollowingCount(0)
        setIsFollowing(false)
        return
      }

      setFollowTableAvailable(true)
      setFollowersCount(followersRes.count ?? 0)
      setFollowingCount(followingRes.count ?? 0)
      setIsFollowing(Boolean(myFollowRes.data))
    }

    void fetchFollowState()
  }, [isOwnProfile, profileId, session?.user?.id])

  const handleToggleFollow = async () => {
    if (!session?.user?.id) {
      setErrorMessage("Voce precisa entrar para seguir perfis.")
      return
    }
    if (!profileId || isOwnProfile || !followTableAvailable || followLoading) return

    setFollowLoading(true)
    setErrorMessage("")

    const result = isFollowing
      ? await supabase
          .from("user_follows")
          .delete()
          .eq("follower_id", session.user.id)
          .eq("following_id", profileId)
      : await supabase.from("user_follows").insert({
          follower_id: session.user.id,
          following_id: profileId,
        })

    if (result.error) {
      setErrorMessage(`Nao foi possivel atualizar seguidores: ${result.error.message}`)
      setFollowLoading(false)
      return
    }

    setIsFollowing((prev) => !prev)
    setFollowersCount((prev) => Math.max(0, prev + (isFollowing ? -1 : 1)))
    setFollowLoading(false)
  }

  const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isOwnProfile || !session?.user?.id) return

    setSaving(true)
    setSuccessMessage("")
    setErrorMessage("")

    const payload = {
      name: nameInput.trim() || null,
      username: usernameInput.trim() || null,
      bio: bioInput.trim() || null,
      city: cityInput.trim() || null,
      state: stateInput.trim() || null,
      profession: professionInput.trim() || null,
      interests: parseCsvToList(interestsInput),
      profile_level: profileLevelInput.trim() || null,
      focus: focusInput.trim() || null,
      favorite_brands: parseCsvToList(favoriteBrandsInput),
      reference_vehicles: parseCsvToList(referenceVehiclesInput),
    }

    const updateAttempts: Array<Record<string, unknown>> = [
      payload,
      {
        name: payload.name,
        username: payload.username,
        bio: payload.bio,
        city: payload.city,
        state: payload.state,
      },
      {
        name: payload.name,
        bio: payload.bio,
      },
      {
        name: payload.name,
      },
    ]

    let saveOk = false
    let lastErrorMessage = "Não foi possível salvar o perfil."

    for (const candidate of updateAttempts) {
      const res = await supabase
        .from("profiles")
        .update(candidate)
        .eq("id", session.user.id)

      if (!res.error) {
        saveOk = true
        break
      }

      const message = res.error.message ?? ""
      lastErrorMessage = message || lastErrorMessage

      if (/column|schema cache/i.test(message)) {
        continue
      }

      break
    }

    if (!saveOk) {
      setErrorMessage(lastErrorMessage || "Não foi possível salvar o perfil.")
      setSaving(false)
      return
    }

    setProfile((prev) => {
      if (!prev) return prev
      const updatedProfile: ProfileData = {
        ...prev,
        name: payload.name,
        username: payload.username,
        bio: payload.bio,
        city: payload.city,
        state: payload.state,
        profession: payload.profession,
        interests: payload.interests,
        profile_level: payload.profile_level,
        focus: payload.focus,
        favorite_brands: payload.favorite_brands,
        reference_vehicles: payload.reference_vehicles,
      }
      profileMemoryCache.set(updatedProfile.id, updatedProfile)
      return updatedProfile
    })

    setSuccessMessage("Perfil atualizado com sucesso.")
    if (session?.user?.id) {
      window.sessionStorage.removeItem(getProfileDraftKey(session.user.id))
      draftLoadedRef.current = false
      draftReadyToPersistRef.current = false
    }
    setSaving(false)
  }

  const handleRateUser = async (value: number) => {
    if (!session?.user?.id || !profileId || isOwnProfile || savingRating) return

    setSavingRating(true)
    setErrorMessage("")

    const upsert = await supabase.from("user_profile_ratings").upsert(
      {
        rated_user_id: profileId,
        rater_user_id: session.user.id,
        rating: value,
      },
      { onConflict: "rated_user_id,rater_user_id" }
    )

    if (upsert.error) {
      setErrorMessage(
        /relation|table|schema cache|does not exist/i.test(upsert.error.message ?? "")
          ? "Avaliacao de usuario ainda nao foi criada no banco."
          : upsert.error.message
      )
      setSavingRating(false)
      return
    }

    const ratingsRes = await supabase
      .from("user_profile_ratings")
      .select("rater_user_id,rating")
      .eq("rated_user_id", profileId)

    const rows = (ratingsRes.data as UserRatingRow[] | null) ?? []
    const sum = rows.reduce((acc, row) => acc + row.rating, 0)

    setMyRating(value)
    setRatingCount(rows.length)
    setAvgRating(rows.length > 0 ? Number((sum / rows.length).toFixed(1)) : 0)
    setSavingRating(false)
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen max-w-5xl mx-auto px-8 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center text-gray-600">
          Carregando perfil...
        </div>
      </div>
    )
  }

  if (!profileId) {
    return (
      <div className="min-h-screen max-w-5xl mx-auto px-8 pt-28 pb-16">
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-gray-700">Você precisa entrar para ver seu perfil.</p>
          <Link href="/login" className="mt-4 inline-block text-sm text-black underline underline-offset-4">
            Ir para login
          </Link>
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen max-w-5xl mx-auto px-8 pt-28 pb-16">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-red-700">
          {errorMessage || "Perfil nao encontrado."}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen max-w-5xl mx-auto px-6 md:px-8 pt-24 pb-16">
      <section className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-sm">
        <div className="relative">
          {profile.banner_url ? (
            <div className="relative h-44 md:h-52">
              <Image src={profile.banner_url} alt="Banner do perfil" fill className="object-cover" />
            </div>
          ) : (
            <div className={`h-44 md:h-52 ${dynamicBannerClass}`} />
          )}

          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 h-36 w-36 md:h-40 md:w-40 rounded-full border-4 border-white bg-gray-100 shadow-lg overflow-hidden flex items-center justify-center">
            {profile.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt="Foto de perfil"
                width={160}
                height={160}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-5xl font-semibold text-gray-500">{avatarFallback}</span>
            )}
          </div>
        </div>

        <div className="pt-24 px-6 md:px-8 pb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">{displayName}</h1>
          <p className="mt-2 text-sm text-gray-500">
            {profile.username ? `@${profile.username}` : "@sem-username"}
          </p>
          {locationLabel ? <p className="mt-1 text-sm text-gray-600">{locationLabel}</p> : null}

          <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
            {profile.plan ? (
              <span className="rounded-full border border-gray-300 px-3 py-1 text-gray-700">
                Plano: {profile.plan}
              </span>
            ) : null}
            {createdAtLabel ? (
              <span className="rounded-full border border-gray-300 px-3 py-1 text-gray-700">
                Membro desde: {createdAtLabel}
              </span>
            ) : null}
            {profile.profile_level ? (
              <span className="rounded-full border border-gray-300 px-3 py-1 text-gray-700">
                Nivel: {profile.profile_level}
              </span>
            ) : null}
            {profile.is_consultant_verified ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-emerald-700">
                Consultor verificado
              </span>
            ) : null}
            {profile.is_founder ? (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-amber-700">
                Fundador
              </span>
            ) : null}
            {profile.launch_bonus_expires_at ? (
              <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-blue-700">
                Bônus até {new Date(profile.launch_bonus_expires_at).toLocaleDateString("pt-BR")}
              </span>
            ) : null}
            <span className="rounded-full border border-gray-300 px-3 py-1 text-gray-700">
              Seguidores: {followersCount}
            </span>
            <span className="rounded-full border border-gray-300 px-3 py-1 text-gray-700">
              Seguindo: {followingCount}
            </span>
          </div>

          {canManageOwnProfile ? (
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {editMode ? (
                <Link
                  href="/perfil"
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 transition"
                >
                  Voltar ao perfil
                </Link>
              ) : (
                <Link
                  href="/perfil/editar"
                  className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 transition"
                >
                  Editar perfil
                </Link>
              )}
              <Link
                href="/assinatura"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Gerenciar plano
              </Link>
              <Link
                href="/postagens/nova"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                <SquarePen size={15} />
                Nova postagem
              </Link>
              <Link
                href="/perfil/denuncias"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Minhas denúncias
              </Link>
            </div>
          ) : null}

          {!canManageOwnProfile && session?.user?.id && followTableAvailable ? (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void handleToggleFollow()}
                disabled={followLoading}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60 ${
                  isFollowing
                    ? "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    : "bg-black text-white hover:bg-gray-900"
                }`}
              >
                {followLoading ? "Atualizando..." : isFollowing ? "Seguindo" : "Seguir"}
              </button>
            </div>
          ) : null}

          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs uppercase tracking-[0.08em] text-gray-500">Avaliacao do perfil</p>
            <div className="mt-2 flex items-center justify-center gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star
                  key={index}
                  size={20}
                  className={index < Math.floor(avgRating) ? "fill-black text-black" : "text-gray-300"}
                />
              ))}
              <span className="ml-2 text-sm text-gray-700">
                {ratingCount > 0 ? `${avgRating.toFixed(1)} (${ratingCount})` : "Sem avaliações"}
              </span>
            </div>

            <p className="mt-2 text-xs text-gray-600">
              Taxa de confirmacao:{" "}
              {confirmationRate !== null
                ? `${confirmationRate.toFixed(1)}% (${confirmationVotes} votos)`
                : "Sem votos suficientes"}
            </p>

            {!isOwnProfile && session?.user?.id ? (
              <div className="mt-3">
                <p className="text-xs text-gray-600">Sua avaliação</p>
                <div className="mt-1 flex items-center justify-center gap-1">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const value = index + 1
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => void handleRateUser(value)}
                        disabled={savingRating}
                        className="p-1"
                        aria-label={`Avaliar com ${value} estrela${value > 1 ? "s" : ""}`}
                      >
                        <Star
                          size={18}
                          className={value <= myRating ? "fill-black text-black" : "text-gray-300"}
                        />
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Informacoes do perfil</h2>
          {profile.bio ? <p className="text-sm text-gray-700">{profile.bio}</p> : null}
          {profile.profession ? (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Profissao no setor:</span> {profile.profession}
            </p>
          ) : null}
          {profile.focus ? (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Foco:</span> {profile.focus}
            </p>
          ) : null}
          {profile.interests.length > 0 ? (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Interesses:</span> {profile.interests.join(", ")}
            </p>
          ) : null}
          {profile.favorite_brands.length > 0 ? (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Marcas favoritas:</span> {profile.favorite_brands.join(", ")}
            </p>
          ) : null}
          {profile.reference_vehicles.length > 0 ? (
            <p className="text-sm text-gray-700">
              <span className="font-medium">Veiculos de referencia:</span> {profile.reference_vehicles.join(", ")}
            </p>
          ) : null}
        </div>

        {canManageOwnProfile && editMode ? (
          <form onSubmit={handleSaveProfile} className="space-y-4 mt-6 border-t border-gray-200 pt-6">
            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="text"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Nome"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
              />
              <input
                type="text"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="Username"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
              />
              <input
                type="text"
                value={cityInput}
                onChange={(event) => setCityInput(event.target.value)}
                placeholder="Cidade"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
              />
              <input
                type="text"
                value={stateInput}
                onChange={(event) => setStateInput(event.target.value)}
                placeholder="Estado"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
              />
              <input
                type="text"
                value={professionInput}
                onChange={(event) => setProfessionInput(event.target.value)}
                placeholder="Profissao no setor"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
              />
              <input
                type="text"
                value={profileLevelInput}
                onChange={(event) => setProfileLevelInput(event.target.value)}
                placeholder="Nivel do perfil"
                className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
              />
              <input
                type="text"
                value={focusInput}
                onChange={(event) => setFocusInput(event.target.value)}
                placeholder="Foco"
                className="md:col-span-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
              />
            </div>

            <textarea
              value={bioInput}
              onChange={(event) => setBioInput(event.target.value)}
              placeholder="Biografia"
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
            />

            <textarea
              value={interestsInput}
              onChange={(event) => setInterestsInput(event.target.value)}
              placeholder="Interesses (separados por virgula)"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
            />

            <textarea
              value={favoriteBrandsInput}
              onChange={(event) => setFavoriteBrandsInput(event.target.value)}
              placeholder="Marcas favoritas (separadas por virgula)"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
            />

            <textarea
              value={referenceVehiclesInput}
              onChange={(event) => setReferenceVehiclesInput(event.target.value)}
              placeholder="Veiculos de referencia (separados por virgula)"
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15"
            />

            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
            {successMessage ? <p className="text-sm text-green-700">{successMessage}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-5 py-3 text-sm font-medium text-white hover:bg-gray-900 transition disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar perfil"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
          <button
            type="button"
            onClick={() => setActiveTab("vehicles")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "vehicles"
                ? "bg-black text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Veiculos/Versoes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("posts")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              activeTab === "posts"
                ? "bg-black text-white"
                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            Postagens
          </button>
        </div>

        {loadingContributions ? (
          <p className="mt-4 text-sm text-gray-600">Carregando conteudo...</p>
        ) : null}

        {!loadingContributions && activeTab === "vehicles" ? (
          <div className="mt-4 space-y-3">
            {!registeredVehicles.length ? (
              <p className="text-sm text-gray-600">Nenhum veiculo/versao registrado.</p>
            ) : null}

            {registeredVehicles.map((item) => (
              <article key={item.id} className="rounded-xl border border-gray-200 p-3">
                <div className="flex items-start gap-3">
                  {toVehicleImageSrc(item.image_url) ? (
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded border border-gray-200 bg-gray-100">
                      <Image
                        src={toVehicleImageSrc(item.image_url)!}
                        alt={toVehicleLabel(item)}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-16 w-24 shrink-0 rounded border border-gray-200 bg-gray-100" />
                  )}

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/carros/${item.slug}`}
                      className="text-sm font-medium text-gray-900 hover:underline"
                    >
                      {toVehicleLabel(item)}
                    </Link>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={`/carros/${item.slug}#comentarios`}
                        className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Comentários ({vehicleStatsByVersion[item.id]?.comments ?? 0})
                      </Link>
                      <Link
                        href={`/carros/${item.slug}#positivos`}
                        className="rounded-full border border-green-300 px-3 py-1 text-xs text-green-700 hover:bg-green-50"
                      >
                        Confirmações ({vehicleStatsByVersion[item.id]?.confirmed ?? 0})
                      </Link>
                      <Link
                        href={`/carros/${item.slug}#defeitos-pontuais`}
                        className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50"
                      >
                        Negações ({vehicleStatsByVersion[item.id]?.denied ?? 0})
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {!loadingContributions && activeTab === "posts" ? (
          <div className="mt-4 space-y-4">
            {canManageOwnProfile ? (
              <div className="flex justify-end">
                <Link
                  href="/postagens/nova"
                  className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 transition"
                >
                  <SquarePen size={15} />
                  Nova postagem
                </Link>
              </div>
            ) : null}

            {!postsTableAvailable ? (
              <p className="text-sm text-gray-600">
                Estrutura de postagens ainda nao foi criada no banco.
              </p>
            ) : null}

            {postsTableAvailable && !userPosts.length ? (
              <p className="text-sm text-gray-600">Nenhuma postagem publicada.</p>
            ) : null}

            {postsTableAvailable &&
              userPosts.map((post) => {
                const mediaSrc = toPostMediaSrc(post.media_path)
                return (
                  <article key={post.id} className="rounded-xl border border-gray-200 p-4">
                    <p className="text-xs uppercase tracking-[0.08em] text-gray-500">
                      {post.type === "noticia" ? "Noticia" : "Publicacao"} •{" "}
                      {new Date(post.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    {post.title ? (
                      <h3 className="mt-1 text-base font-semibold text-gray-900">{post.title}</h3>
                    ) : null}
                    <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">
                      {post.description}
                    </p>

                    {mediaSrc && post.media_kind === "image" ? (
                      <div className="relative mt-3 h-72 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                        <Image src={mediaSrc} alt="Midia da postagem" fill className="object-cover" />
                      </div>
                    ) : null}

                    {mediaSrc && post.media_kind === "video" ? (
                      <video
                        src={mediaSrc}
                        controls
                        className="mt-3 h-72 w-full rounded-lg border border-gray-200 bg-black object-cover"
                      />
                    ) : null}
                  </article>
                )
              })}
          </div>
        ) : null}
      </section>
    </div>
  )
}
