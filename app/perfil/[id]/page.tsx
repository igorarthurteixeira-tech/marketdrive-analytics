import ProfilePageContent from "@/components/ProfilePageContent"

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ProfilePageContent forcedProfileId={id} />
}
