import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function MonthSelector({
  basePath,
  label,
  prevParam,
  nextParam,
  isCurrentMonth,
  paramName = 'mes',
}: {
  basePath: string
  label: string
  prevParam: string
  nextParam: string
  isCurrentMonth: boolean
  // 'mes' (YYYY-MM) o 'anio' (YYYY) -- el mismo selector sirve para los dos modos
  paramName?: string
}) {
  return (
    <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg px-1 py-1">
      <Link
        href={`${basePath}?${paramName}=${prevParam}`}
        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
      >
        <ChevronLeft size={16} />
      </Link>
      <span className="text-sm font-medium text-zinc-700 px-2 min-w-[120px] text-center capitalize">
        {label}
      </span>
      {isCurrentMonth ? (
        <span className="p-1.5 text-zinc-200">
          <ChevronRight size={16} />
        </span>
      ) : (
        <Link
          href={`${basePath}?${paramName}=${nextParam}`}
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
        >
          <ChevronRight size={16} />
        </Link>
      )}
    </div>
  )
}
