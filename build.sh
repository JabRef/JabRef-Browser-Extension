#!/bin/bash

# Transpile Connector React files with babel for serving on a remote repo server

./node_modules/.bin/babel "src/connector" --out-dir "build"
cp package.json build/.