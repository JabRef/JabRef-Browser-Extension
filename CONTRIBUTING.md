## Contributing to the Development

JabRef browser extension uses the [WebExtensions API](https://developer.mozilla.org/en-US/Add-ons/WebExtensions).

Preparation:

1. Install [Node.js](https://nodejs.org) (e.g., `choco install nodejs`) and [pnpm](https://pnpm.io) (e.g., `npm install -g pnpm`).
2. [Fork the repository](https://help.github.com/articles/fork-a-repo/).
3. Checkout the repository.
4. Install development dependencies via `pnpm install`.
5. Start browser with the add-on activated:
   Firefox: `pnpm dev:firefox`
   Chrome: `pnpm dev:chrome`
   Opera: `pnpm dev:opera`
   Edge: `pnpm dev:edge`

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
