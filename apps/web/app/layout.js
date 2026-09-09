import 'react-datepicker/dist/react-datepicker.css';

export const metadata = {
  title: '디지털 교무수첩',
  description: '디지털 교무수첩',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f1f5f9', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', minHeight: '100dvh' }}>{children}</body>
    </html>
  )
}
