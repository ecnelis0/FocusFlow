/** The three ways material gets into the bank, drawn as cats.
 *
 *  Same hand as `cat.tsx` — flat fills, one rounded warm-brown outline weight —
 *  but these are scenes rather than poses: a cat is doing the thing the caption
 *  underneath names. Each sits in a coloured disc and is clipped to it, so a
 *  tail or an elbow that runs past the edge is cut by the circle instead of
 *  floating outside it.
 *
 *  Decorative. The caption beside each one says what it is, and a screen reader
 *  reading "a cat at a scanner" in between would be saying it twice.
 */

const LINE = "#6E4A34";
const GREY = { fur: "#C3B9AF", patch: "#A1948A", line: "#63544A" };
const CREAM = { fur: "#F8F0E1", patch: "#E7D7BE", line: LINE };

export type SceneKind = "pdf" | "video" | "notes";

const DISC: Record<SceneKind, string> = {
  pdf: "#BAD6EA",
  video: "#E4988F",
  notes: "#F2D275",
};

/** Ears, head, and a face — the part every scene repeats. */
function Head({
  x,
  y,
  r,
  coat,
  asleep = false,
  whiskers = true,
}: {
  x: number;
  y: number;
  r: number;
  coat: typeof GREY;
  asleep?: boolean;
  /** Off where something else is already on the face. Whiskers drawn across a
   *  pair of spectacles read as a scribble. */
  whiskers?: boolean;
}) {
  return (
    <g>
      {/* Short and upright. Tall ears swept outwards stop being a cat's. */}
      <path
        d={`M ${x - r * 0.88} ${y - r * 0.46} L ${x - r * 0.64} ${y - r * 1.3} L ${x - r * 0.14} ${y - r * 0.86} Z`}
        fill={coat.fur}
        stroke={coat.line}
        strokeWidth={4}
      />
      <path
        d={`M ${x + r * 0.88} ${y - r * 0.46} L ${x + r * 0.64} ${y - r * 1.3} L ${x + r * 0.14} ${y - r * 0.86} Z`}
        fill={coat.fur}
        stroke={coat.line}
        strokeWidth={4}
      />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.92} fill={coat.fur} stroke={coat.line} strokeWidth={4} />
      {asleep ? (
        <g fill="none" stroke={coat.line} strokeWidth={2.6} strokeLinecap="round">
          <path d={`M ${x - r * 0.62} ${y - r * 0.06} q ${r * 0.2} ${r * 0.22} ${r * 0.4} 0`} />
          <path d={`M ${x + r * 0.22} ${y - r * 0.06} q ${r * 0.2} ${r * 0.22} ${r * 0.4} 0`} />
        </g>
      ) : (
        <g fill={coat.line}>
          <circle cx={x - r * 0.42} cy={y - r * 0.06} r={r * 0.11} />
          <circle cx={x + r * 0.42} cy={y - r * 0.06} r={r * 0.11} />
        </g>
      )}
      <path
        d={`M ${x - r * 0.13} ${y + r * 0.26} h ${r * 0.26} l ${-r * 0.13} ${r * 0.16} z`}
        fill="#D98A7B"
      />
      {whiskers && (
        <g stroke={coat.line} strokeWidth={2} strokeLinecap="round" opacity={0.8}>
          <path d={`M ${x - r * 0.95} ${y + r * 0.18} h ${-r * 0.45}`} />
          <path d={`M ${x + r * 0.95} ${y + r * 0.18} h ${r * 0.45}`} />
        </g>
      )}
    </g>
  );
}

/** A cat at a flatbed scanner with an open book on the glass, in reading
 *  glasses — the one that turns paper into a PDF. */
