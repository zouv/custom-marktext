<template>
  <div class="side-bar-current-dir">
    <div class="title" :title="dirLabel">
      <span class="text-overflow">{{ t('sideBar.currentDir.title') }}</span>
      <a href="javascript:;" :title="t('sideBar.currentDir.refresh')" @click.stop="refresh">
        <el-icon :size="14"><RefreshRight /></el-icon>
      </a>
    </div>
    <div v-if="dirPath" class="dir-header text-overflow" :title="dirPath">
      {{ dirName }}
    </div>
    <div v-if="error" class="status">
      {{ t('sideBar.currentDir.readError') }}
      <button class="button-primary" @click.stop="refresh">
        {{ t('sideBar.currentDir.retry') }}
      </button>
    </div>
    <div v-else-if="!dirPath" class="status">
      {{ t('sideBar.currentDir.noDirectory') }}
    </div>
    <div v-else-if="loading" class="status">
      {{ t('sideBar.currentDir.loading') }}
    </div>
    <div v-else-if="files.length === 0" class="status">
      {{ t('sideBar.currentDir.empty') }}
    </div>
    <div v-else class="file-list">
      <div
        v-for="file of files"
        :key="file.pathname"
        :title="file.pathname"
        class="side-bar-file"
        :class="{ current: currentFile?.pathname && isCurrent(file.pathname) }"
        @click="handleFileClick(file)"
      >
        <file-icon :name="file.name" />
        <span>{{ file.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { RefreshRight } from '@element-plus/icons-vue'
import { useEditorStore } from '@/store/editor'
import FileIcon from './icon.vue'

interface DirFileEntry {
  name: string
  pathname: string
}

const { t } = useI18n()
const editorStore = useEditorStore()

const files = ref<DirFileEntry[]>([])
const loading = ref(false)
const error = ref(false)

const { currentFile, tabs } = storeToRefs(editorStore)

// Untitled tabs have an empty pathname; the panel stays in its
// "no directory" state until the file is saved to disk.
const dirPath = computed<string>(() => {
  const pathname = currentFile.value?.pathname
  return pathname ? window.path.dirname(pathname) : ''
})

const dirName = computed<string>(() => (dirPath.value ? window.path.basename(dirPath.value) : ''))

const dirLabel = computed<string>(() =>
  dirPath.value
    ? `${t('sideBar.currentDir.title')} — ${dirPath.value}`
    : t('sideBar.currentDir.title')
)

const isCurrent = (pathname: string): boolean =>
  !!currentFile.value && window.fileUtils.isSamePathSync(currentFile.value.pathname, pathname)

const handleFileClick = (file: DirFileEntry): void => {
  const openedTab = tabs.value.find((f) =>
    window.fileUtils.isSamePathSync(f.pathname, file.pathname)
  )
  if (openedTab) {
    if (isCurrent(file.pathname)) return
    editorStore.UPDATE_CURRENT_FILE(openedTab)
  } else {
    window.electron.ipcRenderer.send('mt::open-file', file.pathname, {})
  }
}

const load = async (dir: string): Promise<void> => {
  loading.value = true
  error.value = false
  try {
    const entries = await window.fileUtils.readdir(dir)
    files.value = entries
      .filter((name) => window.fileUtils.hasMarkdownExtension(name))
      .map((name) => ({ name, pathname: window.path.join(dir, name) }))
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
  } catch {
    files.value = []
    error.value = true
  } finally {
    loading.value = false
  }
}

const refresh = (): void => {
  if (dirPath.value) load(dirPath.value).catch(() => {})
}

// Reload when the active tab moves to another directory; skip transient
// empty pathnames during tab switches.
watch(
  dirPath,
  (dir) => {
    if (dir) load(dir).catch(() => {})
    else files.value = []
  },
  { immediate: true }
)
</script>

<style scoped>
.side-bar-current-dir {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.side-bar-current-dir > .title {
  height: 35px;
  line-height: 35px;
  padding: 0 15px 0 25px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  color: var(--sideBarTitleColor);
  font-weight: 600;
  font-size: 16px;
}

.side-bar-current-dir > .title > span {
  flex: 1;
  user-select: none;
}

.side-bar-current-dir > .title > a {
  display: none;
  text-decoration: none;
  color: var(--sideBarIconColor);
  margin-left: 8px;
}

.side-bar-current-dir > .title:hover > a,
.side-bar-current-dir > .title > a:hover {
  display: inline-flex;
}

.side-bar-current-dir > .title > a:hover {
  color: var(--highlightThemeColor);
}

.dir-header {
  height: 28px;
  line-height: 28px;
  padding: 0 15px;
  flex-shrink: 0;
  color: var(--sideBarTextColor);
  font-size: 13px;
  border-bottom: 1px solid var(--itemBgColor);
}

.status {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 15px;
  color: var(--sideBarTextColor);
  font-size: 13px;
  user-select: none;
}

.status > button {
  margin-top: 10px;
}

.file-list {
  flex: 1;
  overflow: auto;
}

.file-list::-webkit-scrollbar:vertical {
  width: 8px;
}

.side-bar-file {
  display: flex;
  position: relative;
  align-items: center;
  cursor: default;
  user-select: none;
  height: 30px;
  box-sizing: border-box;
  padding-left: 15px;
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

.side-bar-file.current::before {
  height: 100%;
}

.side-bar-file.current > span {
  color: var(--themeColor);
}

.button-primary {
  border: none;
  border-radius: 3px;
  padding: 4px 12px;
  cursor: pointer;
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
}

.button-primary:hover {
  background-color: var(--buttonPrimaryBgColorHover);
  color: var(--buttonPrimaryFontColorHover);
}
</style>
