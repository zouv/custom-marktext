<template>
  <div class="ws-folder">
    <div
      ref="folderEl"
      class="folder-name"
      :style="{ 'padding-left': `${depth * 6 + 10}px` }"
      :class="{ active: activeItem.pathname === folder.pathname }"
      :title="folder.pathname"
      @click="toggle"
    >
      <el-icon
        class="icon-arrow"
        :class="{ fold: isCollapsed }"
        :size="12"
      >
        <ArrowRight />
      </el-icon>
      <input
        v-if="renameCache === folder.pathname"
        ref="renameInput"
        v-model="newName"
        type="text"
        class="rename"
        @click.stop="noop"
        @keypress.enter="rename"
      >
      <span
        v-else
        class="text-overflow"
      >{{ folder.name }}</span>
    </div>
    <div
      v-if="!isCollapsed"
      class="folder-contents"
    >
      <workspace-tree-folder
        v-for="childFolder of folder.folders"
        :key="childFolder.pathname"
        :folder="childFolder"
        :depth="depth + 1"
      />
      <input
        v-if="createCacheDirname === folder.pathname"
        ref="input"
        v-model="createName"
        placeholder="Enter .md file name"
        type="text"
        class="new-input"
        :style="{ 'margin-left': `${depth * 5 + 15}px` }"
        @keypress.enter="handleInputEnter"
      >
      <workspace-tree-file
        v-for="file of folder.files"
        :key="file.pathname"
        :file="file"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/store/workspace'
import WorkspaceTreeFile from './workspaceTreeFile.vue'
import { showWorkspaceContextMenu } from '../../contextMenu/workspace'
import { ArrowRight } from '@element-plus/icons-vue'
import type { WorkspaceTreeFolderNode } from '@shared/types/workspace'

const props = defineProps<{
  folder: WorkspaceTreeFolderNode
  depth: number
  isRoot?: boolean
}>()

const workspaceStore = useWorkspaceStore()
const { renameCache, createCache, activeItem } = storeToRefs(workspaceStore)

const createName = ref('')
const newName = ref('')
const folderEl = ref<HTMLDivElement | null>(null)
const renameInput = ref<HTMLInputElement | null>(null)
const input = ref<HTMLInputElement | null>(null)

// Roots' direct children start expanded; deeper levels start collapsed.
const isCollapsed = ref<boolean>(props.depth >= 2)

const createCacheDirname = computed<string | undefined>(() => {
  const cache = createCache.value as { dirname?: string }
  return cache.dirname
})

const toggle = (): void => {
  isCollapsed.value = !isCollapsed.value
}

const noop = (): void => {}

const handleInputEnter = (): void => {
  workspaceStore.CREATE_ENTRY(createName.value)
}

const rename = (): void => {
  workspaceStore.RENAME_ENTRY(newName.value)
}

onMounted(() => {
  if (!folderEl.value) return
  folderEl.value.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (renameCache.value) return
    showWorkspaceContextMenu(event, {
      kind: props.isRoot ? 'root' : 'folder',
      pathname: props.folder.pathname,
      name: props.folder.name,
      isDirectory: true
    })
  })
})

watch(renameCache, (value) => {
  if (value !== props.folder.pathname) return
  nextTick(() => {
    renameInput.value?.focus()
    newName.value = props.folder.name
  })
})

watch(createCacheDirname, (value) => {
  if (value !== props.folder.pathname) return
  isCollapsed.value = false
  nextTick(() => {
    input.value?.focus()
    createName.value = ''
  })
})
</script>

<style scoped>
.ws-folder > .folder-name {
  cursor: default;
  user-select: none;
  display: flex;
  align-items: center;
  height: 30px;
  padding-right: 15px;
  &:hover {
    background: var(--sideBarItemHoverBgColor);
  }
  & > .icon-arrow {
    flex-shrink: 0;
    color: var(--sideBarIconColor);
    margin-right: 5px;
    transition: transform 0.25s ease-out;
    transform: rotate(90deg);
  }
  & > .icon-arrow.fold {
    transform: rotate(0);
  }
}
.ws-folder > .folder-name.active > span {
  color: var(--sideBarTitleColor);
}
.new-input,
input.rename {
  outline: none;
  height: 22px;
  margin: 5px 0;
  padding: 0 6px;
  color: var(--sideBarColor);
  border: 1px solid var(--floatBorderColor);
  background: var(--floatBorderColor);
  width: 70%;
  border-radius: 3px;
}
</style>
