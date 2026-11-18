import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { dictionary, dirOf } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import './globals.css';

// Fonts are bundled with the app (app/fonts, SIL Open Font License), so
// neither the build nor visitors need Google Fonts.
const display = localFont({
  src: [
    { path: './fonts/changa-arabic-500-normal.woff2', weight: '500' },
    { path: './fonts/changa-latin-500-normal.woff2', weight: '500' },
    { path: './fonts/changa-arabic-600-normal.woff2', weight: '600' },
    { path: './fonts/changa-latin-600-normal.woff2', weight: '600' },
    { path: './fonts/changa-arabic-700-normal.woff2', weight: '700' },
    { path: './fonts/changa-latin-700-normal.woff2', weight: '700' },
    { path: './fonts/changa-arabic-800-normal.woff2', weight: '800' },
    { path: './fonts/changa-latin-800-normal.woff2', weight: '800' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const sans = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', weight: '400' },
    { path: './fonts/ibm-plex-sans-arabic-latin-400-normal.woff2', weight: '400' },
    { path: './fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2', weight: '500' },
    { path: './fonts/ibm-plex-sans-arabic-latin-500-normal.woff2', weight: '500' },
    { path: './fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2', weight: '700' },
    { path: './fonts/ibm-plex-sans-arabic-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-sans',
  display: 'swap',
});

// Station numbers and live counters (digits only).
const hud = localFont({
  src: [
    { path: './fonts/chakra-petch-latin-600-normal.woff2', weight: '600' },
    { path: './fonts/chakra-petch-latin-700-normal.woff2', weight: '700' },
  ],
  variable: '--font-hud',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = dictionary(await getLocale());
  return {
    title: { default: t.meta.title, template: `%s — CyberReserve` },
    description: t.meta.description,
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05060F',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  // Arabic is right-to-left. All spacing uses logical properties
  // (ms-/me-/ps-/pe-/start-/end-/text-start), so the layout mirrors by itself.
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${display.variable} ${sans.variable} ${hud.variable}`}>
      <head>
        {/* Marks that scripts run, so scroll reveals only hide content when they can show it again. */}
        <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      </head>
      {/* Column: the footer sits at the bottom of short pages, with no gap above it and no scroll. */}
      <body className="flex min-h-dvh flex-col font-sans text-ink antialiased">
        <div className="cyber-bg" aria-hidden="true">
          <div className="cyber-floor">
            <div className="cyber-lines" />
          </div>
          <div className="cyber-fade" />
        </div>
        {children}
      </body>
    </html>
  );
}
