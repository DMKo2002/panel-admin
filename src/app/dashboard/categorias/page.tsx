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

interface SubCategoryTree extends Category {
  subcategories: Category[]
}

interface CategoryTree extends Category {
  subcategories: SubCategoryTree[]
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

  const [addingTop, setAddingTop] = useState(false)
  const [newTopName, setNewTopName] = useState('')
  const [addingSubFor, setAddingSubFor] = useState<string | null>(null)
  const [newSubName, setNewSubName] = useState('')
  const [addingSubSubFor, setAddingSubSubFor] = useState<string | null>(null)
  const [newSubSubName, setNewSubSubName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
  const userRow = _userRows?.[0]
        if (!userRow) { setLoading(false); return }
        setTenantId(userRow?.tenant_id)
        const { data } = await supabase
          .from('categories')
          .select('id, name, slug, active, sort_order, parent_id')
          .eq('tenant_id', userRow.tenant_id)
          .order('sort_order')
        setAllCats(data ?? [])
      } catch (e) {
        console.error('[Categorias] Error al cargar:', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Build 3-level tree
  const topLevel: CategoryTree[] = allCats
    .filter(c => !c.parent_id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => ({
      ...c,
      subcategories: allCats
        .filter(s => s.parent_id === c.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(s => ({
          ...s,
          subcategories: allCats
            .filter(t => t.parent_id === s.id)
            .sort((a, b) => a.sort_order - b.sort_order),
        })),
    }))

  async function handleAddTop() {
    if (!newTopName.trim() || !tenantId) return
    setSaving(true)
    const tops = allCats.filter(c => !c.parent_id)
    const maxOrder = tops.length > 0 ? Math.max(...tops.map(c => c.sort_order)) + 1 : 0
    const { data, error } = await supabase.from('categories')
      .insert({ tenant_id: tenantId, name: newTopName.trim(), slug: slugify(newTopName), active: true, sort_order: maxOrder, parent_id: null })
      .select().single()
    if (!error && data) { setAllCats(prev => [...prev, data]); setNewTopName(''); setAddingTop(false) }
    setSaving(false)
  }

  async function handleAddSub(parentId: string) {
    if (!newSubName.trim() || !tenantId) return
    setSaving(true)
    const siblings = allCats.filter(c => c.parent_id === parentId)
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.sort_order)) + 1 : 0
    const { data, error } = await supabase.from('categories')
      .insert({ tenant_id: tenantId, name: newSubName.trim(), slug: slugify(newSubName), active: true, sort_order: maxOrder, parent_id: parentId })
      .select().single()
    if (!error && data) { setAllCats(prev => [...prev, data]); setNewSubName(''); setAddingSubFor(null) }
    setSaving(false)
  }

  async function handleAddSubSub(parentId: string) {
    if (!newSubSubName.trim() || !tenantId) return
    setSaving(true)
    const siblings = allCats.filter(c => c.parent_id === parentId)
    const maxOrder = siblings.length > 0 ? Math.max(...siblings.map(c => c.sort_order)) + 1 : 0
    const { data, error } = await supabase.from('categories')
      .insert({ tenant_id: tenantId, name: newSubSubName.trim(), slug: slugify(newSubSubName), active: true, sort_order: maxOrder, parent_id: parentId })
      .select().single()
    if (!error && data) { setAllCats(prev => [...prev, data]); setNewSubSubName(''); setAddingSubSubFor(null) }
    setSaving(false)
  }

  async function handleToggleActive(cat: Category) {
    await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id)
    setAllCats(prev => prev.map(c => c.id === cat.id ? { ...c, active: !c.active } : c))
  }

  async function handleDelete(cat: Category) {
    const hasChildren = allCats.some(c => c.parent_id === cat.id)
    const msg = hasChildren
      ? 'Eliminar esta categoria y todas sus subcategorias? Los productos asociados quedaran sin categoria.'
      : 'Eliminar esta categoria? Los productos asociados quedaran sin categoria.'
    if (!confirm(msg)) return
    if (hasChildren) {
      const childIds = allCats.filter(c => c.parent_id === cat.id).map(c => c.id)
      for (const cid of childIds) {
        await supabase.from('categories').delete().eq('parent_id', cid)
      }
      await supabase.from('categories').delete().eq('parent_id', cat.id)
    }
    await supabase.from('categories').delete().eq('id', cat.id)
    const removedIds = new Set([cat.id, ...allCats.filter(c => c.parent_id === cat.id).map(c => c.id)])
    setAllCats(prev => prev.filter(c => !removedIds.has(c.id) && !removedIds.has(c.parent_id ?? '')))
  }

