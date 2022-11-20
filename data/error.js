// Get message from query parameter URL
const parameter = new URLSearchParams(window.location.search)
let message = parameter.get('message')
let details = parameter.get('details')
const stacktrace = parameter.get('stacktrace')

if (details !== '') {
  details = `${details}<br><br>`
}
if (stacktrace !== '') {
  details = `${details}${stacktrace}<br><br>`
}

let message_to_user = ''
const referToGithub = `If the error persists, please open an issue on <a class="text-indigo-600" target="_blank" href="https://github.com/JabRef/JabRef-Browser-Extension/issues">GitHub</a>.`
if (
  message === 'An unexpected error occurred' || // Firefox
  message === 'Error when communicating with the native messaging host.' // Chrome
) {
  // The browser doesn't tell us what the error is
  // Firefox at least prints it to the browser console prefixed by 'stderr output from native app'
  // Chrome doesn't appear to do this
  message_to_user = `Unknown error while sending to JabRef.
    <br>
    ${details}
    Please see the browsers error console for details (press Ctrl-Shift-J)
    and follow the <a class="text-indigo-600" target="_blank" href="https://docs.jabref.org/collect/jabref-browser-extension#installation-and-configuration">manual installation instructions</a>
    to make sure your setup is correct.

    <br><br>
    Common reasons for this error include:
    <ul class="list-inside list-disc">
        <li>JabRef is not installed.</li>
        <li>Powershell not installed.</li>
    </ul>
    <br>
    ${referToGithub}
    `
} else if (message === 'jarNotFound') {
  // This error is thrown by the powershell/python script if the JabRef executable is not found
  message = `Could not find JabRef executable`
  message_to_user = `
    ${details}
    Please follow the <a class="text-indigo-600" target="_blank" href="https://docs.jabref.org/collect/jabref-browser-extension#installation-and-configuration">manual installation instructions</a>
    to make sure your setup is correct.
    In particular, ensure that the correct file name of the <span class="rounded-lg text-lg bg-gray-100 px-1.5 py-0.5">JabRef.bat</span> file is specified in <span class="rounded-lg text-lg bg-gray-100 px-1.5 py-0.5">JabRefHost.ps1</span> under $jabRefExe.
    <br><br>${referToGithub}
    `
} else if (
  message === 'Attempt to postMessage on disconnected port' || // Firefox
  message === 'Specified native messaging host not found.' // Chrome
) {
  // This error is thrown by the browser if the batch script or the jabref-firefox.json is not in the right place
  // Sadly, we don't get more information than this from the browser
  // However, it also reports more details in the browser console such as "Error reading native manifest file C:\Program Files\JabRef\jabref-firefox.json: file is referenced in the registry but does not exist"
  // I've opened the ticket https://bugzilla.mozilla.org/show_bug.cgi?id=1751611 to improve the situation
  message_to_user = `
    ${details}
    Please see the browsers error console for details (press Ctrl-Shift-J)
    and follow the <a class="text-indigo-600" target="_blank" href="https://docs.jabref.org/collect/jabref-browser-extension#installation-and-configuration">manual installation instructions</a>
    to make sure your setup is correct.
    <br><br>
    Common reasons for this error include:
    <ul class="list-inside list-disc">
        <li>The files <span class="rounded-lg text-lg bg-gray-100 px-1.5 py-0.5">jabref-firefox.json</span> and <span class="rounded-lg text-lg bg-gray-100 px-1.5 py-0.5">jabref-chrome.json</span> are not placed next to <span class="rounded-lg text-lg bg-gray-100 px-1.5 py-0.5">JabRef.bat</span>.</li>
        <li>The path to <span class="rounded-lg text-lg bg-gray-100 px-1.5 py-0.5">jabref-firefox.json</span> or <span class="rounded-lg text-lg bg-gray-100 px-1.5 py-0.5">jabref-chrome.json</span> specified in the registry is not correct.</li>
    </ul>
    <br>${referToGithub}
    `
} else if (message === 'flatpakPermissionsError') {
  // This error is thrown by the powershell/python script if the JabRef executable is not found
  message = `Flatpak is missing the permissions to access the JabRef executable`
  message_to_user = `
    ${details}
    For flatpak based browsers you have to enable the org.freedesktop.Flatpak permission.<br>
    To add this you can type 
    <br><br>
    <i>flatpak override --user --talk-name=org.freedesktop.Flatpak org.mozilla.firefox</i>
    <br><br>
    in a terminal window or use the Flatseal application and add <i>org.freedesktop.Flatpak</i> to the <i>Session bus Talk</i> section for <i>org.mozilla.firefox</i>.
    <br><br>
    Note that this will disable the confinement of the flatpak package!
    </p>
    If this doesn't resolve the issue, please have a look at the <a class="text-indigo-600" target="_blank" href="https://docs.jabref.org/collect/jabref-browser-extension#flatpak">manual installation instructions</a>
    to make sure your setup is correct.
    In particular, verify that the Flatpak permissions are set.
    <br><br>${referToGithub}
    `
} else {
  // We have no idea what the error is
  // Usually, this is caused by some bug in the powershell/python script and the error message is usually helpful
  message_to_user = `${details}<br><br>${referToGithub}`
}

// Set message and details to the corresponding elements
document.getElementById('message').innerHTML = message
document.getElementById('details').innerHTML = message_to_user
