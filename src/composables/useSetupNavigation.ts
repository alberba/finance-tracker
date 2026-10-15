import { useUiStore } from '../stores/ui'
import { useSectionNavigation } from './useSectionNavigation'

/** Open the existing setup forms after the destination section mounts. */
export function useSetupNavigation() {
  const uiStore = useUiStore()
  const { navigateTo } = useSectionNavigation()

  function createAccount(): void {
    uiStore.settingsTab = 'accounts'
    uiStore.setupAction = 'account'
    navigateTo('settings')
  }

  function editCategories(): void {
    uiStore.settingsTab = 'categories'
    navigateTo('settings')
  }

  function createMovement(): void {
    uiStore.setupAction = 'movement'
    uiStore.ui.txTab = 'registry'
    navigateTo('transactions')
  }

  return { createAccount, editCategories, createMovement, navigateTo }
}
