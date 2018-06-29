#!/usr/bin/python -u

# Note that running python with the `-u` flag is required on Windows,
# in order to ensure that stdin and stdout are opened in binary, rather
# than text, mode.

import json
import sys
import struct
import subprocess
import shlex


INIT_LOGGER = False
LOG_FILE = "jabfox_backend_log.txt"
def logger(msg):
    global INIT_LOGGER, LOG_FILE
    if INIT_LOGGER:
        with open(LOG_FILE, "a") as f:
            f.write(msg)
    else:
        INIT_LOGGER = True
        with open(LOG_FILE, "w") as f:
            f.write(msg)
        

# Read a message from stdin and decode it.
def get_message():
    raw_length = sys.stdin.read(4)
    if not raw_length:
        logger("[ERROR] Raw_length \n")
        sys.exit(0)
    message_length = struct.unpack('=I', raw_length)[0]
    logger("[INFO] Got length: {} bytes to be read\n".format(message_length))
    message = sys.stdin.read(message_length)
    logger("[INFO] Got message of {} chars\n".format(len(message)))
    data = json.loads(message)
    logger("[INFO] Successfully retrieved JSON\n")
    return data


# Encode a message for transmission, given its content.
def encode_message(message_content):
    encoded_content = json.dumps(message_content)
    encoded_length = struct.pack('=I', len(encoded_content))
    return {'length': encoded_length, 'content': encoded_content}


# Send an encoded message to stdout.
def send_message(encoded_message):
    sys.stdout.write(encoded_message['length'])
    sys.stdout.write(encoded_message['content'])
    sys.stdout.flush()

def add_jabref_entry(data):
    cmd = "/usr/bin/jabref -importBibtex " + data
    proc = subprocess.call(shlex.split(cmd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    logger(proc.stdout)
    logger("test")
    return proc.stdout


logger("[INFO] Starting JabRef backend\n")

try:
    message = get_message()
except Exception as e:
    message = str(e)
entry = message["text"]
logger(str(entry) + "\n")
add_jabref_entry(entry)
send_message(encode_message({"message": "ok", "output": "to be done"}))
    

