import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Modelos | Base Automotiva",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
