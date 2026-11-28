import type { Component } from 'vue'

import SetupAccounts from './steps/SetupAccounts.vue'
import SetupCategories from './steps/SetupCategories.vue'
import SetupDone from './steps/SetupDone.vue'
import SetupInvestment from './steps/SetupInvestment.vue'
import SetupPreferences from './steps/SetupPreferences.vue'
import SetupRecurring from './steps/SetupRecurring.vue'
import SetupStart from './steps/SetupStart.vue'

/** One screen of the setup wizard, in order: the index is the stored step. */
export interface SetupStep {
  /** The name in the list of steps; «Cómo empiezas» has none, it is the door. */
  name: string
  title: string
  lede: string
  optional: boolean
  component: Component
}

export const SETUP_STEPS: readonly SetupStep[] = [
  {
    name: '',
    title: 'Te damos la bienvenida',
    lede: 'Unos minutos para dejar tus finanzas listas: la moneda, tus cuentas y lo que se repite cada mes. Lo que no quieras hacer ahora, lo saltas.',
    optional: false,
    component: SetupStart,
  },
  {
    name: 'Moneda y tema',
    title: 'Moneda y tema',
    lede: 'La moneda en la que llevas tus cuentas y cómo quieres ver la app. Las dos cosas se cambian después en Configuración.',
    optional: false,
    component: SetupPreferences,
  },
  {
    name: 'Cuentas',
    title: 'Tus cuentas',
    lede: 'Dónde está tu dinero: el banco, el efectivo. Con una basta para empezar. Marca como liquidez las que podrías usar mañana mismo.',
    optional: false,
    component: SetupAccounts,
  },
  {
    name: 'Ingresos y gastos fijos',
    title: 'Ingresos y gastos fijos',
    lede: 'La nómina, el alquiler, las suscripciones. Cada vez que toquen, aparecen en «Por confirmar» para que las apuntes con un toque.',
    optional: true,
    component: SetupRecurring,
  },
  {
    name: '¿Inviertes?',
    title: '¿Inviertes?',
    lede: 'Fondos, acciones o criptomonedas. Puedes llevarlos a mano o conectar el servicio donde ya los tienes.',
    optional: true,
    component: SetupInvestment,
  },
  {
    name: 'Categorías',
    title: 'Categorías',
    lede: 'Con qué se clasifican tus movimientos. Ya tienes unas básicas: quita las que no uses y añade las que te falten.',
    optional: true,
    component: SetupCategories,
  },
  {
    name: 'Listo',
    title: 'Listo',
    lede: 'Esto es lo que has dejado preparado. Todo se cambia después en Configuración.',
    optional: false,
    component: SetupDone,
  },
]
