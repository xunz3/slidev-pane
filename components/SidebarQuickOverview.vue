<script setup lang="ts">
import { useEventListener } from '@vueuse/core'
import { computed, ref, watchEffect } from 'vue'
import { currentOverviewPage, overviewRowCount } from '@slidev/client/logic/overview.ts'
import { isScreenshotSupported } from '@slidev/client/logic/screenshot.ts'
import { snapshotManager } from '@slidev/client/logic/snapshot.ts'
import { breakpoints, showOverview, windowSize } from '@slidev/client/state/index.ts'
import { CLICKS_MAX } from '@slidev/client/constants.ts'
import { pathPrefix } from '@slidev/client/env.ts'
import { createFixedClicks } from '@slidev/client/composables/useClicks.ts'
import { useNav } from '@slidev/client/composables/useNav.ts'
import DrawingPreview from '@slidev/client/internals/DrawingPreview.vue'
import IconButton from '@slidev/client/internals/IconButton.vue'
import SlideContainer from '@slidev/client/internals/SlideContainer.vue'
import SlideWrapper from '@slidev/client/internals/SlideWrapper.vue'
import { useSidebarPresenterNav } from '../composables/useSidebarPresenterNav'

const nav = useNav()
const { currentSlideNo, slides } = nav
const { goSidebar } = useSidebarPresenterNav()

function close() {
  showOverview.value = false
}

function go(page: number) {
  goSidebar(page)
  close()
}

function focus(page: number) {
  if (page === currentOverviewPage.value)
    return true
  return false
}

const xs = breakpoints.smaller('xs')
const sm = breakpoints.smaller('sm')

const padding = 4 * 16 * 2
const gap = 2 * 16
const cardWidth = computed(() => {
  if (xs.value)
    return windowSize.width.value - padding
  else if (sm.value)
    return (windowSize.width.value - padding - gap) / 2
  return 300
})

const rowCount = computed(() => {
  return Math.floor((windowSize.width.value - padding) / (cardWidth.value + gap))
})

const keyboardBuffer = ref('')

async function captureSlidesOverview() {
  showOverview.value = false
  await snapshotManager.startCapturing(nav)
  showOverview.value = true
}

useEventListener('keypress', (e) => {
  if (!showOverview.value) {
    keyboardBuffer.value = ''
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (keyboardBuffer.value) {
      go(+keyboardBuffer.value)
      keyboardBuffer.value = ''
    }
    else {
      go(currentOverviewPage.value)
    }
    return
  }
  const num = Number.parseInt(e.key.replace(/\D/g, ''))
  if (Number.isNaN(num)) {
    keyboardBuffer.value = ''
    return
  }
  if (!keyboardBuffer.value && num === 0)
    return

  keyboardBuffer.value += String(num)

  if (+keyboardBuffer.value >= slides.value.length) {
    keyboardBuffer.value = ''
    return
  }

  const extactMatch = slides.value.findIndex(i => `/${i.no}` === keyboardBuffer.value)
  if (extactMatch !== -1)
    currentOverviewPage.value = extactMatch + 1

  if (+keyboardBuffer.value * 10 > slides.value.length) {
    go(+keyboardBuffer.value)
    keyboardBuffer.value = ''
  }
})

watchEffect(() => {
  currentOverviewPage.value = currentSlideNo.value
  overviewRowCount.value = rowCount.value
})
</script>

<template>
  <Transition
    enter-active-class="duration-150 ease-out"
    enter-from-class="opacity-0 scale-102 !backdrop-blur-0px"
    leave-active-class="duration-200 ease-in"
    leave-to-class="opacity-0 scale-102 !backdrop-blur-0px"
  >
    <div
      v-if="showOverview"
      class="fixed left-0 right-0 top-0 h-[calc(var(--vh,1vh)*100)] z-modal bg-main !bg-opacity-75 p-16 py-20 overflow-y-auto backdrop-blur-5px select-none"
      @click="close"
    >
      <div
        class="grid gap-y-4 gap-x-8 w-full"
        :style="`grid-template-columns: repeat(auto-fit,minmax(${cardWidth}px,1fr))`"
      >
        <div
          v-for="(route, idx) of slides"
          :key="route.no"
          class="relative"
        >
          <div
            class="inline-block border rounded overflow-hidden bg-main hover:border-primary transition"
            :class="(focus(idx + 1) || currentOverviewPage === idx + 1) ? 'border-primary' : 'border-main'"
            @click="go(route.no)"
          >
            <SlideContainer
              :key="route.no"
              :no="route.no"
              :use-snapshot="true"
              :width="cardWidth"
              class="pointer-events-none"
            >
              <SlideWrapper
                :clicks-context="createFixedClicks(route, CLICKS_MAX)"
                :route="route"
                render-context="overview"
              />
              <DrawingPreview :page="route.no" />
            </SlideContainer>
          </div>
          <div
            class="absolute top-0"
            :style="`left: ${cardWidth + 5}px`"
          >
            <template v-if="keyboardBuffer && String(idx + 1).startsWith(keyboardBuffer)">
              <span class="text-green font-bold">{{ keyboardBuffer }}</span>
              <span class="opacity-50">{{ String(idx + 1).slice(keyboardBuffer.length) }}</span>
            </template>
            <span v-else class="opacity-50">
              {{ idx + 1 }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
  <div
    v-show="showOverview"
    class="fixed top-4 right-4 z-modal text-gray-400 flex flex-col items-center gap-2"
  >
    <IconButton title="Close" class="text-2xl" @click="close">
      <div class="i-carbon:close" />
    </IconButton>
    <IconButton
      v-if="__SLIDEV_FEATURE_PRESENTER__"
      as="a"
      title="Slides Overview"
      target="_blank"
      :href="`${pathPrefix}overview`"
      tab-index="-1"
      class="text-2xl"
    >
      <div class="i-carbon:list-boxes" />
    </IconButton>
    <IconButton
      v-if="__DEV__ && isScreenshotSupported"
      title="Capture slides as images"
      class="text-2xl"
      @click="captureSlidesOverview"
    >
      <div class="i-carbon:drop-photo" />
    </IconButton>
  </div>
</template>
