#!/usr/bin/python3 -u

# Note that running python with the `-u` flag is required on Windows,
# in order to ensure that stdin and stdout are opened in binary, rather
# than text, mode.

import json
import logging
import sys
import struct
import subprocess
import shlex
import shutil
from pathlib import Path

paths = ["/opt/jabref/bin/JabRef", shutil.which("jabref")]

JABREF_PATH = None
for path in paths:
    if path and Path(path).is_file():
        JABREF_PATH = path

logging_dir = Path.home() / ".mozilla/native-messaging-hosts/"
if not logging_dir.exists():
    logging_dir.mkdir(parents=True)
logging.basicConfig(
    format="%(asctime)s - %(levelname)s: %(message)s",
    level=logging.INFO,
    filename=logging_dir / "jabref_browser_extension.log",
    filemode="w+",
)
logger = logging.getLogger(__name__)

# Read a message from stdin and decode it.
def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        logger.error("Raw_length")
        sys.exit(0)
    message_length = struct.unpack("=I", raw_length)[0]
    logger.info("Got length: %d bytes to be read", message_length)
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    logger.info("Got message of %d chars", len(message))
    data = json.loads(message)
    logger.info("Successfully retrieved JSON")
    return data


# Encode a message for transmission, given its content.
def encode_message(message_content):
    encoded_content = json.dumps(message_content).encode("utf-8")
    encoded_length = struct.pack("=I", len(encoded_content))
    return {
        "length": encoded_length,
        "content": struct.pack(str(len(encoded_content)) + "s", encoded_content),
    }


# Send an encoded message to stdout.
def send_message(message):
    encoded_message = encode_message(message)
    sys.stdout.buffer.write(encoded_message["length"])
    sys.stdout.buffer.write(encoded_message["content"])
    sys.stdout.buffer.flush()


def add_jabref_entry(data):
    cmd = JABREF_PATH + " -importBibtex " + '"' + data + '"'
    try:
        response = subprocess.check_output(shlex.split(cmd), stderr=subprocess.STDOUT)
    except subprocess.CalledProcessError as exc:
        logger.error("Failed to call JabRef: %s %s", exc.returncode, exc.output)
    else:
        logger.info(f"Called JabRef and got: %s", response)
    return response


logger.info("Starting JabRef backend")

try:
    message = get_message()
except Exception as e:
    message = str(e)
logger.info(str(message))

if "status" in message and message["status"] == "validate":
    cmd = JABREF_PATH + " -version"
    try:
        response = subprocess.check_output(
            shlex.split(cmd), stderr=subprocess.STDOUT, shell=True
        )
    except subprocess.CalledProcessError as exc:
        logger.error("Failed to call JabRef: %s %s", exc.returncode, exc.output)
        send_message({"message": "jarNotFound", "path": JABREF_PATH})
    else:
        logger.info(f"Found JabRed binary: %s", response)
        send_message({"message": "jarFound"})
else:
    entry = message["text"]
    output = add_jabref_entry(entry)
    send_message({"message": "ok", "output": str(output)})