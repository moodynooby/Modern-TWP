# Gemini Project: Quicky Translate

## Project Overview

This project contains the source code for "Quicky Translate," a lightweight browser extension for Firefox and Chromium that provides instant text translation. The extension is designed with a clean interface and fast performance, using translation engines like Google Translate and Yandex.

The project is structured as a typical web extension, with a `src` directory containing the core logic, manifest files for different browsers, and localization files.

## Building and Running

The project uses `npm` for dependency management and `gulp` for its build process.

### Prerequisites

- Node.js and npm

### Installation

1.  Clone the repository.
2.  Install the dependencies:
    ```bash
    npm install
    ```

### Build Commands

The following commands are available for building the extension:

-   **Build for both Firefox and Chrome:**
    ```bash
    npm run build
    ```
-   **Build with local sourcemaps:**
    ```bash
    npm run build:local-sourcemaps
    ```
-   **Build and sign the extension:**
    ```bash
    npm run build:sign
    ```
-   **Generate the `polyfill.js` file:**
    ```bash
    npm run polyfill
    ```

The build output is placed in the `build` directory.

### Running in a Browser

#### Firefox

The extension can be loaded directly from the `src` folder for debugging purposes:

1.  Open Firefox and navigate to `about:debugging`.
2.  Click on "This Firefox".
3.  Click on "Load Temporary Add-on...".
4.  Select any file inside the `src` directory.

#### Chromium-based Browsers

1.  Open your browser and navigate to the extensions page (e.g., `chrome://extensions`).
2.  Enable "Developer mode".
3.  Click on "Load unpacked".
4.  Select the `build/QT_<version>_Chromium` directory.

## Development Conventions

-   **Source Code:** The main source code is located in the `src` directory.
-   **Build System:** The project uses `gulp` to automate the build process. The `gulpfile.js` contains the build logic for both Firefox and Chrome.
-   **Polyfills:** The project uses `core-js` and `webpack` to generate a `polyfill.js` file for compatibility with older browsers.
-   **Manifests:** The `src` directory contains `manifest.json` for Firefox and `chrome_manifest.json` for Chromium-based browsers. The build process renames them as needed.
-   **Localization:** The `src/_locales` directory contains localization files for different languages.
