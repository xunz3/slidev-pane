<script setup lang="ts">
import { useNav } from '@slidev/client/composables/useNav.ts'
import IconButton from '@slidev/client/internals/IconButton.vue'
import { useSidebarPresenterNav } from './composables/useSidebarPresenterNav'

const { isEmbedded } = useNav()
const { enterSidebarPresenter } = useSidebarPresenterNav()
</script>

<template>
  <IconButton v-if="!isEmbedded" title="Pane View" @click="enterSidebarPresenter">
    <div class="i-carbon:side-panel-open pane-entry" aria-hidden="true" />
  </IconButton>
</template>

<style scoped>
.pane-entry {
  width: 1rem;
  height: 1rem;
}
</style>
