/** The cats.
 *
 *  Drawn rather than imported: a sticker sheet is a raster at one size, in one
 *  set of colours, and these have to sit on a ridge at 34px in the background
 *  and above an empty state at 96px without going soft. Flat fills and one
 *  rounded outline weight, the way the reference sheet is drawn.
 *
 *  A pose is a `<g>` in its own local coordinates, so the same shape can be
 *  placed inside the landscape's SVG with a transform, or wrapped in an `<svg>`
 *  of its own by `<Cat/>`. Nothing here is random: a cat that changed pose on
 *  every render would be noise on screen and a flaky test underneath, so the
 *  pose and the coat are chosen from a seed string.
 */

export const POSES = ["curl", "loaf", "sit", "stretch"] as const;
export const COATS = ["ginger", "grey", "cream", "calico", "brown"] as const;

export type Pose = (typeof POSES)[number];
export type Coat = (typeof COATS)[number];

type Palette = { fur: string; patch: string; line: string };

/** Straight from the sticker sheet: warm brown outlines rather than black, and
 *  a second, darker tone per coat for the stripes and the patches. */
const COAT_COLOURS: Record<Coat, Palette> = {
  ginger: { fur: "#F2A75C", patch: "#DE8938", line: "#7A4F33" },
  grey: { fur: "#C3B9AF", patch: "#A1948A", line: "#6B5B4E" },
  cream: { fur: "#F8F0E1", patch: "#E7D7BE", line: "#8A6A4F" },
  calico: { fur: "#FBF4E8", patch: "#F0A75C", line: "#7A4F33" },
  brown: { fur: "#8D7261", patch: "#71594A", line: "#4A382E" },
};

/** Each pose's natural box, so `<Cat/>` can give it a viewBox that fits and the
 *  landscape can scale it by a known width instead of by trial. */
const POSE_BOX: Record<Pose, { width: number; height: number }> = {
  // Wide enough for the tail. The first cut of these boxes stopped at the body and
  // every tail was sliced off at the edge of its own drawing.
  curl: { width: 140, height: 108 },
  loaf: { width: 156, height: 100 },
  sit: { width: 104, height: 118 },
  stretch: { width: 150, height: 86 },
};

/** Asleep: two arcs. Awake: two dots and a pair of whisker strokes. */
function Face({
  c,
  x,
  y,
  asleep,
  scale = 1,
}: {
  c: Palette;
  x: number;
  y: number;
  asleep: boolean;
  scale?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {asleep ? (
        <>
          <path d="M -13 0 q 6 6 12 0" fill="none" stroke={c.line} strokeWidth={3} />
          <path d="M 1 0 q 6 6 12 0" fill="none" stroke={c.line} strokeWidth={3} />
        </>
      ) : (
        <>
          <circle cx={-8} cy={-1} r={2.8} fill={c.line} />
          <circle cx={8} cy={-1} r={2.8} fill={c.line} />
        </>
      )}
      {/* The nose is the one warm accent on a face this small; without it the
          head reads as a blank stone. */}
      <path d="M -3.2 7 h 6.4 l -3.2 3.6 z" fill="#D98A7B" stroke="none" />
    </g>
  );
}

/** Curled into a ball with the tail brought round — the sheet's sleeping cat. */
function Curl({ c }: { c: Palette }) {
  return (
    <>
      <path d="M 34 30 L 28 6 L 55 20 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      <path d="M 92 30 L 98 6 L 71 20 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      <path
        d="M 63 16 C 91 16 107 36 107 60 C 107 79 90 90 63 90 C 36 90 19 79 19 60 C 19 36 35 16 63 16 Z"
        fill={c.fur}
        stroke={c.line}
        strokeWidth={5}
      />
      {/* Stripes down the curve of the back. */}
      <path d="M 78 26 q 10 7 13 16" fill="none" stroke={c.patch} strokeWidth={5} />
      <path d="M 90 46 q 11 5 14 13" fill="none" stroke={c.patch} strokeWidth={5} />
      <Face c={c} x={56} y={52} asleep />
      {/* The tail comes round the front and meets the chin — drawn last, on top
          of the body, because that is what makes the cat read as curled rather
          than as a ball with something behind it. */}
      <path
        d="M 112 62 C 120 82 100 95 72 93 C 56 92 44 88 36 82"
        fill="none"
        stroke={c.line}
        strokeWidth={15}
      />
      <path
        d="M 112 62 C 120 82 100 95 72 93 C 56 92 44 88 36 82"
        fill="none"
        stroke={c.fur}
        strokeWidth={9}
      />
      <path d="M 96 88 q 8 -3 12 -9" fill="none" stroke={c.patch} strokeWidth={4} />
    </>
  );
}

