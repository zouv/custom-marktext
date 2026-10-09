<template>
  <div
    ref="fileEl"
    :title="file.pathname"
    class="ws-file"
    :style="{ 'padding-left': `${depth * 6 + 10}px`, opacity: file.isMarkdown ? 1 : 0.6 }"
    :class="{ current: isCurrent, active: activeItem.pathname === file.pathname }"
    @click="handleFileClick"
  >
    <file-icon :name="file.name" />
    <input
      v-if="renameCache === file.pathname"
      ref="renameInput"
      v-model="newName"
      type="text"
      class="rename"
      @click.stop="noop"
      @keypress.enter="rename"
    >
    <span v-else>{{ file.name }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/store/workspace'
import { useEditorStore } from '@/store/editor'
import FileIcon from './icon.vue'
import { showWorkspaceContextMenu } from '../../contextMenu/workspace'
import type { WorkspaceTreeFileNode } from '@shared/types/workspace'

const props = defineProps<{
  file: WorkspaceTreeFileNode
  depth: number
}>()

const workspaceStore = useWorkspaceStore()
const editorStore = useEditorStore()

const { renameCache, activeItem } = storeToRefs(workspaceStore)
const { currentFile } = storeToRefs(editorStore)

const newName = ref('')
const fileEl = ref<HTMLDivElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)

const isCurrent = computed(() =>
  !!currentFile.value &&
  window.fileUtils.isSamePathSync(currentFile.value.pathname, props.file.pathname)
)

const handleFileClick = (): void => {
  workspaceStore.OPEN_FILE(props.file.pathname, props.file.isMarkdown)
}

const noop = (): void => {}

const rename = (): void => {
  workspaceStore.RENAME_ENTRY(newName.value)
}

onMounted(() => {
  if (!fileEl.value) return
  fileEl.value.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (renameCache.value) return
    showWorkspaceContextMenu(event, {
      kind: 'file',
      pathname: props.file.pathname,
      name: props.file.name,
      isDirectory: false
    })
  })
})

watch(renameCache, (value) => {
  if (value !== props.file.pathname) return
  nextTick(() => {
    renameInput.value?.focus()
    newName.value = props.file.name
  })
})
</script>

<style scoped>
.ws-file {
  display: flex;
  position: relative;
  align-items: center;
  cursor: default;
  user-select: none;
  height: 30px;
  box-sizing: border-box;
  padding-right: 15px;
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &:hover {
    background: var(--sideBarItemHoverBgColor);
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
.ws-file.current::before {
  height: 100%;
}
.ws-file.current > span {
  color: var(--themeColor);
}
.ws-file.active > span {
  color: var(--sideBarTitleColor);
}
input.rename {
  height: 22px;
  outline: none;
  margin: 5px 0;
  padding: 0 8px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  width: 100%;
  border-radius: 3px;
}
</style>
