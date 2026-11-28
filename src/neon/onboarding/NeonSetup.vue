<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import { SETUP_LAST_STEP, useSetup, useSetupAutoOpen } from '../../composables/useSetup'
import { useFinancialStateStore } from '../../stores/financial-state'
import { useUiStore } from '../../stores/ui'
import NeonButton from '../ui/NeonButton.vue'
import { SETUP_STEPS } from './setup-steps'

// The setup wizard (#452): a full-screen dialog with one screen per step. On
// the desktop frame a column lists the steps; below it, a bar on top counts
// them. Everything is created inside it, so it never sends the user to another
// section. Closed before «Listo», it leaves a line on top of the section to
// resume it.
useSetupAutoOpen()
const setup = useSetup()
const uiStore = useUiStore()
const financial = useFinancialStateStore()

const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const main = useTemplateRef<HTMLElement>('main')

const current = computed(() => SETUP_STEPS[setup.step.value]!)
/** The numbered steps: all but «Cómo empiezas». */
const numbered = SETUP_STEPS.slice(1)
const total = numbered.length

const accounts = computed(() => financial.accounts.length)

/** Whether an optional step has something in it: «Siguiente» then, else «Saltar». */
const filled = computed(() => {
  switch (setup.step.value) {
    case 3:
      return financial.state.recurringRules.length > 0
    case 4:
      return financial.state.investmentAssets.length > 0 || financial.state.stockEvents.enabled
    default:
      return true
  }
})

const advance = computed(() => {
  if (setup.step.value === SETUP_LAST_STEP)
    return { label: 'Entendido', disabled: accounts.value === 0 }
  if (setup.step.value === 2) return { label: 'Siguiente', disabled: accounts.value === 0 }
  return { label: filled.value ? 'Siguiente' : 'Saltar', disabled: false }
})

const note = computed(() => {
  if (setup.step.value !== 2 || accounts.value === 0) return ''
  return accounts.value === 1 ? '1 cuenta' : `${accounts.value} cuentas`
})

function next(): void {
  if (setup.step.value === SETUP_LAST_STEP) setup.finish()
  else void setup.go(setup.step.value + 1)
}

function back(): void {
  void setup.go(setup.step.value - 1)
}

watch(
  () => uiStore.setupOpen,
  async (open) => {
    await nextTick()
    const element = dialog.value
    if (!element) return
    if (open && !element.open) {
      element.showModal()
      focusTitle()
    } else if (!open && element.open) element.close()
  },
  { immediate: true },
)

function focusTitle(): void {
  main.value?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true })
}

// Each step starts at the top, with the focus on its title.
watch(
  () => setup.step.value,
  async () => {
    await nextTick()
    if (main.value) main.value.scrollTop = 0
    focusTitle()
  },
)

function onCancel(event: Event): void {
  event.preventDefault()
  setup.dismiss()
}

/** For tests: whether the wizard has decided, and what. */
const state = computed(() =>
  !setup.available.value
    ? 'loading'
    : uiStore.setupOpen
      ? 'open'
      : setup.completed.value
        ? 'complete'
        : 'available',
)

const progress = (index: number) =>
  index < setup.step.value ? 'done' : index === setup.step.value ? 'current' : 'next'
</script>

