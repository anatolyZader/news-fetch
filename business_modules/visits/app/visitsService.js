export function createVisitsService({ visitsRepository }) {
  if (!visitsRepository) throw new Error('visitsRepository is required');

  return {
    getDashboard() {
      const days = visitsRepository.listVisitDays();
      const allVisits = days.flatMap((day) => day.visits.map((visit) => ({ ...visit, dayDate: day.date })));
      const signalTypeCounts = new Map();

      for (const visit of allVisits) {
        for (const signal of visit.signals) {
          const type = signal.signal_type || 'unknown';
          signalTypeCounts.set(type, (signalTypeCounts.get(type) ?? 0) + 1);
        }
      }

      const visitDates = allVisits.map((visit) => visit.visitDate || visit.dayDate).filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      const municipalities = [...new Set(allVisits.map((visit) => visit.municipality).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));

      return {
        summary: {
          totalVisits: allVisits.length,
          totalSignals: days.reduce((sum, day) => sum + (day.signalCount ?? 0), 0),
          totalMunicipalities: municipalities.length,
          totalDays: days.length,
          dateRange: visitDates.length ? { from: visitDates[0], to: visitDates.at(-1) } : null,
          storage: {
            rawPattern: 'business_modules/visits/data/articles-field-reports-YYYY-MM-DD.md',
            signalsPattern:
              'business_modules/visits/data/signals/signals-field-YYYY-MM-DD.json',
          },
        },
        municipalities,
        signalTypes: Array.from(signalTypeCounts, ([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
        days,
      };
    },
  };
}
