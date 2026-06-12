import type { SectionId } from '../scripts/types'

export interface AppSectionConfig {
  id: SectionId
  label: string
}

export const APP_SECTIONS: AppSectionConfig[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'transactions', label: 'Movimientos' },
  { id: 'budget', label: 'Presupuesto' },
  { id: 'wealth', label: 'Patrimonio' },
  { id: 'investment', label: 'Inversión' },
  { id: 'goals', label: 'Objetivos' },
  { id: 'settings', label: 'Configuración' },
  { id: 'data', label: 'Datos' },
  { id: 'reports', label: 'Reportes' },
]
