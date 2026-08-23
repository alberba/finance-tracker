import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import ContributionDeleteDialog from '../../src/components/investment/ContributionDeleteDialog.vue'

type ContributionDeleteDialogApi = {
  open: (date: string) => void
}

describe('ContributionDeleteDialog', () => {
  it('abre el diálogo para la fecha solicitada y permite cancelarlo', async () => {
    const wrapper = mount(ContributionDeleteDialog, { attachTo: document.body })

    ;(wrapper.vm as unknown as ContributionDeleteDialogApi).open('2026-08-12')
    await nextTick()

    const dialog = wrapper.get('dialog')
    expect((dialog.element as HTMLDialogElement).open).toBe(true)
    expect(dialog.text()).toContain('2026-08-12')

    await wrapper.get('#contribution-delete-cancel').trigger('click')

    expect((dialog.element as HTMLDialogElement).open).toBe(false)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

  it('emite la fecha al confirmar y cierra el diálogo', async () => {
    const wrapper = mount(ContributionDeleteDialog, { attachTo: document.body })

    ;(wrapper.vm as unknown as ContributionDeleteDialogApi).open('2026-09-01')
    await nextTick()
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('confirm')).toEqual([['2026-09-01']])
    expect((wrapper.get('dialog').element as HTMLDialogElement).open).toBe(false)
    wrapper.unmount()
  })
})
