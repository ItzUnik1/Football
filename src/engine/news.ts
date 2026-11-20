import type { Game, NewsCat, NewsItem } from './types';
import { gameNow } from './messages';

const MAX_NEWS = 300;

/** Central news feed. Every system reports through here. Bounded so saves stay small. */
export function addNews(g: Game, cat: NewsCat, headline: string, opts: { body?: string; imp?: 0 | 1 | 2; clubId?: string; playerId?: string } = {}): NewsItem {
  const item: NewsItem = { id: `n${g.meta.nextId = (g.meta.nextId ?? 1) + 1}`, date: gameNow(g), cat, headline, body: opts.body, imp: opts.imp ?? 0, clubId: opts.clubId, playerId: opts.playerId };
  g.news.push(item);
  if (g.news.length > MAX_NEWS) {
    // keep important items longer: drop the oldest unimportant first
    const idx = g.news.findIndex((n) => n.imp === 0);
    g.news.splice(idx >= 0 ? idx : 0, 1);
  }
  return item;
}
export const recentNews = (g: Game, n = 8, cat?: NewsCat): NewsItem[] => {
  const out: NewsItem[] = [];
  for (let i = g.news.length - 1; i >= 0 && out.length < n; i--) if (!cat || g.news[i].cat === cat) out.push(g.news[i]);
  return out;
};
