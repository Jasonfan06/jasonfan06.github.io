#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
for photo_python in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [[ -x "$photo_python" ]] && "$photo_python" -c 'from PIL import Image, ImageCms, ImageOps' >/dev/null 2>&1; then
    export PYTHON="$photo_python"
    break
  fi
done
node scripts/studio-server.mjs --open
if [[ $? -ne 0 ]]; then
  echo "Canoe Studio could not start. Press Return to close."
  read
fi