/** Sitting with the legs folded under — a loaf of bread with ears. */
function Loaf({ c }: { c: Palette }) {
  return (
    <>
      {/* Tail laid out flat on the floor beside it, not curled: a loaf is awake
          enough to have put its tail down somewhere. */}
      <path
        d="M 114 82 C 136 84 142 68 131 58"
        fill="none"
        stroke={c.line}
        strokeWidth={15}
      />
      <path
        d="M 114 82 C 136 84 142 68 131 58"
        fill="none"
        stroke={c.fur}
        strokeWidth={9}
      />
      <path d="M 36 40 L 31 14 L 59 28 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      <path d="M 94 40 L 99 14 L 71 28 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      {/* Low and wide, sitting flat on its own base — the whole silhouette is
          the difference between this and the curled one. */}
      <path
        d="M 14 78 C 10 52 34 30 65 30 C 96 30 120 52 116 78 C 115 85 110 88 102 88 L 28 88 C 20 88 15 85 14 78 Z"
        fill={c.fur}
        stroke={c.line}
        strokeWidth={5}
      />
      <path d="M 82 40 q 12 6 16 15" fill="none" stroke={c.patch} strokeWidth={5} />
      <path d="M 98 58 q 11 4 15 11" fill="none" stroke={c.patch} strokeWidth={5} />
      <Face c={c} x={57} y={56} asleep />
      {/* Two front paws poking out at the base. */}
      <path d="M 40 88 v -9 q 7 -4 13 0 v 9" fill="none" stroke={c.line} strokeWidth={3.5} />
      <path d="M 66 88 v -9 q 7 -4 13 0 v 9" fill="none" stroke={c.line} strokeWidth={3.5} />
    </>
  );
}

/** Upright, awake, tail laid along the ground. The one that looks back at you. */
function Sit({ c }: { c: Palette }) {
  return (
    <>
      <path
        d="M 78 104 C 96 102 94 76 79 74"
        fill="none"
        stroke={c.line}
        strokeWidth={14}
      />
      <path
        d="M 78 104 C 96 102 94 76 79 74"
        fill="none"
        stroke={c.fur}
        strokeWidth={8}
      />
      {/* Haunch and body: a teardrop widening to the floor. */}
      <path
        d="M 48 44 C 70 44 84 66 84 90 C 84 102 76 108 62 108 L 34 108 C 20 108 12 102 12 90 C 12 66 26 44 48 44 Z"
        fill={c.fur}
        stroke={c.line}
        strokeWidth={5}
      />
      <path d="M 26 26 L 21 4 L 45 17 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      <path d="M 70 26 L 75 4 L 51 17 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      <path
        d="M 48 10 C 68 10 80 24 80 40 C 80 56 66 64 48 64 C 30 64 16 56 16 40 C 16 24 28 10 48 10 Z"
        fill={c.fur}
        stroke={c.line}
        strokeWidth={5}
      />
      {/* A patch over one eye and ear, like the calico on the sheet. */}
      <path
        d="M 48 11 C 62 11 74 19 78 32 C 70 38 58 38 50 33 C 45 26 45 17 48 11 Z"
        fill={c.patch}
        opacity={0.85}
        stroke="none"
      />
      <Face c={c} x={48} y={38} asleep={false} />
      <path d="M 30 100 v -8 q 7 -4 13 0 v 8" fill="none" stroke={c.line} strokeWidth={3.5} />
      <path d="M 52 100 v -8 q 7 -4 13 0 v 8" fill="none" stroke={c.line} strokeWidth={3.5} />
    </>
  );
}

