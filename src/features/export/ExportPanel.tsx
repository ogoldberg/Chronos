import { useState } from 'react';
import type { TimelineEvent, Viewport } from '../../types';
import {
  exportCanvasImage,
  downloadBlob,
  exportEventsJSON,
  generateEmbedSnippet,
  copyToClipboard,
} from '../../utils/export';
import { formatYear } from '../../utils/format';
import { printTimeline, downloadTimelineHTML } from './printExport';

interface Props {
  viewport: Viewport;
  events: TimelineEvent[];
  onClose: () => void;
}

export default function ExportPanel({ viewport, events, onClose }: Props) {
  const [copied, setCopied] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleScreenshot = async () => {
    setExporting(true);
    const blob = await exportCanvasImage();
    if (blob) {
      const name = `chronos-${formatYear(viewport.centerYear).replace(/\s/g, '-')}.png`;
      downloadBlob(blob, name);
    }
    setExporting(false);
  };

  const handleJSON = () => {
    const json = exportEventsJSON(events, viewport);
    const blob = new Blob([json], { type: 'application/json' });
    downloadBlob(blob, 'chronos-events.json');
  };

  const handleEmbed = async () => {
    const snippet = generateEmbedSnippet(viewport);
    const ok = await copyToClipboard(snippet);
    if (ok) { setCopied('embed'); setTimeout(() => setCopied(''), 2000); }
  };

  const handleShareURL = async () => {
    const ok = await copyToClipboard(window.location.href);
    if (ok) { setCopied('url'); setTimeout(() => setCopied(''), 2000); }
  };

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 400,
      maxWidth: 'calc(100vw - 40px)',
      background: 'rgba(10, 14, 22, 0.96)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 18,
      backdropFilter: 'blur(24px)',
      boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      zIndex: 200,
      padding: 24,
      animation: 'modalSlideIn 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: 0 }}>
          Export & Share
        </h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ffffff60', cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>

      <div style={{ color: '#ffffff40', fontSize: 11, marginBottom: 20, fontFamily: 'monospace' }}>
        {formatYear(viewport.centerYear - viewport.span / 2)} → {formatYear(viewport.centerYear + viewport.span / 2)}
        &nbsp;· {events.length} events
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ExportButton
          emoji="📸"
          label="Screenshot"
          desc="Download current view as PNG"
          onClick={handleScreenshot}
          loading={exporting}
        />
        <ExportButton
          emoji="📋"
          label="Copy JSON"
          desc={`Export ${events.length} events as structured data`}
          onClick={handleJSON}
        />
        <ExportButton
          emoji="🔗"
          label={copied === 'url' ? '✓ Copied!' : 'Copy Share URL'}
          desc="Link to this exact view"
          onClick={handleShareURL}
        />
        <ExportButton
          emoji="📦"
          label={copied === 'embed' ? '✓ Copied!' : 'Copy Embed Code'}
          desc="<iframe> snippet for your website"
          onClick={handleEmbed}
        />
        <ExportButton
          emoji="🖨️"
          label="Print / PDF"
          desc="Open print dialog for current view"
          onClick={() => printTimeline(events, viewport)}
        />
        <ExportButton
          emoji="📄"
          label="Download HTML"
          desc="Styled offline timeline document"
          onClick={() => downloadTimelineHTML(events, viewport)}
        />
      </div>
    </div>
  );
}

function ExportButton({ emoji, label, desc, onClick, loading }: {
  emoji: string; label: string; desc: string;
  onClick: () => void; loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 16px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12,
        cursor: loading ? 'wait' : 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s',
        width: '100%',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
    >
      <span style={{ fontSize: 20 }}>{emoji}</span>
      <div>
        <div style={{ color: '#ffffffdd', fontSize: 13, fontWeight: 500 }}>{label}</div>
        <div style={{ color: '#ffffff50', fontSize: 11 }}>{desc}</div>
      </div>
    </button>
  );
}