<template>
  <div class="contents" :data-setup-state="state">
    <aside
      v-if="setup.canResume.value && financial.state.onboardingPresented"
      class="bg-panel border-line rounded-card flex flex-wrap items-center justify-between gap-3 border px-5 py-3.5"
      aria-label="Puesta en marcha"
      data-setup-resume
    >
      <p class="text-soft text-[15px] font-bold">Tu puesta en marcha está a medias.</p>
      <NeonButton @click="setup.resume">Retomar puesta en marcha</NeonButton>
    </aside>

    <dialog
      ref="dialog"
      class="bg-bg text-text m-0 h-(--ui-dvh) max-h-none w-full max-w-none p-0 backdrop:bg-transparent"
      aria-labelledby="setup-title"
      data-setup
      :data-setup-step="setup.step.value"
      @cancel="onCancel"
    >
      <div class="frame:grid-cols-[400px_minmax(0,1fr)] grid h-full grid-cols-1">
        <aside
          class="bg-side border-side-line frame:flex hidden min-h-0 flex-col border-e px-9 py-10"
          aria-label="Pasos"
        >
          <p class="font-display text-brand tracking-brand font-extrabold">
            finanzas<span class="text-accent">.</span>
          </p>
          <p class="text-muted text-label tracking-label mbs-14 font-extrabold uppercase">
            Puesta en marcha
          </p>
          <ol class="mbs-4 grid gap-1">
            <li
              v-for="(item, index) in numbered"
              :key="item.name"
              class="rounded-field flex min-h-13 items-center gap-3.5 px-3.5 text-[16px]"
              :class="{
                'bg-panel2 text-text font-extrabold': progress(index + 1) === 'current',
                'text-soft font-semibold': progress(index + 1) === 'done',
                'text-muted font-semibold': progress(index + 1) === 'next',
              }"
              :aria-current="progress(index + 1) === 'current' ? 'step' : undefined"
            >
              <span
                class="font-display grid size-[30px] shrink-0 place-items-center rounded-full text-[13px] font-semibold"
                :class="{
                  'bg-panel2 text-gain': progress(index + 1) === 'done',
                  'border-accent text-accent-text border': progress(index + 1) === 'current',
                  'border-ctrl-line border': progress(index + 1) === 'next',
                }"
                aria-hidden="true"
              >
                <svg
                  v-if="progress(index + 1) === 'done'"
                  viewBox="0 0 24 24"
                  class="size-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M5 12l5 5 9-10" />
                </svg>
                <template v-else>{{ index + 1 }}</template>
              </span>
              <span class="min-w-0 flex-1">{{ item.name }}</span>
              <span v-if="item.optional" class="text-faint text-meta font-normal">Opcional</span>
            </li>
          </ol>
          <div class="mbs-auto grid justify-items-start gap-1.5">
            <NeonButton class="px-0" @click="setup.dismiss">Ahora no</NeonButton>
            <p class="text-muted text-meta">Lo que crees se guarda. Puedes seguir otro día.</p>
          </div>
        </aside>

        <div class="flex min-h-0 flex-col">
          <header class="frame:hidden grid gap-2 pbe-1">
            <div class="flex min-h-16 items-center justify-between ps-3 pe-2">
              <button
                v-if="setup.step.value > 0"
                type="button"
                class="outline-accent grid size-11 place-items-center rounded-full focus-visible:outline-2"
                aria-label="Atrás"
                @click="back"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-[22px]"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <span v-else class="size-11" aria-hidden="true" />
              <span v-if="setup.step.value > 0" class="text-soft text-[14px] font-extrabold">
                Paso {{ setup.step.value }} de {{ total }}
              </span>
              <NeonButton @click="setup.dismiss">Ahora no</NeonButton>
            </div>
            <div v-if="setup.step.value > 0" class="grid grid-cols-6 gap-1 px-5" aria-hidden="true">
              <span
                v-for="index in total"
                :key="index"
                class="h-1 rounded-full"
                :class="
                  index < setup.step.value
                    ? 'bg-soft'
                    : index === setup.step.value
                      ? 'bg-accent'
                      : 'bg-line'
                "
              />
            </div>
          </header>

          <main ref="main" class="min-h-0 flex-1 overflow-y-auto">
            <div
              :key="setup.step.value"
              class="frame:px-0 frame:pbs-30 motion-safe:animate-rise mx-auto grid w-full max-w-[820px] content-start gap-3.5 px-4 pbs-7 pbe-10"
            >
              <p
                v-if="setup.step.value > 0"
                class="text-muted text-label tracking-label frame:block hidden font-extrabold uppercase"
              >
                Paso {{ setup.step.value }} de {{ total }}
              </p>
              <h1
                id="setup-title"
                tabindex="-1"
                class="font-display text-h1 tracking-h1 leading-h1 font-bold outline-none"
              >
                {{ current.title }}
              </h1>
              <p class="text-soft text-lede max-w-[640px]">{{ current.lede }}</p>
              <div class="mbs-5">
                <component :is="current.component" />
              </div>
            </div>
          </main>

          <footer
            v-if="setup.step.value > 0"
            class="frame:border-line frame:border-t frame:py-5.5 px-4 pbs-3 pbe-[calc(16px+env(safe-area-inset-bottom))]"
          >
            <div class="mx-auto flex w-full max-w-[820px] items-center justify-between gap-4">
              <NeonButton v-if="setup.step.value > 1" class="frame:px-0" @click="back">
                Atrás
              </NeonButton>
              <span v-else class="frame:block hidden" />
              <div class="frame:w-auto frame:flex-none flex min-w-0 flex-1 items-center gap-4.5">
                <span v-if="note" class="text-muted text-meta frame:inline hidden">{{ note }}</span>
                <NeonButton
                  variant="primary"
                  class="frame:w-auto frame:min-h-11 min-h-13 w-full"
                  :disabled="advance.disabled"
                  data-setup-next
                  @click="next"
                >
                  {{ advance.label }}
                </NeonButton>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </dialog>
  </div>
</template>
