/**
 * Map report JSON to indexable documents (shared by chat + retrieval).
 */
import { deriveInstrumentState } from '../../business_modules/resilience/index.js';

export function signalCountFromReport(reportData) {
  if (Array.isArray(reportData?.signals)) return reportData.signals.length;
  const assessmentSignals = reportData?.assessment?.signals;
  if (Array.isArray(assessmentSignals)) return assessmentSignals.length;
  return 0;
}

export function signalsFromReport(reportData, assessment) {
  if (Array.isArray(reportData?.signals)) return reportData.signals;
  if (Array.isArray(assessment?.signals)) return assessment.signals;
  return [];
}

export function fingerprintReport(reportData) {
  const a = reportData?.assessment ?? {};
  const sigCount = signalCountFromReport(reportData);
  const createdAt = reportData?.created_at ?? reportData?.createdAt ?? '';
  const scope = a?.report_scope?.id ?? 'national';
  return `${a?.date ?? ''}|scope=${scope}|signals=${sigCount}|created=${createdAt}`;
}

export function signalToDoc(signal, idx) {
  const ev = String(signal?.evidence ?? '').trim();
  const type = String(signal?.signal_type ?? '').trim();
  const docId = signal?.signal_id ? String(signal.signal_id) : `signal:${idx + 1}`;
  const text = `${type}\n${ev}`;
  return { docId, kind: 'signal', text };
}

export function componentToDoc(component) {
  const id = String(component?.component_id ?? '').trim();
  if (!id) return null;
  const narrative = String(component?.narrative ?? '').trim();
  const evidence = Array.isArray(component?.evidence) ? component.evidence.join('\n') : '';
  const inst = component?.instrument ?? deriveInstrumentState(component);
  const text =
    `${id}\n` +
    `Instrument: confidence=${inst.confidence}, sufficiency=${inst.evidence_sufficiency}` +
    `${inst.contested ? ', contested' : ''}${inst.significant_delta ? ', significant_delta' : ''}\n\n` +
    `${narrative}\n\nEvidence:\n${evidence}`;
  return { docId: `component:${id}`, kind: 'component', text };
}

export const reportIndexHelpers = {
  fingerprintReport,
  signalsFromReport,
  signalToDoc,
  componentToDoc,
};
