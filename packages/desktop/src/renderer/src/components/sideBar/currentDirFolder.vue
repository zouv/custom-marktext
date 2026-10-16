<template>
  <div class="cd-folder">
    <div
      :title="folder.pathname"
      class="cd-dir"
      :class="{ 'cd-root': isRoot, error: folder.error && !folder.loaded }"
      :style="{ 'padding-left': `${depth * 14 + 15}px` }"
      @click="handleClick"
    >
      <el-icon
        class="cd-arrow"
        :class="{ fold: !folder.expanded }"
        :size="12"
      >
        <ArrowRight />
      </el-icon>
      <span class="text-overflow">{{ folder.name }}</span>
    </div>
    <div v-if="folder.expanded">
      <current-dir-folder
        v-for="child of folder.folders"
        :key="child.pathname"
        :folder="child"
        :depth="depth + 1"
      />
      <div
        v-if="note"
        class="cd-note"
        :style="{ 'padding-left': `${(depth + 1) * 14 + 32}px` }"
      >
        {{ note }}
      </div>
      <current-dir-file
        v-for="file of folder.files"
        :key="file.pathname"
        :file="file"
        :depth="depth + 1"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRight } from '@element-plus/icons-vue'
import { useCurrentDirStore, type CurrentDirFolderNode } from '@/store/currentDir'
import CurrentDirFile from './currentDirFile.vue'

const props = defineProps<{
  folder: CurrentDirFolderNode
  depth: number
  isRoot?: boolean
}>()

const { t } = useI18n()
const currentDirStore = useCurrentDirStore()

// One line stands in for the contents of a folder that has nothing to show:
// still scanning, unreadable, or holding no markdown at all.
const note = computed<string>(() => {
  const { loading, loaded, error, folders, files } = props.folder
  if (loading && !loaded) return t('sideBar.currentDir.loading')
  if (error) return t('sideBar.currentDir.readError')
  if (loaded && !folders.length && !files.length) return t('sideBar.currentDir.empty')
  return ''
})

const handleClick = (): void => {
  currentDirStore.OPEN_FOLDER(props.folder.pathname)
}
</script>

<style scoped>
.cd-dir {
  display: flex;
  align-items: center;
  cursor: default;
  user-select: none;
  height: 30px;
  box-sizing: border-box;
  padding-right: 15px;
  &:hover {
    background: var(--sideBarItemHoverBgColor);
  }
  & > .cd-arrow {
    flex-shrink: 0;
    color: var(--sideBarIconColor);
    margin-right: 5px;
    transition: transform 0.25s ease-out;
    transform: rotate(90deg);
  }
  & > .cd-arrow.fold {
    transform: rotate(0);
  }
  & > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.cd-root > span {
  color: var(--sideBarTitleColor);
}

.cd-dir.error > span {
  color: var(--errorColor);
}

.cd-note {
  height: 24px;
  line-height: 24px;
  padding-right: 15px;
  color: var(--sideBarTextColor);
  font-size: 12px;
  font-style: italic;
  user-select: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
