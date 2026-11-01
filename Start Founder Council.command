#!/bin/bash
# Double-click this file in Finder to start the Founder Council room.
# Keep the Terminal window it opens running; close it to stop the room.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Download the LTS version from https://nodejs.org, then double-click this file again."
  read -r -p "Press Return to close." _; exit 1
fi
if curl -s localhost:4730/api/health >/dev/null 2>&1; then
  echo "The room is already running. Opening it…"; open "http://localhost:4730"; exit 0
fi
(sleep 2; open "http://localhost:4730") &
npm start
