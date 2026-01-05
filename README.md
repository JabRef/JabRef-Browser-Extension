# JabRef Connector Browser Extension

A simple browser extension that connects to JabRef via WebSocket and allows you to send BibTeX entries directly from your browser.

## Features

- 🔌 Connect directly to JabRef via WebSocket (port 23116)
- 📚 Send BibTeX entries to JabRef
- 📝 Editable sample BibTeX entry included
- 📊 Real-time connection status indicator
- 📜 Activity log to track all actions
- 🎨 Clean and intuitive user interface
- ⚡ No bridge server needed - direct connection!

## Prerequisites

1. **JabRef** version 5.x or higher with WebSocket support
2. **WebSocket server enabled** in JabRef:
   - Open JabRef  
   - Go to **Options** → **Preferences** → **Advanced** → **Remote operation**
   - Check "**Enable WebSocket server**"
   - Default port: 23116
3. **Have a library open** in JabRef (or be ready to choose one when importing)

## Installation

### Browser Extension

#### Chrome/Edge/Brave

1. Open your browser and navigate to:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
   - Brave: `brave://extensions/`
2. Enable "**Developer mode**" (toggle in top-right corner)
3. Click "**Load unpacked**"
4. Select the `JabRef-Connector` folder
5. The extension icon should appear in your browser toolbar

#### Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "**Load Temporary Add-on**"
3. Navigate to the `JabRef-Connector` folder and select `manifest.json`
4. The extension will be loaded temporarily

## Usage

### Step 1: Start JabRef

1. Start JabRef
2. Create or open a library: **File** → **New Library** (or open existing)
3. Enable WebSocket server if not already enabled (see Prerequisites)
4. Keep JabRef running

### Step 2: Use the Extension

1. Click the **JabRef Connector** extension icon in your browser toolbar
2. Verify the WebSocket URL (default: `ws://localhost:23116`)
3. Click "**Connect to JabRef**"
4. Once connected:
   - Edit the sample BibTeX entry in the text area if desired
   - Click "**Send Sample BibTeX**"
   - The entry will be added to your open JabRef library
   - Monitor the connection status and activity log in the extension
5. Click "**Disconnect**" when finished

## Sample BibTeX Entry

The extension comes with a pre-filled sample entry:

```bibtex
@article{Example2024,
  author = {John Doe and Jane Smith},
  title = {An Example Article Title},
  journal = {Journal of Examples},
  year = {2024},
  volume = {42},
  number = {7},
  pages = {123--456},
  doi = {10.1000/example.2024}
}
```

You can edit this entry directly in the extension popup before sending it to JabRef.

## File Structure

```
JabRef-Connector/
├── manifest.json       # Extension configuration
├── popup.html          # Extension popup UI
├── popup.js            # WebSocket logic and event handlers
├── popup.css           # Styling
├── bridge-server.js    # Node.js WebSocket bridge server
├── package.json        # Node.js dependencies
├── icon16.png          # Extension icon (16x16)
├── icon48.png          # Extension icon (48x48)
├── icon128.png         # Extension icon (128x128)
└── README.md           # This file
```

## Troubleshooting

### "Connection refused" or "WebSocket error"

1. **Make sure the bridge server is running:**
   ```bash
   npm start
   ```
   You should see "Bridge listening on: ws://localhost:8765"

2. **Check if the bridge can connect to JabRef:**
   - Ensure JabRef is running
   - Verify remote operation is enabled in JabRef preferences
   - Default JabRef port is 6050

### Bridge Server Won't Start

- Ensure Node.js is installed: `node --version`
- Install dependencies: `npm install`
- Check if port 8765 is already in use: `lsof -i :8765` (macOS/Linux) or `netstat -ano | findstr 8765` (Windows)

### Extension Not Loading

- Verify all required files are present
- Check the browser console for errors (F12)
- Ensure Developer Mode is enabled in your browser

### BibTeX Entry Not Appearing in JabRef

- Check the bridge server terminal for error messages
- Check the JabRef console for any error messages
- Verify the BibTeX syntax is valid
- Make sure you're connected before sending

### Port Conflicts

If port 8765 is already in use, you can change it:
1. Edit `bridge-server.js` and change `BRIDGE_PORT`
2. Update the URL in the extension popup to match

## Technical Details

- **WebSocket Bridge**: Node.js server that bridges WebSocket (browser) ↔ TCP (JabRef)
- **Bridge Port**: 8765 (WebSocket)
- **JabRef Port**: 6050 (TCP)
- **Message Format**: BibTeX entries are sent as JSON objects with an `action` and `data` field
- **Protocol**: Browser → WebSocket → Bridge Server → TCP → JabRef

## Known Limitations

- Currently supports only localhost connections
- Requires JabRef to be running with remote operation enabled
- The extension must remain open to maintain the connection

## Future Enhancements

- Support for multiple BibTeX entries at once
- Import from webpage metadata
- Custom WebSocket message formats
- Persistent connection settings
- Error handling improvements

## License

MIT License - Feel free to modify and distribute as needed.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## Author

Created as a simple demonstration of browser extension + JabRef integration.

---

**Note**: This extension is not officially affiliated with or endorsed by the JabRef project.
