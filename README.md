# Panel Admin — Plataforma Ecommerce Ropa

## Stack
- Next.js 14 (App Router)
- TypeScript
- Supabase (Auth + DB + Storage)
- Tailwind CSS

## Setup

### 1. Crear proyecto Next.js
```bash
npx create-next-app@latest panel-admin --typescript --tailwind --app --src-dir
cd panel-admin
```

### 2. Instalar dependencias
```bash
npm install @supabase/supabase-js @supabase/ssr
npm install @supabase/auth-ui-react @supabase/auth-ui-shared
npm install lucide-react
npm install clsx
```

### 3. Variables de entorno
Crear archivo `.env.local` con tus credenciales de Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```
Las encontrás en: Supabase > Project Settings > API

### 4. Correr el proyecto
```bash
npm run dev
```
Abrir http://localhost:3000

## Estructura de archivos
```
src/
├── app/
│   ├── layout.tsx              # Layout raíz
│   ├── page.tsx                # Redirect a /dashboard
│   ├── login/
│   │   └── page.tsx            # Página de login
│   └── dashboard/
│       ├── layout.tsx          # Layout con sidebar
│       ├── page.tsx            # Dashboard principal
│       ├── pedidos/
│       │   └── page.tsx        # Listado de pedidos
│       ├── productos/
│       │   ├── page.tsx        # Grilla de productos
│       │   └── nuevo/
│       │       └── page.tsx    # Crear producto
│       ├── precios/
│       │   └── page.tsx        # Reglas de precio
│       ├── notificaciones/
│       │   └── page.tsx        # Config notificaciones
│       └── tienda/
│           └── page.tsx        # Config tienda
├── components/
│   ├── Sidebar.tsx
│   ├── TopBar.tsx
│   ├── StatCard.tsx
│   ├── Badge.tsx
│   └── Toggle.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # Cliente browser
│   │   ├── server.ts           # Cliente server (SSR)
│   │   └── middleware.ts       # Auth middleware
│   └── types.ts                # Tipos TypeScript del schema
└── middleware.ts               # Protección de rutas
```
