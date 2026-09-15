import { Star } from "lucide-react";

interface RatingStarsProps {
  rating: number;
  count?: number | undefined;
  size?: "sm" | "md";
}

export function RatingStars({ rating, count, size = "sm" }: RatingStarsProps) {
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-1 text-warning" aria-label={`${rating}/5 sao`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star key={index} className={index < rounded ? "fill-current" : "text-ink-tertiary"} size={size === "sm" ? 14 : 18} />
      ))}
      {typeof count === "number" && <span className="ml-1 text-xs text-ink-tertiary">({count})</span>}
    </div>
  );
}
