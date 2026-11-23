#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

if ! command -v docker >/dev/null; then
  print -u2 'Установите и откройте Docker Desktop, затем запустите этот файл снова.'
  exit 1
fi
if ! docker --context desktop-linux info >/dev/null 2>&1; then
  docker desktop start
fi
docker --context desktop-linux compose --env-file /dev/null --file compose.yaml up --build -d
print 'Docker Desktop → Containers → bmwquiz-tests → tests → Logs.'
print 'Для повторного запуска нажмите Start на контейнере tests.'
open -a Docker
