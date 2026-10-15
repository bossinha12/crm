import { Company } from '../types';

let currentManifestBlobUrl: string | null = null;

/**
 * Dynamically updates the browser favicon, apple-touch-icon, page title,
 * and Web App Manifest (PWA) to strictly match the CURRENT company being accessed.
 * When the user clicks "Instalar Aplicativo" on Chrome (Android/PC/iOS),
 * it will display the exact name and logo of the owner's company!
 */
export function updateDynamicManifestAndIcons(company: Company | null) {
  if (typeof document === 'undefined') return;

  const companyName = company?.name?.trim() || 'AtendePro';
  const rawLogo = company?.logoUrl?.trim() || '';
  const primaryColor = company?.primaryColor || '#4f46e5';

  // Fallback SVG icon with company initial if company has no custom logo
  const initial = companyName.charAt(0).toUpperCase() || 'A';
  const defaultSvgDataUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="%234f46e5"/><text x="50%25" y="58%25" dominant-baseline="middle" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="96" fill="%23ffffff">${initial}</text></svg>`;

  const activeIconUrl = rawLogo && !rawLogo.includes('8CdttXNK') ? rawLogo : defaultSvgDataUrl;

  // 1. Update Document Title
  document.title = `${companyName} • Atendimento & Vendas`;

  // 2. Update Favicon (<link rel="icon">)
  let favicon = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }
  favicon.href = activeIconUrl;

  // 3. Update Apple Touch Icon (<link rel="apple-touch-icon">)
  let appleTouch = document.querySelector("link[rel='apple-touch-icon']") as HTMLLinkElement;
  if (!appleTouch) {
    appleTouch = document.createElement('link');
    appleTouch.rel = 'apple-touch-icon';
    document.head.appendChild(appleTouch);
  }
  appleTouch.href = activeIconUrl;

  // 4. Update Meta Theme Color
  let themeColorMeta = document.querySelector("meta[name='theme-color']") as HTMLMetaElement;
  if (themeColorMeta) {
    themeColorMeta.content = primaryColor;
  }

  // 5. Generate and inject Dynamic Web App Manifest Blob
  try {
    const manifestJson = {
      short_name: companyName.length > 12 ? companyName.slice(0, 12) : companyName,
      name: `${companyName} - Atendimento & Vendas`,
      start_url: window.location.href,
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: primaryColor,
      orientation: 'portrait',
      icons: [
        {
          src: activeIconUrl,
          sizes: '192x192',
          type: activeIconUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png',
          purpose: 'any maskable'
        },
        {
          src: activeIconUrl,
          sizes: '512x512',
          type: activeIconUrl.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png',
          purpose: 'any maskable'
        }
      ]
    };

    // Clean up previous blob URL
    if (currentManifestBlobUrl) {
      URL.revokeObjectURL(currentManifestBlobUrl);
      currentManifestBlobUrl = null;
    }

    const blob = new Blob([JSON.stringify(manifestJson, null, 2)], { type: 'application/manifest+json' });
    currentManifestBlobUrl = URL.createObjectURL(blob);

    let manifestLink = document.querySelector("link[rel='manifest']") as HTMLLinkElement;
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = currentManifestBlobUrl;
  } catch (err) {
    console.warn("Aviso ao gerar PWA Manifest dinâmico:", err);
  }
}
