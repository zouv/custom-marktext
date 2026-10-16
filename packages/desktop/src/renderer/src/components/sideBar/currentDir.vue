<template>
  <div class="side-bar-current-dir">
    <div
      class="title"
      :title="dirLabel"
    >
      <span class="text-overflow">{{ t('sideBar.currentDir.title') }}</span>
      <a
        href="javascript:;"
        :title="t('sideBar.currentDir.refresh')"
        @click.stop="refresh"
      >
        <el-icon
          :class="{ 'is-loading': loading }"
          :size="14"
        >
          <RefreshRight />
        </el-icon>
      </a>
    </div>
    <div class="pin-bar">
      <el-tooltip
        :content="t('sideBar.currentDir.pinHint')"
        placement="bottom-start"
      >
        <el-checkbox v-model="pinChecked">
          {{ t('sideBar.currentDir.pin') }}
        </el-checkbox>
      </el-tooltip>
    </div>
    <div
      v-if="!dirPath"
      class="status"
    >
      {{ t('sideBar.currentDir.noDirectory') }}
    </div>
    <div
      v-else-if="root && root.error && !root.loaded"
      class="status"
    >
      {{ t('sideBar.currentDir.readError') }}
      <button
        class="button-primary"
        @click.stop="refresh"
      >
        {{ t('sideBar.currentDir.retry') }}
      </button>
    </div>
    <div
      v-else
      class="tree"
    >
      <current-dir-folder
        v-if="root"
        :folder="root"
        :depth="0"
        is-root
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { RefreshRight } from '@element-plus/icons-vue'
import { useCurrentDirStore } from '@/store/currentDir'
import CurrentDirFolder from './currentDirFolder.vue'

const { t } = useI18n()
const currentDirStore = useCurrentDirStore()

const { root, dirPath } = storeToRefs(currentDirStore)

// The checkbox needs a writable v-model (el-checkbox is a controlled component:
// a read-only :model-value + @change never flips its internal state). Mirror it
// through a local ref so the store's SET_PINNED keeps owning the unpin
// snap-back behaviour.
const pinChecked = ref(currentDirStore.pinned)

watch(pinChecked, (value) => {
  if (value !== currentDirStore.pinned) currentDirStore.SET_PINNED(value)
})

watch(
  () => currentDirStore.pinned,
  (value) => {
    if (pinChecked.value !== value) pinChecked.value = value
  }
)

const loading = computed<boolean>(() => !!root.value?.loading)

const dirLabel = computed<string>(() =>
  dirPath.value
    ? `${t('sideBar.currentDir.title')} — ${dirPath.value}`
    : t('sideBar.currentDir.title')
)

const refresh = (): void => {
  currentDirStore.REFRESH().catch(() => {})
}

// Point the tree at the active file's directory. Folder state, including which
// folders are expanded and what they last listed, is kept by the store, so
// revisiting a directory restores the shape instead of re-scanning it. While
// pinned, FOLLOW_DIR is a no-op and only the refresh button re-reads the tree.
watch(dirPath, (dir) => currentDirStore.FOLLOW_DIR(dir), { immediate: true })
</script>

<style scoped>
.side-bar-current-dir {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  /* The title bar is position: fixed across the window top; clear it so the
     panel title no longer sits underneath it (upstream panels use a 35px
     placeholder for the same reason). */
  padding-top: var(--titleBarHeight);
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

.pin-bar {
  display: flex;
  align-items: center;
  height: 30px;
  padding: 0 15px 0 25px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--itemBgColor);
  font-size: 12px;
  :deep(.el-checkbox__label) {
    font-size: 12px;
  }
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

.tree {
  flex: 1;
  overflow: auto;
}

.tree::-webkit-scrollbar:vertical {
  width: 8px;
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
