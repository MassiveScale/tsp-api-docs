# Changelog

All notable changes to `@massivescale/tsp-api-docs` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.0.0-beta2] — DocFx Improvements

### Added

- `docfx.app-name` option — sets `globalMetadata._appName` in the generated `docfx.json`
- `docfx.app-title` option — sets `globalMetadata._appTitle` in the generated `docfx.json`
- `docfx.emit-json` option — suppresses `docfx.json` output independently of `emit-project-files`
- `docfx.enable-pdf` option — controls `globalMetadata.pdf` in the generated `docfx.json`
- `docfx.enable-pdf-toc-page` option — controls `globalMetadata.pdfTocPage` in the generated `docfx.json`

### Changed

- **Breaking**: DocFx-specific options are now nested under a `docfx:` key in `tspconfig.yaml` (e.g. `docfx: { app-name: "..." }`) rather than being flat top-level keys with a `docfx-` prefix. Rename existing `docfx-app-name` → `docfx.app-name`, `docfx-theme` → `docfx.theme`, etc.
- DocFx root `toc.yml` now groups versioned services under a nested `Versions` section rather than listing them as a flat list
- `docfx.json` template expanded: `globalMetadata` now includes `_appName`, `_appTitle`, and `pdfTocPage`

---

## [v1.0.0-beta1] — Initial Release

### Added

- Initial Release
