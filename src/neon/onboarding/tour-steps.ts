import type { TourPlatform } from './use-tour'

/**
 * One bubble of the guided tour. `target` selects what it points at: every
 * visible match is lit as one block, and a step with none is skipped. `side`
 * is where the bubble goes, relative to it.
 */
export interface TourStep {
  target: string
  title: string
  text: string
  side: 'end' | 'top' | 'bottom'
}

const APUNTAR =
  'Un gasto, un ingreso, un ahorro o una compra de inversión, desde cualquier pantalla.'

const sidebar = (section: string) => `aside [data-nav-item][data-section="${section}"]`

export const TOUR_STEPS: Record<TourPlatform, TourStep[]> = {
  desktop: [
    {
      target: '[data-dashboard-apuntar]',
      title: 'Apuntar',
      text: 'Un gasto, un ingreso, un ahorro o una compra de inversión. También lo tienes en Movimientos.',
      side: 'bottom',
    },
    {
      target: '[data-dashboard-edit-toggle]',
      title: 'Editar el Dashboard',
      text: 'Mueve los widgets, cambia su tamaño y elige cuáles se ven.',
      side: 'bottom',
    },
    {
      target: sidebar('transactions'),
      title: 'Movimientos',
      text: 'Todo lo que entra y sale, mes a mes, con buscador y filtros. Aquí también están tus suscripciones.',
      side: 'end',
    },
    {
      target: sidebar('budget'),
      title: 'Presupuesto',
      text: 'Cuánto prevés gastar en cada categoría y cuánto llevas este mes.',
      side: 'end',
    },
    {
      target: sidebar('wealth'),
      title: 'Patrimonio',
      text: 'Tus cuentas, con su saldo, y cómo cambia lo que tienes mes a mes.',
      side: 'end',
    },
    {
      target: sidebar('investment'),
      title: 'Inversión',
      text: 'Tus posiciones, lo que rinden y cómo van frente al mercado.',
      side: 'end',
    },
    {
      target: sidebar('goals'),
      title: 'Objetivos',
      text: 'Metas de ahorro: cuánto quieres reunir y para cuándo.',
      side: 'end',
    },
    {
      target: sidebar('data'),
      title: 'Datos',
      text: 'Importa y exporta tus datos y revisa la sincronización.',
      side: 'end',
    },
    {
      target: sidebar('settings'),
      title: 'Configuración',
      text: 'Cuentas, categorías, recurrentes, conexiones y preferencias. Desde Preferencias puedes repetir este recorrido.',
      side: 'end',
    },
    {
      target: '#global-report-trigger',
      title: 'Reportar',
      text: 'Si algo falla o echas algo en falta, escríbelo aquí.',
      side: 'top',
    },
  ],
  mobile: [
    {
      target: '[data-bottom-bar] [data-nav-item]',
      title: 'Navegación',
      text: 'Dashboard, Movimientos y Presupuesto, siempre a mano.',
      side: 'top',
    },
    { target: '[data-fab-apuntar]', title: 'Apuntar', text: APUNTAR, side: 'top' },
    {
      target: '[data-mobile-app-bar] [data-pending-trigger]',
      title: 'Por confirmar',
      text: 'Los fijos que ya tocan y esperan a que los confirmes.',
      side: 'bottom',
    },
    {
      target: '[data-mobile-app-bar] [data-search-trigger]',
      title: 'Buscar',
      text: 'Encuentra cualquier movimiento.',
      side: 'bottom',
    },
    {
      target: '[data-mobile-more-trigger]',
      title: 'Más',
      text: 'Patrimonio, Inversión, Objetivos, Datos, Configuración y tus reportes. Desde Configuración puedes repetir este recorrido.',
      side: 'top',
    },
  ],
}
