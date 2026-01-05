let websocket = null;

// DOM Elements
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const sendBtn = document.getElementById('sendBtn');
const wsUrlInput = document.getElementById('wsUrl');
const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const bibEntryTextarea = document.getElementById('bibEntry');

// Add log message to the log box
function addLog(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  logEl.appendChild(logEntry);
  logEl.scrollTop = logEl.scrollHeight;
}

// Update connection status
function updateStatus(status, className) {
  statusEl.textContent = status;
  statusEl.className = `status-${className}`;
}

// Connect to JabRef WebSocket
function connectToJabRef() {
  const wsUrl = wsUrlInput.value.trim();
  
  if (!wsUrl) {
    addLog('Please enter a WebSocket URL', 'error');
    return;
  }

  try {
    addLog(`Connecting to ${wsUrl}...`, 'info');
    websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
      addLog('Connected to JabRef successfully!', 'success');
      updateStatus('Connected', 'connected');
      connectBtn.disabled = true;
      disconnectBtn.disabled = false;
      sendBtn.disabled = false;
      wsUrlInput.disabled = true;
    };

    websocket.onmessage = (event) => {
      try {
        const response = JSON.parse(event.data);
        if (response.type === 'success') {
          addLog(response.message, 'success');
        } else if (response.type === 'error') {
          addLog(response.message, 'error');
        } else if (response.type === 'connected') {
          addLog(response.message, 'success');
        } else {
          addLog(`Received: ${event.data}`, 'info');
        }
      } catch (e) {
        addLog(`Received: ${event.data}`, 'info');
      }
    };

    websocket.onerror = (error) => {
      addLog('WebSocket error occurred', 'error');
      addLog('Check: Is JabRef running? Is remote operation enabled?', 'warning');
      console.error('WebSocket error:', error);
    };

    websocket.onclose = (event) => {
      if (event.wasClean) {
        addLog(`Disconnected from JabRef (code: ${event.code})`, 'warning');
      } else {
        addLog('Connection lost unexpectedly', 'error');
        if (event.code === 1006) {
          addLog('Connection refused - JabRef may not be running or remote operation is disabled', 'error');
        }
      }
      updateStatus('Disconnected', 'disconnected');
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      sendBtn.disabled = true;
      wsUrlInput.disabled = false;
      websocket = null;
    };
  } catch (error) {
    addLog(`Connection failed: ${error.message}`, 'error');
    console.error('Connection error:', error);
  }
}

// Disconnect from JabRef
function disconnectFromJabRef() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.close();
    addLog('Disconnecting...', 'info');
  }
}

// Send BibTeX entry to JabRef
function sendBibEntry() {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    addLog('Not connected to JabRef', 'error');
    return;
  }

  const bibEntry = bibEntryTextarea.value.trim();
  
  if (!bibEntry) {
    addLog('BibTeX entry is empty', 'error');
    return;
  }

  try {
    // JabRef WebSocket API format
    const message = JSON.stringify({
      command: 'add',
      bibtex: bibEntry
    });

    websocket.send(message);
    addLog('BibTeX entry sent successfully!', 'success');
    addLog(`Sent: ${bibEntry.substring(0, 50)}...`, 'info');
  } catch (error) {
    addLog(`Failed to send: ${error.message}`, 'error');
    console.error('Send error:', error);
  }
}

// Event listeners
connectBtn.addEventListener('click', connectToJabRef);
disconnectBtn.addEventListener('click', disconnectFromJabRef);
sendBtn.addEventListener('click', sendBibEntry);

// Allow Enter key to connect
wsUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !connectBtn.disabled) {
    connectToJabRef();
  }
});

// Initialize
addLog('JabRef Connector initialized', 'info');
addLog('Make sure JabRef is running with WebSocket server enabled', 'warning');
addLog('Check: Preferences → Advanced → Remote operation', 'info');
