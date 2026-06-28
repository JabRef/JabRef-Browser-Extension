## Contributing to the Development

JabRef browser extension uses the [WebExtensions API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

Preparation:

1. Install [Node.js](https://nodejs.org) (e.g., `choco install nodejs`) and [pnpm](https://pnpm.io) (e.g., `npm install -g pnpm`).
2. [Fork the repository](https://help.github.com/articles/fork-a-repo/).
3. Checkout the repository.
4. Initialize the git submodules via `git submodule update --init --recursive`.
5. Install development dependencies via `pnpm install`.
6. Start browser with the add-on activated:
   Firefox: `pnpm dev:firefox`
   Chrome: `pnpm dev:chrome`
   Opera: `pnpm dev:opera`
   Edge: `pnpm dev:edge`
   Safari: `pnpm safari:xcode` (macOS with Xcode required)

Safari local packaging flow:

1. Build and generate the Xcode project:
   `pnpm safari:xcode`
2. Open:
   `dist/safari/JabRef Browser Extension.xcodeproj`
3. Run the `JabRef Browser Extension` scheme in Xcode
4. Enable the extension in Safari Settings
5. Optional signing:
   `pnpm sign:safari-local IDENTITY="Developer ID Application: Your Name (TEAMID)"`
6. Optional notarization:
   `pnpm notarize:safari-local PROFILE="profile-name"`

Now just follow the typical steps to [contribute code](https://guides.github.com/activities/contributing-to-open-source/#contributing):

1. Create your feature branch: `git checkout -b my-new-feature`
2. Make your changes and test them by running the extension in the browser as described above.
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request.

## Updating dependencies & Zotero translators

- `python scripts/import_and_patch_translators.py` updates all Zotero submodules, post-processes the translators and applies the necessary patches for our extension

The following commands are used to update the dependencies of the project; as we use Renovate for automatic dependency updates this should not be necessary in most cases, but it is good to know how to do it manually:

- `pnpm outdated` gives an overview of outdated packages ([doc](https://pnpm.io/cli/outdated))
- `pnpm update --latest` updates all packages
- `pnpm install` installs updated packages

## Release of new version

- Increase version number in `package.json`
- `pnpm build`
- Upload to:
  - https://addons.mozilla.org/en-US/developers/addon/jabref/versions/submit/
  - https://chrome.google.com/u/2/webstore/devconsole/26c4c347-9aa1-48d8-8a22-1c79fd3a597e/bifehkofibaamoeaopjglfkddgkijdlh/edit/package
  - https://addons.opera.com/developer/upload/
  - https://developer.apple.com/app-store-connect/
- Remove the `key` field in `wxt.config.ts` and build again. Then upload to:
  - https://partner.microsoft.com/en-us/dashboard/microsoftedge/2045cdc1-808f-43c4-8091-43e2dcaff53d/packages

## Safari CI and Notarization

Safari CI currently has two jobs:

1. `.github/workflows/test.yml`
   - `safari-build`
   - runs on `macos-latest`
   - executes `make safari`
2. `.github/workflows/release.yml`
   - `safari-package`
   - builds and uploads the unsigned Safari app artifact
   - `safari-publish`
   - publishes the Safari project to App Store Connect for actual releases

GitHub Actions secrets required for Safari publishing:

- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `SAFARI_APP_SIGNING_IDENTITY`
- `SAFARI_INSTALLER_SIGNING_IDENTITY`
- `APPLE_MACOS_PROVISIONING_PROFILE_BASE64`
- `APPLE_MACOS_EXTENSION_PROVISIONING_PROFILE_BASE64`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
