#!/usr/bin/env bash
# Tags the releases in CHANGELOG.md that have no tag yet, and makes each a GitHub release with its section as the
# notes. Run by the release job of .github/workflows/deploy.yml on a push to main; nobody runs it by hand.
#   DRY_RUN=1 bash scripts/release.sh     says what it would do
set -euo pipefail

git fetch --quiet --tags origin 2> /dev/null || true
tagged() { git rev-parse -q --verify "refs/tags/v$1" > /dev/null; }

# From the newest release down to the first one that is tagged and released. Twenty is far more than can pile up.
missing=()
while read -r version; do
	if tagged "$version" && { [ -n "${DRY_RUN:-}" ] || gh release view "v$version" > /dev/null 2>&1; }; then break; fi
	missing=("$version" "${missing[@]+"${missing[@]}"}")
done < <(sed -nE 's/^## ([0-9]+\.[0-9]+\.[0-9]+) - [0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]*$/\1/p' CHANGELOG.md | head -n 20)

if [ "${#missing[@]}" -eq 0 ]; then
	echo "Every release is tagged."
	exit 0
fi

for version in "${missing[@]}"; do
	awk -v version="$version" '/^## / { on = ($2 == version); next } on' CHANGELOG.md > notes.md
	grep -q '^- ' notes.md || { echo "CHANGELOG.md has no entries under $version."; exit 1; }
	printf '\n[All releases](https://fluxbio.link/en/changelog/#v%s)\n' "$version" >> notes.md
	if tagged "$version"; then
		# A run stopped between the tag and the release.
		echo "v$version is tagged and has no release: making the release."
		[ -n "${DRY_RUN:-}" ] || gh release create "v$version" --verify-tag --title "v$version" --notes-file notes.md
		continue
	fi
	# The commit that first wrote this version in package.json, which is the one the release was merged as.
	sha=$(git log --reverse --format=%H -S"\"version\": \"$version\"" -- package.json | head -n 1)
	[ -n "$sha" ] || { echo "No commit sets the version $version in package.json."; exit 1; }
	echo "v$version: tagging $sha."
	[ -n "${DRY_RUN:-}" ] && continue
	if ! gh release create "v$version" --target "$sha" --title "v$version" --notes-file notes.md; then
		# Another run made it meanwhile: that is done, not failed.
		git ls-remote --exit-code --tags origin "refs/tags/v$version" > /dev/null || exit 1
		echo "v$version was tagged by another run."
	fi
done
rm -f notes.md
