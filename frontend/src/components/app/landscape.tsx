import { CatShape } from "@/components/app/cat";

/** The page's ground: a blue-green landscape, painted in SVG.
 *
 *  Not a flat green. What makes a qinglü shanshui read as distance is that one
 *  hue is laid down three times at three strengths — pale sage at the horizon,
 *  mineral green through the middle ridges, deep malachite in the near rock —
 *  with a band of bare silk left between each rank for the cloud. Take the
 *  ranks away and you have a colour; keep them and you have air.
 *
 *  Every fill is a theme variable rather than a literal, so the whole painting
 *  follows `.dark` into the evening without a second copy of it existing.
 *
 *  Three rules that make this a background rather than a picture:
 *    - `fixed` and `-z-10`. A negative z-index child paints above the body's own
 *      background and below every in-flow element — exactly the stack a
 *      wallpaper wants.
 *    - `pointer-events-none`, so it can never take a click meant for the app. A
 *      full-viewport element that swallows hits is the oldest way to make a page
 *      look fine and behave as though it were frozen.
 *    - `aria-hidden`, so none of these paths becomes an accessible name.
 *
 *  The weight is in the margins and along the floor: the reading column lands in
 *  the middle, so the middle is where the picture is only cloud and open water.
 */

/** One peak. Chinese painting builds a range out of separate peaks with mist
 *  between them rather than one continuous wobble, and a bell curve with a
 *  movable apex covers the whole repertoire — `lean` below 0.5 throws the
 *  summit left, above it throws the summit right. Nothing in a range should
 *  lean the same way as its neighbour. */
function Peak({
  x,
  base,
  w,
  h,
  lean = 0.5,
  fill,
  opacity,
  contour,
}: {
  x: number;
  base: number;
  w: number;
  h: number;
  lean?: number;
  fill: string;
  opacity?: number;
  /** Ink along the skyline only. A contour taken all the way round a shape this
   *  size stops being a mountain and becomes a sticker. */
  contour?: number;
}) {
  const apex = x + w * lean;
  const ridge =
    `M ${x} ${base} C ${x + w * 0.1} ${base - h * 0.34} ${apex - w * 0.2} ${base - h * 0.93} ${apex} ${base - h}` +
    ` C ${apex + w * 0.2} ${base - h * 0.93} ${x + w * 0.9} ${base - h * 0.34} ${x + w} ${base}`;
  return (
    <g>
      <path d={`${ridge} Z`} fill={fill} opacity={opacity} />
      {contour ? (
        <path
          d={ridge}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2"
          strokeOpacity={contour}
        />
      ) : null}
    </g>
  );
}

/** The painting itself, minus any decision about how it is framed.
 *
 *  `p` prefixes the gradient and filter ids: the scene is rendered twice, and
 *  two elements in one document may not share an id. */
