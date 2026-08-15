/**
 * Source independence classes — who is speaking, relative to what is assessed.
 *
 * Pipeline position: assess — consumed by componentEvidence.js when building
 * evidence_basis.source_class_exposure.
 *
 * Owns: the source-class table and the per-component self-assessment table.
 * Does NOT: weight, rescale or drop signals. Counting and labelling only —
 * a component may legitimately rest on self-reported evidence, but a reader is
 * entitled to know that it does.
 *
 * Why this exists separately from concentration_warning: that flag measures
 * whether ONE outlet dominates. It cannot see a component built from forty
 * municipalities' self-reports, because no single outlet crosses its threshold
 * while independent corroboration is still effectively zero.
 *
 * Key collaborators: componentEvidence.js, sourceFamilies.js.
 */

export const SOURCE_CLASS = Object.freeze({
  /** The assessed apparatus reporting on itself (municipal PBO returns). */
  self_reported: 'self_reported',
  /** A trained outsider observing the community (field officer visit reports). */
  expert_observer: 'expert_observer',
  independent_media: 'independent_media',
  citizen_voice: 'citizen_voice',
  instrumented: 'instrumented',
});

/** Bucket for source types with no class mapping — never counted as independent. */
export const UNCLASSIFIED_SOURCE_CLASS = '_unknown';

export const SOURCE_CLASS_BY_TYPE = Object.freeze({
  pbo: SOURCE_CLASS.self_reported,
  pbo_regional: SOURCE_CLASS.self_reported,
  visits: SOURCE_CLASS.expert_observer,
  field: SOURCE_CLASS.expert_observer, // read-compat for older bundles
  field_whatsapp: SOURCE_CLASS.expert_observer,
  naftali: SOURCE_CLASS.expert_observer,
  news: SOURCE_CLASS.independent_media,
  radio: SOURCE_CLASS.independent_media,
  whatsapp: SOURCE_CLASS.citizen_voice,
  social: SOURCE_CLASS.citizen_voice,
  probe: SOURCE_CLASS.instrumented,
});

/** Classes that corroborate a municipality from outside its own account. */
const INDEPENDENT_CLASSES = new Set([
  SOURCE_CLASS.independent_media,
  SOURCE_CLASS.citizen_voice,
  SOURCE_CLASS.instrumented,
]);

/**
 * Components where a `self_reported` source is reporting on ITSELF.
 *
 * The PBO author is the municipal apparatus. Its account of municipal
 * leadership, or of how well the municipality informs residents, is a
 * self-assessment. On wellbeing or protective infrastructure the same author
 * is describing a third party and the self-report threat does not apply —
 * which is why this is a per-component table and not a global source weight.
 */
export const SELF_ASSESSED_COMPONENTS = Object.freeze({
  leadership: [SOURCE_CLASS.self_reported],
  information_communication: [SOURCE_CLASS.self_reported],
});

/**
 * @param {string|null|undefined} sourceType
 * @returns {string} a SOURCE_CLASS value, or UNCLASSIFIED_SOURCE_CLASS
 */
export function sourceClassOf(sourceType) {
  return SOURCE_CLASS_BY_TYPE[sourceType] ?? UNCLASSIFIED_SOURCE_CLASS;
}

/**
 * @param {string} componentId
 * @param {string} sourceClass
 * @returns {boolean} whether this class is assessing itself on this component
 */
export function isSelfAssessing(componentId, sourceClass) {
  return (SELF_ASSESSED_COMPONENTS[componentId] ?? []).includes(sourceClass);
}

/**
 * @param {string} sourceClass
 * @returns {boolean}
 */
export function isIndependentClass(sourceClass) {
  return INDEPENDENT_CLASSES.has(sourceClass);
}
