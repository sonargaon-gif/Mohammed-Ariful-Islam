import { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, FolderOpen, Search } from 'lucide-react';
import {
  ANDROID_PROJECT_FILES,
  AndroidProjectFile,
  downloadAndroidProjectZip,
} from '../data/androidProjectFiles';

const CATEGORIES: Array<'All' | AndroidProjectFile['category']> = [
  'All',
  'Bluetooth Transport',
  'Mesh Relay Engine',
  'Encryption & Room DB',
  'Security, Voice & Pairing',
  'Jetpack Compose UI',
  'Localization',
  'Gradle & Manifest',
  'Docs',
];

export function AndroidCodeExplorer() {
  const [selectedCategory, setSelectedCategory] = useState<'All' | AndroidProjectFile['category']>(
    'All'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string>(
    ANDROID_PROJECT_FILES.find((f) => f.name === 'BluetoothClassicManager.kt')?.path ??
      ANDROID_PROJECT_FILES[0]?.path ??
      ''
  );
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ANDROID_PROJECT_FILES.filter((file) => {
      const catMatch = selectedCategory === 'All' || file.category === selectedCategory;
      const qMatch =
        !q ||
        file.path.toLowerCase().includes(q) ||
        file.content.toLowerCase().includes(q);
      return catMatch && qMatch;
    });
  }, [selectedCategory, searchQuery]);

  const activeFile =
    ANDROID_PROJECT_FILES.find((f) => f.path === selectedPath) ?? filteredFiles[0];

  const totalLines = useMemo(
    () => ANDROID_PROJECT_FILES.reduce((sum, f) => sum + f.lines, 0),
    []
  );

  const handleCopy = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadAndroidProjectZip();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Native Android Studio Project (Kotlin + Jetpack Compose · 20 Screens)
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            {ANDROID_PROJECT_FILES.length} source files · {totalLines.toLocaleString()} lines ·
            Android SDK 26–35 · Zero INTERNET permission · EN/BN/HI/AR RTL · RFCOMM + BLE + Room + E2EE
          </p>
        </div>

        <button
          onClick={handleDownload}
          disabled={downloading}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#0891B2] hover:brightness-110 disabled:opacity-60 text-white text-sm font-semibold border border-cyan-300/40 shadow-[0_0_20px_rgba(37,99,235,0.4)] flex items-center gap-2 transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-4 h-4" />
          {downloading ? 'Packaging .zip...' : 'Download Android Studio Project (.zip)'}
        </button>
      </div>

      {/* Category Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#0891B2] text-white border border-cyan-300/45'
                  : 'bg-white dark:bg-[#07152C]/75 border border-slate-300 dark:border-cyan-400/20 text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-cyan-400/45'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 dark:text-cyan-300/70 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter Kotlin / XML files..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-white dark:bg-[#07152C]/80 border border-slate-300 dark:border-cyan-400/25 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 dark:focus:border-cyan-300"
          />
        </div>
      </div>

      {/* IDE Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl bg-[#07152C] border border-slate-300 dark:border-cyan-400/25 overflow-hidden min-h-[640px]">
        {/* File Tree Sidebar */}
        <div className="lg:col-span-4 xl:col-span-3 border-b lg:border-b-0 lg:border-r border-[#1A2D4D] bg-[#0A1527] max-h-[680px] overflow-y-auto">
          <div className="px-4 py-3 border-b border-[#1A2D4D] flex items-center gap-2 text-xs font-medium text-slate-300">
            <FolderOpen className="w-4 h-4 text-[#3B82F6]" />
            <span>FreeConnect-Android/</span>
          </div>

          <div className="divide-y divide-[#12223C]">
            {filteredFiles.map((file) => {
              const selected = activeFile?.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedPath(file.path)}
                  className={`w-full text-left px-4 py-2.5 transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#173058] text-white'
                      : 'text-slate-300 hover:bg-[#10203A]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileCode2
                      className={`w-3.5 h-3.5 shrink-0 ${
                        selected ? 'text-[#60A5FA]' : 'text-slate-500'
                      }`}
                    />
                    <span className="text-xs font-medium truncate">{file.name}</span>
                  </div>
                  <p className="text-[10px] font-mono text-slate-500 truncate mt-0.5 pl-5">
                    {file.path}
                  </p>
                </button>
              );
            })}

            {filteredFiles.length === 0 && (
              <p className="p-4 text-xs text-slate-400">No files match your filter.</p>
            )}
          </div>
        </div>

        {/* Code Viewer */}
        <div className="lg:col-span-8 xl:col-span-9 flex flex-col max-h-[680px]">
          {activeFile ? (
            <>
              <div className="px-5 py-3 bg-[#0E1B31] border-b border-[#1A2D4D] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-xs font-mono text-white truncate">{activeFile.path}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {activeFile.category} · {activeFile.lines} lines · {activeFile.language}
                  </p>
                </div>
                <button
                  onClick={handleCopy}
                  className="px-3 py-1.5 rounded-lg border border-[#2B436B] hover:bg-[#162948] text-slate-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy File
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4 bg-[#071120]">
                <pre className="text-xs font-mono leading-relaxed text-slate-200">
                  {activeFile.content.split('\n').map((line, i) => (
                    <div key={i} className="table-row hover:bg-[#0F1E37]">
                      <span className="table-cell pr-4 text-right select-none text-slate-600 tabular-nums w-10">
                        {i + 1}
                      </span>
                      <span className="table-cell whitespace-pre">{line}</span>
                    </div>
                  ))}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400">
              Select a Kotlin or Gradle file to inspect its implementation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
