<template>
  <div
    :title="file.pathname"
    class="cd-file"
    :class="{ current: isCurrent }"
    :style="{ 'padding-left': `${depth * 14 + 32}px` }"
    @click="handleClick"
  >
    <file-icon :name="file.name" />
    <span>{{ file.name }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCurrentDirStore, type CurrentDirFileNode } from '@/store/currentDir'
import FileIcon from './icon.vue'

const props = defineProps<{
  file: CurrentDirFileNode
  depth: number
}>()

const currentDirStore = useCurrentDirStore()

const isCurrent = computed(() => currentDirStore.isCurrentFile(props.file.pathname))

const handleClick = (): void => {
  currentDirStore.OPEN_FILE(props.file.pathname)
}
</script>

<style scoped>
.cd-file {
  display: flex;
  position: relative;
  align-items: center;
  cursor: default;
  user-select: none;
  height: 30px;
  box-sizing: border-box;
  padding-right: 15px;
  &:hover {
    background: var(--sideBarItemHoverBgColor);
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &::before {
    content: '';
    position: absolute;
    display: block;
    left: 0;
    background: var(--themeColor);
    width: 2px;
    height: 0;
    top: 50%;
    transform: translateY(-50%);
    transition: all 0.2s ease;
  }
}

.cd-file.current::before {
  height: 100%;
}

.cd-file.current > span {
  color: var(--themeColor);
}
</style>
