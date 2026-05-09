import { useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import { scoreColor10 } from '../lib/score.js';

export function DriftSparkline({
  series,
  t,
  valueKey = 'score',
  variant = 'score10',
  height = 78,
}) {
  const theme = useTheme();
  const containerRef = useRef(null);
  const [pixelW, setPixelW] = useState(600);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) setPixelW(Math.floor(w));
    });
    ro.observe(el);
    const w0 = el.clientWidth;
    if (w0 > 0) setPixelW(w0);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(120, pixelW);
  const H = height;
  const padX = 8;
  const padY = 6;
  const rows = (Array.isArray(series) ? series : [])
    .map((p, i) => ({ x: i, y: p?.[valueKey], date: p?.date }));
  const points = rows.filter((p) => p.y != null && !Number.isNaN(p.y));

  if (points.length === 0) {
    return (
      <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
        {t ? t('drift.noData') : 'No data'}
      </Typography>
    );
  }

  const labelAreaH = 16;
  const plotH = Math.max(20, H - labelAreaH);

  const xMax = Math.max(1, rows.length - 1);
  const yMin = variant === 'unit01' ? 0 : 1;
  const yMax = variant === 'unit01' ? 1 : 10;

  function sx(x) { return padX + (x / xMax) * (W - 2 * padX); }
  function sy(y) { return plotH - padY - ((y - yMin) / (yMax - yMin)) * (plotH - 2 * padY); }

  const last = points[points.length - 1];
  const lastColor = variant === 'unit01'
    ? theme.palette.primary.main
    : scoreColor10(last.y, theme);

  const tickLabel = (d) => {
    const s = String(d ?? '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(5);
    return s;
  };

  const segments = [];
  let seg = [];
  for (const p of rows) {
    if (p.y == null || Number.isNaN(p.y)) {
      if (seg.length > 0) segments.push(seg);
      seg = [];
      continue;
    }
    seg.push(p);
  }
  if (seg.length > 0) segments.push(seg);

  return (
    <Box ref={containerRef} sx={{ width: '100%', minWidth: 0, display: 'block' }}>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="drift sparkline"
        style={{ display: 'block' }}
      >
        <line x1={padX} y1={plotH - padY} x2={W - padX} y2={plotH - padY} stroke={theme.palette.divider} strokeWidth={1} />
        <line x1={padX} y1={padY} x2={padX} y2={plotH - padY} stroke={theme.palette.divider} strokeWidth={1} />

        {rows.map((p, idx) => (
          <line
            key={idx}
            x1={sx(p.x)}
            y1={plotH - padY}
            x2={sx(p.x)}
            y2={plotH - padY + 3.5}
            stroke={theme.palette.divider}
            strokeWidth={1}
          />
        ))}

        {segments.map((s, i) => (
          <polyline
            key={i}
            points={s.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={theme.palette.text.secondary}
            strokeWidth={1.5}
          />
        ))}

        {rows.map((p, i) => {
          const has = p.y != null && !Number.isNaN(p.y);
          const y = has ? sy(p.y) : (plotH - padY);
          const fill = has
            ? (variant === 'unit01' ? theme.palette.text.secondary : scoreColor10(p.y, theme))
            : theme.palette.action.disabled;
          const r = has ? 2.5 : 2;
          const opacity = has ? 1 : 0.55;
          return (
            <circle key={i} cx={sx(p.x)} cy={y} r={r} fill={fill} opacity={opacity} />
          );
        })}

        <circle cx={sx(last.x)} cy={sy(last.y)} r={4} fill={lastColor} />

        {rows.map((p, i) => (
          <text
            key={`lbl-${i}`}
            x={sx(p.x)}
            y={plotH + labelAreaH - 2}
            textAnchor="middle"
            fontSize="10"
            fill={theme.palette.text.disabled}
          >
            {tickLabel(p.date)}
          </text>
        ))}
      </svg>
    </Box>
  );
}
