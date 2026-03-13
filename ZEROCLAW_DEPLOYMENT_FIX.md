# ZeroClaw Deployment Fix

## Issue
The agent deployment is failing with a 404 error when trying to download ZeroClaw:

```
curl: (22) The requested URL returned error: 404
https://github.com/zeroclaw-labs/zeroclaw/releases/latest/download/zeroclaw-x86_64-unknown-linux-gnu.tar.gz
```

## Root Cause
The ZeroClaw repository doesn't have a "latest" release available at the expected URL. This is a common issue with GitHub releases where the "latest" endpoint may not exist or the release assets have different names.

## Solution Applied

### 1. Enhanced Dockerfile with Fallback
Updated `claw-infra/agent/Dockerfile` to handle missing ZeroClaw releases gracefully:

- **Graceful Failure**: If the download fails, creates a placeholder script instead of failing the build
- **Clear Error Messages**: The placeholder script explains what happened
- **Build Continues**: The container builds successfully even without ZeroClaw

### 2. Alternative Solutions

#### Option A: Use a Specific Version (Recommended)
If you know a working ZeroClaw version, specify it explicitly:

```dockerfile
ARG ZEROCLAW_VERSION=v0.4.2
```

#### Option B: Skip ZeroClaw Installation
If ZeroClaw isn't critical for your deployment, you can comment out the installation:

```dockerfile
# RUN ARCH=$(dpkg --print-architecture) && \
#     ... (ZeroClaw installation code)
```

#### Option C: Manual Installation
Install ZeroClaw manually after deployment:

```bash
# SSH into your container and install manually
curl -L https://github.com/zeroclaw-labs/zeroclaw/releases/download/v0.4.2/zeroclaw-x86_64-unknown-linux-gnu.tar.gz -o zeroclaw.tar.gz
tar -xzf zeroclaw.tar.gz
sudo mv zeroclaw /usr/local/bin/
chmod +x /usr/local/bin/zeroclaw
```

## Verification

After the fix, the deployment should:

1. **Build Successfully**: No more 404 errors during Docker build
2. **Show Warning**: If ZeroClaw isn't available, you'll see a warning message
3. **Container Starts**: The application starts normally
4. **ZeroClaw Status**: Check if ZeroClaw is available with `zeroclaw --version`

## Finding Available Versions

To find available ZeroClaw versions:

1. **Visit GitHub Releases**: https://github.com/zeroclaw-labs/zeroclaw/releases
2. **Check Available Assets**: Look for releases with the binary assets
3. **Update Dockerfile**: Use a specific version that has the required assets

Example of checking available versions:
```bash
curl -s https://api.github.com/repos/zeroclaw-labs/zeroclaw/releases | jq '.[].tag_name'
```

## Long-term Solution

1. **Pin to Specific Version**: Always use a specific version instead of "latest"
2. **Version Management**: Keep track of ZeroClaw versions that work with your setup
3. **Fallback Strategy**: Always have a fallback plan when external dependencies fail

## Files Modified

- `claw-infra/agent/Dockerfile` - Added graceful fallback for missing ZeroClaw releases

The deployment should now succeed even if ZeroClaw isn't available, allowing you to fix the materialized views issue while addressing the ZeroClaw dependency separately.