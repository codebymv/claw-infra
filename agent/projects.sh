#!/bin/bash

# ZeroClaw project management integration
# This script provides project management capabilities via the project-manager CLI

# Set default user info from environment or use defaults
export ZEROCLAW_USER_ID="${ZEROCLAW_USER_ID:-${TELEGRAM_USER_ID:-zeroclaw-user}}"
export ZEROCLAW_CHAT_ID="${ZEROCLAW_CHAT_ID:-${TELEGRAM_CHAT_ID:-zeroclaw-chat}}"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Execute the project manager with all arguments
exec node "$SCRIPT_DIR/project-manager.js" "$@"