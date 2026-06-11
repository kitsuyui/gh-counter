#!/bin/sh
set -eu
VERSION="${1:?Usage: validate-semver.sh <version>}"
if ! printf '%s' "$VERSION" | grep -Eq '^v[0-9]+[.][0-9]+[.][0-9]+$'; then
  echo "::error::version must match vMAJOR.MINOR.PATCH, got: $VERSION" >&2
  exit 1
fi
