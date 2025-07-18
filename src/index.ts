import { fs, vol } from 'memfs'
import { ofetch } from 'ofetch'
import {
  buildDownloadFontUrls,
  buildFont,
  buildGoogleFontUrl,
  buildVariables,
  chunk,
  delay,
  extend,
  getFontCss,
  mergeDeep,
  mergeFontCss,
  normalizeFontOptions,
  normalizeOptions,
  parseFontCss,
} from './utils'
import { normalizeName } from './utils/string'
import type {
  Family,
  FetchFontOptions,
  FetchFontResult,
  FetchFontsResult,
  FontMetadata,
  FontOptions,
  GoogleFontsFetch,
  GoogleFontsFetchOptions,
  Metadata,
  ResolvedGoogleFontsFetchOptions,
} from './types'

const metadataURL = 'https://fonts.google.com/metadata/fonts'

/**
 * Download font by url and store in memory
 * @param options
 */
async function downloadFontToMemory(options: FetchFontOptions): Promise<string> {
  try {
    const name = normalizeName(options.name)
    const fontPath = `/fonts/${name}`

    // Create directory in memory
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
    const filePath = `${fontPath}/${options.filename}`
    await fs.promises.writeFile(filePath, buffer)

    return `${options.base}/${name}/${options.filename}`
  }
  catch (e) {
    return Promise.reject(e)
  }
}

/**
 * Download metadata and store in memory
 * @param outputPath
 * @param override
 */
