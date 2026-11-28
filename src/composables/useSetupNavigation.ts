import { useUiStore } from '../stores/ui'
import { useSectionNavigation } from './useSectionNavigation'

/** Takes the user to a setting that a section is missing. */
export function useSetupNavigation() {
  const uiStore = useUiStore()
  const { navigateTo } = useSectionNavigation()

  function editCategories(): void {
    uiStore.settingsTab = 'categories'
    navigateTo('settings')
  }

  return { editCategories }
}
