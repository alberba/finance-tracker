<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, nextTick, provide, ref, shallowRef, watch } from 'vue'

import { useAccountRequirement } from '../../../composables/useAccountRequirement'
import { formatMoney } from '../../../lib/format'
import { isDemoMode } from '../../../scripts/demo-mode'
import type { CategoryKey } from '../../../scripts/types'
import { useRecurringStore } from '../../../stores/recurring'
import { useSettingsStore } from '../../../stores/settings'
import NeonSwitch from '../../ui/NeonSwitch.vue'
import { ruleDeletion, type PendingDeletion } from './deletion'
import { useEntityActions, type EntityKind } from './entity-actions'
import NeonAccountBlock from './NeonAccountBlock.vue'
import NeonCategoryList from './NeonCategoryList.vue'
import NeonConnectionsBlock from './NeonConnectionsBlock.vue'
import NeonEntitySheet from './NeonEntitySheet.vue'
import NeonMobileRows from './NeonMobileRows.vue'
import NeonPreferencesBlock from './NeonPreferencesBlock.vue'
import NeonRuleFormPanel from './NeonRuleFormPanel.vue'
import NeonSecurityBlock from './NeonSecurityBlock.vue'
import { BARE_BLOCK } from './settings-layout'
import { MOBILE_CARD, PRESS } from './table-styles'
import {
  accountMeta,
  assetMeta,
  mobileIndex,
  PART_DESCRIPTIONS,
  ruleMeta,
  type AccountsTable,
  type AssetsTable,
  type LiabilitiesTable,
  type MobilePartId,
  type RulesTable,
  type SettingsPartId,
} from './view-model'

// Configuración in the mobile frame (artboard «Configuración · móvil · Pixel
// 10», #444): the same data as the desktop page, laid out for one column. An
// index of the apartados, grouped, each with a line of what it holds; tapping
// one opens it on its own screen with «‹ Ajustes» to go back. The tables
// become lists whose rows open a sheet to edit them; the rest of the blocks
// are the desktop ones, without their own title.
const props = defineProps<{
  isActive: boolean
  accounts: AccountsTable
  assets: AssetsTable
  liabilities: LiabilitiesTable
  rules: RulesTable
  counts: Record<SettingsPartId, number | null>
  security: boolean
}>()
const emit = defineEmits<{ ask: [deletion: PendingDeletion] }>()
const view = defineModel<MobilePartId | null>('view', { required: true })

provide(BARE_BLOCK, true)

const { viewModel } = storeToRefs(useSettingsStore())
const recurringStore = useRecurringStore()
const { needsAccount } = useAccountRequirement()

const groups = computed(() =>
  mobileIndex({
    counts: props.counts,
    alerts: props.assets.alerts,
    year: viewModel.value.year,
    currency: viewModel.value.currency,
    security: props.security,
    account: !isDemoMode(),
  }),
)
const current = computed(() =>
  groups.value.flatMap((group) => group.items).find((item) => item.id === view.value),
)

// Leaving the section and coming back starts from the index again.
watch(
  () => props.isActive,
  (active) => {
    if (!active) view.value = null
  },
)

// Each screen starts at its top, with the focus on its title.
watch(view, async () => {
  window.scrollTo?.({ top: 0 })
  await nextTick()
  if (props.isActive) document.getElementById('settings-title')?.focus({ preventScroll: true })
})

// ---- Cuentas, Activos, Pasivos ----
const accountRows = computed(() =>
  props.accounts.rows.map((row) => ({
    ...row,
    title: row.name,
    meta: accountMeta(row),
    amount: formatMoney(row.openingBalance),
  })),
)
const assetRows = computed(() =>
  props.assets.rows.map((row) => ({
    ...row,
    title: row.name,
    meta: assetMeta(row),
    amount: formatMoney(row.openingBalance),
  })),
)
const liabilityRows = computed(() =>
  props.liabilities.rows.map((row) => ({
    id: row.id,
    name: row.name,
    openingBalance: row.openingBalance,
    title: row.name,
    meta: 'Pasivo',
    amount: formatMoney(row.openingBalance),
  })),
)

