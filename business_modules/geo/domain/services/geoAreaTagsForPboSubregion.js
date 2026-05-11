/**
 * Geographic / analytic tags separate from PBO administrative filing.
 * All current northern PBO subregions are tagged `north`.
 * @param {string} pboSubregionId
 * @returns {string[]}
 */
export function geoAreaTagsForPboSubregion(pboSubregionId) {
  const id = String(pboSubregionId ?? '').trim().toLowerCase();
  const north = ['north'];
  switch (id) {
    case 'golan':
      return [...north, 'golan_heights'];
    case 'naftali':
      return [...north, 'upper_galilee_adjacent'];
    case 'baram':
    case 'hiram':
    case 'galma':
      return [...north, 'galilee'];
    default:
      return [];
  }
}
