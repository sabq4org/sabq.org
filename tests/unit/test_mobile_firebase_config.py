import copy
import plistlib
import xml.etree.ElementTree as ET
import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location(
    "mobile_config", Path(__file__).parents[2] / "scripts/verify-mobile-firebase-config.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class NativeFirebaseConfigTests(unittest.TestCase):
    def setUp(self):
        self.ios = {"GOOGLE_APP_ID": "1:123:ios:aabb", "PROJECT_ID": "synthetic-test",
                    "GCM_SENDER_ID": "123", "BUNDLE_ID": "com.sabq.sabqorg", "API_KEY": "synthetic"}
        self.android = {"project_info": {"project_id": "synthetic-test", "project_number": "123"},
                        "client": [{"client_info": {"mobilesdk_app_id": "1:123:android:aabb",
                                                    "android_client_info": {"package_name": "com.sabqorg.sabq"}},
                                    "api_key": [{"current_key": "synthetic"}]}]}

    def test_native_configs_match_approved_project_without_exposing_credentials(self):
        for config, platform, identity in [(self.ios, "ios", "com.sabq.sabqorg"),
                                            (self.android, "android", "com.sabqorg.sabq")]:
            result = MODULE.validate(config, platform, identity, "synthetic-test")
            self.assertEqual(result["project_id"], "synthetic-test")
            self.assertNotIn("API_KEY", result)
            self.assertNotIn("api_key", result)

    def test_oauth_only_plist_cannot_enable_analytics(self):
        with self.assertRaises(ValueError):
            MODULE.validate({"BUNDLE_ID": "com.sabq.sabqorg", "CLIENT_ID": "oauth"}, "ios", "com.sabq.sabqorg")

    def test_release_debug_and_other_projects_cannot_be_confused(self):
        for identity, project in [("com.sabqorg.sabq.dev", "synthetic-test"),
                                  ("com.sabqorg.sabq", "another-project")]:
            with self.assertRaises(ValueError):
                MODULE.validate(self.android, "android", identity, project)

    def test_platform_project_number_and_legacy_secret_are_rejected(self):
        for key, value in [("GOOGLE_APP_ID", "1:123:android:aabb"),
                           ("GCM_SENDER_ID", "456"), ("GA4_API_SECRET", "synthetic")]:
            config = copy.deepcopy(self.ios)
            config[key] = value
            with self.assertRaises(ValueError):
                MODULE.validate(config, "ios", "com.sabq.sabqorg")

    def test_ambiguous_android_client_is_rejected(self):
        self.android["client"].append(copy.deepcopy(self.android["client"][0]))
        with self.assertRaises(ValueError):
            MODULE.validate(self.android, "android", "com.sabqorg.sabq")


    def test_native_default_consent_is_denied_before_sdk_startup(self):
        root = Path(__file__).parents[2]
        ios = plistlib.loads((root / "sabq app ios/sabq/Info.plist").read_bytes())
        for key in ["FIREBASE_ANALYTICS_COLLECTION_ENABLED", "FirebaseAutomaticScreenReportingEnabled",
                    "GOOGLE_ANALYTICS_DEFAULT_ALLOW_ANALYTICS_STORAGE", "GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_STORAGE",
                    "GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_USER_DATA", "GOOGLE_ANALYTICS_DEFAULT_ALLOW_AD_PERSONALIZATION_SIGNALS"]:
            self.assertIs(ios.get(key), False, key)
        manifest = ET.parse(root / "android-native/app/src/main/AndroidManifest.xml")
        ns = "{http://schemas.android.com/apk/res/android}"
        data = {e.get(ns + "name"): e.get(ns + "value") for e in manifest.findall(".//meta-data")}
        for key in ["firebase_analytics_collection_enabled", "google_analytics_automatic_screen_reporting_enabled",
                    "google_analytics_default_allow_analytics_storage", "google_analytics_default_allow_ad_storage",
                    "google_analytics_default_allow_ad_user_data", "google_analytics_default_allow_ad_personalization_signals",
                    "google_analytics_adid_collection_enabled"]:
            self.assertEqual(data.get(key), "false", key)


if __name__ == "__main__":
    unittest.main()