/** Stretched out on its side, back legs trailing, tail flicked up. */
function Stretch({ c }: { c: Palette }) {
  return (
    <>
      <path
        d="M 122 56 C 140 54 140 28 124 26"
        fill="none"
        stroke={c.line}
        strokeWidth={14}
      />
      <path
        d="M 122 56 C 140 54 140 28 124 26"
        fill="none"
        stroke={c.fur}
        strokeWidth={8}
      />
      <path d="M 26 34 L 20 12 L 44 24 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      <path d="M 66 34 L 71 12 L 48 24 Z" fill={c.fur} stroke={c.line} strokeWidth={5} />
      <path
        d="M 46 20 C 66 20 78 32 78 46 C 92 44 112 48 120 60 C 126 69 120 76 106 76 L 26 76 C 14 76 8 68 12 56 C 15 47 24 40 34 38 C 32 28 38 20 46 20 Z"
        fill={c.fur}
        stroke={c.line}
        strokeWidth={5}
      />
      <path d="M 86 52 q 6 9 4 20" fill="none" stroke={c.patch} strokeWidth={5} />
      <path d="M 100 52 q 6 9 4 21" fill="none" stroke={c.patch} strokeWidth={5} />
      <Face c={c} x={45} y={44} asleep={false} />
      {/* The forelegs reaching out in front, which is the whole point of a stretch. */}
      <path d="M 24 76 q 2 -10 12 -12" fill="none" stroke={c.line} strokeWidth={3.5} />
      <path d="M 44 76 q 2 -9 11 -11" fill="none" stroke={c.line} strokeWidth={3.5} />
    </>
  );
}

const DRAW: Record<Pose, (props: { c: Palette }) => React.JSX.Element> = {
  curl: Curl,
  loaf: Loaf,
  sit: Sit,
  stretch: Stretch,
};

/** A cat as a `<g>`, for placing inside a larger drawing. */
export function CatShape({
  pose,
  coat,
  transform,
  opacity,
}: {
  pose: Pose;
  coat: Coat;
  transform?: string;
  opacity?: number;
}) {
  const Draw = DRAW[pose];
  return (
    <g transform={transform} opacity={opacity} strokeLinecap="round" strokeLinejoin="round">
      <Draw c={COAT_COLOURS[coat]} />
    </g>
  );
}

/** A small, stable hash. The point is only that the same seed gives the same
 *  cat on the server and on the client — `Math.random()` here would hydrate to
 *  a different animal than it rendered. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function catFor(seed: string): { pose: Pose; coat: Coat } {
  const h = hash(seed);
  return { pose: POSES[h % POSES.length], coat: COATS[(h >> 3) % COATS.length] };
}

/** A cat on its own, sized by width. Decorative by default: it is a drawing
 *  beside the words, and a screen reader reading "cat" between a heading and
 *  its explanation is noise. Pass a `label` on the rare one that carries
 *  meaning. */
export function Cat({
  seed,
  pose,
  coat,
  width = 96,
  className,
  label,
}: {
  /** Picks the pose and coat, stably. Give it the heading it sits under. */
  seed?: string;
  pose?: Pose;
  coat?: Coat;
  width?: number;
  className?: string;
  label?: string;
}) {
  const chosen = catFor(seed ?? "focusflow");
  const usePose = pose ?? chosen.pose;
  const useCoat = coat ?? chosen.coat;
  const box = POSE_BOX[usePose];

  return (
    <svg
      viewBox={`0 0 ${box.width} ${box.height}`}
      width={width}
      height={(width * box.height) / box.width}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <CatShape pose={usePose} coat={useCoat} />
    </svg>
  );
}