const ENTITY_PARTS = [
  { part: 'cuentas', kind: 'accounts', rows: accountRows, totalLabel: 'Saldo inicial total' },
  { part: 'activos', kind: 'investmentAssets', rows: assetRows, totalLabel: 'Valor inicial total' },
  { part: 'pasivos', kind: 'liabilities', rows: liabilityRows, totalLabel: 'Deuda inicial total' },
] as const
const TOTALS: Record<EntityKind, () => number> = {
  accounts: () => props.accounts.total,
  investmentAssets: () => props.assets.total,
  liabilities: () => props.liabilities.total,
}
const entityPart = computed(() => ENTITY_PARTS.find((entry) => entry.part === view.value))
const actions = {
  accounts: useEntityActions('accounts'),
  investmentAssets: useEntityActions('investmentAssets'),
  liabilities: useEntityActions('liabilities'),
}

type EntityRow = { id: string; name: string; openingBalance: number }
const sheet = shallowRef<{ kind: EntityKind; row: EntityRow | null } | null>(null)
const sheetOpen = ref(false)

function openSheet(kind: EntityKind, row: EntityRow | null): void {
  sheet.value = { kind, row }
  sheetOpen.value = true
}

// ---- Categorías ----
const CATEGORY_TABS = [
  { key: 'incomeCategories', label: 'Ingresos', noun: 'de ingresos' },
  { key: 'expenseCategories', label: 'Gastos', noun: 'de gastos' },
  { key: 'investmentCategories', label: 'Inversión', noun: 'de inversión' },
] as const satisfies ReadonlyArray<{ key: CategoryKey; label: string; noun: string }>
const categoryTab = ref<CategoryKey>('expenseCategories')
const category = computed(() => CATEGORY_TABS.find((tab) => tab.key === categoryTab.value)!)

// ---- Recurrentes ----
const ruleRows = computed(() =>
  props.rules.rows.map((row) => ({
    ...row,
    title: row.name,
    meta: ruleMeta(row),
    gain: row.income,
    muted: !row.active,
  })),
)
const ruleOpen = ref(false)

function newRule(): void {
  if (!needsAccount.value) ruleOpen.value = true
}
</script>

