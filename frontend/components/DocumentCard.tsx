'use client'

import Link from 'next/link'
import StatusBadge, { DocumentStatus } from './StatusBadge'

export interface Document {
  _id: string
  filename: string
  status: DocumentStatus
  sourceLang: string
  targetLang: string
  createdAt: string
}

const STEPS: { key: DocumentStatus; label: string }[] = [
  { key: 'uploaded',    label: 'Uploaded' },
  { key: 'paid',        label: 'Paid' },
  { key: 'translating', label: 'Translating' },
  { key: 'translated',  label: 'Translated' },
  { key: 'notarizing',  label: 'Notarizing' },
  { key: 'done',        label: 'Done' },
]

const STATUS_STEP: Record<DocumentStatus, number> = {
  uploaded:   0,
  paid:       1,
  translating:2,
  translated: 3,
  notarizing: 4,
  notarized:  5,
  done:       5,
}

function StepProgressBar({ status }: { status: DocumentStatus }) {
  const current = STATUS_STEP[status] ?? 0

  return (
    <div className="mt-4">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const done = i < current
          const active = i === current
          const last = i === STEPS.length - 1

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* dot */}
              <div className="flex flex-col items-center">
                <div
                  className={[
                    'w-3 h-3 rounded-full flex-shrink-0 transition-all duration-500',
                    done  ? 'bg-green-500 dark:bg-green-400' : '',
                    active ? 'bg-blue-500 dark:bg-blue-400' : '',
                    !done && !active ? 'bg-gray-300 dark:bg-gray-600' : '',
                    active ? 'ring-4 ring-blue-100 dark:ring-blue-900' : '',
                  ].join(' ')}
                  style={active ? { animation: 'pulse-dot 1.5s ease-in-out infinite' } : undefined}
                />
                <span className={[
                  'text-[9px] mt-1 font-medium whitespace-nowrap',
                  done   ? 'text-green-600 dark:text-green-400' : '',
                  active ? 'text-blue-600 dark:text-blue-400' : '',
                  !done && !active ? 'text-gray-400 dark:text-gray-500' : '',
                ].join(' ')}>
                  {step.label}
                </span>
              </div>
              {/* connector */}
              {!last && (
                <div className="flex-1 h-0.5 mb-4 mx-1 transition-all duration-500">
                  <div className={[
                    'h-full transition-all duration-500',
                    done ? 'bg-green-400 dark:bg-green-500' : 'bg-gray-200 dark:bg-gray-700',
                  ].join(' ')} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DocumentCard({
  doc,
  onPay,
  paying,
}: {
  doc: Document
  onPay?: () => void
  paying?: boolean
}) {
  return (
    <div data-testid="document-card" className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md dark:hover:shadow-gray-800 transition-all duration-200 group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/document/${doc._id}`}
            className="font-medium text-gray-900 dark:text-gray-100 truncate block hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            {doc.filename || doc._id.slice(-8)}
          </Link>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {doc.sourceLang} → {doc.targetLang}
          </p>
        </div>
        <StatusBadge status={doc.status} />
      </div>

      <StepProgressBar status={doc.status} />

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        {new Date(doc.createdAt).toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric',
        })}
      </p>

      {doc.status === 'uploaded' && onPay && (
        <button
          onClick={onPay}
          disabled={paying}
          className="mt-3 w-full bg-green-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-green-700 active:scale-[0.98] transition-all duration-150 disabled:opacity-50"
        >
          {paying ? 'Redirecting…' : 'Pay & Translate — $29.99'}
        </button>
      )}

      {(doc.status === 'translated' || doc.status === 'notarized' || doc.status === 'done') && (
        <Link
          href={`/document/${doc._id}`}
          className="mt-3 w-full flex items-center justify-center gap-1.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-sm font-semibold py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
        >
          View & Download →
        </Link>
      )}
    </div>
  )
}
