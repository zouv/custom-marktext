// Context menu for the Workspace panel (CUSTOM-20261009-001).
//
// Built directly on the shared popup renderer, deliberately NOT on
// contextMenu/sideBar — that one routes every action through the single-root
// project store (activeItem/clipboard + bus events), which would make a
// workspace rename also drive the Files panel.

import { popupContextMenu, type ContextMenuItem } from '../popupMenu'
import { t } from '../../i18n'
import { useWorkspaceStore } from '@/store/workspace'

export interface WorkspaceMenuTarget {
  kind: 'root' | 'folder' | 'file'
  pathname: string
  name: string
  isDirectory: boolean
}

const SEPARATOR: ContextMenuItem = { type: 'separator' }

export const showWorkspaceContextMenu = (
  event: { clientX: number; clientY: number },
  target: WorkspaceMenuTarget
): void => {
  const store = useWorkspaceStore()

  const isContainer = target.isDirectory
  const containerPath = isContainer ? target.pathname : window.path.dirname(target.pathname)

  store.CHANGE_ACTIVE_ITEM({
    pathname: target.pathname,
    name: target.name,
    isDirectory: target.isDirectory,
    isFile: !target.isDirectory
  })

  const newFile: ContextMenuItem = {
    label: t('contextMenu.sideBar.newFile'),
    click: () => {
      store.createCache = { dirname: containerPath, type: 'file' }
    }
  }
  const newDirectory: ContextMenuItem = {
    label: t('contextMenu.sideBar.newDirectory'),
    click: () => {
      store.createCache = { dirname: containerPath, type: 'directory' }
    }
  }
  const rename: ContextMenuItem = {
    label: t('contextMenu.sideBar.rename'),
    click: () => {
      store.renameCache = target.pathname
    }
  }
  const remove: ContextMenuItem = {
    label: t('contextMenu.sideBar.moveToTrash'),
    click: () => store.REMOVE_ENTRY(target.pathname)
  }
  const showInFolder: ContextMenuItem = {
    label: t('contextMenu.sideBar.showInFolder'),
    click: () => window.electron.shell.showItemInFolder(target.pathname)
  }
  const copy: ContextMenuItem = {
    label: t('contextMenu.sideBar.copy'),
    click: () => store.CHANGE_CLIPBOARD({ type: 'copy', src: target.pathname })
  }
  const cut: ContextMenuItem = {
    label: t('contextMenu.sideBar.cut'),
    click: () => store.CHANGE_CLIPBOARD({ type: 'cut', src: target.pathname })
  }
  const paste: ContextMenuItem = {
    label: t('contextMenu.sideBar.paste'),
    enabled: !!store.clipboard,
    click: () => {
      store.PASTE_ENTRY()
    }
  }
  const refresh: ContextMenuItem = {
    label: t('sideBar.workspace.refresh'),
    click: () => {
      store.REFRESH_ROOT(target.pathname)
    }
  }

  let items: ContextMenuItem[]
  if (target.kind === 'root') {
    items = [
      {
        label: t('contextMenu.workspace.addFolder'),
        click: () => {
          store.ADD_FOLDERS()
        }
      },
      refresh,
      SEPARATOR,
      newFile,
      newDirectory,
      SEPARATOR,
      {
        label: t('contextMenu.workspace.saveWorkspace'),
        click: () => {
          store.SAVE_WORKSPACE(false)
        }
      },
      {
        label: t('contextMenu.workspace.saveWorkspaceAs'),
        click: () => {
          store.SAVE_WORKSPACE(true)
        }
      },
      SEPARATOR,
      {
        label: t('contextMenu.workspace.removeFolder'),
        click: () => {
          store.REMOVE_ROOT(target.pathname)
        }
      }
    ]
  } else {
    items = [
      ...(isContainer ? [newFile, newDirectory, SEPARATOR] : []),
      rename,
      remove,
      SEPARATOR,
      copy,
      cut,
      paste,
      SEPARATOR,
      showInFolder
    ]
  }

  popupContextMenu(items, { x: event.clientX, y: event.clientY })
}
