'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, Check, X, ChevronDown, ChevronRight } from 'lucide-react'

interface Category {
  id: string
  name: string
  slug: string
  active: boolean
  sort_order: number
  parent_id: string | null
}

interface CategoryTree extends Category {
  subcategories: Category[]
}

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function CategoriasPage() {
  const supabase = createClient()
  const [allCats, setAllCats] = useState<Category[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Add new top-level category
  const [addingTop, setAddingTop] = useState(false)
  const [newTopName, setNewTopName] = useState('')

  // Add subcategory
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // Expand / collapse top-level categories
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return
      setTenantId(userRow.tenant_id)
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug, active, sort_order, parent_id')
        .eq('tenant_id', userRow.tenant_id)
        .order('sort_order')
      setAllCats(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // Build tree: top-level + their subcategories
  const topLevel: CategoryTree[] = allCats
    .filter(c => !c.parent_id)
    .map(c => ({
      ...c,
      subcategories: allCats.filter(s => s.parent_id === c.id).sort((a, b) => a.sort_order - b.sort_order),
    }))

  async function handleAddTop() {
    if (!newTopName.trim() || !tenantId) return
    setSaving(true)
    const maxOrder = allCats.filter(c => !c.parent_id).length > 0
      ? Math.max(...allCats.filter(c => !c.parent_id).map(c => c.sort_order)) + 1
      : 0
    const { data, error } = await supabase
      .from('categories')
      .insert({ tenant_id: tenantId, name: newTopName.trim(), slug: slugify(newTopName), active: true, sort_order: maxOrder, parent_id: null })
      .select()
      .single()
    if (!error && data) {
      setAllCats(prev => [...prev, data])
      setNewTopName('')
      setAddingTop(false)
    }
    setSaving(false)
  }

  async function handleAddSub(parentId: string) {
    if (!newSubName.trim() || !tenantId) return
    setSaving(true)
    const siblings = allCats.filter(c => c.parent_id === parentId)
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('categories')
      .insert({ tenant_id: tenantId, name: newSubName.trim(), slug: slugify(newSubName), active: true, sort_order: maxOrder, parent_id: parentId })
      .select()
      .single()
    if (!error && data) {
      setAllCats(prev => [...prev, data])
      setNewSubName('')
      setAddingSubFor(null)
    }
    setSaving(false)
  }

  async function handleToggleActive(cat: Category) {
    await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id)
    setAllCats(prev => prev.map(c => c.id === cat.id ? { ...c, active: !c.active } : c))
  }

  async function handleDelete(cat: Category) {
    const hasChildren = allCats.some(c => c.parent_id === cat.id)
    const msg = hasChildren
      ? '¿Eliminar esta categoría y todas sus subcategorías? Los productos asociados quedarán sin categoría.'
      : '¿Eliminar esta categoría? Los productos asociados quedarán sin categoría.'
    if (!confirm(msg)) return
    // Delete subcategories first if any
    if (hasChildren) {
      await supabase.from('categories').delete().eq('parent_id', cat.id)
    }
    await supabase.from('categories').delete().eq('id', cat.id)
    setAllCats(prev => prev.filter(c => c.id !== cat.id && c.parent_id !== cat.id))
  }

  async function handleSaveEdit(cat: Category) {
    if (!editName.trim()) return
    const newSlug = slugify(editName)
    await supabase.from('categories').update({ name: editName.trim(), slug: newSlug }).eq('id', cat.id)
    setAllCats(prev => prev.map(c => c.id === cat.id ? { ...c, name: editName.trim(), slug: newSlug } : c))
    setEditingId(null)
  }

  async function handleMoveTop(i: number, dir: 'up' | 'down') {
    const tops = topLevel
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= tops.length) return
    const a = tops[i], b = tops[j]
    const tempOrder = a.sort_order
    await supabase.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id)
    await supabase.from('categories').update({ sort_order: tempOrder }).eq('id', b.id)
    setAllCats(prev => prev.map(c => {
      if (c.id === a.id) return { ...c, sort_order: b.sort_order }
      if (c.id === b.id) return { ...c, sort_order: tempOrder }
      return c
    }))
  }

  async function handleMoveSub(parentId: string, i: number, dir: 'up' | 'down') {
    const subs = allCats.filter(c => c.parent_id === parentId).sort((a, b) => a.sort_order - b.sort_order)
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= subs.length) return
    const a = subs[i], b = subs[j]
    const tempOrder = a.sort_order
    await supabase.from('categories').update({ sort_order: b.sort_order }).eq('id', a.id)
    await supabase.from('categories').update({ sort_order: tempOrder }).eq('id', b.id)
    setAllCats(prev => prev.map(c => {
      if (c.id === a.id) return { ...c, sort_order: b.sort_order }
      if (c.id === b.id) return { ...c, sort_order: tempOrder }
      return c
    }))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Categorías</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Organizá tus productos con categorías y subcategorías</p>
        </div>
        <button
          onClick={() => setAddingTop(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={15} />
          Nueva categoría
        </button>
      </div>

      <div className="px-8 py-6 max-w-2xl">

        {/* Nueva categoría top-level */}
        {addingTop && (
          <div className="bg-white rounded-xl border border-violet-200 p-4 mb-4 flex items-center gap-3">
            <input
              autoFocus
              className="input flex-1"
              placeholder="Ej: Remeras, Vestidos, Pantalones..."
              value={newTopName}
              onChange={e => setNewTopName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddTop(); if (e.key === 'Escape') { setAddingTop(false); setNewTopName('') } }}
            />
            <button onClick={handleAddTop} disabled={saving || !newTopName.trim()} className="btn-primary text-sm py-2 disabled:opacity-60">
              {saving ? 'Guardando...' : 'Agregar'}
            </button>
            <button onClick={() => { setAddingTop(false); setNewTopName('') }} className="text-zinc-400 hover:text-zinc-600">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Lista */}
        <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
          {loading && (
            <div className="px-5 py-8 text-center text-sm text-zinc-400">Cargando...</div>
          )}
          {!loading && topLevel.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-500 mb-1">No hay categorías todavía</p>
              <p className="text-xs text-zinc-400">Agregá tu primera categoría para organizar tu catálogo</p>
            </div>
          )}

          {topLevel.map((cat, i) => {
            const isExpanded = expanded.has(cat.id)
            const hasSubs = cat.subcategories.length > 0

            return (
              <div key={cat.id}>
                {/* Categoría principal */}
                <div className="flex items-center gap-3 px-4 py-3">

                  {/* Expand toggle */}
                  <button
                    onClick={() => toggleExpand(cat.id)}
                    className={`text-zinc-300 hover:text-zinc-500 transition-colors flex-shrink-0 w-4 ${!hasSubs && addingSubFor !== cat.id ? 'opacity-0 pointer-events-none' : ''}`}
                    title={isExpanded ? 'Colapsar' : 'Expandir'}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>

                  {/* Orden */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => handleMoveTop(i, 'up')} disabled={i === 0}
                      className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 transition-colors leading-none text-xs">▲</button>
                    <button onClick={() => handleMoveTop(i, 'down')} disabled={i === topLevel.length - 1}
                      className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 transition-colors leading-none text-xs">▼</button>
                  </div>

                  {/* Nombre / edición */}
                  <div className="flex-1 min-w-0">
                    {editingId === cat.id ? (
                      <div className="flex items-center gap-2">
                        <input autoFocus className="input text-sm flex-1" value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(cat); if (e.key === 'Escape') setEditingId(null) }}
                        />
                        <button onClick={() => handleSaveEdit(cat)} className="text-violet-600 hover:text-violet-700"><Check size={15} /></button>
                        <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600"><X size={15} /></button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingId(cat.id); setEditName(cat.name) }} className="text-left group">
                        <p className="text-sm font-semibold text-zinc-800 group-hover:text-violet-700 transition-colors">{cat.name}</p>
                        <p className="text-xs text-zinc-400 font-mono">/{cat.slug}</p>
                      </button>
                    )}
                  </div>

                  {/* Botón + subcategoría */}
                  <button
                    onClick={() => { setAddingSubFor(cat.id); setExpanded(prev => new Set([...prev, cat.id])) }}
                    className="text-xs text-zinc-400 hover:text-violet-600 transition-colors flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded hover:bg-violet-50"
                    title="Agregar subcategoría"
                  >
                    <Plus size={12} />
                    Sub
                  </button>

                  {/* Visible toggle */}
                  <button onClick={() => handleToggleActive(cat)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors flex-shrink-0 ${
                      cat.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                    }`}>
                    {cat.active ? 'Visible' : 'Oculta'}
                  </button>

                  {/* Eliminar */}
                  <button onClick={() => handleDelete(cat)} className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Subcategorías (expandidas) */}
                {isExpanded && (
                  <div className="bg-zinc-50 border-t border-zinc-100">

                    {/* Formulario nueva subcategoría */}
                    {addingSubFor === cat.id && (
                      <div className="flex items-center gap-3 pl-12 pr-4 py-2.5 border-b border-zinc-100">
                        <input
                          autoFocus
                          className="input text-sm flex-1"
                          placeholder="Ej: Running, De vestir, Oversize..."
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddSub(cat.id); if (e.key === 'Escape') { setAddingSubFor(null); setNewSubName('') } }}
                        />
                        <button onClick={() => handleAddSub(cat.id)} disabled={saving || !newSubName.trim()}
                          className="btn-primary text-xs py-1.5 px-3 disabled:opacity-60">
                          {saving ? '...' : 'Agregar'}
                        </button>
                        <button onClick={() => { setAddingSubFor(null); setNewSubName('') }} className="text-zinc-400 hover:text-zinc-600">
                          <X size={14} />
                        </button>
                      </div>
                    )}

                    {cat.subcategories.length === 0 && addingSubFor !== cat.id && (
                      <div className="pl-12 pr-4 py-3 text-xs text-zinc-400">
                        Sin subcategorías. Hacé click en <span className="font-medium">+ Sub</span> para agregar.
                      </div>
                    )}

                    {cat.subcategories.map((sub, si) => (
                      <div key={sub.id} className="flex items-center gap-3 pl-12 pr-4 py-2.5 border-t border-zinc-100 first:border-t-0">

                        {/* Orden subcategoría */}
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button onClick={() => handleMoveSub(cat.id, si, 'up')} disabled={si === 0}
                            className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 transition-colors leading-none text-xs">▲</button>
                          <button onClick={() => handleMoveSub(cat.id, si, 'down')} disabled={si === cat.subcategories.length - 1}
                            className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 transition-colors leading-none text-xs">▼</button>
                        </div>

                        {/* Nombre subcategoría */}
                        <div className="flex-1 min-w-0">
                          {editingId === sub.id ? (
                            <div className="flex items-center gap-2">
                              <input autoFocus className="input text-sm flex-1" value={editName}
                                onChange={e => setEditName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(sub); if (e.key === 'Escape') setEditingId(null) }}
                              />
                              <button onClick={() => handleSaveEdit(sub)} className="text-violet-600 hover:text-violet-700"><Check size={14} /></button>
                              <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600"><X size={14} /></button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingId(sub.id); setEditName(sub.name) }} className="text-left group">
                              <p className="text-sm font-medium text-zinc-700 group-hover:text-violet-700 transition-colors">{sub.name}</p>
                              <p className="text-xs text-zinc-400 font-mono">/{sub.slug}</p>
                            </button>
                          )}
                        </div>

                        {/* Visible toggle */}
                        <button onClick={() => handleToggleActive(sub)}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors flex-shrink-0 ${
                            sub.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                          }`}>
                          {sub.active ? 'Visible' : 'Oculta'}
                        </button>

                        {/* Eliminar */}
                        <button onClick={() => handleDelete(sub)} className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-zinc-400 mt-3">
          Hacé click en el nombre para editar · <span className="font-medium">+ Sub</span> agrega subcategorías · Las categorías ocultas no se muestran en la tienda
        </p>
      </div>
    </div>
  )
}
