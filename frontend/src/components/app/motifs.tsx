/** A closed vocabulary of small scenes, one per kind of idea.
 *
 *  The map is the product, and a map of grey boxes is an org chart. What makes
 *  the difference is that "the flight to Varennes" arrives as a carriage in the
 *  dark and "Austria and Prussia declare war" arrives as a line of muskets —
 *  the picture is doing part of the remembering.
 *
 *  Closed on purpose, and for the same reason the note figures are: a model
 *  asked for "an illustration" writes prose describing one, or SVG that renders
 *  like a ransom note. A model asked to pick one of twenty names picks well
 *  nearly every time, and the app draws something it can actually style. Adding
 *  a motif means adding it here and to `MOTIFS` in `lib/motif.ts`; nothing else
 *  in the app has to know.
 *
 *  Drawn small and flat: these are ~110px on a card, so three to eight shapes
 *  each, with the same warm outline as the cats. Anything finer turns to mud.
 */

const LINE = "#6E4A34";
const GREY = "#C3B9AF";
const GREY_DARK = "#9C9087";
const CREAM = "#F8F0E1";
const GINGER = "#F2A75C";
const GOLD = "#D9A84E";
const RED = "#C4453A";
const BLUE = "#5B7FA6";
const GREEN = "#3F7355";
const PAPER = "#FDFBF4";

export const MOTIF_BOX = { width: 120, height: 84 };

/** Shared defaults. Every motif is drawn with one outline weight so that a map
 *  of twenty different scenes still reads as one hand. */
function Ink({ children, width = 3 }: { children: React.ReactNode; width?: number }) {
  return (
    <g stroke={LINE} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round">
      {children}
    </g>
  );
}

