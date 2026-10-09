<template>
  <div
    ref="panelEl"
    class="side-bar-workspace"
  >
    <div class="title">
      <span class="name text-overflow">{{ workspaceName || t('sideBar.workspace.title') }}</span>
      <span
        v-if="dirty"
        class="dirty"
        :title="t('sideBar.workspace.unsaved')"
      >●</span>
    </div>

    <div class="toolbar">
      <el-button
        text
        size="small"
        @click="openWorkspace"
      >
        {{ t('sideBar.workspace.open') }}
      </el-button>
      <el-dropdown
        trigger="click"
        @command="handleRecentCommand"
      >
        <el-button
          text
          size="small"
        >
          {{ t('sideBar.workspace.openRecent') }}
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-if="!recentWorkspaceFiles.length"
              disabled
            >
              {{ t('sideBar.workspace.noRecent') }}
            </el-dropdown-item>
            <el-dropdown-item
              v-for="file of recentWorkspaceFiles"
              :key="file"
              :command="file"
              :title="file"
            >
              {{ fileName(file) }}
            </el-dropdown-item>
            <el-dropdown-item
              v-if="recentWorkspaceFiles.length"
              divided
              :command="CLEAR_RECENTS_COMMAND"
            >
              {{ t('sideBar.workspace.clearRecent') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button
        text
        size="small"
        @click="addFolder"
      >
        {{ t('sideBar.workspace.addFolder') }}
      </el-button>
      <el-button
        text
        size="small"
        :disabled="!rootStates.length"
        @click="saveWorkspace(false)"
      >
        {{ t('sideBar.workspace.save') }}
      </el-button>
      <el-button
        text
        size="small"
        @click="saveWorkspace(true)"
      >
        {{ t('sideBar.workspace.saveAs') }}
      </el-button>
      <el-button
        text
        size="small"
        :disabled="!rootStates.length"
        @click="closeWorkspace"
      >
        {{ t('sideBar.workspace.close') }}
      </el-button>
    </div>

    <div
      v-if="restorePending"
      class="state"
    >
      {{ t('sideBar.workspace.loading') }}
    </div>

    <div
      v-else-if="!rootStates.length"
      class="state empty"
    >
      <span>{{ t('sideBar.workspace.noWorkspace') }}</span>
      <div class="centered-group">
        <button
          class="button-primary"
          @click="openWorkspace"
        >
          {{ t('sideBar.workspace.open') }}
        </button>
        <button
          class="button-secondary"
          @click="addFolder"
        >
          {{ t('sideBar.workspace.addFolder') }}
        </button>
      </div>
    </div>

    <div
      v-else
      class="roots"
    >
      <template
        v-for="state of rootStates"
        :key="state.path"
      >
        <div
          v-if="!state.tree"
          class="state"
        >
          {{ t('sideBar.workspace.readError') }}
        </div>
        <workspace-tree-folder
          v-else
          :folder="state.tree"
          :depth="0"
          is-root
        />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '@/store/workspace'
import WorkspaceTreeFolder from './workspaceTreeFolder.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const workspaceStore = useWorkspaceStore()
const panelEl = ref<HTMLDivElement | null>(null)

const { rootStates, workspaceName, dirty, restorePending, recentWorkspaceFiles } =
  storeToRefs(workspaceStore)

const CLEAR_RECENTS_COMMAND = '__clear_recent_workspaces__'

const fileName = (pathname: string): string => window.path.basename(pathname)

const handleRecentCommand = (command: string): void => {
  if (command === CLEAR_RECENTS_COMMAND) {
    workspaceStore.CLEAR_RECENTS()
    return
  }
  workspaceStore.OPEN_WORKSPACE(command)
}

const openWorkspace = (): void => {
  workspaceStore.OPEN_WORKSPACE()
}

const addFolder = (): void => {
  workspaceStore.ADD_FOLDERS()
}

const saveWorkspace = (saveAs: boolean): void => {
  workspaceStore.SAVE_WORKSPACE(saveAs)
}

const closeWorkspace = (): void => {
  workspaceStore.CLOSE_WORKSPACE()
}

onMounted(() => {
  // Dismiss pending create/rename inputs and selection on any outside click.
  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName !== 'INPUT') {
      workspaceStore.CHANGE_ACTIVE_ITEM({})
      workspaceStore.createCache = {}
      workspaceStore.renameCache = null
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      workspaceStore.createCache = {}
      workspaceStore.renameCache = null
    }
  })
})
</script>

<style scoped>
.side-bar-workspace {
  font-size: 14px;
  color: var(--sideBarColor);
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.title {
  height: 30px;
  line-height: 30px;
  padding: 0 15px;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.title > .name {
  flex: 1;
  font-weight: 600;
  color: var(--sideBarTitleColor);
}
.title > .dirty {
  color: var(--themeColor);
  margin-left: 6px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  padding: 0 8px 6px;
  flex-shrink: 0;
  & :deep(.el-button) {
    margin: 0 2px 2px 0;
  }
}
.roots {
  flex: 1;
  overflow: auto;
}
.roots::-webkit-scrollbar:vertical {
  width: 8px;
}
.state {
  padding: 24px 15px;
  color: var(--sideBarTextColor);
  text-align: center;
}
.state.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 40px;
}
.centered-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 12px;
}
.button-primary,
.button-secondary {
  margin-top: 8px;
  padding: 6px 14px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
}
.button-primary {
  background-color: var(--buttonPrimaryBgColor);
  color: var(--buttonPrimaryFontColor);
}
.button-secondary {
  background-color: var(--sideBarItemHoverBgColor);
  color: var(--sideBarColor);
}
</style>