async function downloadMetadataToMemory(outputPath: string, override = true): Promise<void> {
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
    // Create directory structure in memory
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

/**
 * Write font CSS to memory
 * @param name
 * @param fonts
 */
async function writeFontCssToMemory(name: string, fonts: string): Promise<void> {
  const fontPath = `/fonts/${normalizeName(name)}`
  await fs.promises.mkdir(fontPath, { recursive: true })

  const content = `/* Google Font: ${name} */\n${fonts}`
  await fs.promises.writeFile(`${fontPath}/style.css`, content, { encoding: 'utf-8' })
}

/**
 * Create Google fonts fetch for Cloudflare Workers
 * @param defaultOptions
 * @returns GoogleFontsFetch
 */
export function createGoogleFontsFetchForWorkers(defaultOptions: GoogleFontsFetchOptions): GoogleFontsFetch & {
  getFileFromMemory: (path: string) => Promise<Uint8Array | string>
  getAllFiles: () => Record<string, Uint8Array | string>
  clearMemory: () => void
} {
  const baseOptions = normalizeOptions(defaultOptions) as ResolvedGoogleFontsFetchOptions
  const metadataPath = `/metadata/${baseOptions.metadata.name}`

  const context = {
    /**
     * Fetch a single font and store in memory.
     * @param name - The name of the font.
     * @param fontOptions - The font options.
     * @param metadata - The font metadata.
     * @returns {Promise<FetchFontResult>} The downloaded fonts.
     */
    async single(
      name: string,
      fontOptions?: FontOptions,
      metadata?: Record<string, FontMetadata>,
    ): Promise<FetchFontResult> {
      try {
        const options = mergeDeep(baseOptions, normalizeFontOptions(fontOptions)) as ResolvedGoogleFontsFetchOptions
        let fontMetadata: Record<string, FontMetadata> = metadata || {}

        if (!metadata) {
          await context.metadata(false)
          const metadataContent = await fs.promises.readFile(metadataPath, { encoding: 'utf-8' }) as string
          const parsedMetadata = JSON.parse(metadataContent) as Metadata
          const family = parsedMetadata.familyMetadataList.find(({ family }) => family === name)
          if (family)
            fontMetadata = family.fonts
        }

        let css = ''
        const normalize = mergeDeep(
          options.font,
          normalizeFontOptions(fontOptions),
        ) as Required<FontOptions>
        const { weightVariables, italicVariables } = buildVariables(normalize, fontMetadata)

        if (weightVariables.length) {
          const url = buildGoogleFontUrl(name, weightVariables)
          css = await getFontCss(url)
        }

        if (italicVariables.length) {
          const url = buildGoogleFontUrl(name, italicVariables)
          css += await getFontCss(url)
        }

        if (css) {
          const parsed = parseFontCss(css, normalize.subset)
          const fontUrls = buildDownloadFontUrls(parsed)
          const downloadedFontUrls: Record<string, string> = {}

          if (fontUrls.length) {
            const promises = fontUrls.map(async (url, index) => {
              downloadedFontUrls[url] = await downloadFontToMemory({
                url,
                name,
                outDir: '/fonts',
                base: options.base,
                filename: `${index + 1}.woff2`,
              })
            })
            await Promise.all(promises)

            const fonts = buildFont(parsed, downloadedFontUrls)
            if (options.css.write)
              await writeFontCssToMemory(name, Object.values(fonts).join(''))

            return fonts
          }
        }

        return {}
      }
      catch (e) {
        return Promise.reject(e)
      }
    },

    /**
     * Fetch metadata and store in memory.
     * @param override - Whether to override existing metadata.
     * @returns {Promise<void>} A promise that resolves when the metadata is downloaded successfully.
     */
    async metadata(override?: boolean): Promise<void> {
      try {
        await downloadMetadataToMemory(metadataPath, override)
      }
      catch (e) {
        return Promise.reject(e)
      }
    },

    /**
     * Fetch multiple fonts and store in memory.
     * @param fonts - The fonts to fetch.
     * @param fontOptions - The font options.
     * @returns {Promise<FetchFontsResult>} A promise that resolves with the downloaded fonts.
     */
    async multiple(fonts: Array<{ name: string, options?: Partial<FontOptions>, metadata?: Record<string, FontMetadata> }>, fontOptions?: FontOptions): Promise<FetchFontsResult> {
      try {
        const options = mergeDeep(baseOptions, normalizeFontOptions(fontOptions)) as ResolvedGoogleFontsFetchOptions
        const promises = fonts.map(async ({ name, options, metadata }) => {
          return context.single(name, options || {}, metadata)
        })
        const res = await Promise.all(promises)
        const result = res.map((item, i) => ({ name: fonts[i].name, fonts: item }))

        if (options.css.write && options.css.merge) {
          const mergedFonts = mergeFontCss(result)
          await writeFontCssToMemory('multiple', Object.values(mergedFonts).join(''))
        }

        return result
      }
      catch (e) {
        return Promise.reject(e)
      }
    },

    /**
     * Fetch all fonts and store in memory.
     * @param fontOptions - The font options.
     * @returns {Promise<{ success: FetchFontsResult, errors: Array<Family> }>} A promise that resolves with the downloaded fonts.
     */
    async all(fontOptions?: Partial<FontOptions>): Promise<{ success: FetchFontsResult, errors: Array<Family> }> {
      const options = mergeDeep(baseOptions, normalizeFontOptions(fontOptions)) as ResolvedGoogleFontsFetchOptions

      // Clear memory instead of removing directory
      if (options.chunk.emptyDir) {
        vol.reset()
      }

      try {
        await fs.promises.access(metadataPath)
      }
      catch (e) {
        await context.metadata()
      }

      await context.metadata(false)
      const metadataContent = await fs.promises.readFile(metadataPath, { encoding: 'utf-8' }) as string
      const parsedMetadata = JSON.parse(metadataContent) as Metadata
      const families = parsedMetadata.familyMetadataList
      const chunkFamilies: Array<Array<Family>> = chunk(families, baseOptions.chunk.size)
      const success: FetchFontsResult = []
      const errors: Array<Family> = []

      for (let i = 0; i < chunkFamilies.length; i++) {
        const multiple = chunkFamilies[i].map((item) => {
          const { family: name, fonts } = item
          const weight = Object.keys(fonts)
            .filter(item => !item.includes('i'))
            .map(Number)

          return { name, options: extend({}, { weight }, '/fonts', fontOptions), metadata: fonts }
        })

        if (fontOptions) {
          extend(fontOptions, { css: { write: false, merge: false } })
        }

        let multipleResult: FetchFontsResult = []
        try {
          multipleResult = await context.multiple(multiple, fontOptions)
        }
        catch (e) {
          try {
            multipleResult = await onError(multiple, fontOptions || {}, options.chunk.retry, options.chunk.retryDelay)
          }
          catch (e) {
            errors.push(...chunkFamilies[i])
            multipleResult = []
          }
        }

        if (multipleResult.length > 0) {
          success.push(...multipleResult)
        }

        if (baseOptions.chunk.delay) {
          await delay(baseOptions.chunk.delay)
        }
      }

      if (options.css.write && options.css.merge) {
        const mergedFonts = mergeFontCss(success)
        await writeFontCssToMemory('all', Object.values(mergedFonts).join(''))
      }

      return {
        success,
        errors,
      }
    },

    /**
     * Get a file from memory
     * @param path - The file path
     * @returns {Promise<Buffer | string>} The file content
     */
    async getFileFromMemory(path: string): Promise<Uint8Array | string> {
      try {
        return await fs.promises.readFile(path) as Uint8Array | string
      }
      catch (e) {
        throw new Error(`File not found: ${path}`)
      }
    },

    /**
     * Get all files from memory
     * @returns {Record<string, Buffer | string>} All files in memory
     */
    getAllFiles(): Record<string, Uint8Array | string> {
      const files: Record<string, Uint8Array | string> = {}

      function traverse(dirPath: string) {
        try {
          const items = fs.readdirSync(dirPath)
          for (const item of items) {
            const itemPath = `${dirPath}/${item}`
            const stat = fs.statSync(itemPath)

            if (stat.isDirectory()) {
              traverse(itemPath)
            }
            else {
              files[itemPath] = fs.readFileSync(itemPath)
            }
          }
        }
        catch (e) {
          // Directory doesn't exist or is empty
        }
      }

      traverse('/fonts')
      traverse('/metadata')

      return files
    },

    /**
     * Clear all files from memory
     */
    clearMemory(): void {
      vol.reset()
    },
  }

  /**
   * Handle download fonts error
   * @param fonts
   * @param fontOptions
   * @param retry
   * @param retryDelay
   */
  async function onError(fonts: Array<{ name: string, options?: Partial<FontOptions>, metadata?: Record<string, FontMetadata> }>, fontOptions: FontOptions, retry: number, retryDelay: number): Promise<FetchFontsResult> {
    if (retry === 0) {
      return Promise.reject(new Error('Download fonts failed'))
    }

    try {
      return await context.multiple(fonts, fontOptions)
    }
    catch (e) {
      if (retryDelay > 0) {
        await delay(retryDelay)
      }

      return onError(fonts, fontOptions, retry - 1, retryDelay)
    }
  }

  return context
}

// Export the main function
export function createGoogleFontsFetch(defaultOptions: GoogleFontsFetchOptions): GoogleFontsFetch & {
  getFileFromMemory: (path: string) => Promise<Uint8Array | string>
  getAllFiles: () => Record<string, Uint8Array | string>
  clearMemory: () => void
} {
  return createGoogleFontsFetchForWorkers(defaultOptions)
}