function Pdf() {
  return (
    <g>
      {/* The sheet coming out, top right, so the disc is not empty up there. */}
      <g transform="rotate(8 150 52)">
        <path
          d="M 130 26 h 30 l 14 14 v 36 h -44 z"
          fill="#FBF8F1"
          stroke={LINE}
          strokeWidth={3.5}
          strokeLinejoin="round"
        />
        <path d="M 160 26 v 14 h 14" fill="none" stroke={LINE} strokeWidth={3.5} />
        <g stroke="#C4453A" strokeWidth={3} strokeLinecap="round">
          <path d="M 136 58 h 20" />
          <path d="M 136 66 h 12" />
        </g>
      </g>

      {/* Cat first: the scanner is drawn over its middle, which is what puts it
          behind the desk rather than balanced on top of one. */}
      <ellipse cx="96" cy="118" rx="42" ry="40" fill={GREY.fur} stroke={GREY.line} strokeWidth={4} />
      <Head x={96} y={72} r={28} coat={GREY} whiskers={false} />
      {/* Spectacles: rims around the eyes that are already there, not goggles
          over them. Barely tinted, so the face still shows through. */}
      <g fill="none" stroke={GREY.line} strokeWidth={3}>
        <circle cx="84" cy="70" r="9.5" fill="#FFFFFF" fillOpacity={0.28} />
        <circle cx="108" cy="70" r="9.5" fill="#FFFFFF" fillOpacity={0.28} />
        <path d="M 93.5 69 H 98.5" />
        <path d="M 74.5 68 L 67 65" />
        <path d="M 117.5 68 L 125 65" />
      </g>

      {/* The scanner: a dark body under a pale lid, with the seam between them
          drawn. One flat slab was reading as a table. */}
      <rect x="30" y="138" width="140" height="26" rx="7" fill="#9FB0BC" stroke={LINE} strokeWidth={4} />
      <rect x="36" y="128" width="128" height="14" rx="5" fill="#EDF2F6" stroke={LINE} strokeWidth={3.5} />
      <path d="M 40 142 H 160" stroke={LINE} strokeWidth={2} strokeOpacity={0.45} />
      {/* The open book on the glass: two pages, a spine, and the block of
          leaves under each, which is what makes it a book and not a card. */}
      <path
        d="M 100 116 C 88 106 74 104 60 108 L 60 126 C 74 122 88 124 100 132 C 112 124 126 122 140 126 L 140 108 C 126 104 112 106 100 116 Z"
        fill="#FDFBF6"
        stroke={LINE}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <path d="M 100 116 V 132" stroke={LINE} strokeWidth={2.5} />
      <g stroke="#BFB5A6" strokeWidth={2} strokeLinecap="round">
        <path d="M 70 114 q 12 -3 22 4" />
        <path d="M 70 120 q 12 -3 22 4" />
        <path d="M 130 114 q -12 -3 -22 4" />
        <path d="M 130 120 q -12 -3 -22 4" />
      </g>
      {/* Both forepaws on the page. */}
      <g fill={GREY.fur} stroke={GREY.line} strokeWidth={3.5}>
        <ellipse cx="66" cy="124" rx="11" ry="8" />
        <ellipse cx="134" cy="124" rx="11" ry="8" />
      </g>
    </g>
  );
}

/** A cat on a beanbag with a bowl, watching something with a play button on it.
 *  The lecture-shaped way material arrives. */
function Video() {
  return (
    <g>
      {/* The screen, on its stand. */}
      <rect x="112" y="38" width="84" height="60" rx="8" fill="#F7F5EF" stroke={LINE} strokeWidth={4} />
      <path d="M 146 98 v 12 h -14 l 0 6 h 42 l 0 -6 h -14 v -12 z" fill="#E7E2D8" stroke={LINE} strokeWidth={3.5} strokeLinejoin="round" />
      <rect x="136" y="54" width="36" height="26" rx="8" fill="#D63C2E" stroke={LINE} strokeWidth={3} />
      <path d="M 149 61 l 12 6 l -12 6 z" fill="#FFFFFF" />

      {/* Beanbag. */}
      <path
        d="M 12 156 C 8 126 28 106 60 104 C 92 102 112 120 112 142 C 112 154 106 162 94 164 L 28 168 C 18 168 13 164 12 156 Z"
        fill="#C74A3F"
        stroke={LINE}
        strokeWidth={4}
      />
      <path d="M 30 112 C 44 106 62 106 74 112" fill="none" stroke="#A73A31" strokeWidth={3.5} strokeLinecap="round" />

      {/* Cat lying back on it. */}
      <ellipse cx="70" cy="122" rx="44" ry="28" fill={CREAM.fur} stroke={CREAM.line} strokeWidth={4} />
      <path d="M 104 132 q 24 8 28 -6" fill="none" stroke={CREAM.line} strokeWidth={13} strokeLinecap="round" />
      <path d="M 104 132 q 24 8 28 -6" fill="none" stroke={CREAM.fur} strokeWidth={7} strokeLinecap="round" />
      <Head x={40} y={98} r={24} coat={CREAM} asleep />

      {/* The bowl, held up clear of the belly so it is a bowl and not a patch
          of cat. Noodles over the rim, steam above it, chopsticks out of it. */}
      <g stroke="#B9866A" strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.75}>
        <path d="M 62 92 q 5 -7 0 -13" />
        <path d="M 74 88 q 5 -8 0 -14" />
      </g>
      <path d="M 52 104 q 8 -7 16 0" fill="none" stroke="#E7B45F" strokeWidth={4} strokeLinecap="round" />
      <path d="M 68 104 q 8 -8 15 -1" fill="none" stroke="#E7B45F" strokeWidth={4} strokeLinecap="round" />
      <path
        d="M 46 104 h 44 a 22 22 0 0 1 -44 0 z"
        fill="#F6F1E4"
        stroke={LINE}
        strokeWidth={3.5}
        strokeLinejoin="round"
      />
      <path d="M 44 104 H 92" stroke={LINE} strokeWidth={3.5} strokeLinecap="round" />
      <g stroke={LINE} strokeWidth={3} strokeLinecap="round">
        <path d="M 60 98 l -14 -24" />
        <path d="M 66 98 l -9 -25" />
      </g>
      {/* Paws under the rim, holding it. */}
      <g fill={CREAM.fur} stroke={CREAM.line} strokeWidth={3.5}>
        <ellipse cx="46" cy="112" rx="10" ry="8" />
        <ellipse cx="90" cy="112" rx="10" ry="8" />
      </g>
    </g>
  );
}