<template>
  <div v-if="!current" class="grid min-w-0 gap-5" data-settings-mobile="index">
    <header class="grid gap-1.5">
      <p class="text-muted text-label tracking-label font-sans font-extrabold uppercase">
        Datos maestros
      </p>
      <h1
        id="settings-title"
        tabindex="-1"
        class="font-display text-h1 motion-safe:animate-rise font-bold outline-none"
      >
        Configuración
      </h1>
      <p class="text-soft text-[15px] leading-normal">
        Cada cuenta, activo y regla con todo lo suyo en un solo sitio.
      </p>
    </header>
    <nav aria-label="Ajustes" :class="MOBILE_CARD">
      <template v-for="group in groups" :key="group.title">
        <h2
          class="text-muted text-label tracking-label px-1 pbs-[18px] pbe-1.5 font-sans font-extrabold uppercase"
        >
          {{ group.title }}
        </h2>
        <ul class="grid">
          <li v-for="item in group.items" :key="item.id" class="border-line border-t">
            <button
              type="button"
              class="rounded-field flex min-h-16 w-full min-w-0 items-center gap-3 px-1 py-2 text-start"
              :class="PRESS"
              :data-settings-open="item.id"
              @click="view = item.id"
            >
              <span
                class="bg-panel2 text-soft grid size-10 shrink-0 place-items-center rounded-full"
                aria-hidden="true"
              >
                <svg
                  class="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path :d="item.icon" />
                </svg>
              </span>
              <span class="grid min-w-0 flex-1 gap-0.5">
                <span class="text-row truncate font-bold">{{ item.label }}</span>
                <span class="text-muted text-meta truncate" :data-settings-meta="item.id">
                  {{ item.meta }}
                </span>
              </span>
              <svg
                class="text-muted size-[18px] shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        </ul>
      </template>
    </nav>
  </div>

  <div v-else class="grid min-w-0 gap-4" :data-settings-mobile="current.id">
    <div>
      <button
        type="button"
        class="text-accent-text text-row inline-flex min-h-11 items-center gap-0.5 pe-3 font-extrabold"
        :class="PRESS"
        @click="view = null"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 6l-6 6 6 6" />
        </svg>
        Ajustes
      </button>
    </div>
    <header class="grid min-w-0 gap-1.5">
      <h1
        id="settings-title"
        tabindex="-1"
        class="font-display text-h1-detail tracking-h1 leading-[1.15] font-bold outline-none"
      >
        {{ current.label }}
      </h1>
      <p v-if="current.id === 'recurrentes'" class="text-soft text-[15px] leading-normal">
        Neto al mes de las activas
        <span
          class="font-display font-semibold whitespace-nowrap"
          :class="rules.net >= 0 ? 'text-gain' : 'text-loss'"
          data-settings-rules-net
          >{{ rules.netText }}</span
        >
      </p>
      <p v-else class="text-soft text-[15px] leading-normal">
        {{ PART_DESCRIPTIONS[current.id] }}
      </p>
    </header>

    <NeonMobileRows
      v-if="entityPart"
      :label="current.label"
      :rows="entityPart.rows.value"
      :delete-label="(row) => `Eliminar ${row.name}`"
      :edit-label="(row) => `Editar ${row.name}`"
      :add-label="actions[entityPart.kind].words.fresh"
      :total="{
        label: entityPart.totalLabel,
        value: formatMoney(TOTALS[entityPart.kind]()),
        hook: entityPart.part,
      }"
      @edit="openSheet(entityPart.kind, $event)"
      @remove="emit('ask', actions[entityPart.kind].deletion($event))"
      @add="openSheet(entityPart.kind, null)"
    />

    <template v-else-if="current.id === 'categorias'">
      <div
        role="group"
        aria-label="Tipo de categoría"
        class="bg-panel2 rounded-pill flex w-fit max-w-full gap-[3px] justify-self-center p-[3px]"
      >
        <button
          v-for="tab in CATEGORY_TABS"
          :key="tab.key"
          type="button"
          class="rounded-pill text-note min-h-9 px-3 font-extrabold pointer-coarse:min-h-11"
          :class="[PRESS, tab.key === categoryTab ? 'bg-sel-bg text-sel-text' : 'text-soft']"
          :aria-pressed="tab.key === categoryTab"
          @click="categoryTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
      <div :class="[MOBILE_CARD, 'pbs-3']">
        <NeonCategoryList
          :key="category.key"
          :title="category.label"
          :noun="category.noun"
          :category-key="category.key"
          :tags="viewModel[category.key]"
          @ask="emit('ask', $event)"
        />
      </div>
    </template>

    <template v-else-if="current.id === 'recurrentes'">
      <p v-if="needsAccount" class="text-muted text-note">
        Crea una cuenta para añadir reglas recurrentes.
      </p>
      <NeonMobileRows
        label="Reglas recurrentes"
        :rows="ruleRows"
        :delete-label="(row) => `Eliminar la regla ${row.name}`"
        :add-label="needsAccount ? undefined : 'Nueva regla'"
        @remove="
          emit(
            'ask',
            ruleDeletion($event, () => recurringStore.removeRule($event.id)),
          )
        "
        @add="newRule"
      >
        <template #trailing="{ row }">
          <NeonSwitch
            :model-value="row.active"
            :label="`Regla ${row.name} activa`"
            @update:model-value="recurringStore.toggleRule(row.id, $event)"
          />
        </template>
      </NeonMobileRows>
      <NeonRuleFormPanel v-model:open="ruleOpen" description="" />
    </template>

    <div v-else-if="current.id === 'preferencias'" :class="MOBILE_CARD">
      <NeonPreferencesBlock />
    </div>
    <div v-else-if="current.id === 'seguridad'" :class="[MOBILE_CARD, 'pbs-3']">
      <NeonSecurityBlock />
    </div>
    <NeonConnectionsBlock v-else-if="current.id === 'conexiones'" />
    <div v-else-if="current.id === 'cuenta'" :class="MOBILE_CARD">
      <NeonAccountBlock />
    </div>

    <NeonEntitySheet
      v-if="sheet"
      :key="sheet.kind"
      v-model:open="sheetOpen"
      :kind="sheet.kind"
      :row="sheet.row"
    />
  </div>
</template>
