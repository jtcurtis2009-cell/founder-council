#!/bin/bash
# Founder Council: one-time setup for a Mac.
# Double-click this file in Finder (first time: right-click → Open → Open).
# It checks Node.js, installs Claude Code, helps you sign in, then opens the room.
cd "$(dirname "$0")" || exit 1
clear
echo ""
echo "  ◆ Founder Council setup"
echo "  ─────────────────────────"
echo ""

pause_exit() { echo ""; read -r -p "  Press Return to close this window." _; exit "${1:-1}"; }

# 1. Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "  Step 1/3: Node.js is not installed yet."
  echo "  Opening the download page. Install the LTS version (the big button),"
  echo "  then double-click this file again."
  open "https://nodejs.org/en/download"
  pause_exit 1
fi
echo "  ✓ Step 1/3: Node.js $(node -v) is installed."

# 2. Claude Code
if ! command -v claude >/dev/null 2>&1; then
  echo "  … Step 2/3: installing Claude Code (about a minute)."
  if ! npm install -g @anthropic-ai/claude-code >/dev/null 2>&1; then
    echo "  Your Mac needs your login password to finish installing."
    echo "  (Nothing appears while you type it. That's normal.)"
    if ! sudo npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code; then
      echo "  ✖ Claude Code could not be installed. Send a screenshot of this window to Justin."
      pause_exit 1
    fi
  fi
fi
echo "  ✓ Step 2/3: Claude Code $(claude --version 2>/dev/null | head -1) is installed."

# 3. Sign in (only needed once)
echo "  … Step 3/3: checking your Claude sign-in."
check=$(claude -p "Reply with exactly: OK" 2>&1 | head -5)
if echo "$check" | grep -qi "not logged in\|/login\|invalid api key\|authenticate"; then
  echo ""
  echo "  You need to sign in to Claude once:"
  echo "   1. Choose a text style (press Return)."
  echo "   2. Choose \"Claude account with subscription\"."
  echo "   3. Sign in in the browser window that opens and click Authorize."
  echo "   4. When you see the > prompt, type /exit and press Return."
  echo ""
  read -r -p "  Press Return to start the sign-in." _
  claude
fi
echo "  ✓ Step 3/3: signed in."
echo ""
echo "  All set! Opening the room now. Next time, just double-click"
echo "  \"Start Founder Council.command\"."
echo ""
exec "./Start Founder Council.command"
