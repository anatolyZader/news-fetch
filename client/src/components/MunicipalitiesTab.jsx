import { useMemo } from 'react';
import { Line } from 'recharts';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Card from '@mui/material/Card';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Table from '@mui/material/Table';
import TableHead from '@mui/material/TableHead';
import TableBody from '@mui/material/TableBody';
import TableFooter from '@mui/material/TableFooter';
import TableRow from '@mui/material/TableRow';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import { useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import {
  EmptyState,
  ErrorState,
  KpiCard,
  KpiStrip,
  LineChartFrame,
  LoadingState,
  PageHeader,
  dateToggleGridSx,
} from '../ui/index.js';
import { scoreBg01, scoreColor01 } from '../lib/score.js';
import { formatDate } from '../lib/date.js';
import { useMunicipalitiesData } from '../hooks/useMunicipalitiesData.js';
import PropTypes from 'prop-types';

function pct(v) {
  return v == null ? '—' : Math.round(v * 100) + '%';
}

function ScoreBadge({ value, theme }) {
  return (
    <Box
      sx={(t) => ({
        fontWeight: 700,
        color: scoreColor01(value, theme),
        background: scoreBg01(value, theme),
        paddingTop: t.spacing(0.25),
        paddingBottom: t.spacing(0.25),
        paddingLeft: t.spacing(0.75),
        paddingRight: t.spacing(0.75),
        borderRadius: `${t.custom.radius.section}px`,
        fontSize: t.typography.body2.fontSize,
      })}
    >
      {pct(value)}
    </Box>
  );
}

ScoreBadge.propTypes = {
  value: PropTypes.number,
  theme: PropTypes.object.isRequired,
};

function ScoreLabelPill({ label, value, surface = 'muted', theme }) {
  return (
    <Stack
      direction="row"
      spacing={0.6}
      alignItems="center"
      sx={(t) => ({
        background: surface === 'muted' ? t.palette.background.default : t.palette.background.paper,
        border: t.custom.border.hairline,
        borderRadius: `${t.custom.radius.section}px`,
        paddingTop: t.spacing(0.25),
        paddingBottom: t.spacing(0.25),
        paddingLeft: t.spacing(0.75),
        paddingRight: t.spacing(0.75),
        fontSize: t.typography.pill.fontSize,
      })}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 'inherit' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700, color: scoreColor01(value, theme), fontSize: 'inherit' }}>
        {pct(value)}
      </Typography>
    </Stack>
  );
}

ScoreLabelPill.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number,
  surface: PropTypes.oneOf(['muted', 'paper']),
  theme: PropTypes.object.isRequired,
};

function normalizeScoreLabel(l) {
  return String(l ?? '').trim();
}

/** Sub-question labels: current day order first, then labels only seen on other days. */
function collectSubquestionLabelOrder(muniAllDays, cid, currentScores) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    const s = normalizeScoreLabel(raw);
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  (currentScores ?? []).forEach((s) => add(s.label));
  for (const md of muniAllDays) {
    (md.components?.[cid]?.scores ?? []).forEach((s) => add(s.label));
  }
  return out;
}

