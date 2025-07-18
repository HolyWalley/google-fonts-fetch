# @frontlabsofficial/google-fonts-fetch

A lightweight utility for downloading Google Fonts to memory for use in Cloudflare Workers and other serverless environments.

## Description

This package allows you to download Google Fonts and store them in memory instead of the filesystem, making it perfect for serverless environments like Cloudflare Workers. All fonts are fetched from Google Fonts API and stored using an in-memory filesystem (memfs).

## Features

- **Memory-based storage**: Fonts are stored in memory, perfect for serverless environments
- **Cloudflare Workers compatible**: No Node.js dependencies, uses Web APIs
- **Multiple download options**: Download single fonts, multiple fonts, or all available fonts
- **Font access methods**: Retrieve fonts from memory for serving or processing
- **TypeScript support**: Full TypeScript support with proper type definitions

## Installation

### From GitHub Release (Recommended)

Check the [releases page](https://github.com/HolyWalley/google-fonts-fetch/releases) for the latest version and install using:

```bash
npm install https://github.com/HolyWalley/google-fonts-fetch/releases/download/v[VERSION]/frontlabsofficial-google-fonts-fetch-1.0.3.tgz
```

Or with yarn:
```bash
yarn add https://github.com/HolyWalley/google-fonts-fetch/releases/download/v[VERSION]/frontlabsofficial-google-fonts-fetch-1.0.3.tgz
```

Or with pnpm:
```bash
pnpm add https://github.com/HolyWalley/google-fonts-fetch/releases/download/v[VERSION]/frontlabsofficial-google-fonts-fetch-1.0.3.tgz
```

Replace `[VERSION]` with the latest version number (e.g., `1.0.4`).

### From GitHub Repository (Latest)

```bash
npm install HolyWalley/google-fonts-fetch
```

### From npm Registry (Original Package)

```bash
npm install @frontlabsofficial/google-fonts-fetch
```

> **Note**: The npm registry version is the original filesystem-based version. Use the GitHub release for Cloudflare Workers compatibility.

## Usage

### Basic Setup

```javascript
import { createGoogleFontsFetch } from '@frontlabsofficial/google-fonts-fetch'

const fontFetch = createGoogleFontsFetch({
  outDir: '/fonts',
  base: 'https://your-domain.com/fonts',
  metadata: {
    name: 'fonts-metadata.json'
  }
})
```

### Download a Single Font

```javascript
// Download default weights of Roboto
const fonts = await fontFetch.single('Roboto')

// Download specific weights
const fonts = await fontFetch.single('Roboto', {
  weight: [400, 700],
  italic: true
})
```

### Download Multiple Fonts

```javascript
const fonts = await fontFetch.multiple([
  { name: 'Roboto' },
  { name: 'Open Sans', options: { weight: [400, 600] } }
])
```

### Download All Available Fonts

```javascript
const result = await fontFetch.all({ weight: [400] })
console.log(`Downloaded ${result.success.length} fonts`)
console.log(`Failed to download ${result.errors.length} fonts`)
```

### Access Downloaded Fonts

```javascript
// Get a specific font file
const fontFile = await fontFetch.getFileFromMemory('/fonts/roboto/1.woff2')

// Get all downloaded files
const allFiles = fontFetch.getAllFiles()
console.log(Object.keys(allFiles)) // Lists all file paths

// Clear all fonts from memory
fontFetch.clearMemory()
```

## Debug Logging

To see what URLs are being fetched from Google's servers, enable debug logging:

```javascript
// Enable debug logging to see all URLs
console.debug = console.log

const fontFetch = createGoogleFontsFetch({
  outDir: '/fonts',
  base: 'dummy'
})

await fontFetch.single('Inter', { weight: [400, 700] })
```

This will show:
- 📄 CSS URLs from Google Fonts API
- 🔍 Font URLs found in CSS
- 🔤 Font file downloads from Google's CDN
- 📊 Metadata fetching
- ✅ File storage confirmation with sizes

## Cloudflare Workers Example

```javascript
import { createGoogleFontsFetch } from '@frontlabsofficial/google-fonts-fetch'

export default {
  async fetch(request, env, ctx) {
    const fontFetch = createGoogleFontsFetch({
      outDir: '/fonts',
      base: 'https://your-worker.your-domain.workers.dev/fonts'
    })

    // Download fonts
    await fontFetch.single('Roboto', { weight: [400, 700] })

    // Serve font files
    const url = new URL(request.url)
    if (url.pathname.startsWith('/fonts/')) {
      try {
        const fontData = await fontFetch.getFileFromMemory(url.pathname)
        return new Response(fontData, {
          headers: {
            'Content-Type': 'font/woff2',
            'Cache-Control': 'public, max-age=31536000'
          }
        })
      } catch (error) {
        return new Response('Font not found', { status: 404 })
      }
    }

    return new Response('Hello World!')
  }
}
```

## API Reference

### `createGoogleFontsFetch(options)`

Creates a new Google Fonts fetch instance.

**Options:**
- `outDir`: Base directory for font storage (default: `./fonts`)
- `base`: Base URL for font serving
- `metadata.name`: Name for metadata file (default: `fonts-metadata.json`)

**Returns:** Font fetch instance with methods:

#### `single(name, options?)`
Download a single font family.

#### `multiple(fonts, options?)`
Download multiple font families.

#### `all(options?)`
Download all available Google Fonts.

#### `getFileFromMemory(path)`
Retrieve a specific file from memory.

#### `getAllFiles()`
Get all files stored in memory.

#### `clearMemory()`
Clear all files from memory.

## Font Options

```javascript
{
  weight: [400, 700],        // Font weights to download
  italic: true,              // Include italic variants
  subset: ['latin'],         // Character subsets
  css: {
    write: true,             // Generate CSS files
    merge: false             // Merge CSS into single file
  }
}
```

## Release Process

### For Maintainers

To create a new release of this package:

1. **Update the version** in `package.json`:
   ```json
   {
     "version": "1.0.5"
   }
   ```

2. **Run the release script** (this will run tests, lint, build, and pack):
   ```bash
   pnpm run release:github
   ```
   This creates a `.tgz` file (e.g., `frontlabsofficial-google-fonts-fetch-1.0.5.tgz`)

3. **Create a GitHub release** with the tarball:
   ```bash
   gh release create v[NEW_VERSION] frontlabsofficial-google-fonts-fetch-[NEW_VERSION].tgz \
     --title "v[NEW_VERSION] - Your Release Title" \
     --notes "Release notes here"
   ```
   Replace `[NEW_VERSION]` with the actual version number (e.g., `1.0.5`)

4. **Users can find the new release** on the [releases page](https://github.com/HolyWalley/google-fonts-fetch/releases)

### Alternative: Manual Steps

If you prefer to run steps manually:

1. **Make your changes** and ensure all tests pass:
   ```bash
   pnpm run typecheck
   pnpm run lint
   ```

2. **Update version** in `package.json`

3. **Build the package**:
   ```bash
   pnpm run build
   ```

4. **Create a package tarball**:
   ```bash
   pnpm pack
   ```

### Why This Process?

- The `dist` folder is in `.gitignore` and not committed to the repository
- The `.tgz` file contains the built package that users actually need
- GitHub releases provide a clean way to distribute built packages
- Users can install directly from GitHub releases without needing to build locally

## License

This project is licensed under the [MIT License](LICENSE).
