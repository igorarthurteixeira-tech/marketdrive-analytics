import { Star } from "lucide-react"

interface Props {
  rating: number
  showValue?: boolean
}

export default function StarRating({ rating, showValue = true }: Props) {
  const fullStars = Math.floor(rating)

  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={16}
          className={
            i < fullStars
              ? "fill-black text-black"
              : "text-gray-300"
          }
        />
      ))}
      {showValue ? (
        <span className="text-sm text-gray-600 ml-2">
          {rating.toFixed(1)}
        </span>
      ) : null}
    </div>
  )
}
