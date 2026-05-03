'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import { isAuthenticated, getRole } from '@/lib/auth'
import api from '@/lib/api'

interface NotaryDocument {
  _id: string
  originalFile: string
  originalFileName: string | null
  fromLang: string
  toLang: string
  status: string
  createdAt: string
  userId?: { email: string }
}

export default function NotaryPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<NotaryDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signingId, setSigningId] = useState<string | null>(null)

  useEffect(() => {
    if (!isAuthenticated() || getRole() !== 'notary') {
      router.push('/login')
      return
    }
    fetchDocs()
  }, [router])

  async function fetchDocs() {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<NotaryDocument[]>('/notary/documents')
      setDocs(data)
    } catch {
      setError('Failed to load documents.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSign(docId: string) {
    setSigningId(docId)
    try {
      await api.post(`/notary/sign/${docId}`)
      await fetchDocs()
    } catch {
      setError('Failed to sign document.')
    } finally {
      setSigningId(null)
    }
  }

  const pending = docs.filter((d) => d.status === 'notarizing')
  const completed = docs.filter((d) => d.status === 'notarized')

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="max-w-4xl mx-auto w-full px-4 py-8">
        <div className="mb-6">
          <h1 data-testid="notary-heading" className="text-2xl font-bold text-gray-900">Notary Cabinet</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Review translated documents and apply your notarial signature
          </p>
        </div>

        {loading && (
          <div className="flex justify-center py-20 text-gray-400">Loading…</div>
        )}

        {error && (
          <div className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        {!loading && (
          <>
            <section data-testid="pending-section" className="mb-8">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                Pending Signature
                {pending.length > 0 && (
                  <span className="ml-2 text-sm font-normal bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                    {pending.length}
                  </span>
                )}
              </h2>
              {pending.length === 0 ? (
                <p className="text-gray-400 text-sm">No documents awaiting signature.</p>
              ) : (
                <div className="space-y-3">
                  {pending.map((doc) => (
                    <NotaryRow
                      key={doc._id}
                      doc={doc}
                      onSign={() => handleSign(doc._id)}
                      signing={signingId === doc._id}
                    />
                  ))}
                </div>
              )}
            </section>

            <section data-testid="completed-section">
              <h2 className="text-lg font-semibold text-gray-800 mb-3">Completed</h2>
              {completed.length === 0 ? (
                <p className="text-gray-400 text-sm">No completed documents yet.</p>
              ) : (
                <div className="space-y-3">
                  {completed.map((doc) => (
                    <NotaryRow key={doc._id} doc={doc} />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function NotaryRow({
  doc,
  onSign,
  signing,
}: {
  doc: NotaryDocument
  onSign?: () => void
  signing?: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium text-gray-900 truncate">
          {doc.originalFileName || doc.originalFile?.split('/').pop() || doc._id}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {doc.fromLang} → {doc.toLang}
          {doc.userId?.email && <span className="ml-2">· {doc.userId.email}</span>}
          {' · '}{new Date(doc.createdAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
          })}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs font-medium bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
          {doc.status}
        </span>
        {onSign && (
          <button
            onClick={onSign}
            disabled={signing}
            className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50"
          >
            {signing ? 'Signing…' : 'Sign & Notarize'}
          </button>
        )}
      </div>
    </div>
  )
}
