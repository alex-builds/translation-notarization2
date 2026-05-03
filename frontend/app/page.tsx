import Link from 'next/link'
import Header from '@/components/Header'

const features = [
  {
    icon: '📄',
    title: 'Upload Documents',
    description: 'Securely upload your documents in any format. We handle PDFs, Word docs, and more.',
  },
  {
    icon: '🌐',
    title: 'Professional Translation',
    description: 'Certified translators handle your documents with precision across 50+ language pairs.',
  },
  {
    icon: '✅',
    title: 'Notarization',
    description: 'Legally binding notarization of your translated documents, accepted worldwide.',
  },
  {
    icon: '📬',
    title: 'Fast Delivery',
    description: 'Track every step in real time and receive your documents digitally or by mail.',
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 bg-gradient-to-b from-blue-50 to-white">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight max-w-2xl">
          Document Translation &{' '}
          <span className="text-blue-600">Notarization</span>
        </h1>
        <p className="mt-4 text-lg text-gray-500 max-w-xl">
          Fast, certified, and legally binding. Upload your documents and let us handle
          the rest — from translation to notarization.
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/register"
            className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="bg-white text-blue-600 border border-blue-200 px-6 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-colors"
          >
            Login
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16 w-full">
        <h2 className="text-2xl font-bold text-center text-gray-900 mb-10">
          How it works
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-white rounded-xl border border-gray-200 p-6 text-center shadow-sm">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-gray-900 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-center text-xs text-gray-400 py-6 border-t border-gray-100">
        © {new Date().getFullYear()} DocTranslate. All rights reserved.
      </footer>
    </div>
  )
}
