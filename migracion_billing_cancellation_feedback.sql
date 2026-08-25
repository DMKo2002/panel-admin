-- Motivo de baja opcional que el tenant puede dejar al "dar de baja" su
-- suscripcion desde /perfil/plan (POST /api/billing/cancel). Pedido de
-- David/Aram 2026-08-25 tras probar el flujo de cancelacion.
-- Ya aplicada en Supabase (xvhqiwypejurjdqioyuq) el 2026-08-25.
create table if not exists billing_cancellation_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  tenant_name text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists billing_cancellation_feedback_tenant_id_idx
  on billing_cancellation_feedback(tenant_id);

comment on table billing_cancellation_feedback is
  'Motivo opcional que el tenant deja al cancelar su suscripcion de Mercado Pago desde /perfil/plan. Ver /api/billing/cancel en panel-admin y gounuri-web.';
