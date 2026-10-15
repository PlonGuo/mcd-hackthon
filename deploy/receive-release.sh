#!/bin/bash
# SSH 专用入口：接收构建文件，或仅回退指定提交；不执行任意远程命令。
set -euo pipefail
umask 077
command="${SSH_ORIGINAL_COMMAND:-}"
action=deploy
if [[ "$command" =~ ^rollback\ ([0-9a-f]{40})$ ]]; then
  action=rollback
  sha="${BASH_REMATCH[1]}"
elif [[ "$command" =~ ^[0-9a-f]{40}$ ]]; then
  sha="$command"
else
  echo 'Expected a full commit SHA or rollback SHA' >&2
  exit 2
fi
exec 9>/srv/mcdebate/deploy.lock
flock -n 9 || { echo 'Another deployment is running' >&2; exit 3; }
release="/srv/mcdebate/releases/$sha"
host="$(cat /srv/mcdebate/public-host)"
[[ "$host" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Missing valid public IPv4 host' >&2; exit 4; }
check_health() {
  local expected="$1"
  for attempt in {1..30}; do
    if curl -fsS --max-time 3 "https://$host/health" |
        /usr/local/bin/node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{process.exit(JSON.parse(s).data.release===process.argv[1]?0:1)}catch{process.exit(1)}})' "$expected"; then
      return 0
    fi
    sleep 1
  done
  return 1
}
restore_previous() {
  local previous
  previous="$(cat "$release/previous" 2>/dev/null || true)"
  if [[ "$previous" == /srv/mcdebate/releases/* && -f "$previous/sha" ]]; then
    ln -sfn "$previous" /srv/mcdebate/current.rollback || return 1
    mv -Tf /srv/mcdebate/current.rollback /srv/mcdebate/current || return 1
    sudo /usr/bin/systemctl restart mcdebate.service || return 1
    check_health "$(cat "$previous/sha")" || return 1
    echo 'Previous release restored and verified'
  else
    echo 'No previous release is available for rollback' >&2
    return 1
  fi
}
if [[ "$action" == rollback ]]; then
  if [[ "$(readlink -f /srv/mcdebate/current || true)" == "$release" ]]; then
    restore_previous
  else
    echo 'Release is no longer current; nothing to roll back'
  fi
  exit
fi
if [[ -e "$release" ]]; then
  echo 'Release already exists; refusing to replace it (use a new commit)' >&2
  exit 5
fi
mkdir "$release"
head -c 10485761 > "$release/server.mjs"
if [[ "$(stat -c %s "$release/server.mjs")" -gt 10485760 ]]; then
  echo 'Bundle exceeds 10 MiB' >&2
  exit 6
fi
/usr/local/bin/node --check "$release/server.mjs"
printf '%s\n' "$sha" > "$release/sha"
printf 'process.env.RELEASE_SHA="%s"; await import("./server.mjs");\n' "$sha" > "$release/start.mjs"
readlink -f /srv/mcdebate/current > "$release/previous" || true
switched=false
committed=false
on_exit() {
  local code=$?
  trap - EXIT INT TERM
  if [[ "$switched" == true && "$committed" != true ]]; then
    echo 'Deployment failed; restoring previous release' >&2
    if ! restore_previous; then echo 'Rollback unavailable or failed; administrator intervention required' >&2; fi
    [[ "$code" -ne 0 ]] || code=1
  fi
  exit "$code"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
ln -sfn "$release" /srv/mcdebate/current.next
switched=true
mv -Tf /srv/mcdebate/current.next /srv/mcdebate/current
sudo /usr/bin/systemctl restart mcdebate.service
check_health "$sha"
committed=true
printf 'Deployed %s\n' "$sha"
