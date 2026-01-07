const DEFAULT_PORT = 23119;

const portInput = document.getElementById("portInput");
const saveBtn = document.getElementById("saveBtn");
const cancelBtn = document.getElementById("cancelBtn");
const msg = document.getElementById("msg");

function loadSettings() {
  chrome.storage.local.get({ jabrefPort: DEFAULT_PORT }, (res) => {
    portInput.value = res.jabrefPort;
  });
}

function saveSettings() {
  const port = parseInt(portInput.value, 10) || DEFAULT_PORT;
  chrome.storage.local.set({ jabrefPort: port }, () => {
    msg.textContent = "Saved.";
    setTimeout(() => (msg.textContent = ""), 1500);
  });
}

saveBtn.addEventListener("click", saveSettings);
cancelBtn.addEventListener("click", () => {
  window.close();
});

loadSettings();
