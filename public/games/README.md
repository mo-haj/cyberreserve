# Game covers

Put one cover per game here, named after the game's slug, for example:

    counter-strike-2.webp
    dota-2.webp
    ea-sports-fc-25.jpg

Slugs are listed in `prisma/games-data.ts`. Any shape works (logo, icon or
cover): it is shown whole, centred in the game's box. About 512 px on the long
side, WebP, under 40 KB each. Use images you have the right to
use (publishers' press kits are the usual source). Then run `run-build.bat`.
A game without a file shows a generated tile.