function buildAvgTrendData(muniAllDays, cid) {
  return muniAllDays
    .map((md) => {
      const comp = md.components?.[cid];
      if (!comp || comp.avg == null) return null;
      return { day: formatDate(md.date), iso: md.date, pct: Math.round(comp.avg * 100) };
    })
    .filter(Boolean)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

function buildSubquestionTrendData(muniAllDays, cid, labels) {
  return muniAllDays
    .map((md) => {
      const comp = md.components?.[cid];
      if (!comp) return null;
      const row = { day: formatDate(md.date), iso: md.date };
      labels.forEach((label, i) => {
        const sc = (comp.scores ?? []).find((s) => normalizeScoreLabel(s.label) === label);
        row[`q${i}`] = sc?.value == null ? null : Math.round(sc.value * 100);
      });
      return row;
    })
    .filter(Boolean)
    .sort((a, b) => a.iso.localeCompare(b.iso));
}

/** Spread overlapping series on the Y axis for display; keep raw % in `qN_raw` for tooltips. */
const SUB_TREND_NUDGE_PCT = 0.55;

function nudgeSubquestionRowsForDisplay(rows, nLabels) {
  const n = nLabels.length;
  if (n <= 1) return { rows, nudged: false };
  return {
    rows: rows.map((row) => {
      const out = { day: row.day, iso: row.iso };
      for (let i = 0; i < n; i++) {
        const k = `q${i}`;
        const raw = row[k];
        out[`${k}_raw`] = raw;
        if (raw == null) {
          out[k] = null;
          continue;
        }
        const offset = (i - (n - 1) / 2) * SUB_TREND_NUDGE_PCT;
        // Do not clamp: small values may sit just outside 0–100 so all lines stay separated.
        out[k] = raw + offset;
      }
      return out;
    }),
    nudged: true,
  };
}

function muniTrendStrokes(th) {
  const p = th.palette;
  const raw = [
    p.primary.main,
    p.info?.main,
    p.success?.main,
    p.warning?.main,
    p.secondary?.main,
    p.error?.main,
    p.text.secondary,
  ];
  return raw.map((c) => c || p.primary.main);
}

export function MunicipalitiesTab() {
  const { getIdToken, apiReady } = useAuth();
  const { lang, t } = useLanguage();
  const theme = useTheme();
  const isHe = lang === 'he';
  const {
    data,
    loading,
    error,
    selectedDate,
    setSelectedDate,
    selectedMuni,
    setSelectedMuni,
    day,
    muniAllDays,
    muniDay,
    districtAvg,
    visibleMunicipalities,
  } = useMunicipalitiesData({ getIdToken, apiReady });

  const compNames = useMemo(() => {
    if (!data) return {};
    return isHe ? data.componentNames.he : data.componentNames.en;
  }, [data, isHe]);

  if (loading) return <LoadingState>{isHe ? 'טוען נתונים...' : 'Loading data...'}</LoadingState>;
  if (error) return <ErrorState>{`${isHe ? 'שגיאה' : 'Error'}: ${error}`}</ErrorState>;
  if (!data?.days?.length) return <EmptyState>{isHe ? 'אין נתוני רשויות' : 'No municipality data available.'}</EmptyState>;

  const comps = data.componentsOrder;

  const dateTabSx = (t) => ({
    '&.Mui-selected': {
      color: t.palette.primary.contrastText,
      borderColor: `${t.palette.primary.main} !important`,
      background: `linear-gradient(135deg, ${t.palette.primary.main} 0%, ${t.palette.primary.dark} 100%)`,
      '&:hover': {
        color: t.palette.primary.contrastText,
      },
    },
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <PageHeader title={isHe ? ' דוחות קה"א יקל"ר' : 'Municipality PBO Reports'} />

      <ToggleButtonGroup
        value={selectedDate}
        exclusive
        size="small"
        onChange={(_, next) => { if (next) setSelectedDate(next); }}
        aria-label={isHe ? 'בחר תאריך' : 'Select date'}
        sx={(t) => dateToggleGridSx(t, { minColumnWidth: 128 })}
      >
        {data.days.map((d) => (
          <ToggleButton key={d.date} value={d.date} sx={dateTabSx}>
            {formatDate(d.date)} ({d.municipalities.length})
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {day && (
        <KpiStrip columns={8}>
          <KpiCard density="dense" span={4} label={isHe ? 'תאריך' : 'Date'} value={formatDate(day.date)} />
          <KpiCard density="dense" span={4} label={isHe ? 'רשויות' : 'Municipalities'} value={day.municipalities.length} />
          {comps.map((cid) => (
            <KpiCard
              key={cid}
              density="dense"
              label={compNames[cid]}
              value={pct(districtAvg?.[cid])}
              tone={scoreColor01(districtAvg?.[cid], theme)}
            />
          ))}
        </KpiStrip>
      )}

      {day && (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>{isHe ? 'רשות' : 'Municipality'}</TableCell>
                {comps.map((cid) => (
                  <TableCell key={cid} sx={{ fontWeight: 600 }}>{compNames[cid]}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleMunicipalities.map((m) => (
                <TableRow
                  key={m.name}
                  hover
                  selected={selectedMuni === m.name}
                  onClick={() => setSelectedMuni(selectedMuni === m.name ? null : m.name)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{m.name}</TableCell>
                  {comps.map((cid) => (
                    <TableCell
                      key={cid}
                      sx={{
                        fontWeight: 600,
                        color: scoreColor01(m.components[cid].avg, theme),
                        background: scoreBg01(m.components[cid].avg, theme),
                      }}
                    >
                      {pct(m.components[cid].avg)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            {districtAvg && (
              <TableFooter>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, color: 'text.primary' }}>
                    {t('district.avgLabel')}
                  </TableCell>
                  {comps.map((cid) => (
                    <TableCell key={cid} sx={{ fontWeight: 700, color: scoreColor01(districtAvg[cid], theme) }}>
                      {pct(districtAvg[cid])}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </TableContainer>
      )}

      {selectedMuni && muniDay && (
        <Stack spacing={1.2}>
          <PageHeader
            title={`${selectedMuni} — ${formatDate(selectedDate)}`}
            action={(
              <Button variant="outlined" size="small" onClick={() => setSelectedMuni(null)}>
                {isHe ? 'סגור' : 'Close'}
              </Button>
            )}
          />

          {comps.map((cid) => {
            const c = muniDay.components[cid];
            const avg = c.avg;
            const hasText = c.texts.some((t) => t.length > 0);
            return (
              <Card
                key={cid}
                sx={(t) => ({
                  borderInlineStartWidth: 4,
                  borderInlineStartStyle: 'solid',
                  borderInlineStartColor: scoreColor01(avg, theme),
                  paddingTop: t.spacing(1),
                  paddingBottom: t.spacing(1),
                  paddingLeft: t.spacing(1.5),
                  paddingRight: t.spacing(1.5),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: t.spacing(0.75),
                })}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                  <Typography variant="cardTitle" component="h3">{compNames[cid]}</Typography>
                  <ScoreBadge value={avg} theme={theme} />
                </Stack>

                {hasText
                  ? c.texts.map((txt, i) => (
                    <Typography key={i} variant="body2">{txt}</Typography>
                  ))
                  : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      {isHe ? 'אין התייחסות מילולית' : 'No verbal reference provided'}
                    </Typography>
                  )}

                {c.scores.length > 0 && (
                  <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
                    {c.scores.map((s, i) => (
                      <ScoreLabelPill key={i} label={s.label} value={s.value} theme={theme} />
                    ))}
                  </Stack>
                )}

                {muniAllDays.length > 1 && (() => {
                  const daysWithChange = muniAllDays.map((md, idx) => {
                    const mc = md.components[cid];
                    const prev = idx > 0 ? muniAllDays[idx - 1].components[cid] : null;
                    const changed = !prev
                      || mc.avg !== prev.avg
                      || mc.texts.join('|') !== prev.texts.join('|');
                    return { ...md, mc, changed };
                  });
                  const anyChange = daysWithChange.some((d, i) => i > 0 && d.changed);
                  const subLabels = collectSubquestionLabelOrder(muniAllDays, cid, c.scores);
                  const useSubTrend = subLabels.length > 0;
                  const rawTrendRows = useSubTrend
                    ? buildSubquestionTrendData(muniAllDays, cid, subLabels)
                    : buildAvgTrendData(muniAllDays, cid);
                  const nudgeResult = useSubTrend
                    ? nudgeSubquestionRowsForDisplay(rawTrendRows, subLabels)
                    : { rows: rawTrendRows, nudged: false };
                  const trendData = nudgeResult.rows;
                  const subTrendNudged = nudgeResult.nudged;
                  const hasMultiSub = subLabels.length > 1;
                  const trendStrokes = muniTrendStrokes(theme);
                  return (
                    <Accordion>
                      <AccordionSummary>
                        <Typography variant="cardTitle" component="span">
                          {isHe ? 'השוואה בין ימים' : 'Compare across days'}
                        </Typography>
                        {!anyChange && (
                          <Typography
                            component="span"
                            color="text.secondary"
                            sx={(th) => ({ marginInlineStart: th.spacing(0.5), fontWeight: 400 })}
                          >
                            {isHe ? '— ללא שינוי' : '— no change'}
                          </Typography>
                        )}
                      </AccordionSummary>
                      <AccordionDetails>
                        {trendData.length > 0 && (
                          <Box
                            component="section"
                            aria-label={t('muni.trendTitle')}
                            sx={(th) => ({ width: '100%', marginBottom: th.spacing(2) })}
                          >
                            <Typography
                              variant="eyebrow"
                              color="text.secondary"
                              sx={(th) => ({ marginBottom: th.spacing(1) })}
                            >
                              {t('muni.trendTitle')}
                            </Typography>
                            {useSubTrend ? (
                              <LineChartFrame
                                data={trendData}
                                xKey="day"
                                yDomain={hasMultiSub && subTrendNudged ? [-1.2, 101.2] : [0, 100]}
                                yTicks={hasMultiSub && subTrendNudged ? [0, 25, 50, 75, 100] : undefined}
                                height={subLabels.length > 2 ? 300 : 260}
                                margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
                                legend
                                tooltipFormatter={(value, name, item) => {
                                  const row = item?.payload;
                                  const idx = subLabels.findIndex((l) => l === name);
                                  if (row && idx >= 0 && row[`q${idx}_raw`] != null) {
                                    return [`${row[`q${idx}_raw`]}%`, name];
                                  }
                                  const v = value == null || Number.isNaN(Number(value))
                                    ? null
                                    : Math.round(Number(value));
                                  return [v == null ? '—' : `${v}%`, name];
                                }}
                              >
                                {subLabels.map((label, i) => (
                                  <Line
                                    key={`${cid}-q${i}`}
                                    type="monotone"
                                    dataKey={`q${i}`}
                                    name={label}
                                    stroke={trendStrokes[i % trendStrokes.length]}
                                    strokeWidth={2 + (i % 2) * 0.35}
                                    strokeLinecap="round"
                                    dot={{
                                      r: 2.4 + (i % 3) * 0.4,
                                      strokeWidth: 1,
                                      fill: theme.palette.background.paper,
                                    }}
                                    activeDot={{ r: 3.5 }}
                                    connectNulls
                                  />
                                ))}
                              </LineChartFrame>
                            ) : (
                              <LineChartFrame
                                data={trendData}
                                xKey="day"
                                yDomain={[0, 100]}
                                height={200}
                                margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
                                tooltipFormatter={(value) => [`${value}%`, compNames[cid]]}
                              >
                                <Line
                                  type="monotone"
                                  dataKey="pct"
                                  name={compNames[cid]}
                                  stroke={theme.palette.primary.main}
                                  strokeWidth={2}
                                  dot={{
                                    r: 3,
                                    strokeWidth: 1,
                                    fill: theme.palette.background.paper,
                                  }}
                                  activeDot={{ r: 4 }}
                                  connectNulls
                                />
                              </LineChartFrame>
                            )}
                          </Box>
                        )}
                        {daysWithChange.map((md) => {
                          const { mc, changed } = md;
                          const mdTexts = mc.texts.filter((t) => t.length > 0);
                          return (
                            <Box
                              key={md.date}
                              sx={(t) => ({
                                paddingTop: t.spacing(0.75),
                                borderTop: `1px dashed ${t.palette.divider}`,
                                opacity: changed ? 1 : 0.7,
                                marginTop: t.spacing(0.5),
                                '&:first-of-type': { borderTop: 'none', marginTop: 0, paddingTop: 0 },
                              })}
                            >
                              <Stack direction="row" alignItems="center" spacing={1}>
                                <Typography variant="caption" color="text.secondary">
                                  {formatDate(md.date)}
                                </Typography>
                                <Typography
                                  variant="cardTitle"
                                  sx={{ color: scoreColor01(mc.avg, theme) }}
                                >
                                  {pct(mc.avg)}
                                </Typography>
                                {!changed && (
                                  <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    {isHe ? 'ללא שינוי' : 'unchanged'}
                                  </Typography>
                                )}
                              </Stack>
                              {changed && (
                                <>
                                  {mdTexts.length > 0
                                    ? mdTexts.map((txt, i) => (
                                      <Typography
                                        key={i}
                                        variant="body2"
                                        sx={(t) => ({ marginTop: t.spacing(0.5) })}
                                      >
                                        {txt}
                                      </Typography>
                                    ))
                                    : (
                                      <Typography
                                        variant="body2"
                                        color="text.secondary"
                                        sx={(t) => ({ fontStyle: 'italic', marginTop: t.spacing(0.5) })}
                                      >
                                        {isHe ? 'אין התייחסות' : 'No text'}
                                      </Typography>
                                    )}
                                  {mc.scores.length > 0 && (
                                    <Stack
                                      direction="row"
                                      useFlexGap
                                      flexWrap="wrap"
                                      spacing={0.7}
                                      sx={(t) => ({ marginTop: t.spacing(0.5) })}
                                    >
                                      {mc.scores.map((s, i) => (
                                        <ScoreLabelPill
                                          key={i}
                                          label={s.label}
                                          value={s.value}
                                          surface="raised"
                                          theme={theme}
                                        />
                                      ))}
                                    </Stack>
                                  )}
                                </>
                              )}
                            </Box>
                          );
                        })}
                      </AccordionDetails>
                    </Accordion>
                  );
                })()}
              </Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
