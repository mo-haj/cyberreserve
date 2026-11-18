// Game catalogue for the seed. Names only: no cover art is bundled, because
// box art belongs to the publishers. An arena owner can add a cover they have
// the right to use (Game.imageUrl); until then the site draws a tile.

export interface GameData {
  slug: string;
  name: string;
  genre: GenreKey;
}

export type GenreKey = 'shooter' | 'moba' | 'battle' | 'sports' | 'racing' | 'fighting' | 'open' | 'strategy' | 'coop';

export const GENRES: Record<GenreKey, { en: string; ar: string }> = {
  shooter: { en: 'Shooter', ar: 'تصويب' },
  moba: { en: 'MOBA', ar: 'موبا' },
  battle: { en: 'Battle royale', ar: 'باتل رويال' },
  sports: { en: 'Sports', ar: 'رياضة' },
  racing: { en: 'Racing', ar: 'سباق' },
  fighting: { en: 'Fighting', ar: 'قتال' },
  open: { en: 'Open world', ar: 'عالم مفتوح' },
  strategy: { en: 'Strategy', ar: 'استراتيجية' },
  coop: { en: 'Co-op', ar: 'لعب جماعي' },
};

export const GAMES: GameData[] = [
  { slug: 'counter-strike-2', name: 'Counter-Strike 2', genre: 'shooter' },
  { slug: 'valorant', name: 'Valorant', genre: 'shooter' },
  { slug: 'call-of-duty-warzone', name: 'Call of Duty: Warzone', genre: 'battle' },
  { slug: 'pubg-battlegrounds', name: 'PUBG: Battlegrounds', genre: 'battle' },
  { slug: 'fortnite', name: 'Fortnite', genre: 'battle' },
  { slug: 'apex-legends', name: 'Apex Legends', genre: 'battle' },
  { slug: 'rainbow-six-siege', name: 'Rainbow Six Siege', genre: 'shooter' },
  { slug: 'overwatch-2', name: 'Overwatch 2', genre: 'shooter' },
  { slug: 'dota-2', name: 'Dota 2', genre: 'moba' },
  { slug: 'league-of-legends', name: 'League of Legends', genre: 'moba' },
  { slug: 'ea-sports-fc-25', name: 'EA Sports FC 25', genre: 'sports' },
  { slug: 'efootball', name: 'eFootball', genre: 'sports' },
  { slug: 'rocket-league', name: 'Rocket League', genre: 'sports' },
  { slug: 'forza-horizon-5', name: 'Forza Horizon 5', genre: 'racing' },
  { slug: 'tekken-8', name: 'Tekken 8', genre: 'fighting' },
  { slug: 'street-fighter-6', name: 'Street Fighter 6', genre: 'fighting' },
  { slug: 'mortal-kombat-1', name: 'Mortal Kombat 1', genre: 'fighting' },
  { slug: 'gta-v', name: 'Grand Theft Auto V', genre: 'open' },
  { slug: 'minecraft', name: 'Minecraft', genre: 'open' },
  { slug: 'red-dead-redemption-2', name: 'Red Dead Redemption 2', genre: 'open' },
  { slug: 'age-of-empires-ii', name: 'Age of Empires II', genre: 'strategy' },
  { slug: 'hearthstone', name: 'Hearthstone', genre: 'strategy' },
  { slug: 'it-takes-two', name: 'It Takes Two', genre: 'coop' },
  { slug: 'left-4-dead-2', name: 'Left 4 Dead 2', genre: 'coop' },
];

/** Games each demo arena offers, by slug. */
export const DEMO_ARENA_GAMES: Record<string, string[]> = {
  'mezzeh-arena': [
    'counter-strike-2', 'valorant', 'call-of-duty-warzone', 'pubg-battlegrounds', 'fortnite', 'apex-legends',
    'dota-2', 'league-of-legends', 'ea-sports-fc-25', 'rocket-league', 'tekken-8', 'gta-v', 'minecraft',
    'forza-horizon-5',
  ],
  'old-city-lan': [
    'counter-strike-2', 'dota-2', 'age-of-empires-ii', 'ea-sports-fc-25', 'efootball', 'gta-v',
    'left-4-dead-2', 'it-takes-two', 'mortal-kombat-1', 'hearthstone',
  ],
  'kafr-souseh-hub': GAMES.map((g) => g.slug),
};
