import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Orvio — Conciliación bancaria inteligente',
    template: '%s | Orvio',
  },
  description:
    'Plataforma SaaS para estudios contables argentinos. Automatizá la extracción y conciliación de extractos bancarios con inteligencia artificial.',
  keywords: [
    'conciliación bancaria',
    'contabilidad argentina',
    'extracto bancario PDF',
    'SaaS contable',
    'Tango',
    'Holistor',
  ],
  robots: { index: false, follow: false }, // App privada — no indexar
  openGraph: {
    title: 'Orvio — Conciliación bancaria inteligente',
    description: 'Plataforma SaaS para estudios contables argentinos.',
    type: 'website',
    locale: 'es_AR',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
