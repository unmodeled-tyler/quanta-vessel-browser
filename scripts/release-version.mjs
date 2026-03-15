import { pathToFileURL } from "node:url";

export function parseVersion(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid semantic version: ${value}`);
  }

  return match.slice(1).map((part) => Number.parseInt(part, 10));
}

export function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }

  return 0;
}

export function incrementPatch(value) {
  const [major, minor, patch] = parseVersion(value);
  return `${major}.${minor}.${patch + 1}`;
}

export function nextReleaseVersion(packageVersion, tags = []) {
  let latestVersion = packageVersion;

  for (const tag of tags) {
    if (!tag.trim()) {
      continue;
    }

    if (compareVersions(tag, latestVersion) > 0) {
      latestVersion = tag;
    }
  }

  return incrementPatch(latestVersion);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [packageVersion, ...tags] = process.argv.slice(2);

  if (!packageVersion) {
    console.error("Usage: node scripts/release-version.mjs <package-version> [tags...]");
    process.exit(1);
  }

  process.stdout.write(nextReleaseVersion(packageVersion, tags));
}
