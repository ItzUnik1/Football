import type { ClubRecords, Game, HistoryState } from './types';

export const emptyRecords = (): ClubRecords => ({
  titles: [], bestFinish: null, biggestWin: null, heaviestDefeat: null, recordSigning: null, recordSale: null, topScorerAllTime: null, highestPoints: null,
});
export const emptyHistory = (): HistoryState => ({ seasons: [], clubs: {} });
export function clubRecords(g: Game, clubId: string): ClubRecords {
  if (!g.history) g.history = emptyHistory();
  return (g.history.clubs[clubId] ??= emptyRecords());
}
