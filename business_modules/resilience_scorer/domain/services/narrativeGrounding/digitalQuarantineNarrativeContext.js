/**
 * Epistemic prompt block when digital signals are quarantined from scoring only.
 *
 * Pipeline position: injected into narrative LLM system prompt when scoring partition
 * quarantines digital; narrative pool still includes quarantined signals.
 *
 * Owns: formatDigitalQuarantineNarrativeBlock text, active-context predicate.
 * Does NOT: perform scoring partition or void index computation.
 *
 * Key collaborators: `dataVoid/scoringPartition.js`, narrative LLM orchestrator,
 * `narrativeGrounding/index.js` re-export.
 */

/**
 * Build EPISTEMIC_PARTITION prompt block when digital signals are scoring-quarantined.
 *
 * @param {object} [params]
 * @param {object|null|undefined} [params.quarantinedDigital]
 * @param {object|null|undefined} [params.scoringPartition]
 * @param {number} [params.narrativeScopeSignalCount]
 * @param {number} [params.signalsScoringUsed]
 * @returns {string} Prompt block or empty string when partition not active.
 */
export function formatDigitalQuarantineNarrativeBlock(params = {}) {
  const {
    quarantinedDigital = null,
    scoringPartition = null,
    narrativeScopeSignalCount = 0,
    signalsScoringUsed = 0,
  } = params;

  const partitionApplied = scoringPartition?.partitionApplied === true;
  const quarantinedCount = quarantinedDigital?.count
    ?? scoringPartition?.quarantinedSignals?.length
    ?? 0;

  if (!partitionApplied || quarantinedCount <= 0) {
    return '';
  }

  const reason = quarantinedDigital?.reason
    ?? scoringPartition?.quarantineReason
    ?? 'digital_quarantine';
  const mode = scoringPartition?.assessmentMode ?? 'field_anchor_only';

  return (
    'EPISTEMIC_PARTITION (scoring vs narrative):\n' +
    `- Headline scores use ${mode} signals only (${signalsScoringUsed} signal(s) in scoring pool).\n` +
    `- ${quarantinedCount} digital signal(s) quarantined from scoring (${reason}).\n` +
    `- Narrative/investigation pool: ${narrativeScopeSignalCount} signal(s) — includes quarantined digital.\n` +
    '- You MUST still extract claims and write prose citing digital/news signals from the input pool.\n' +
    '- Mark digital observations as provisional / not score-anchored when appropriate.\n' +
    '- Do NOT omit news or digital evidence because scores quarantined them.\n\n'
  );
}

/**
 * Whether digital quarantine narrative context should be injected into prompts.
 *
 * @param {object} params Same shape as formatDigitalQuarantineNarrativeBlock.
 * @returns {boolean}
 */
export function narrativeQuarantineContextActive(params = {}) {
  const block = formatDigitalQuarantineNarrativeBlock(params);
  return block.length > 0;
}
