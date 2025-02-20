#!/bin/bash

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"

function usage {
	cat >&2 <<DONE
Usage: $0 [option]
Options
 -g PATTERN          only run tests matching the given pattern (grep)
 -h                  display this help
 -j PATH             path to schema.json (default: from resource/schema/global)
DONE
	exit 1
}

export UTILITIES_SCHEMA_PATH="$SCRIPT_DIR/../resource/schema/global/schema.json"

while getopts "g:hj:" opt; do
	case $opt in
		g)
			GREP="$OPTARG"
			;;
		h)
			usage
			;;
		j)
			UTILITIES_SCHEMA_PATH="$OPTARG"
			;;
		*)
			usage
			;;
	esac
	shift $((OPTIND-1)); OPTIND=1
done

mocha \
	--recursive \
	--file "$SCRIPT_DIR/init.js" \
	--grep "$GREP" \
	-- "$SCRIPT_DIR/tests"
