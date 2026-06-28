'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="p-8 max-w-lg">
      <h2 className="text-lg font-semibold text-zinc-900 mb-2">Ocurrió un error</h2>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 mb-4">
        <p className="font-medium">{error.message}</p>
        {error.digest && (
          <p className="mt-1 text-red-500 text-xs">ID: {error.digest}</p>
        )}
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 bg-zinc-900 text-white text-sm rounded-lg hover:bg-zinc-700 transition-colors"
      >
        Reintentar
      </button>
    </div>
  )
}
