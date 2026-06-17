'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2, GripVertical, Check, X } from 'lucide-react'

interface Category {
  id: string
  name: string
  slug: string
  active: boolean
  sort_order: number
}

function slugify(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function CategoriasPage() {
  const supabase = createClient()
  const [categories, setCategories] = useState<Category[]>([])
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: userRow } = await supabase.from('users').select('tenant_id').eq('id', user.id).single()
      if (!userRow) return
      setTenantId(userRow.tenant_id)
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug, active, sort_order')
        .eq('tenant_id', userRow.tenant_id)
        .order('sort_order')
      setCategories(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  async function handleAdd() {
    if (!newName.trim() || !tenantId) return
    setSaving(true)
    const slug = slugify(newName)
    const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) + 1 : 0
    const { data, error } = await supabase
      .from('categories')
      .insert({ tenant_id: tenantId, name: newName.trim(), slug, active: true, sort_order: maxOrder })
      .select()
      .single()
    if (!error && data) {
      setCategories(prev => [...prev, data])
      setNewName('')
      setAdding(false)
    }
    setSaving(false)
  }

  async function handleToggleActive(cat: Category) {
    await supabase.from('categories').update({ active: !cat.active }).eq('id', cat.id)
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, active: !c.active } : c))
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta categoría? Los productos asociados quedarán sin categoría.')) return
    await supabase.from('categories').delete().eq('id', id)
    setCategories(prev => prev.filter(c => c.id !== id))
  }

  async function handleSaveEdit(cat: Category) {
    if (!editName.trim()) return
    const newSlug = slugify(editName)
    await supabase.from('categories').update({ name: editName.trim(), slug: newSlug }).eq('id', cat.id)
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, name: editName.trim(), slug: newSlug } : c))
    setEditingId(null)
  }

  async function handleMoveUp(i: number) {
    if (i === 0) return
    const updated = [...categories]
    const temp = updated[i - 1].sort_order
    updated[i - 1] = { ...updated[i - 1], sort_order: updated[i].sort_order }
    updated[i] = { ...updated[i], sort_order: temp }
    ;[updated[i - 1], updated[i]] = [updated[i], updated[i - 1]]
    setCategories(updated)
    await supabase.from('categories').update({ sort_order: updated[i - 1].sort_order }).eq('id', updated[i - 1].id)
    await supabase.from('categories').update({ sort_order: updated[i].sort_order }).eq('id', updated[i].id)
  }

  async function handleMoveDown(i: number) {
    if (i === categories.length - 1) return
    const updated = [...categories]
    const temp = updated[i + 1].sort_order
    updated[i + 1] = { ...updated[i + 1], sort_order: updated[i].sort_order }
    updated[i] = { ...updated[i], sort_order: temp }
    ;[updated[i], updated[i + 1]] = [updated[i + 1], updated[i]]
    setCategories(updated)
    await supabase.from('categories').update({ sort_order: updated[i].sort_order }).eq('id', updated[i].id)
    await supabase.from('categories').update({ sort_order: updated[i + 1].sort_order }).eq('id', updated[i + 1].id)
  }

  return (
    <div>
      <div className="px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Categorías</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Organizá tus productos por tipo de artículo</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus size={15} />
          Nueva categoría
        </button>
      </div>

      <div className="px-8 py-6 max-w-2xl">

        {/* Formulario nueva categoría */}
        {adding && (
          <div className="bg-white rounded-xl border border-violet-200 p-4 mb-4 flex items-center gap-3">
            <input
              autoFocus
              className="input flex-1"
              placeholder="Ej: Remeras, Vestidos, Pantalones..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            />
            <button onClick={handleAdd} disabled={saving || !newName.trim()} className="btn-primary text-sm py-2 disabled:opacity-60">
              {saving ? 'Guardando...' : 'Agregar'}
            </button>
            <button onClick={() => { setAdding(false); setNewName('') }} className="text-zinc-400 hover:text-zinc-600">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Lista */}
        <div className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
          {loading && (
            <div className="px-5 py-8 text-center text-sm text-zinc-400">Cargando...</div>
          )}
          {!loading && categories.length === 0 && (
            <div className="px-5 py-10 text-center">
              <p className="text-sm text-zinc-500 mb-1">No hay categorías todavía</p>
              <p className="text-xs text-zinc-400">Agregá tu primera categoría para organizar tu catálogo</p>
            </div>
          )}
          {categories.map((cat, i) => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3">

              {/* Orden */}
              <div className="flex flex-col gap-0.5 flex-shrink-0">
                <button
                  onClick={() => handleMoveUp(i)}
                  disabled={i === 0}
                  className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 transition-colors leading-none text-xs"
                >▲</button>
                <button
                  onClick={() => handleMoveDown(i)}
                  disabled={i === categories.length - 1}
                  className="text-zinc-300 hover:text-zinc-500 disabled:opacity-20 transition-colors leading-none text-xs"
                >▼</button>
              </div>

              {/* Nombre / edición */}
              <div className="flex-1 min-w-0">
                {editingId === cat.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      className="input text-sm flex-1"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(cat); if (e.key === 'Escape') setEditingId(null) }}
                    />
                    <button onClick={() => handleSaveEdit(cat)} className="text-violet-600 hover:text-violet-700">
                      <Check size={15} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-zinc-400 hover:text-zinc-600">
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingId(cat.id); setEditName(cat.name) }}
                    className="text-left group"
                  >
                    <p className="text-sm font-medium text-zinc-800 group-hover:text-violet-700 transition-colors">{cat.name}</p>
                    <p className="text-xs text-zinc-400 font-mono">/{cat.slug}</p>
                  </button>
                )}
              </div>

              {/* Activa toggle */}
              <button
                onClick={() => handleToggleActive(cat)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors flex-shrink-0 ${
                  cat.active
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200'
                }`}
              >
                {cat.active ? 'Visible' : 'Oculta'}
              </button>

              {/* Eliminar */}
              <button
                onClick={() => handleDelete(cat.id)}
                className="text-zinc-300 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <p className="text-xs text-zinc-400 mt-3">
          Hacé click en el nombre para editar. Las categorías ocultas no se muestran en la tienda.
        </p>
      </div>
    </div>
  )
}
