import type { TutorialStep } from '@/components/tutorial/TutorialProvider'

// Pasos del tutorial de la ficha de producto — compartidos por /productos/nuevo
// y /productos/[id] para que no se desincronicen.
//
// Los pasos se arman según cómo está configurada la tienda y qué hay
// realmente en pantalla: en modo tabla existen la matriz y sus paneles, en
// modo lista existe otra cosa, los nombres de eje solo aparecen en tabla
// libre y el bloque de categorías no se renderiza si el tenant todavía no
// creó ninguna. Si un paso apuntara a un bloque ausente, el tour se cortaría
// ahí — por eso se filtran en vez de registrarlos todos.

// TutorialHint (el signo de pregunta) solo usa step.id para pedirle al
// provider el paso ya registrado, así que alcanza con un puntero al id: el
// texto real vive una sola vez acá.
export const hint = (id: string): TutorialStep => ({ id, target: '', title: '', content: '' })

export function buildProductoSteps(opts: {
  variantMode: 'sizes_colors' | 'simple'
  columnType: 'color' | 'text'
  hasExtraAttrs: boolean
  hasCategories: boolean
  rowWord: string
  colWord: string
  isNuevo?: boolean
}): TutorialStep[] {
  const { variantMode, columnType, hasExtraAttrs, hasCategories, rowWord, colWord, isNuevo } = opts
  const steps: TutorialStep[] = [
    {
      id: 'prod-basica',
      target: '[data-tutorial="prod-basica"]',
      title: 'Información básica',
      content: 'Nombre y descripción son lo que ve el cliente en la tienda. El código interno (SKU) es solo tuyo, para identificar el producto en tu stock. "Producto activo" lo muestra o lo esconde de la tienda sin borrarlo, y "Destacado" lo sube a la sección de más vendidos de la home. El pedido mínimo y el tope de cuotas son opcionales: si los dejás vacíos, se usa la configuración general de la tienda.',
    },
    {
      id: 'prod-dimensiones',
      target: '[data-tutorial="prod-dimensiones"]',
      title: 'Dimensiones y peso',
      content: 'Son opcionales y hoy se usan para la etiqueta de envío: el PDF muestra el peso total del pedido y las medidas de cada producto, así no tenés que buscarlas para completar la guía del correo. Cada producto puede tener su propia unidad (un paquete en gramos y una bolsa en kilos): si elegís "Usar la de la tienda", toma la que configuraste en Mi Tienda > Catálogo. Ojo: cambiar la unidad no convierte el número que ya cargaste.',
    },
    {
      id: 'prod-imagenes',
      target: '[data-tutorial="prod-imagenes"]',
      title: 'Imágenes',
      content: 'La primera imagen es la portada: es la que se ve en el listado de la tienda. Podés arrastrarlas para cambiar el orden y usar la estrella para elegir otra portada. Se recortan y comprimen solas al subirlas, con el formato que configuraste en Catálogo.',
    },
  ]

  // El bloque de categorías solo se renderiza si el tenant tiene alguna creada.
  if (hasCategories) {
    steps.splice(1, 0, {
      id: 'prod-categorias',
      target: '[data-tutorial="prod-categorias"]',
      title: 'Categorías',
      content: 'Un producto puede estar en varias categorías a la vez y aparece en todas. Las categorías se crean y se ordenan en la sección Categorías del menú, no acá.',
    })
  }

  if (variantMode === 'simple') {
    steps.push({
      id: 'prod-lista',
      target: '[data-tutorial="prod-lista"]',
      title: 'Variantes, stock y precios',
      content: 'Cada fila es una forma de vender este producto (por ejemplo: suelto, pack x5, pack x10), con su propio precio y stock. Si vendés el producto de una sola forma, dejá una sola variante y sin nombre: la tienda no muestra ningún selector. El tilde "Sin stock" marca esa variante como no disponible sin importar el número de stock, útil cuando no llevás control de unidades.',
    })
  } else {
    steps.push({
      id: 'prod-tabla',
      target: '[data-tutorial="prod-tabla"]',
      title: 'La tabla de variantes',
      content: `Cada cruce entre una ${rowWord.toLowerCase()} y una ${colWord.toLowerCase()} es una variante distinta, con su propio stock y precio. Con los botones "+ ${rowWord}" y "+ ${colWord}" agregás filas y columnas: mientras no guardes son solo visuales, así que podés sacarlas con la X sin que pase nada. Si una fila o columna ya está guardada, la X te pide confirmación porque borra variantes de verdad.`,
    })

    if (columnType === 'text') {
      steps.push({
        id: 'prod-ejes',
        target: '[data-tutorial="prod-ejes"]',
        title: `Cómo se llaman las ${rowWord.toLowerCase()}s y ${colWord.toLowerCase()}s`,
        content: 'Le ponés nombre a los dos ejes de la tabla solo para este producto (por ejemplo "Peso" y "Pack"). Esos nombres son los que ve el cliente en la ficha del producto al elegir. Si los dejás vacíos se usa el nombre general de tu tienda, que se configura en Mi Tienda > Catálogo.',
      })
    }

    steps.push({
      id: 'prod-bulk',
      target: '[data-tutorial="prod-bulk"]',
      title: 'Editar todas las celdas a la vez',
      content: 'Sirve para no cargar lo mismo celda por celda: lo que completes acá y toques "Aplicar a todas" se copia a toda la tabla. Los campos que dejes vacíos no tocan nada, así podés aplicar solo el precio y dejar el stock como está.',
    })
  }

  if (hasExtraAttrs) {
    steps.push({
      id: 'prod-atributos',
      target: variantMode === 'simple' ? '[data-tutorial="prod-lista"]' : '[data-tutorial="prod-tabla"]',
      title: 'Atributos adicionales',
      content: 'Son los datos extra que definiste en Mi Tienda > Catálogo (por ejemplo contenido neto, sabor o marca). Se cargan por variante desde el botón "Atributos", así el pack de 5 puede decir 600 g y el suelto 120 g. Lo que dejes vacío no se muestra en la tienda. El cliente los ve en la ficha del producto y cambian al elegir cada variante.',
    })
  }

  steps.push(isNuevo ? {
    id: 'prod-guardar',
    target: '[data-tutorial="prod-guardar"]',
    title: 'Crear el producto',
    content: 'Hasta que toques "Crear producto" no se guarda nada — ni el producto ni las filas y columnas que hayas armado. Después vas a poder volver a editarlo, ver la ficha en tu tienda o eliminarlo.',
  } : {
    id: 'prod-guardar',
    target: '[data-tutorial="prod-guardar"]',
    title: 'Guardar, ver y eliminar',
    content: 'Nada de lo que cambiás se aplica hasta que tocás "Guardar cambios" — incluidas las filas y columnas que hayas agregado. "Ver en tienda" abre la ficha real como la ve tu cliente. "Eliminar" borra el producto con todas sus variantes, precios e imágenes, y no se puede deshacer.',
  })

  return steps
}

