# JabRef Remote Operation - Important Notes

## Discovery

After testing, JabRef's remote operation appears to:
1. Accept TCP connections on port 6050
2. Respond with acknowledgment bytes
3. **BUT**: May require a library to be already open in JabRef

## To Use Properly:

### 1. Open or Create a Library in JabRef First
- In JabRef: File → New Library (or open existing)
- Keep JabRef window open

### 2. Enable Remote Operation
- Options → Preferences → Advanced → Remote operation
- Check "Accept remote commands"

### 3. The remote operation may:
- Import into the currently open library
- OR show an import dialog
- OR do nothing if no library is open

## Testing

You can manually test with:
```bash
# Create test file
echo '@article{Test,author={A},title={T},year={2024}}' > /tmp/test.bib

# Send to JabRef
echo "/tmp/test.bib" | nc localhost 6050
```

Check your JabRef window to see if:
- Entry appears in the open library
- Import dialog appears
- Nothing happens (means library must be open first)

## Alternative: Use JabRef CLI

If remote operation doesn't work well, consider using JabRef's CLI:
```bash
jabref --import /path/to/file.bib --importToOpen library.bib
```
