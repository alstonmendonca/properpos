import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'ProperPOS - Modern Point of Sale System',
    template: '%s | ProperPOS',
  },
  description: 'Modern cloud-based point of sale system for restaurants, retail, and more. Manage orders, inventory, customers, and analytics in one platform.',
  keywords: ['POS', 'point of sale', 'restaurant POS', 'retail POS', 'inventory management', 'order management', 'SaaS POS'],
  authors: [{ name: 'ProperPOS' }],
  creator: 'ProperPOS',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://properpos.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'ProperPOS',
    title: 'ProperPOS - Modern Point of Sale System',
    description: 'Modern cloud-based point of sale system for restaurants, retail, and more. Manage orders, inventory, customers, and analytics in one platform.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'ProperPOS' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ProperPOS - Modern Point of Sale System',
    description: 'Modern cloud-based POS for restaurants, retail, and more.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon-16x16.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none">
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
