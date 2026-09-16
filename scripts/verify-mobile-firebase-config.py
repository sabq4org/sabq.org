#!/usr/bin/env python3
"""Validate native Firebase config without printing API keys or OAuth secrets."""
import argparse
import json
import plistlib
import re
from pathlib import Path


def validate(config, platform, identity, expected_project=None):
    if not isinstance(config, dict):
        raise ValueError("Firebase config must be an object")
    if platform == "ios":
        app_id = config.get("GOOGLE_APP_ID", "")
        project = config.get("PROJECT_ID", "")
        number = str(config.get("GCM_SENDER_ID", ""))
        if config.get("BUNDLE_ID") != identity:
            raise ValueError("iOS bundle identifier does not match the target")
        if not config.get("API_KEY"):
            raise ValueError("iOS Firebase API_KEY is missing")
        if config.get("GA4_API_SECRET"):
            raise ValueError("Legacy Measurement Protocol secret must not be bundled")
    else:
        info = config.get("project_info", {})
        project, number = info.get("project_id", ""), str(info.get("project_number", ""))
        clients = [c for c in config.get("client", [])
                   if c.get("client_info", {}).get("android_client_info", {}).get("package_name") == identity]
        if len(clients) != 1:
            raise ValueError("Android config must contain exactly one client matching the target package")
        client = clients[0]
        app_id = client.get("client_info", {}).get("mobilesdk_app_id", "")
        if not any(k.get("current_key") for k in client.get("api_key", [])):
            raise ValueError("Android Firebase API key is missing")
    match = re.fullmatch(r"1:(\d+):" + platform + r":[a-fA-F0-9]+", str(app_id))
    if not match or not project or match.group(1) != number:
        raise ValueError("Firebase app ID, platform and project number must agree")
    if expected_project and project != expected_project:
        raise ValueError("Firebase project does not match the approved project")
    return {"platform": platform, "identity": identity, "project_id": project,
            "app_id": app_id, "project_number": number}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=("ios", "android"), required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--identity", required=True)
    parser.add_argument("--expected-project")
    args = parser.parse_args()
    try:
        raw = args.config.read_bytes()
        config = plistlib.loads(raw) if args.platform == "ios" else json.loads(raw)
        result = validate(config, args.platform, args.identity, args.expected_project)
    except (OSError, ValueError, TypeError, KeyError, AttributeError, plistlib.InvalidFileException):
        # Do not echo parser errors: they can contain config fragments or secrets.
        parser.exit(1, "Firebase config validation failed: check existence, native app identity, project and required fields. No credentials were printed.\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
