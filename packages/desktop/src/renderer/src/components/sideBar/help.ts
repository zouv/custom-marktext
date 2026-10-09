import {
  Folder as FilesIcon,
  Search as SearchIcon,
  Memo as TocIcon,
  Files as CurrentDirIcon,
  // [CUSTOM-BEGIN] CUSTOM-20261009-001 - workspace panel icon
  FolderOpened as WorkspaceIcon,
  // [CUSTOM-END] CUSTOM-20261009-001
  Setting as SettingIcon
} from '@element-plus/icons-vue'
import { t } from '@/i18n'

export interface SideBarIconEntry {
  id: string
  name: () => string
  icon: unknown
}

export const sideBarIcons: SideBarIconEntry[] = [
  {
    id: 'files',
    name: () => t('sideBar.icons.files'),
    icon: FilesIcon
  },
  {
    id: 'search',
    name: () => t('sideBar.icons.search'),
    icon: SearchIcon
  },
  {
    id: 'toc',
    name: () => t('sideBar.icons.toc'),
    icon: TocIcon
  },
  // [CUSTOM-BEGIN] CUSTOM-20260909-001 - side bar "current directory" panel icon
  {
    id: 'currentDir',
    name: () => t('sideBar.icons.currentDir'),
    icon: CurrentDirIcon
  },
  // [CUSTOM-END] CUSTOM-20260909-001
  // [CUSTOM-BEGIN] CUSTOM-20261009-001 - workspace panel icon
  {
    id: 'workspace',
    name: () => t('sideBar.icons.workspace'),
    icon: WorkspaceIcon
  }
  // [CUSTOM-END] CUSTOM-20261009-001
]

export const sideBarBottomIcons: SideBarIconEntry[] = [
  {
    id: 'settings',
    name: () => t('sideBar.icons.settings'),
    icon: SettingIcon
  }
]
