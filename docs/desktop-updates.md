# Desktop updates

The Windows Electron build checks the published GitHub releases for
`kartikgoswami349/Library-Manegment-app` after startup and every six hours.
When a newer release is found, the app asks whether to download it and then
asks before restarting to install it.

To publish an update, increment the version in `package.json` and create a
published GitHub release with the Windows NSIS installer produced by
`npm run desktop:package`. Electron Builder must publish the installer and its
update metadata (`latest.yml`) to the release. Draft and prerelease releases
are not installed by the updater.