function Scene({ p }: { p: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${p}-silk`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--silk)" />
          <stop offset="48%" stopColor="var(--mist)" />
          <stop offset="100%" stopColor="var(--silk)" />
        </linearGradient>
        {/* Rock is lit along its top edge and sinks into its own shadow. */}
        <linearGradient id={`${p}-near`} x1="0.3" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor="var(--malachite)" />
          <stop offset="38%" stopColor="var(--jade)" />
          <stop offset="100%" stopColor="var(--jade)" />
        </linearGradient>
        <linearGradient id={`${p}-mid`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--malachite)" />
          <stop offset="72%" stopColor="var(--jade)" />
          <stop offset="100%" stopColor="var(--jade)" />
        </linearGradient>
        <filter id={`${p}-cloud`} x="-20%" y="-80%" width="140%" height="260%">
          <feGaussianBlur stdDeviation="17" />
        </filter>
        {/* The tooth of the paper: barely there at 4%, and the whole
            difference between a painting and a gradient. */}
        <filter id={`${p}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="1440" height="900" fill={`url(#${p}-silk)`} />

      {/* ---- Far rank. Highest, palest, least detailed: distance. ---- */}
      <g opacity="0.7">
        <Peak x={20} base={452} w={280} h={150} lean={0.58} fill="var(--sage)" contour={0.22} />
        <Peak x={196} base={452} w={300} h={214} lean={0.42} fill="var(--sage)" contour={0.32} />
        <Peak x={430} base={452} w={250} h={124} lean={0.6} fill="var(--sage)" contour={0.22} />
        <Peak x={620} base={452} w={300} h={176} lean={0.48} fill="var(--sage)" contour={0.22} />
        <Peak x={856} base={452} w={260} h={132} lean={0.38} fill="var(--sage)" contour={0.22} />
        <Peak x={1036} base={452} w={330} h={236} lean={0.56} fill="var(--sage)" contour={0.26} />
        <Peak x={1284} base={452} w={230} h={146} lean={0.44} fill="var(--sage)" contour={0.22} />
      </g>

      {/* Cloud caught between the far and middle ranks. */}
      <g filter={`url(#${p}-cloud)`} opacity="0.72">
        <ellipse cx="300" cy="452" rx="300" ry="18" fill="var(--silk)" />
        <ellipse cx="900" cy="470" rx="360" ry="16" fill="var(--silk)" />
        <ellipse cx="1330" cy="444" rx="210" ry="15" fill="var(--silk)" />
      </g>

      {/* ---- Middle rank. Tall at the two edges, low across the centre, which
              is what keeps the reading column over open cloud. ---- */}
      <g opacity="0.82">
        <Peak x={-80} base={648} w={300} h={216} lean={0.62} fill={`url(#${p}-mid)`} contour={0.32} />
        <Peak x={120} base={648} w={290} h={272} lean={0.44} fill={`url(#${p}-mid)`} contour={0.22} />
        <Peak x={322} base={648} w={250} h={158} lean={0.56} fill={`url(#${p}-mid)`} contour={0.3} />
        <Peak x={548} base={648} w={310} h={104} lean={0.5} fill={`url(#${p}-mid)`} contour={0.24} />
        <Peak x={800} base={648} w={270} h={126} lean={0.42} fill={`url(#${p}-mid)`} contour={0.24} />
        <Peak x={988} base={648} w={290} h={238} lean={0.58} fill={`url(#${p}-mid)`} contour={0.32} />
        <Peak x={1192} base={648} w={320} h={286} lean={0.46} fill={`url(#${p}-mid)`} contour={0.22} />
      </g>

      <g filter={`url(#${p}-cloud)`} opacity="0.6">
        <ellipse cx="520" cy="646" rx="340" ry="19" fill="var(--silk)" />
        <ellipse cx="1120" cy="666" rx="240" ry="16" fill="var(--silk)" />
      </g>

      {/* ---- The water, laid down before the near rock stands in it. ---- */}
      <rect x="0" y="786" width="1440" height="114" fill="var(--sage)" opacity="0.34" />
      <g stroke="var(--ink)" strokeOpacity="0.18" strokeWidth="2" fill="none">
        <path d="M 400 812 q 18 -8 36 0 q 18 8 36 0" />
        <path d="M 500 846 q 18 -8 36 0 q 18 8 36 0" />
        <path d="M 392 876 q 18 -8 36 0 q 18 8 36 0" />
        <path d="M 812 822 q 18 -8 36 0 q 18 8 36 0" />
        <path d="M 884 864 q 18 -8 36 0 q 18 8 36 0" />
        <path d="M 996 836 q 18 -8 36 0 q 18 8 36 0" />
        <path d="M 640 884 q 18 -8 36 0 q 18 8 36 0" />
      </g>

      {/* ---- Near rock: the two crags the page sits between. Drawn by hand
              rather than as bells — near rock is where the picture gets its
              character, and a bell curve has none. ---- */}
      <g>
        {/* Left crag, with a flat shoulder near the top for a cat to sit on. */}
        <path
          fill={`url(#${p}-near)`}
          d="M -60 900 L -60 712 C -44 678 -18 654 18 642 C 54 630 98 626 134 636 C 162 644 180 664 192 692 C 208 730 228 774 254 814 C 274 845 290 874 298 900 Z"
        />
        <path
          fill="none"
          stroke="var(--ochre)"
          strokeWidth="5"
          strokeOpacity="0.55"
          d="M -60 712 C -44 678 -18 654 18 642 C 54 630 98 626 134 636"
        />
        <path
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.5"
          strokeOpacity="0.38"
          d="M -60 712 C -44 678 -18 654 18 642 C 54 630 98 626 134 636 C 162 644 180 664 192 692 C 208 730 228 774 254 814"
        />
        {/* Cun — the texture strokes a landscape is built from. Short, curved,
            following the fall of the rock, never crossing. */}
        <g fill="none" stroke="var(--ink)" strokeOpacity="0.15" strokeWidth="2">
          <path d="M -20 900 C 0 838 26 790 64 758" />
          <path d="M 64 758 C 100 740 136 754 158 790" />
          <path d="M -48 800 C -6 782 44 788 78 812" />
          <path d="M 120 680 C 140 692 152 712 158 736" />
          <path d="M 40 676 C 66 672 92 678 110 692" />
        </g>

        {/* Right crag. */}
        <path
          fill={`url(#${p}-near)`}
          d="M 1500 900 L 1500 694 C 1482 662 1452 640 1414 632 C 1374 624 1332 626 1300 640 C 1270 653 1250 676 1238 704 C 1222 742 1200 784 1174 822 C 1154 851 1140 876 1134 900 Z"
        />
        <path
          fill="none"
          stroke="var(--ochre)"
          strokeWidth="5"
          strokeOpacity="0.55"
          d="M 1500 694 C 1482 662 1452 640 1414 632 C 1374 624 1332 626 1300 640"
        />
        <path
          fill="none"
          stroke="var(--ink)"
          strokeWidth="2.5"
          strokeOpacity="0.38"
          d="M 1500 694 C 1482 662 1452 640 1414 632 C 1374 624 1332 626 1300 640 C 1270 653 1250 676 1238 704 C 1222 742 1200 784 1174 822"
        />
        <g fill="none" stroke="var(--ink)" strokeOpacity="0.15" strokeWidth="2">
          <path d="M 1440 900 C 1420 840 1386 792 1344 762" />
          <path d="M 1344 762 C 1306 746 1272 762 1250 798" />
          <path d="M 1470 806 C 1430 786 1382 792 1348 816" />
          <path d="M 1330 676 C 1310 688 1296 708 1290 732" />
        </g>

        {/* A rock standing in the water, so the middle distance is not empty. */}
        <path
          fill="var(--jade)"
          opacity="0.92"
          d="M 604 900 C 608 848 632 812 670 804 C 708 796 740 820 754 860 C 760 878 764 892 766 900 Z"
        />
        <path
          fill="none"
          stroke="var(--ochre)"
          strokeWidth="4"
          strokeOpacity="0.5"
          d="M 628 852 C 642 820 650 808 670 804 C 700 798 728 820 744 846"
        />
      </g>

      {/* The fall, off the left crag's flank into the water. */}
      <g opacity="0.8">
        <path
          fill="var(--silk)"
          d="M 200 700 C 208 742 220 782 238 812 L 214 818 C 196 784 188 742 186 702 Z"
        />
        <path
          fill="none"
          stroke="var(--ink)"
          strokeOpacity="0.16"
          strokeWidth="1.5"
          d="M 200 700 C 208 742 220 782 238 812"
        />
        {/* Where it lands. */}
        <ellipse cx="226" cy="822" rx="26" ry="5" fill="var(--silk)" opacity="0.7" />
      </g>

      {/* A boat, with the last cat aboard. The water was the one part of the
          picture with nothing happening in it. */}
      <g transform="translate(952 836)">
        <path
          d="M 0 10 C 12 24 76 24 88 10 C 66 4 22 4 0 10 Z"
          fill="var(--ochre)"
          stroke="var(--ink)"
          strokeOpacity="0.45"
          strokeWidth="2"
        />
        <path d="M 44 8 V -22" stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="2" />
        <path
          d="M 46 -22 C 62 -18 68 -8 68 4 L 46 6 Z"
          fill="var(--silk)"
          stroke="var(--ink)"
          strokeOpacity="0.3"
          strokeWidth="1.5"
        />
        <CatShape pose="sit" coat="brown" transform="translate(6 -30) scale(0.3)" />
      </g>

      {/* ---- The signs of people: one pavilion, a few pines. ---- */}
      <g transform="translate(234 462) scale(0.95)">
        <path
          fill="var(--ochre)"
          stroke="var(--ink)"
          strokeOpacity="0.45"
          strokeWidth="1.5"
          d="M 40 22 C 28 22 10 30 0 40 C 14 38 22 37 40 37 C 58 37 66 38 80 40 C 70 30 52 22 40 22 Z"
        />
        <path
          fill="var(--ochre)"
          opacity="0.9"
          d="M 40 4 C 32 4 20 12 12 22 C 22 19 30 18 40 18 C 50 18 58 19 68 22 C 60 12 48 4 40 4 Z"
        />
        <g stroke="var(--cinnabar)" strokeWidth="3" strokeLinecap="round">
          <path d="M 14 40 v 20" />
          <path d="M 40 40 v 20" />
          <path d="M 66 40 v 20" />
        </g>
        <path stroke="var(--ink)" strokeOpacity="0.4" strokeWidth="2" d="M 8 61 H 72" />
      </g>

      {/* A trunk and two tiers. Anything more at this size is mud. */}
      <g stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="2" fill="var(--jade)">
        <g transform="translate(112 592) scale(0.8)">
          <path d="M 10 46 v -22" strokeOpacity="0.6" />
          <path d="M 10 0 L 24 18 H -4 Z" />
          <path d="M 10 14 L 27 34 H -7 Z" />
        </g>
        <g transform="translate(150 610) scale(0.62)">
          <path d="M 10 46 v -22" strokeOpacity="0.6" />
          <path d="M 10 0 L 24 18 H -4 Z" />
          <path d="M 10 14 L 27 34 H -7 Z" />
        </g>
        <g transform="translate(1382 588) scale(0.78)">
          <path d="M 10 46 v -22" strokeOpacity="0.6" />
          <path d="M 10 0 L 24 18 H -4 Z" />
          <path d="M 10 14 L 27 34 H -7 Z" />
        </g>
        <g transform="translate(1342 606) scale(0.6)">
          <path d="M 10 46 v -22" strokeOpacity="0.6" />
          <path d="M 10 0 L 24 18 H -4 Z" />
          <path d="M 10 14 L 27 34 H -7 Z" />
        </g>
      </g>

      {/* ---- The figures. In the painting these are scholars on the path;
              here they are cats, which is the same idea and better company.
              Three, on the ledges the rock was drawn with: enough to read as
              inhabitants, few enough not to read as a pattern. ---- */}
      <CatShape pose="curl" coat="ginger" transform="translate(16 586) scale(0.58)" />
      <CatShape pose="sit" coat="grey" transform="translate(1316 560) scale(0.58)" />
      <CatShape pose="loaf" coat="calico" transform="translate(632 762) scale(0.46)" />

      {/* The seal, where a painter's would be: high on the empty side, away
          from the picture rather than on top of it. */}
      <g transform="translate(1352 84)" opacity="0.9">
        <rect width="36" height="36" rx="5" fill="var(--cinnabar)" />
        {/* Not a letter: the squared-off strokes of a carved name seal. */}
        <g stroke="var(--silk)" strokeWidth="2.4" strokeLinecap="square" opacity="0.92">
          <path d="M 9 10 H 27" />
          <path d="M 9 18 H 27" />
          <path d="M 9 26 H 27" />
          <path d="M 15 10 V 26" />
          <path d="M 21 10 V 26" />
        </g>
      </g>

      <rect width="1440" height="900" filter={`url(#${p}-grain)`} opacity="0.04" />
    </>
  );
}

export function Landscape() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Two crops of one painting. `slice` scales to cover, so on a phone the
          wide composition would be cropped to its own middle — which is the one
          part deliberately left as open cloud, and reads as a blank page. The
          narrow crop takes the left third instead: crag, waterfall, pavilion,
          and a cat on the ledge. */}
      <svg
        className="hidden h-full w-full sm:block"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <Scene p="ffw" />
      </svg>
      <svg
        className="h-full w-full sm:hidden"
        viewBox="0 96 640 804"
        preserveAspectRatio="xMidYMax slice"
        focusable="false"
      >
        <Scene p="ffn" />
      </svg>
    </div>
  );
}
