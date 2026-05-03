'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/components/Header'
import DocumentCard, { Document } from '@/components/DocumentCard'
import Toast, { ToastMessage } from '@/components/Toast'
import { isAuthenticated } from '@/lib/auth'
import api from '@/lib/api'

interface QueueStats {
  waiting: number
  active: number
  avgProcessingMs: number | null
}

function QueueWidget() {
  const [stats, setStats] = useState<QueueStats | null>(null)

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data } = await api.get<QueueStats>('/queue/stats')
        setStats(data)
      } catch {
        // silently ignore — optional widget
      }
    }
    fetchStats()
    const id = setInterval(fetchStats, 10000)
    return () => clearInterval(id)
  }, [])

  if (!stats) return null

  const total = stats.waiting + stats.active
  const avgSec = stats.avgProcessingMs != null
    ? (stats.avgProcessingMs / 1000).toFixed(1)
    : null

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-100 dark:border-blue-900 text-xs text-blue-700 dark:text-blue-300">
      <span className="relative flex h-2 w-2">
        {stats.active > 0 && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${stats.active > 0 ? 'bg-blue-500' : 'bg-blue-300 dark:bg-blue-700'}`} />
      </span>
      <span>
        <span className="font-semibold">{total}</span> in queue
        {avgSec && <span className="ml-1 text-blue-500 dark:text-blue-400">· avg {avgSec}s</span>}
      </span>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm animate-pulse">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex-1">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/3" />
        </div>
        <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
      </div>
      <div className="flex items-center gap-1 mt-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-700" />
            {i < 5 && <div className="flex-1 h-0.5 mx-1 bg-gray-100 dark:bg-gray-800" />}
          </div>
        ))}
      </div>
      <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/4 mt-4" />
    </div>
  )
}

function ConfirmDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Delete document?</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          This will permanently delete the document and all associated files. This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg py-2 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, type, text }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login')
      return
    }
    api
      .get<Document[]>('/documents')
      .then(({ data }) => setDocs(data))
      .catch(() => setError('Failed to load documents'))
      .finally(() => setLoading(false))
  }, [router])

  // Poll statuses for active documents every 5s
  useEffect(() => {
    if (docs.length === 0) return
    const TERMINAL = new Set(['uploaded', 'done', 'notarized'])
    const active = docs.filter((d) => !TERMINAL.has(d.status))
    if (active.length === 0) return

    const interval = setInterval(async () => {
      const updates = await Promise.allSettled(
        active.map((d) =>
          api
            .get<{ status: string }>(`/documents/${d._id}/status`)
            .then(({ data }) => ({ _id: d._id, status: data.status }))
        )
      )
      setDocs((prev) => {
        let changed = false
        const next = prev.map((d) => {
          const hit = updates.find(
            (u) => u.status === 'fulfilled' && u.value._id === d._id
          )
          if (hit && hit.status === 'fulfilled' && hit.value.status !== d.status) {
            changed = true
            return { ...d, status: hit.value.status as Document['status'] }
          }
          return d
        })
        return changed ? next : prev
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [docs])

  function requestDelete(docId: string) {
    setConfirmDeleteId(docId)
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return
    const docId = confirmDeleteId
    setConfirmDeleteId(null)
    setDeletingId(docId)
    try {
      await api.delete(`/documents/${docId}`)
      setDocs((prev) => prev.filter((d) => d._id !== docId))
      addToast('success', 'Document deleted successfully')
    } catch {
      addToast('error', 'Failed to delete document. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handlePay(docId: string) {
    setPayingId(docId)
    try {
      const { data } = await api.post<{ url: string }>('/payments/create-session', {
        documentId: docId,
        amount: 29.99,
      })
      window.location.href = data.url
    } catch {
      addToast('error', 'Failed to start payment. Please try again.')
      setPayingId(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header />
      <main className="max-w-5xl mx-auto w-full px-4 py-8">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">My Documents</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Track the status of your translation & notarization requests
            </p>
          </div>
          <div className="flex items-center gap-3">
            <QueueWidget />
            <Link
              href="/upload"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition-all"
            >
              + Upload Document
            </Link>
          </div>
        </div>

        {loading && (
          <div data-testid="skeleton-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {error && (
          <div className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && docs.length === 0 && (
          <div data-testid="empty-state" className="text-center py-20">
            <p className="text-5xl mb-4">📄</p>
            <p className="text-gray-500 dark:text-gray-400 text-lg mb-6">No documents yet</p>
            <Link
              href="/upload"
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Upload your first document
            </Link>
          </div>
        )}

        {!loading && docs.length > 0 && (
          <div data-testid="document-grid" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {docs.map((doc) => (
              <DocumentCard
                key={doc._id}
                doc={doc}
                onPay={() => handlePay(doc._id)}
                paying={payingId === doc._id}
                onDelete={() => requestDelete(doc._id)}
                deleting={deletingId === doc._id}
              />
            ))}
          </div>
        )}
      </main>

      {confirmDeleteId && (
        <ConfirmDialog
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
