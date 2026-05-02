interface Props {
  points?: { x: number; y: number }[];
  height?: number;
}

export const CrosshairCursor = ({ points, height }: Props) => {
  if (points == null || points.length === 0) return null;
  const { x } = points[0];
  return (
    <line
      x1={x}
      x2={x}
      y1={0}
      y2={height ?? 0}
      stroke="var(--border)"
      strokeWidth={1}
      strokeDasharray="3 3"
    />
  );
};
