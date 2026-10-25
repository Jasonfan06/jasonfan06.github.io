#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
node scripts/studio-server.mjs --open
if [[ $? -ne 0 ]]; then
  echo "Canoe Studio could not start. Press Return to close."
  read
fi
