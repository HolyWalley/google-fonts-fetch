import { fs } from 'memfs'
import { ofetch } from 'ofetch'
import type { FetchFontOptions } from '../types'
import { normalizeName } from './string'

const metadataURL = 'https://fonts.google.com/metadata/fonts'

/**
 * Download font by url and path
 * @param options
 */
export async function downloadFont(options: FetchFontOptions): Promise<string> {
  try {
    const name = normalizeName(options.name)
    const fontPath = `${options.outDir}/${name}`
    await fs.promises.mkdir(fontPath, { recursive: true })
    const response = await ofetch(options.url, {
      responseType: 'arrayBuffer',
      retry: 5,
      retryDelay: 1000,
    })
    if (!response) {
      return Promise.reject(new Error('Not found font'))
    }

    const buffer = new Uint8Array(response)
    await fs.promises.writeFile(`${fontPath}/${options.filename}`, buffer)
    return `${options.base}/${name}/${options.filename}`
  }
  catch (e) {
    return Promise.reject(e)
  }
}

/**
 * Download metadata by url and path
 * @param outputPath
 * @param override
 */
export async function downloadMetadata(outputPath: string, override = true): Promise<void> {
  if (!override) {
    try {
      await fs.promises.access(outputPath)
      return
    }
    catch (e) {
      // Continue
    }
  }

  try {
    const dirname = outputPath.substring(0, outputPath.lastIndexOf('/'))
    await fs.promises.mkdir(dirname, { recursive: true })
    const response = await ofetch(metadataURL)
    if (!response) {
      return Promise.reject(new Error('Not found metadata'))
    }

    await fs.promises.writeFile(outputPath, JSON.stringify(response, null, 2), { encoding: 'utf-8' })
  }
  catch (e) {
    return Promise.reject(e)
  }
}
