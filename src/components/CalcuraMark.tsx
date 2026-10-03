// The Calcura integral sign, drawn from the master outline used by the app icon and the app menu:
// calcura/branding/calcura-integral-mark.svg (KaTeX Size1 \int). Do not substitute a font glyph
// or another integral for the logo.
const MARK_WIDTH = 555;
const MARK_HEIGHT = 1111;
const MARK_PATH =
  'M98.0 1000.0Q98.0 1030.0 74.0 1042.0Q73.0 1043.0 69.0 1044.5Q65.0 1046.0 61.0 1047.0L58.0 1049.0Q58.0 1050.0 63.5 1055.0Q69.0 1060.0 73.0 1062.0Q89.0 1074.0 112.0 1074.0Q131.0 1074.0 144.0 1065.0Q168.0 1051.0 180.0 1013.0Q197.0 965.0 212.0 758.0Q226.0 568.0 242.0 438.0Q268.0 235.0 272.0 214.0Q297.0 70.0 369.0 23.0Q394.0 7.0 424.0 1.0Q426.0 1.0 433.5 0.5Q441.0 0.0 446.0 0.0Q493.0 3.0 524.0 33.0Q555.0 63.0 555.0 110.0Q555.0 132.0 541.0 146.0Q527.0 160.0 506.0 160.0Q485.0 160.0 471.0 145.5Q457.0 131.0 457.0 111.0Q457.0 81.0 481.0 69.0Q482.0 68.0 486.0 66.5Q490.0 65.0 493.0 63.0L497.0 62.0Q497.0 57.0 482.0 49.0Q465.0 37.0 443.0 37.0Q399.0 37.0 379.0 89.0Q367.0 118.0 360.5 168.5Q354.0 219.0 344.0 353.0Q330.0 541.0 314.0 672.0Q294.0 844.0 284.0 896.0Q255.0 1056.0 170.0 1098.0Q144.0 1111.0 114.0 1111.0Q42.0 1111.0 12.0 1049.0Q0.0 1028.0 0.0 1001.0Q0.0 979.0 14.0 965.0Q28.0 951.0 49.0 951.0Q70.0 951.0 84.0 965.5Q98.0 980.0 98.0 1000.0Z';

/**
 * `weight` thickens the outline (in path units) so the hairline tails stay visible
 * at small sizes; the viewBox grows with it so the stroke is never clipped.
 */
export function CalcuraIntegralMark({
  className,
  weight = 0,
}: {
  className?: string;
  weight?: number;
}) {
  const pad = weight / 2;
  return (
    <svg
      className={className}
      viewBox={`${-pad} ${-pad} ${MARK_WIDTH + weight} ${MARK_HEIGHT + weight}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={MARK_PATH}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={weight}
        strokeLinejoin="round"
      />
    </svg>
  );
}
