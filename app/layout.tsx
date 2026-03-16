import "./globals.css"
import Header from "@/components/Header"
import Footer from "@/components/Footer"
import AuthProvider from "@/components/AuthProvider"
import BackToTopButton from "@/components/BackToTopButton"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Base Automotiva",
  description: "Inteligência e Transparência no Mercado Automotivo",
  icons: {
    icon: [{ url: "/favicon.ico?v=20260316x" }],
    shortcut: [{ url: "/favicon.ico?v=20260316x" }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-white text-black">
        <AuthProvider>
          <Header />

          {/* Espaço fixo reservado para navbar */}
          <main className="pt-0">{children}</main>

          <Footer />
          <BackToTopButton />
        </AuthProvider>
      </body>
    </html>
  )
}
