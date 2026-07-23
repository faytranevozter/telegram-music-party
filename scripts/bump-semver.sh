#!/usr/bin/env sh
# Bump semver in VERSION, root package.json, and workspace package.json files.
# Usage: scripts/bump-semver.sh [patch|minor|major]
set -eu

root="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
level="${1:-patch}"
version_file="$root/VERSION"
package_json="$root/package.json"

current="$(tr -d '[:space:]' <"$version_file")"
case "$current" in
  *.*.*) ;;
  *)
    echo "error: invalid VERSION: ${current}" >&2
    exit 1
    ;;
esac

major="${current%%.*}"
rest="${current#*.}"
minor="${rest%%.*}"
patch="${rest#*.}"

case "$level" in
  major)
    major=$((major + 1))
    minor=0
    patch=0
    ;;
  minor)
    minor=$((minor + 1))
    patch=0
    ;;
  patch)
    patch=$((patch + 1))
    ;;
  *)
    echo "error: level must be patch|minor|major" >&2
    exit 1
    ;;
esac

next="${major}.${minor}.${patch}"
printf '%s\n' "$next" >"$version_file"

set_package_version() {
  target="$1"
  if [ ! -f "$target" ]; then
    return 0
  fi
  tmp="$(mktemp)"
  sed -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\\1${next}\\2/" "$target" >"$tmp"
  mv "$tmp" "$target"
  echo "updated ${target#"$root"/}"
}

set_package_version "$package_json"

# Workspace packages (pnpm monorepo)
for pkg in "$root"/apps/*/package.json "$root"/packages/*/package.json; do
  set_package_version "$pkg"
done

# Extension package version shown in Chrome/Firefox
set_package_version "$root/apps/extension/public/manifest.json"

echo "VERSION=${next}"
echo "Next: commit, then tag and push:"
echo "  git tag \"v${next}\" && git push origin \"v${next}\""