/** A cat's head, small, for the scenes that need someone in them. */
function Kitty({
  x,
  y,
  r = 11,
  fur = GREY,
  hat,
}: {
  x: number;
  y: number;
  r?: number;
  fur?: string;
  hat?: "shako" | "bonnet" | "none";
}) {
  return (
    <g>
      <path d={`M ${x - r * 0.9} ${y - r * 0.4} L ${x - r * 0.62} ${y - r * 1.35} L ${x - r * 0.1} ${y - r * 0.9} Z`} fill={fur} />
      <path d={`M ${x + r * 0.9} ${y - r * 0.4} L ${x + r * 0.62} ${y - r * 1.35} L ${x + r * 0.1} ${y - r * 0.9} Z`} fill={fur} />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.92} fill={fur} />
      <circle cx={x - r * 0.38} cy={y - r * 0.08} r={r * 0.13} fill={LINE} stroke="none" />
      <circle cx={x + r * 0.38} cy={y - r * 0.08} r={r * 0.13} fill={LINE} stroke="none" />
      {hat === "shako" && (
        <path
          d={`M ${x - r * 0.75} ${y - r * 0.85} h ${r * 1.5} v ${-r * 1.1} h ${-r * 1.5} z`}
          fill={BLUE}
        />
      )}
      {hat === "bonnet" && (
        <path d={`M ${x - r} ${y - r * 0.75} q ${r} ${-r * 1.1} ${r * 2} 0 z`} fill={RED} />
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- history */

/** A crown on its cushion. Monarchy, a reign, a claim to a throne. */
function Crown() {
  return (
    <Ink>
      <path d="M 26 62 h 68 a 8 8 0 0 1 8 8 h -84 a 8 8 0 0 1 8 -8 z" fill={RED} />
      <path d="M 30 58 L 24 26 L 42 42 L 60 20 L 78 42 L 96 26 L 90 58 Z" fill={GOLD} />
      <g fill={RED} stroke="none">
        <circle cx="60" cy="48" r="4.5" />
        <circle cx="42" cy="52" r="3" />
        <circle cx="78" cy="52" r="3" />
      </g>
      <circle cx="24" cy="24" r="4" fill={GOLD} />
      <circle cx="96" cy="24" r="4" fill={GOLD} />
      <circle cx="60" cy="16" r="4.5" fill={GOLD} />
    </Ink>
  );
}

/** Cats under a banner. A rising, a march, a republic declared. */
function Flag() {
  return (
    <g>
      <Ink>
        <path d="M 46 74 V 14" />
        <path d="M 46 16 h 46 v 26 h -46 z" fill={BLUE} />
        <path d="M 61 16 h 16 v 26 h -16 z" fill={PAPER} />
        <path d="M 77 16 h 15 v 26 h -15 z" fill={RED} />
      </Ink>
      <Kitty x={32} y={62} fur={GINGER} />
      <Kitty x={58} y={66} r={10} fur={CREAM} hat="bonnet" />
      <Kitty x={80} y={64} r={10} fur={GREY} />
      <Ink width={2.6}>
        <path d="M 12 78 h 96" />
      </Ink>
    </g>
  );
}

/** A line behind a wall, muskets up. War, a battle, an invasion. */
function Battle() {
  return (
    <g>
      <Ink width={2.6}>
        <path d="M 16 32 L 30 68" />
        <path d="M 38 28 L 52 68" />
        <path d="M 60 30 L 74 68" />
        <path d="M 82 26 L 96 68" />
      </Ink>
      <g fill={GREY_DARK} stroke="none">
        <circle cx="16" cy="32" r="3.5" />
        <circle cx="38" cy="28" r="3.5" />
        <circle cx="60" cy="30" r="3.5" />
        <circle cx="82" cy="26" r="3.5" />
      </g>
      <Kitty x={26} y={56} r={10} fur={GREY} hat="shako" />
      <Kitty x={50} y={58} r={10} fur={CREAM} hat="shako" />
      <Kitty x={74} y={56} r={10} fur={GINGER} hat="shako" />
      <Ink>
        <path d="M 8 70 h 104 v 10 h -104 z" fill={GREY} />
      </Ink>
    </g>
  );
}

/** A carriage at speed. A flight, a journey, a route. */
function Carriage() {
  return (
    <g>
      <Ink>
        <path d="M 30 36 h 52 a 8 8 0 0 1 8 8 v 18 h -68 v -18 a 8 8 0 0 1 8 -8 z" fill={GREY_DARK} />
        <path d="M 40 42 h 16 v 14 h -16 z" fill={PAPER} />
        <path d="M 64 42 h 16 v 14 h -16 z" fill={PAPER} />
        <circle cx="38" cy="66" r="12" fill={CREAM} />
        <circle cx="82" cy="66" r="12" fill={CREAM} />
        <circle cx="38" cy="66" r="3.5" fill={LINE} />
        <circle cx="82" cy="66" r="3.5" fill={LINE} />
        <path d="M 90 46 l 16 -8" />
      </Ink>
      <Kitty x={100} y={30} r={9} fur={GINGER} />
      <Ink width={2.4}>
        <path d="M 6 74 h 108" />
        <path d="M 12 58 h 12" />
        <path d="M 8 66 h 16" />
      </Ink>
    </g>
  );
}

/** A ship under sail. Exploration, trade, a navy, an arrival. */
function Ship() {
  return (
    <g>
      <Ink>
        <path d="M 60 12 V 56" />
        <path d="M 60 16 q 26 10 0 28 z" fill={PAPER} />
        <path d="M 60 20 q -22 8 0 24 z" fill={CREAM} />
        <path d="M 24 56 h 72 l -12 16 h -48 z" fill={GREY_DARK} />
      </Ink>
      <Ink width={2.4}>
        <path d="M 8 76 q 10 -6 20 0 q 10 6 20 0" />
        <path d="M 72 78 q 10 -6 20 0 q 10 6 20 0" />
      </Ink>
    </g>
  );
}

/** A rostrum with someone at it. A debate, a declaration, a speech. */
function Assembly() {
  return (
    <g>
      <Kitty x={60} y={30} r={12} fur={CREAM} />
      <Ink>
        <path d="M 42 48 h 36 l 6 24 h -48 z" fill={GREY_DARK} />
        <path d="M 50 56 h 20 v 10 h -20 z" fill={GOLD} />
      </Ink>
      <Kitty x={20} y={62} r={9} fur={GINGER} />
      <Kitty x={100} y={62} r={9} fur={GREY} />
      <Ink width={2.4}>
        <path d="M 4 78 h 112" />
      </Ink>
    </g>
  );
}

/** A sealed scroll. An act, a law, a charter, a constitution. */
function Law() {
  return (
    <Ink>
      <path d="M 26 14 h 68 v 52 h -68 z" fill={PAPER} />
      <path d="M 26 14 q -10 6 0 12" fill={CREAM} />
      <path d="M 94 14 q 10 6 0 12" fill={CREAM} />
      <g stroke={GREY_DARK} strokeWidth={2.4}>
        <path d="M 38 34 h 44" />
        <path d="M 38 42 h 44" />
        <path d="M 38 50 h 28" />
      </g>
      <circle cx="82" cy="62" r="10" fill={RED} />
      <path d="M 78 58 l 8 8 M 86 58 l -8 8" stroke={PAPER} strokeWidth={2.2} />
    </Ink>
  );
}

/** Coins and a purse. Taxes, debt, trade, an economy. */
function Money() {
  return (
    <Ink>
      <path d="M 20 44 q 22 -18 44 0 q 8 24 -22 28 q -30 -4 -22 -28 z" fill={GOLD} />
      <path d="M 34 32 q 8 -10 16 0" fill="none" />
      <circle cx="86" cy="36" r="14" fill={GOLD} />
      <circle cx="96" cy="60" r="12" fill={GOLD} />
      <path d="M 86 29 v 14 M 82 33 h 8 M 82 39 h 8" strokeWidth={2.2} />
    </Ink>
  );
}

/** Gears and a chimney. Industry, a system, a mechanism. */
function Factory() {
  return (
    <Ink>
      <path d="M 18 76 v -34 h 10 v -22 h 10 v 22 h 10 v 34 z" fill={GREY_DARK} />
      <g fill={CREAM} stroke="none">
        <circle cx="30" cy="16" r="6" opacity={0.8} />
        <circle cx="42" cy="8" r="5" opacity={0.6} />
      </g>
      <g fill={GOLD}>
        <path d="M 78 26 l 6 4 l 7 -2 l 2 7 l 6 4 l -4 6 l 1 7 l -7 1 l -5 5 l -5 -5 l -7 -1 l 1 -7 l -4 -6 l 6 -4 l 2 -7 z" />
      </g>
      <circle cx="84" cy="48" r="5" fill={PAPER} />
      <path d="M 12 78 h 96" strokeWidth={2.4} />
    </Ink>
  );
}

/** Two paws over a document. A treaty, an alliance, an agreement. */
function Treaty() {
  return (
    <g>
      <Ink>
        <path d="M 24 44 h 72 v 34 h -72 z" fill={PAPER} />
        <g stroke={GREY_DARK} strokeWidth={2.2}>
          <path d="M 34 68 h 24" />
          <path d="M 66 68 h 20" />
        </g>
        <ellipse cx="46" cy="30" rx="16" ry="12" fill={GINGER} />
        <ellipse cx="74" cy="30" rx="16" ry="12" fill={GREY} />
        <path d="M 54 30 h 12" strokeWidth={2.4} />
      </Ink>
    </g>
  );
}

/** An unrolled map with a route on it. Territory, expansion, geography. */
function MapMotif() {
  return (
    <Ink>
      <path d="M 16 18 h 88 v 50 h -88 z" fill={CREAM} />
      <path d="M 16 18 q -8 25 0 50" fill={CREAM} />
      <path d="M 104 18 q 8 25 0 50" fill={CREAM} />
      <path d="M 30 56 q 10 -22 26 -14 q 16 8 30 -14" fill="none" stroke={RED} strokeWidth={2.6} strokeDasharray="5 5" />
      <path d="M 82 24 l 8 8 M 90 24 l -8 8" stroke={RED} strokeWidth={2.6} />
      <path d="M 28 34 q 8 -6 14 0 q 6 6 12 0" fill="none" stroke={BLUE} strokeWidth={2.2} />
    </Ink>
  );
}

/** A lit idea. A doctrine, a philosophy, an argument, an invention. */
function Idea() {
  return (
    <g>
      <Ink>
        <path d="M 60 12 a 20 20 0 0 1 12 36 v 6 h -24 v -6 a 20 20 0 0 1 12 -36 z" fill={GOLD} />
        <path d="M 50 58 h 20 M 52 64 h 16" strokeWidth={2.6} />
        <g strokeWidth={2.6}>
          <path d="M 26 20 l 8 6" />
          <path d="M 94 20 l -8 6" />
          <path d="M 20 44 h 10" />
          <path d="M 100 44 h -10" />
        </g>
      </Ink>
      <Kitty x={60} y={74} r={10} fur={CREAM} />
    </g>
  );
}

/* ---------------------------------------------------------------- science */

/** A flask, bubbling. Chemistry, an experiment, a reaction. */
function Flask() {
  return (
    <Ink>
      <path d="M 52 14 h 16 v 22 l 18 34 a 6 6 0 0 1 -6 8 h -40 a 6 6 0 0 1 -6 -8 l 18 -34 z" fill={PAPER} />
      <path d="M 40 56 h 40 l 6 14 a 6 6 0 0 1 -6 8 h -40 a 6 6 0 0 1 -6 -8 z" fill={GREEN} />
      <g fill={CREAM} stroke="none">
        <circle cx="54" cy="64" r="3.5" opacity={0.85} />
        <circle cx="68" cy="70" r="2.5" opacity={0.85} />
      </g>
      <path d="M 50 14 h 20" strokeWidth={3.4} />
      <circle cx="96" cy="26" r="4" fill={GREEN} />
      <circle cx="88" cy="14" r="3" fill={GREEN} />
    </Ink>
  );
}

/** A cell. Biology, anything with parts inside a membrane. */
function Cell() {
  return (
    <Ink>
      <ellipse cx="60" cy="44" rx="42" ry="32" fill="#CFE3D0" />
      <ellipse cx="54" cy="42" rx="15" ry="13" fill={GREEN} />
      <circle cx="54" cy="42" r="5" fill={CREAM} stroke="none" />
      <ellipse cx="86" cy="56" rx="11" ry="6" fill={GOLD} />
      <ellipse cx="34" cy="62" rx="9" ry="5" fill={GOLD} />
      <ellipse cx="82" cy="28" rx="8" ry="5" fill={PAPER} />
    </Ink>
  );
}

/** A nucleus and its orbits. Physics, energy, structure, forces. */
function Atom() {
  return (
    <Ink>
      <ellipse cx="60" cy="42" rx="44" ry="17" fill="none" />
      <g transform="rotate(60 60 42)">
        <ellipse cx="60" cy="42" rx="44" ry="17" fill="none" />
      </g>
      <g transform="rotate(-60 60 42)">
        <ellipse cx="60" cy="42" rx="44" ry="17" fill="none" />
      </g>
      <circle cx="60" cy="42" r="10" fill={RED} />
      <circle cx="104" cy="42" r="5" fill={BLUE} />
      <circle cx="38" cy="4" r="5" fill={BLUE} />
    </Ink>
  );
}

/** A head with the thinking part shown. Psychology, cognition, perception. */
function Brain() {
  return (
    <g>
      <Ink>
        <path d="M 30 70 v -22 a 32 30 0 0 1 64 -2 v 24 z" fill={CREAM} />
        <path d="M 40 66 v -18 a 22 20 0 0 1 44 -2 v 20 z" fill="#E7B9B2" />
        <g strokeWidth={2.4} fill="none">
          <path d="M 52 64 q -8 -12 2 -18 q 10 -6 16 2" />
          <path d="M 72 64 q 10 -10 2 -18" />
        </g>
        <path d="M 30 56 h -8 a 6 6 0 0 0 0 12 h 8" fill={CREAM} />
      </Ink>
      <path d="M 92 22 L 100 6 L 108 24 Z" fill={CREAM} stroke={LINE} strokeWidth={3} strokeLinejoin="round" />
    </g>
  );
}

/** A board with a line of symbols. Maths, a method, a formula. */
function Equation() {
  return (
    <g>
      <Ink>
        <path d="M 12 12 h 96 v 52 h -96 z" fill="#2F4A3C" />
        <path d="M 18 18 h 84 v 40 h -84 z" fill="none" stroke={GOLD} strokeWidth={2} />
        <path d="M 44 64 l -8 12 M 76 64 l 8 12" strokeWidth={2.6} />
      </Ink>
      <text
        x="60"
        y="44"
        textAnchor="middle"
        fontSize="20"
        fontFamily="ui-monospace, monospace"
        fill={PAPER}
      >
        a²+b²
      </text>
    </g>
  );
}

/** Axes and a line. Data, a trend, a rate, an economy. */
function Graph() {
  return (
    <Ink>
      <path d="M 20 12 v 58 h 84" fill="none" strokeWidth={3.2} />
      <path d="M 32 58 h 12 v 12 h -12 z" fill={GREY} />
      <path d="M 52 44 h 12 v 26 h -12 z" fill={GREY_DARK} />
      <path d="M 72 30 h 12 v 40 h -12 z" fill={GREEN} />
      <path d="M 28 52 L 52 38 L 76 22 L 100 14" fill="none" stroke={RED} strokeWidth={3} />
      <circle cx="100" cy="14" r="4" fill={RED} />
    </Ink>
  );
}

/** An open book. The default: a concept that is simply something to know. */
function Book() {
  return (
    <Ink>
      <path
        d="M 60 26 C 46 14 30 12 14 16 v 48 C 30 60 46 62 60 72 C 74 62 90 60 106 64 V 16 C 90 12 74 14 60 26 Z"
        fill={PAPER}
      />
      <path d="M 60 26 V 72" />
      <g stroke={GREY_DARK} strokeWidth={2.2}>
        <path d="M 24 30 q 14 -3 26 5" />
        <path d="M 24 40 q 14 -3 26 5" />
        <path d="M 96 30 q -14 -3 -26 5" />
        <path d="M 96 40 q -14 -3 -26 5" />
      </g>
      <path d="M 78 14 v 22 l 7 -6 l 7 6 V 12" fill={RED} />
    </Ink>
  );
}

/** A clock and an hourglass. A period, a sequence, a duration. */
function Clock() {
  return (
    <Ink>
      <circle cx="44" cy="42" r="28" fill={PAPER} />
      <path d="M 44 24 v 18 l 12 8" strokeWidth={3.2} fill="none" />
      <path d="M 82 14 h 26 l -10 16 l 10 16 h -26 l 10 -16 z" fill={CREAM} />
      <path d="M 88 40 h 14 l -7 -10 z" fill={GOLD} stroke="none" />
      <path d="M 80 12 h 30 M 80 48 h 30" strokeWidth={3} />
    </Ink>
  );
}

/** An eye. Seeing, perception, attention, observation, a threshold. */
function Eye() {
  return (
    <Ink>
      <path d="M 8 42 q 52 -36 104 0 q -52 36 -104 0 z" fill={PAPER} />
      <circle cx="60" cy="42" r="18" fill="#7FA8C4" />
      <circle cx="60" cy="42" r="8" fill={LINE} stroke="none" />
      <circle cx="54" cy="36" r="3" fill={PAPER} stroke="none" />
      <g strokeWidth={2.6}>
        <path d="M 60 18 v -8" />
        <path d="M 26 26 l -5 -6" />
        <path d="M 94 26 l 5 -6" />
      </g>
    </Ink>
  );
}

/** An ear and a sound. Hearing, a signal, a stimulus arriving. */
function Ear() {
  return (
    <Ink>
      <path
        d="M 44 76 V 58 C 30 54 24 42 26 32 C 29 16 46 8 60 14 C 74 20 78 36 70 44 C 64 50 58 50 56 58 V 76 Z"
        fill={CREAM}
      />
      <path d="M 44 34 q 8 -10 16 -2 q 6 8 -2 12" fill="none" strokeWidth={2.6} />
      <g fill="none" strokeWidth={2.8} stroke={GREEN}>
        <path d="M 86 26 q 10 16 0 32" />
        <path d="M 98 16 q 16 26 0 52" />
      </g>
    </Ink>
  );
}

/** A building with columns. An institution, a state, a court, a school. */
function Institution() {
  return (
    <Ink>
      <path d="M 12 30 L 60 8 L 108 30 Z" fill={CREAM} />
      <path d="M 18 30 h 84 v 8 h -84 z" fill={PAPER} />
      <g fill={PAPER}>
        <path d="M 26 38 h 12 v 28 h -12 z" />
        <path d="M 54 38 h 12 v 28 h -12 z" />
        <path d="M 82 38 h 12 v 28 h -12 z" />
      </g>
      <path d="M 14 66 h 92 v 10 h -92 z" fill={GREY} />
    </Ink>
  );
}

export const MOTIF_ART = {
  crown: Crown,
  flag: Flag,
  battle: Battle,
  carriage: Carriage,
  ship: Ship,
  assembly: Assembly,
  law: Law,
  money: Money,
  factory: Factory,
  treaty: Treaty,
  map: MapMotif,
  idea: Idea,
  flask: Flask,
  cell: Cell,
  atom: Atom,
  brain: Brain,
  equation: Equation,
  graph: Graph,
  book: Book,
  clock: Clock,
  institution: Institution,
  eye: Eye,
  ear: Ear,
} as const;

export type MotifName = keyof typeof MOTIF_ART;

/** The wash behind each scene, so a map reads as a set of coloured tiles from
 *  across the room and the colour means something when you get closer. */
export const MOTIF_TINT: Record<MotifName, string> = {
  crown: "#F3E2C0",
  flag: "#DCE6F0",
  battle: "#E8D9CF",
  carriage: "#E3E0D6",
  ship: "#D8E6EC",
  assembly: "#EDE3D2",
  law: "#EFE7D6",
  money: "#F3E7C4",
  factory: "#E2E2DC",
  treaty: "#E9E2D4",
  map: "#E6E7D8",
  idea: "#F5E9C8",
  flask: "#DCEBDE",
  cell: "#DDEBDD",
  atom: "#E4E0EC",
  brain: "#F0DFDC",
  equation: "#DFE7E1",
  graph: "#E2E9E4",
  book: "#EDE7DA",
  clock: "#E6E3DA",
  institution: "#E9E6DC",
  eye: "#DCE8F0",
  ear: "#E4EADD",
};

export function Motif({ name, className }: { name: MotifName; className?: string }) {
  const Art = MOTIF_ART[name];
  return (
    <svg
      viewBox={`0 0 ${MOTIF_BOX.width} ${MOTIF_BOX.height}`}
      className={className}
      aria-hidden
      focusable="false"
    >
      <Art />
    </svg>
  );
}
