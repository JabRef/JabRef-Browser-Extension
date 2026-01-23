const DEFAULT_PORT = 23119;

const portInput = document.getElementById("portInput");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const msg = document.getElementById("msg");

function loadSettings() {
  browser.storage.local.get({ jabrefPort: DEFAULT_PORT }).then((res) => {
    portInput.value = res.jabrefPort;
  }).catch((e) => {
    console.warn('Failed to load settings', e);
  });
}

function saveSettings() {
  const port = parseInt(portInput.value, 10) || DEFAULT_PORT;
  browser.storage.local.set({ jabrefPort: port }).then(() => {
    msg.textContent = "Saved.";
    setTimeout(() => (msg.textContent = ""), 1500);
  }).catch((e) => {
    console.warn('Failed to save settings', e);
    msg.textContent = "Save failed.";
    setTimeout(() => (msg.textContent = ""), 1500);
  });
}

saveBtn.addEventListener("click", saveSettings);
cancelBtn.addEventListener("click", () => {
  window.close();
});

loadSettings();
