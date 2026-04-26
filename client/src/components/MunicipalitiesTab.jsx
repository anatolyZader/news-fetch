import { useMemo } from 'react';
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
import { alpha, useTheme } from '@mui/material/styles';
import { useAuth } from '../context/AuthContext.jsx';
import { useLanguage } from '../context/LanguageContext.jsx';
import { EmptyState, ErrorState, KpiCard, LoadingState, PageHeader } from '../ui/index.js';
import { scoreBg01, scoreColor01 } from '../lib/score.js';
import { useMunicipalitiesData } from '../hooks/useMunicipalitiesData.js';

function pct(v) {
  return v != null ? Math.round(v * 100) + '%' : '—';
}

function formatDate(dateStr, lang) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  if (lang === 'he') return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        borderRadius: t.custom.radius.pill,
        fontSize: t.typography.body2.fontSize,
      })}
    >
      {pct(value)}
    </Box>
  );
}

function ScoreLabelPill({ label, value, surface = 'muted', theme }) {
  return (
    <Stack
      direction="row"
      spacing={0.6}
      alignItems="center"
      sx={(t) => ({
        background: surface === 'muted' ? t.palette.background.default : t.palette.background.paper,
        border: t.custom.border.hairline,
        borderRadius: t.custom.radius.pill,
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

export function MunicipalitiesTab() {
  const { getIdToken, apiReady } = useAuth();
  const { lang } = useLanguage();
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <PageHeader
        title={isHe ? 'דוחות רשויות — קה"א' : 'Municipality PBO Reports'}
        subtitle={isHe ? 'דיווחי קציני התנהגות אוכלוסייה' : 'Population Behavior Officer reports'}
        action={(
          <ToggleButtonGroup
            value={selectedDate}
            exclusive
            size="small"
            onChange={(_, next) => { if (next) setSelectedDate(next); }}
            sx={{ flexWrap: 'wrap' }}
          >
            {data.days.map((d) => (
              <ToggleButton
                key={d.date}
                value={d.date}
                sx={(t) => ({
                  borderRadius: `${t.custom.radius.pill}px !important`,
                  border: `1px solid ${t.palette.divider} !important`,
                  marginRight: t.spacing(0.25),
                  marginBottom: t.spacing(0.25),
                  '&.Mui-selected': {
                    color: t.palette.primary.main,
                    borderColor: `${t.palette.primary.main} !important`,
                    backgroundColor: alpha(t.palette.primary.main, 0.06),
                  },
                })}
              >
                {formatDate(d.date, lang)} ({d.municipalities.length})
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}
      />

      {day && (
        <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1}>
          <KpiCard density="dense" label={isHe ? 'תאריך' : 'Date'} value={day.date} />
          <KpiCard density="dense" label={isHe ? 'רשויות' : 'Municipalities'} value={day.municipalities.length} />
          {comps.map((cid) => (
            <KpiCard
              key={cid}
              density="dense"
              label={compNames[cid]}
              value={pct(districtAvg?.[cid])}
              tone={scoreColor01(districtAvg?.[cid], theme)}
            />
          ))}
        </Stack>
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
                    {isHe ? 'ממוצע מחוזי' : 'District avg'}
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
            title={`${selectedMuni} — ${formatDate(selectedDate, lang)}`}
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
                            sx={(t) => ({ marginInlineStart: t.spacing(0.5), fontWeight: 400 })}
                          >
                            {isHe ? '— ללא שינוי' : '— no change'}
                          </Typography>
                        )}
                      </AccordionSummary>
                      <AccordionDetails>
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
                                  {formatDate(md.date, lang)}
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
