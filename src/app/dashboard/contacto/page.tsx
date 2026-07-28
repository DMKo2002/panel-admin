'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'

export default function ContactoPage() {
  const supabase = createClient()
  const [configId, setConfigId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)

  const [whatsapp, setWhatsapp] = useState('')
  const [instagram, setInstagram] = useState('')
  const [facebook, setFacebook] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [storeAddress, setStoreAddress] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [branches, setBranches] = useState<{ name: string; address: string; phone?: string }[]>([])

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: _userRows } = await supabase.from('users').select('tenant_id').eq('id', user.id).limit(1)
      const userRow = _userRows?.[0]
      if (!userRow) return
      const { data } = await supabase.from('store_config').select('*').eq('tenant_id', userRow.tenant_id).single()
      if (data) {
        setConfigId(data.id)
        setWhatsapp((data as any).whatsapp_number ?? '')
        setInstagram((data as any).instagram_url ?? '')
        setFacebook((data as any).facebook_url ?? '')
        setTiktok((data as any).tiktok_url ?? '')
        setStoreAddress((data as any).store_address ?? '')
        setPickupAddress((data as any).pickup_address ?? '')
        const rawBranches = (data as any).branches
        setBranches(Array.isArray(rawBranches) ? rawBranches : [])
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!configId) return
    setSaving(true)
    setErrorGeneral(null)
    const { error } = await supabase.from('store_config').update({
      whatsapp_number: whatsapp.trim()     || null,
      instagram_url:   instagram.trim()    || null,
      facebook_url:    facebook.trim()     || null,
      tiktok_url:      tiktok.trim()       || null,
      store_address:   storeAddress.trim()  || null,
      pickup_address:  pickupAddress.trim() || null,
      branches,
    }).eq('id', configId)
    setSaving(false)
    if (error) {
      console.error('Error guardando contacto:', error)
      setErrorGeneral(error.message || 'No se pudo guardar. Reintentá o contactá a soporte.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div>
      <div className="sticky top-0 z-10 px-8 py-6 border-b border-zinc-200 bg-white flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Contacto y Redes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Se muestran en el footer, la página de contacto y los PDFs de tu tienda</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-60">
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
        {errorGeneral && <p className="text-xs text-red-600 mt-1.5">{errorGeneral}</p>}
      </div>

      <div className="px-8 py-6 max-w-2xl space-y-5">

        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-zinc-700">Contacto y redes sociales</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">WhatsApp</label>
              <input className="input text-sm" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="5491112345678 (sin + ni espacios)" />
              <p className="text-xs text-zinc-400 mt-1">También es el número al que llegan los avisos de WhatsApp — configurables en Notificaciones.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Instagram</label>
              <input className="input text-sm" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="https://instagram.com/tutienda" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Facebook</label>
              <input className="input text-sm" value={facebook} onChange={e => setFacebook(e.target.value)} placeholder="https://facebook.com/tutienda" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">TikTok</label>
              <input className="input text-sm" value={tiktok} onChange={e => setTiktok(e.target.value)} placeholder="https://tiktok.com/@tutienda" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Dirección de retiro (visible en la tienda)</label>
              <input className="input text-sm" value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Dirección de despacho (aparece en PDFs)</label>
              <input className="input text-sm" value={storeAddress} onChange={e => setStoreAddress(e.target.value)} placeholder="Av. Corrientes 1234, CABA" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-zinc-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700">Sucursales</h2>
              <p className="text-xs text-zinc-400 mt-0.5">Aparecen en el footer del sitio</p>
            </div>
            <button onClick={() => setBranches(prev => [...prev, { name: '', address: '', phone: '' }])} className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700">
              <Plus size={14} /> Agregar
            </button>
          </div>
          {branches.length === 0 && <p className="text-xs text-zinc-400">No hay sucursales cargadas</p>}
          {branches.map((branch, i) => (
            <div key={i} className="grid grid-cols-3 gap-3 pb-3 border-b border-zinc-50 last:border-0">
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Nombre</label>
                <input className="input text-sm" value={branch.name} onChange={e => setBranches(prev => prev.map((b, idx) => idx === i ? { ...b, name: e.target.value } : b))} placeholder="Sucursal Centro" />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Dirección</label>
                <input className="input text-sm" value={branch.address} onChange={e => setBranches(prev => prev.map((b, idx) => idx === i ? { ...b, address: e.target.value } : b))} placeholder="Av. Corrientes 1234, CABA" />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Teléfono (opcional)</label>
                  <input className="input text-sm" value={branch.phone ?? ''} onChange={e => setBranches(prev => prev.map((b, idx) => idx === i ? { ...b, phone: e.target.value } : b))} placeholder="11 1234-5678" />
                </div>
                <button onClick={() => setBranches(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-300 hover:text-red-400 mb-1">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
