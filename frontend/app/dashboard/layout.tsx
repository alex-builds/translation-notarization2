import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard — DocTranslate',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
