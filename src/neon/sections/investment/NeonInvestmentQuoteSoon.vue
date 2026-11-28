<script setup lang="ts">
// Where an asset's detail will show its symbol's quote (#524): the price, the
// day's change and the time. Until then the box says it is coming, with the
// figures it will hold drawn empty. The desktop and the mobile detail share it.
</script>

<template>
  <div class="bg-panel2 rounded-card grid gap-1.5 px-4 py-3.5" data-asset-quote>
    <div class="flex items-center justify-between gap-3">
      <span class="text-muted text-meta font-bold">Cotización</span>
      <span class="bg-sel-bg text-sel-text rounded-pill px-2.5 py-0.5 text-[12px] font-extrabold">
        Próximamente
      </span>
    </div>
    <div class="text-muted flex items-baseline justify-between gap-3 opacity-60" aria-hidden="true">
      <span class="font-display text-[24px] leading-[1.05] font-semibold tracking-[-0.03em]">
        — €
      </span>
      <span class="font-display text-[15px] font-semibold">— % hoy</span>
    </div>
    <p class="text-muted text-meta m-0 font-semibold">
      Verás el precio del símbolo, su cambio del día y la hora.
    </p>
  </div>
</template>
