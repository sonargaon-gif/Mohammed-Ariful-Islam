import JSZip from 'jszip';

export interface AndroidProjectFile {
  path: string;
  name: string;
  category:
    | 'Gradle & Manifest'
    | 'Bluetooth Transport'
    | 'Mesh Relay Engine'
    | 'Encryption & Room DB'
    | 'Security, Voice & Pairing'
    | 'Jetpack Compose UI'
    | 'Localization'
    | 'Docs';
  language: string;
  content: string;
  lines: number;
}

const rawModules = import.meta.glob('/android-freeconnect/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FUTURISTIC_BG_URL =
  '/src/assets/images/freeconnect_futuristic_bg_1795073450644.jpg';

function classifyCategory(relPath: string): AndroidProjectFile['category'] {
  if (relPath.endsWith('README.md')) return 'Docs';
  if (relPath.includes('/res/values')) return 'Localization';
  if (relPath.includes('/bluetooth/')) return 'Bluetooth Transport';
  if (relPath.includes('/mesh/')) return 'Mesh Relay Engine';
  if (relPath.includes('/crypto/') || relPath.includes('/data/')) return 'Encryption & Room DB';
  if (
    relPath.includes('/security/') ||
    relPath.includes('/media/') ||
    relPath.includes('/pairing/')
  ) {
    return 'Security, Voice & Pairing';
  }
  if (
    relPath.includes('/ui/') ||
    relPath.endsWith('MainActivity.kt') ||
    relPath.endsWith('FreeConnectApp.kt')
  ) {
    return 'Jetpack Compose UI';
  }
  return 'Gradle & Manifest';
}

function detectLanguage(path: string): string {
  if (path.endsWith('.kt') || path.endsWith('.kts')) return 'kotlin';
  if (path.endsWith('.xml')) return 'xml';
  if (path.endsWith('.toml')) return 'toml';
  if (path.endsWith('.md')) return 'markdown';
  return 'text';
}

export const ANDROID_PROJECT_FILES: AndroidProjectFile[] = Object.entries(rawModules)
  .map(([fullPath, content]) => {
    const relPath = fullPath.replace(/^\/android-freeconnect\//, '');
    const segments = relPath.split('/');
    return {
      path: relPath,
      name: segments[segments.length - 1],
      category: classifyCategory(relPath),
      language: detectLanguage(relPath),
      content,
      lines: content.split('\n').length,
    };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

export async function downloadAndroidProjectZip(): Promise<void> {
  const zip = new JSZip();
  const rootFolder = zip.folder('FreeConnect-Ultimate-Android');
  if (!rootFolder) return;

  for (const file of ANDROID_PROJECT_FILES) {
    rootFolder.file(file.path, file.content);
  }

  try {
    const response = await fetch(FUTURISTIC_BG_URL);
    if (response.ok) {
      const imageBlob = await response.blob();
      rootFolder.file('app/src/main/res/drawable/bg_freeconnect_futuristic.jpg', imageBlob);
    }
  } catch {
    // Non-fatal fallback
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'FreeConnect-Ultimate-Android-Studio.zip';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
