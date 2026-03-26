type TrendState = "rising" | "flat" | "declining" | "volatile";

const PATHS: Record<TrendState, string> = {
  rising: "M0 28 Q10 24, 20 20 Q30 16, 40 14 Q50 10, 60 6 Q70 3, 80 2",
  flat: "M0 16 Q10 15, 20 16 Q30 17, 40 16 Q50 15, 60 16 Q70 17, 80 16",
  declining: "M0 4 Q10 6, 20 10 Q30 14, 40 18 Q50 22, 60 24 Q70 27, 80 28",
  volatile: "M0 20 Q10 6, 20 26 Q30 8, 40 22 Q50 10, 60 24 Q70 12, 80 18",
};

const COLORS: Record<TrendState, string> = {
  rising: "#34d399",
  flat: "#60a5fa",
  declining: "#f87171",
  volatile: "#fbbf24",
};

interface Props {
  trend: TrendState;
  className?: string;
}

export default function MiniCurve({ trend, className }: Props) {
  const path = PATHS[trend];
  const color = COLORS[trend];

  return (
    <svg
      viewBox="0 0 80 32"
      fill="none"
      className={className || "w-20 h-8"}
      preserveAspectRatio="none"
    >
      <path d={path} stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path
        d={`${path} L80 32 L0 32 Z`}
        fill={color}
        fillOpacity="0.1"
      />
    </svg>
  );
}

export type { TrendState };
