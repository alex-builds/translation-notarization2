import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Notary Cabinet — DocTranslate',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
