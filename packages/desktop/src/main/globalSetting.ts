import path from 'path'
import { app } from 'electron'
import { setLocalesDirectory } from 'common/i18n'

// A packaged app keeps `static/` beside the executable's resources; every other
// run — the dev server, `electron-vite preview`, the e2e suite — reads it from
// the app directory.
const staticPath = path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'static')

// Set `__static` path to static files in production / development depending on the environment
// [CUSTOM-BEGIN] CUSTOM-20260904-003 - fix Windows packaged startup error
// Upstream mangled the path by doubling every backslash (.replace(/\\/g, '\\\\')),
// which only stays harmless in dev (getAppPath uses forward slashes there) and
// breaks readFileSync of resources\static\preference.json in packaged builds on
// Windows ("Can not load static preference.json file" error dialog at startup).
// [CUSTOM-END] CUSTOM-20260904-003
;(global as unknown as { __static: string }).__static = staticPath

setLocalesDirectory(path.join(staticPath, 'locales'))