/** A cat at a desk, writing. Notes typed or pasted in by hand. */
function Notes() {
  return (
    <g>
      {/* Cat behind the desk. */}
      <ellipse cx="104" cy="120" rx="40" ry="38" fill={GREY.fur} stroke={GREY.line} strokeWidth={4} />
      <path d="M 140 128 q 22 2 20 -14" fill="none" stroke={GREY.line} strokeWidth={13} strokeLinecap="round" />
      <path d="M 140 128 q 22 2 20 -14" fill="none" stroke={GREY.fur} strokeWidth={7} strokeLinecap="round" />
      <Head x={104} y={74} r={28} coat={GREY} />

      {/* Desk. */}
      <rect x="18" y="134" width="164" height="18" rx="5" fill="#CE9C5E" stroke={LINE} strokeWidth={4} />
      <rect x="30" y="152" width="14" height="26" rx="3" fill="#B98748" stroke={LINE} strokeWidth={3.5} />
      <rect x="156" y="152" width="14" height="26" rx="3" fill="#B98748" stroke={LINE} strokeWidth={3.5} />

      {/* Keyboard, pushed aside for the paper. */}
      <rect x="26" y="120" width="48" height="16" rx="4" fill="#EDE8DE" stroke={LINE} strokeWidth={3.5} />
      <g fill={LINE} opacity={0.55}>
        <circle cx="35" cy="126" r="1.8" />
        <circle cx="43" cy="126" r="1.8" />
        <circle cx="51" cy="126" r="1.8" />
        <circle cx="59" cy="126" r="1.8" />
        <circle cx="67" cy="126" r="1.8" />
        <rect x="35" y="130" width="32" height="3" rx="1.5" />
      </g>

      {/* The page being written on. */}
      <g transform="rotate(-5 128 126)">
        <rect x="94" y="112" width="68" height="26" rx="3" fill="#FDFBF6" stroke={LINE} strokeWidth={3.5} />
        <g stroke="#B9AFA2" strokeWidth={2.4} strokeLinecap="round">
          <path d="M 102 120 h 44" />
          <path d="M 102 127 h 52" />
          <path d="M 102 134 h 30" />
        </g>
      </g>

      {/* A paw on the page, and a pen in it. */}
      <g fill={GREY.fur} stroke={GREY.line} strokeWidth={3.5}>
        <ellipse cx="86" cy="126" rx="11" ry="8" />
        <ellipse cx="128" cy="118" rx="11" ry="8" />
      </g>
      <g transform="rotate(-28 132 112)">
        <rect x="126" y="76" width="9" height="36" rx="3" fill="#3F7355" stroke={LINE} strokeWidth={3} />
        <path d="M 126 112 h 9 l -4.5 9 z" fill="#F2D275" stroke={LINE} strokeWidth={2.6} strokeLinejoin="round" />
      </g>
    </g>
  );
}

const SCENES: Record<SceneKind, () => React.JSX.Element> = {
  pdf: Pdf,
  video: Video,
  notes: Notes,
};

export function CatScene({ kind, className }: { kind: SceneKind; className?: string }) {
  const Draw = SCENES[kind];
  const clip = `scene-${kind}`;
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden focusable="false">
      <defs>
        <clipPath id={clip}>
          <circle cx="100" cy="100" r="100" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="100" fill={DISC[kind]} />
      <g clipPath={`url(#${clip})`} strokeLinejoin="round" strokeLinecap="round">
        <Draw />
      </g>
    </svg>
  );
}
