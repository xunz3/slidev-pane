<script setup lang="ts">
import { useNav } from '@slidev/client/composables/useNav.ts'
import IconButton from '@slidev/client/internals/IconButton.vue'
import { useSidebarPresenterNav } from './composables/useSidebarPresenterNav'

const { isEmbedded } = useNav()
const { enterSidebarPresenter } = useSidebarPresenterNav()
</script>

<template>
  <IconButton v-if="!isEmbedded" title="Pane View" @click="enterSidebarPresenter">
    <div class="text-[9px] font-semibold tracking-[0.06em] uppercase">
      Pane
    </div>
  </IconButton>
</template>
