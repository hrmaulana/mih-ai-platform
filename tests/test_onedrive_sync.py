"""Host sync contract; a PATH stub prevents all real rclone/cloud calls."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/sync-onedrive-office.sh"


class OneDriveSyncTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.config = self.root / "rclone.conf"
        self.config.write_text("[onedrive]\ntype = onedrive\n")
        self.capture = self.root / "args.json"
        stub = self.root / "rclone"
        stub.write_text(
            "#!/usr/bin/env python3\n"
            "import json, os, sys, time\n"
            "with open(os.environ['CAPTURE'], 'w') as f: json.dump(sys.argv[1:], f)\n"
            "time.sleep(float(os.environ.get('STUB_SLEEP', '0')))\n"
            "sys.exit(int(os.environ.get('STUB_EXIT', '0')))\n"
        )
        stub.chmod(0o755)
        self.env = {
            **os.environ,
            "PATH": f"{self.root}:/usr/bin:/bin",
            "RCLONE_CONFIG": str(self.config),
            "RCLONE_SOURCE": "onedrive:Pengetahuan PMP",
            "RCLONE_DESTINATION": "/data/mih/rclone/Pengetahuan PMP",
            "RCLONE_LOCK_FILE": str(self.root / "sync.lock"),
            "RCLONE_TIMEOUT": "5s",
            "CAPTURE": str(self.capture),
            "STUB_SLEEP": "0",
            "STUB_EXIT": "0",
        }

    def run_sync(self, **overrides):
        return subprocess.run(
            ["bash", str(SCRIPT)], env={**self.env, **overrides},
            capture_output=True, text=True, timeout=10,
        )

    def test_copies_only_office_folder_with_explicit_config(self):
        result = self.run_sync()
        self.assertEqual(result.returncode, 0, result.stderr)
        args = json.loads(self.capture.read_text())
        self.assertEqual(args, [
            "copy", "onedrive:Pengetahuan PMP", "/data/mih/rclone/Pengetahuan PMP",
            "--config", str(self.config),
        ])

    def test_rejects_unsafe_sources_destinations_and_config(self):
        cases = [
            {"RCLONE_SOURCE": "onedrive:"},
            {"RCLONE_SOURCE": "onedrive:/"},
            {"RCLONE_SOURCE": "onedrive:Backup MIH"},
            {"RCLONE_SOURCE": "onedrive:Pengetahuan PMP/../Backup MIH"},
            {"RCLONE_DESTINATION": "/data/mih/rclone"},
            {"RCLONE_DESTINATION": "/data/mih/rclone/Backup MIH"},
            {"RCLONE_CONFIG": "relative.conf"},
            {"RCLONE_CONFIG": str(self.root / "missing.conf")},
            {"RCLONE_CONFIG": str(self.root)},
        ]
        for overrides in cases:
            with self.subTest(overrides=overrides):
                self.capture.unlink(missing_ok=True)
                result = self.run_sync(**overrides)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.capture.exists(), "rclone must not run")

    def test_held_lock_prevents_rclone(self):
        import fcntl
        with open(self.env["RCLONE_LOCK_FILE"], "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            result = self.run_sync()
        self.assertEqual(result.returncode, 75, result.stderr)
        self.assertFalse(self.capture.exists())

    def test_timeout_stops_slow_rclone(self):
        result = self.run_sync(RCLONE_TIMEOUT="0.1s", STUB_SLEEP="2")
        self.assertEqual(result.returncode, 124, result.stderr)
        self.assertTrue(self.capture.exists())

    def test_invalid_timeout_is_rejected_before_rclone(self):
        for duration in ("0", "0s", "garbage", "-1", "--help"):
            with self.subTest(duration=duration):
                self.capture.unlink(missing_ok=True)
                result = self.run_sync(RCLONE_TIMEOUT=duration)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse(self.capture.exists())

    def test_rclone_failure_propagates_and_lock_is_released(self):
        self.assertEqual(self.run_sync(STUB_EXIT="7").returncode, 7)
        self.assertEqual(self.run_sync().returncode, 0)


if __name__ == "__main__":
    unittest.main()