  async function handleSaveEdit(cat: Category) {
    if (!editName.trim()) return
    const newSlug = slugify(editName)
    await supabase.from('categories').update({ name: editName.trim(), slug: newSlug }).eq('id', cat.id)
    setAllCats(prev => prev.map(c => c.id === cat.id ? { ...c, name: editName.trim(), slug: newSlug } : c))
    setEditingId(null)
  }

  async function swapOrder(aId: string, aOrder: number, bId: string, bOrder: number) {
    await supabase.from('categories').update({ sort_order: bOrder }).eq('id', aId)
    await supabase.from('categories').update({ sort_order: aOrder }).eq('id', bId)
    setAllCats(prev => prev.map(c => {
      if (c.id === aId) return { ...c, sort_order: bOrder }
      if (c.id === bId) return { ...c, sort_order: aOrder }
      return c
    }))
  }

  function toggleExpand(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const inlineInput = (placeholder: string, value: string, onChange: (v: string) => void, onSave: () => void, onCancel: () => void) => (
    <div className="flex items-center gap-2 flex-1">
      <input autoFocus className="input text-sm flex-1" placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }} />
      <button onClick={onSave} disabled={saving || !value.trim()} className="btn-primary text-xs py-1.5 px-3 disabled:opacity-60">{saving ? '...' : 'Agregar'}</button>
      <button onClick={onCancel} className="text-zinc-400 hover:text-zinc-600"><X size={14} /></button>
    </div>
  )

  const rowButtons = (cat: Category, onAddSub?: () => void) => (
    <div className="flex items-center gap-2 flex-shrink-0">
      {onAddSub && (
        <button onClick={onAddSub} className="text-xs text-zinc-400 hover:text-violet-600 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-violet-50">
          <Plus size={12} /> Sub
        </button>
      )}
      <button onClick={() => handleToggleActive(cat)}
        className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${cat.active ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'}`}>
        {cat.active ? 'Visible' : 'Oculta'}
      </button>
      <button onClick={() => handleDelete(cat)} className="text-zinc-300 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
    </div>
  )

  const nameCell = (cat: Category) => editingId === cat.id ? (
    <div className="flex items-center gap-2 flex-1">
      <input autoFocus className="input text-sm flex-1" value={editName} onChange={e => setEditName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(cat); if (e.key === 'Escape') setEditingId(null) }} />
      <button onClick={() => handleSaveEdit(cat)} className="text-violet-600 hover:text-violet-700"><Check size={14} /></button>
      <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600"><X size={14} /></button>
    </div>
  ) : (
    <button onClick={() => { setEditingId(cat.id); setEditName(cat.name) }} className="text-left group flex-1">
      <p className="text-sm font-medium text-zinc-800 group-hover:text-violet-700 transition-colors">{cat.name}</p>
      <p className="text-xs text-zinc-400 font-mono">/{cat.slug}</p>
    </button>
  )

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Categorias</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Hasta 3 niveles: Categoria / Subcategoria / Sub-subcategoria</p>
        </div>
        <button onClick={() => setAddingTop(true)} className="btn-primary flex items-center gap-2">
          <Plus size={15} /> Nueva categoria
        </button>
      </div>

      <div className="px-8 py-6 max-w-2xl">

        {addingTop && (
          <div className="bg-white rounded-xl border border-violet-200 p-4 mb-4 flex items-center gap-3">
            {inlineInput('Ej: Remeras, Vestidos...', newTopName, setNewTopName, handleAddTop, () => { setAddingTop(false); setNewTopName('') })}
          </div>
        )}

        <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
          {loading && <div className="px-5 py-8 text-center text-sm text-zinc-400">Cargando...</div>}
          {!loading && topLevel.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-500 mb-1">No hay categorias todavia</p>
              <p className="text-xs text-zinc-400">Agrega tu primera categoria para organizar tu catalogo</p>
            </div>
          )}

          {topLevel.map((cat, i) => {
            const isExpanded = expanded.has(cat.id)
            const hasSubs = cat.subcategories.length > 0 || addingSubFor === cat.id
            return (
              <div key={cat.id}>
                {/* NIVEL 1 */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button onClick={() => toggleExpand(cat.id)} className={`text-zinc-300 hover:text-zinc-500 transition-colors w-4 flex-shrink-0 ${!hasSubs ? 'opacity-0 pointer-events-none' : ''}`}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button onClick={() => i > 0 && swapOrder(cat.id, cat.sort_order, topLevel[i-1].id, topLevel[i-1].sort_order)} disabled={i === 0} className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 text-xs leading-none">▲</button>
                    <button onClick={() => i < topLevel.length-1 && swapOrder(cat.id, cat.sort_order, topLevel[i+1].id, topLevel[i+1].sort_order)} disabled={i === topLevel.length-1} className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 text-xs leading-none">▼</button>
                  </div>
                  {nameCell(cat)}
                  {rowButtons(cat, () => { setAddingSubFor(cat.id); setExpanded(prev => new Set([...prev, cat.id])) })}
                </div>

                {/* NIVEL 2 */}
                {isExpanded && (
                  <div className="bg-zinc-50 border-t border-zinc-100">
                    {addingSubFor === cat.id && (
                      <div className="flex items-center gap-3 pl-12 pr-4 py-2.5 border-b border-zinc-100">
                        {inlineInput('Nueva subcategoria...', newSubName, setNewSubName, () => handleAddSub(cat.id), () => { setAddingSubFor(null); setNewSubName('') })}
                      </div>
                    )}
                    {cat.subcategories.length === 0 && addingSubFor !== cat.id && (
                      <div className="pl-12 pr-4 py-3 text-xs text-zinc-400">Sin subcategorias. Click en <strong>+ Sub</strong> para agregar.</div>
                    )}
                    {cat.subcategories.map((sub, si) => {
                      const subExpanded = expanded.has(sub.id)
                      const subHasSubs = sub.subcategories.length > 0 || addingSubSubFor === sub.id
                      return (
                        <div key={sub.id}>
                          <div className="flex items-center gap-3 pl-10 pr-4 py-2.5 border-t border-zinc-100 first:border-t-0">
                            <button onClick={() => toggleExpand(sub.id)} className={`text-zinc-300 hover:text-zinc-500 w-4 flex-shrink-0 ${!subHasSubs ? 'opacity-0 pointer-events-none' : ''}`}>
                              {subExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                            <div className="flex flex-col gap-0.5 flex-shrink-0">
                              <button onClick={() => si > 0 && swapOrder(sub.id, sub.sort_order, cat.subcategories[si-1].id, cat.subcategories[si-1].sort_order)} disabled={si === 0} className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 text-xs leading-none">▲</button>
                              <button onClick={() => si < cat.subcategories.length-1 && swapOrder(sub.id, sub.sort_order, cat.subcategories[si+1].id, cat.subcategories[si+1].sort_order)} disabled={si === cat.subcategories.length-1} className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 text-xs leading-none">▼</button>
                            </div>
                            {nameCell(sub)}
                            {rowButtons(sub, () => { setAddingSubSubFor(sub.id); setExpanded(prev => new Set([...prev, sub.id])) })}
                          </div>

                          {/* NIVEL 3 */}
                          {subExpanded && (
                            <div className="bg-zinc-100/60 border-t border-zinc-200/60">
                              {addingSubSubFor === sub.id && (
                                <div className="flex items-center gap-3 pl-20 pr-4 py-2 border-b border-zinc-200/60">
                                  {inlineInput('Nueva sub-subcategoria...', newSubSubName, setNewSubSubName, () => handleAddSubSub(sub.id), () => { setAddingSubSubFor(null); setNewSubSubName('') })}
                                </div>
                              )}
                              {sub.subcategories.length === 0 && addingSubSubFor !== sub.id && (
                                <div className="pl-20 pr-4 py-2.5 text-xs text-zinc-400">Sin sub-subcategorias. Click en <strong>+ Sub</strong> para agregar.</div>
                              )}
                              {sub.subcategories.map((leaf, li) => (
                                <div key={leaf.id} className="flex items-center gap-3 pl-18 pr-4 py-2 border-t border-zinc-200/60 first:border-t-0" style={{ paddingLeft: 72 }}>
                                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                                    <button onClick={() => li > 0 && swapOrder(leaf.id, leaf.sort_order, sub.subcategories[li-1].id, sub.subcategories[li-1].sort_order)} disabled={li === 0} className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 text-xs leading-none">▲</button>
                                    <button onClick={() => li < sub.subcategories.length-1 && swapOrder(leaf.id, leaf.sort_order, sub.subcategories[li+1].id, sub.subcategories[li+1].sort_order)} disabled={li === sub.subcategories.length-1} className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 text-xs leading-none">▼</button>
                                  </div>
                                  {nameCell(leaf)}
                                  {rowButtons(leaf)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <p className="text-xs text-zinc-400 mt-3">
          Click en el nombre para editar. <strong>+ Sub</strong> agrega subcategorias. Soporta hasta 3 niveles de profundidad.
        </p>
      </div>
    </div>
  )
}
