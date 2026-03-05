export default function Footer() {
  return (
    <footer className="border-t border-gray-100 mt-24">
      <div className="max-w-7xl mx-auto px-8 py-12 text-sm text-gray-600">
        © {new Date().getFullYear()} Base Automotiva — Todos os direitos reservados.
      </div>
    </footer>
  )
}