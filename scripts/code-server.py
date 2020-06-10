#!/usr/bin/env python3

# Simple code repo server for testing during development

import http.server
import socketserver
import os

PORT = 8090

serve_dir = os.path.join(os.path.dirname(__file__), '../build')
os.chdir(serve_dir)

Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print("serving at port", PORT)
    httpd.serve_forever()