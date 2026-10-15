// PostgREST (Supabase) corta cualquier consulta a 1000 filas si no se pagina.
// fetchAll pide de a `pageSize` con .range() hasta traer todo.
// IMPORTANTE: el query debe tener un orden estable (ej. created_at + id) para no repetir/saltear filas entre páginas.
export async function fetchAll<T = any>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < pageSize) break
  }
  return all
}
