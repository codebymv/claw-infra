# ZeroClaw Version Update Guide

This document describes how to update the pinned ZeroClaw version in the agent Docker image.

## Current Version

**v0.1.9a** (pinned in `agent/Dockerfile`, built from source)

## Why Build from Source?

Building ZeroClaw from source ensures:
- **Always available** - No dependency on prebuilt binary availability
- **Architecture support** - Works on any architecture supported by Rust
- **Security** - Full control over the build process
- **Reproducible builds** - Same source always produces same binary
- **Latest fixes** - Get all commits up to the tagged version

## Updating ZeroClaw Version

### 1. Check Available Versions

Visit the ZeroClaw releases page:
https://github.com/zeroclaw-labs/zeroclaw/releases

### 2. Update Dockerfile

Edit `agent/Dockerfile` and change the `ZEROCLAW_VERSION` ARG:

```dockerfile
# Before
ARG ZEROCLAW_VERSION=v0.4.2

# After
ARG ZEROCLAW_VERSION=v0.4.3
```

### 3. Build and Test

```bash
cd agent

# Build with new version
docker build -t claw-agent:test .

# Verify version
docker run --rm claw-agent:test zeroclaw --version
# Should output: zeroclaw v0.4.3

# Test basic functionality
docker run --rm -e BACKEND_INTERNAL_URL=http://host.docker.internal:3000 claw-agent:test
```

### 4. Update Documentation

Update this file with the new current version at the top.

### 5. Commit and Deploy

```bash
git add agent/Dockerfile agent/ZEROCLAW_VERSION_UPDATE.md
git commit -m "chore(agent): update ZeroClaw to v0.4.3"
git push
```

## Building with Custom Version

You can override the version at build time without editing the Dockerfile:

```bash
docker build --build-arg ZEROCLAW_VERSION=v0.4.4 -t claw-agent:custom agent/
```

## Version Compatibility

| ZeroClaw Version | Agent Reporter | Notes |
|---|---|---|
| v0.1.9a | ✅ Compatible | Current pinned version (built from source) |
| v0.1.9-beta.136 | ✅ Compatible | Latest beta (built from source) |
| v0.4.2 | ✅ Compatible | Previous stable (deprecated) |
| v0.4.1 | ✅ Compatible | Previous stable (deprecated) |
| latest | ❌ Blocked | Not allowed (fails at build time) |

## Troubleshooting

### Build fails with "Unsupported arch"

The Dockerfile supports `amd64` (x86_64) and `arm64` (aarch64) only. If you need other architectures, update the architecture detection logic in the Dockerfile.

### Download fails with 404

This issue has been resolved by building from source instead of downloading prebuilt binaries. The Dockerfile now clones the repository and builds ZeroClaw from source, which is more reliable and works for all architectures.

### Version mismatch after build

Clear Docker build cache and rebuild:

```bash
docker build --no-cache -t claw-agent:latest agent/
```

## Rollback Procedure

If a new version causes issues:

1. **Revert Dockerfile:**
```bash
git revert <commit-hash>
```

2. **Or build with previous version:**
```bash
docker build --build-arg ZEROCLAW_VERSION=v0.4.2 -t claw-agent:rollback agent/
```

3. **Deploy rollback image:**
```bash
docker tag claw-agent:rollback claw-agent:latest
# Push to registry and redeploy
```

## CI/CD Integration

### GitHub Actions Example

```yaml
- name: Build Agent
  run: |
    cd agent
    docker build \
      --build-arg ZEROCLAW_VERSION=${{ env.ZEROCLAW_VERSION }} \
      -t claw-agent:${{ github.sha }} \
      .
```

### Railway Example

Railway will automatically use the pinned version from the Dockerfile. No additional configuration needed.

## Security Considerations

- Always verify checksums when downloading ZeroClaw binaries (future enhancement)
- Only use official releases from github.com/zeroclaw-labs/zeroclaw
- Review release notes before updating to understand breaking changes
- Test in staging environment before production deployment

## Related Files

- `agent/Dockerfile` - Contains pinned version
- `PHASE3_IMPLEMENTATION.md` - Implementation details
- `IMPLEMENTATION_SUMMARY.md` - Overall project summary
