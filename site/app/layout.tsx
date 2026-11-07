import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://encre-app.vercel.app'),
  title: 'Encre · Tako, ton Claude Code de bureau',
  description:
    'Un petit poulpe qui flotte sur ton bureau. Un clic, et c’est Claude Code qui travaille dans ton projet : fichiers, commandes, voix. Windows et macOS.',
  icons: { icon: '/icon.png' },
  openGraph: {
    title: 'Encre',
    description: 'Tako, le poulpe qui flotte sur ton bureau et ouvre Claude Code.',
    images: ['/icon.png'],
    locale: 'fr',
    type: 'website'
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    /* `suppressHydrationWarning` : le script plus bas pose une classe et la
       plateforme sur <html> avant l'hydratation. */
    <html lang="fr" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {/* Animable seulement si JS tourne (sinon tout resterait invisible), et
            la plateforme notée avant le rendu pour ne proposer que le bon
            binaire, sans clignotement. Plateforme inconnue : les deux. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.add('js');
try {
  var ua = navigator.userAgent || '';
  var pf = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  var tactile = navigator.maxTouchPoints > 1;
  var os = '';
  if (/win/i.test(pf) || /Windows/.test(ua)) os = 'win';
  else if ((/mac/i.test(pf) || /Mac OS X/.test(ua)) && !tactile) os = 'mac';
  if (os) document.documentElement.dataset.os = os;
} catch (e) {}`
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
