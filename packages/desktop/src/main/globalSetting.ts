import path from 'path'
import { app } from 'electron'

// Set `__static` path to static files in production / development depending on the environment
// [CUSTOM-BEGIN] CUSTOM-20260904-003 - fix Windows packaged startup error
// Upstream mangled the path by doubling every backslash (.replace(/\\/g, '\\\\')),
// which only stays harmless in dev (getAppPath uses forward slashes there) and
// breaks readFileSync of resources\static\preference.json in packaged builds on
// Windows ("Can not load static preference.json file" error dialog at startup).
// [CUSTOM-END] CUSTOM-20260904-003
;(global as unknown as { __static: string }).__static = path.join(
  app.isPackaged ? process.resourcesPath : app.getAppPath(),
  'static'
)
