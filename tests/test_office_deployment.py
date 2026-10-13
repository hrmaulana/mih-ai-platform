"""Deployment contracts; no production commands are executed by this suite."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class WorkflowContract(unittest.TestCase):
    def test_office_only_exact_ci_sha_and_approval(self):
        workflow = (ROOT / '.github/workflows/deploy.yml').read_text()
        self.assertIn('runs-on: [self-hosted, Linux, X64, mih-office-keuanganpmp]', workflow)
        self.assertNotIn('deploy-vps:', workflow)
        self.assertNotIn('workflow_dispatch:', workflow)
        self.assertIn('environment: office-production', workflow)
        self.assertIn("if: ${{ vars.MIH_OFFICE_DEPLOY_ENABLED == 'true' }}", workflow)
        self.assertIn('MIH_OFFICE_DEPLOY_ENABLED: ${{ vars.MIH_OFFICE_DEPLOY_ENABLED }}', workflow)
        self.assertIn('"$FRONTEND_ARTIFACT" --apply', workflow)
        self.assertIn("github.event.workflow_run.head_repository.full_name == github.repository", workflow)
        self.assertIn('ref: ${{ github.event.workflow_run.head_sha }}', workflow)
        self.assertIn('needs.build-frontend-artifact.outputs.sha', workflow)
        self.assertIn('frontend-dist-${{', workflow)
        self.assertIn('npm ci', workflow)
        self.assertIn('npm run build', workflow)
        self.assertNotIn('git -C "$HOME/mih" pull', workflow)
        self.assertIn('python3 -m unittest discover -s tests -p test_office_deployment.py', workflow)


class StorageContract(unittest.TestCase):
    def test_reject_storage_swap_and_accept_existing_office_mounts(self):
        import importlib.util
        import copy
        path = ROOT / 'scripts/deploy-office-preflight.py'
        self.assertTrue(path.exists(), 'office storage guard is missing')
        spec = importlib.util.spec_from_file_location('office_guard', path)
        assert spec is not None and spec.loader is not None
        guard = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(guard)
        config = {'name': 'mih', 'volumes': {'appdata': {'name': 'mih_appdata', 'external': True}}, 'services': {
            'db': {'volumes': [{'type': 'bind', 'source': '/data/mih/pgdata', 'target': '/var/lib/postgresql/data'}]},
            'backend': {'volumes': [{'type': 'volume', 'source': 'appdata', 'target': '/data'}]},
            'worker': {'volumes': [{'type': 'volume', 'source': 'appdata', 'target': '/data'}, {'type': 'bind', 'source': '/home/hrmaulana/mih/data/rclone', 'target': '/data/rclone'}]},
        }}
        live = []
        for service, value in config['services'].items():
            mounts = []
            for mount in value['volumes']:
                mounts.append({'Type': mount['type'], 'Name': 'mih_appdata' if mount['type'] == 'volume' else '',
                    'Source': '/var/lib/docker/volumes/mih_appdata/_data' if mount['type'] == 'volume' else mount['source'],
                    'Destination': mount['target'], 'RW': True})
            live.append({'Name': '/mih-' + service + '-1', 'State': {'Running': True}, 'Config': {'Labels': {
                'com.docker.compose.project': 'mih', 'com.docker.compose.service': service,
                'com.docker.compose.project.working_dir': '/home/hrmaulana/mih',
                'com.docker.compose.project.config_files': '/home/hrmaulana/mih/docker-compose.prod.yml'}}, 'Mounts': mounts})
        volume = [{'Name': 'mih_appdata', 'Mountpoint': '/var/lib/docker/volumes/mih_appdata/_data'}]
        guard.validate_storage(config, live, volume)
        for label, modify in [
            ('project', lambda c, l, v: c.update(name='other')),
            ('database bind', lambda c, l, v: c['services']['db']['volumes'][0].update(source='/data/new-db')),
            ('appdata project', lambda c, l, v: c['volumes']['appdata'].update(name='other_appdata')),
            ('nonexternal volume', lambda c, l, v: c['volumes']['appdata'].update(external=False)),
            ('live mount', lambda c, l, v: l[0]['Mounts'][0].update(Source='/data/wrong')),
            ('live project', lambda c, l, v: l[0]['Config']['Labels'].update({'com.docker.compose.project': 'vps'})),
            ('live directory', lambda c, l, v: l[0]['Config']['Labels'].update({'com.docker.compose.project.working_dir': '/root/mih'})),
            ('extra shadow mount', lambda c, l, v: c['services']['backend']['volumes'].append({'type': 'bind', 'source': '/tmp/new', 'target': '/data/raw'})),
            ('missing volume', lambda c, l, v: v.clear()),
            ('stopped db', lambda c, l, v: l[0]['State'].update(Running=False)),
            ('rclone swap', lambda c, l, v: c['services']['worker']['volumes'][1].update(source='/data/mih/rclone')),
        ]:
            with self.subTest(label=label):
                c, l, v = copy.deepcopy((config, live, volume))
                modify(c, l, v)
                with self.assertRaises(ValueError):
                    guard.validate_storage(c, l, v)


class ReleaseContract(unittest.TestCase):
    def test_artifact_sha_checksums_and_file_boundaries(self):
        import hashlib
        import importlib.util
        import tempfile
        spec = importlib.util.spec_from_file_location('office_guard', ROOT / 'scripts/deploy-office-preflight.py')
        assert spec is not None and spec.loader is not None
        guard = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(guard)
        self.assertTrue(hasattr(guard, 'validate_artifact'), 'CI artifact validator missing')
        sha = 'a' * 40
        with tempfile.TemporaryDirectory() as directory:
            artifact = pathlib.Path(directory)
            (artifact / 'index.html').write_text('<html>release</html>')
            checksum = hashlib.sha256((artifact / 'index.html').read_bytes()).hexdigest()
            (artifact / '.mih-release-sha').write_text(sha + '\n')
            (artifact / '.mih-release-checksums').write_text(checksum + '  ./index.html\n')
            guard.validate_artifact(artifact, sha)
            with self.assertRaises(ValueError):
                guard.validate_artifact(artifact, 'b' * 40)
            (artifact / 'index.html').write_text('corrupted')
            with self.assertRaises(ValueError):
                guard.validate_artifact(artifact, sha)
            (artifact / 'index.html').write_text('<html>release</html>')
            (artifact / 'stale.js').write_text('stale')
            with self.assertRaises(ValueError):
                guard.validate_artifact(artifact, sha)
            (artifact / 'stale.js').unlink()
            (artifact / '.mih-release-checksums').write_text(checksum + '  ../index.html\n')
            with self.assertRaises(ValueError):
                guard.validate_artifact(artifact, sha)
            (artifact / '.mih-release-checksums').write_text(checksum + '  ./index.html\n')
            (artifact / 'symlink').symlink_to(artifact / 'index.html')
            with self.assertRaises(ValueError):
                guard.validate_artifact(artifact, sha)


class ScriptContract(unittest.TestCase):
    def test_explicit_safe_compose_and_no_destructive_checkout(self):
        script = (ROOT / 'scripts/deploy.sh').read_text()
        self.assertIn('DEPLOY_DIR=/home/hrmaulana/mih', script)
        self.assertIn('keuanganpmp', script)
        self.assertIn('status --porcelain=v1 --untracked-files=all', script)
        self.assertIn('checkout --detach "$SHA"', script)
        self.assertIn('-p mih --env-file .env.prod -f docker-compose.prod.yml -f docker-compose.office.yml', script)
        self.assertIn('up -d --no-build --no-deps', script)
        self.assertIn('MIH_OFFICE_DEPLOY_ENABLED', script)
        self.assertNotIn('git clean', script)
        self.assertNotIn('reset --hard', script)
        self.assertNotIn('pull ', script)
        self.assertNotIn('psql', script)
        self.assertNotIn('up -d --no-build db', script)
        self.assertNotIn('npm ', script)
        self.assertIn('external: true', (ROOT / 'docker-compose.office.yml').read_text())
        self.assertIn('name: mih_appdata', (ROOT / 'docker-compose.office.yml').read_text())

    def test_wrong_host_and_dirty_tree_stop_before_mutation(self):
        import os
        import subprocess
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            folder = pathlib.Path(directory)
            log = folder / 'commands'
            sandbox = folder / 'repo'
            sandbox.mkdir()
            script = folder / 'deploy-under-test.sh'
            script.write_text((ROOT / 'scripts/deploy.sh').read_text().replace(
                'DEPLOY_DIR=/home/hrmaulana/mih', 'DEPLOY_DIR=' + str(sandbox)))
            for host, dirty, expected in [('vps', '', 'host'), ('keuanganpmp', '?? local-file', 'dirty'),
                                          ('keuanganpmp', '__ERROR__', 'git status')]:
                with self.subTest(host=host, dirty=dirty):
                    (folder / 'hostname').write_text('#!/bin/sh\nprintf "%s\\n" "' + host + '"\n')
                    status = 'exit 99' if dirty == '__ERROR__' else 'printf "%s\\n" "' + dirty + '"'
                    (folder / 'git').write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$COMMAND_LOG"\ncase "$*" in\n*status*) ' + status + ';;\n*rev-parse*) printf "%s\\n" "' + str(sandbox) + '";;\n*) exit 99;;\nesac\n')
                    (folder / 'docker').write_text('#!/bin/sh\nprintf "UNSAFE docker\\n" >> "$COMMAND_LOG"\nexit 99\n')
                    for name in ('hostname', 'git', 'docker'):
                        (folder / name).chmod(0o755)
                    log.write_text('')
                    result = subprocess.run(['bash', str(script), 'a' * 40, str(folder)],
                        env={**os.environ, 'PATH': str(folder) + ':' + os.environ['PATH'], 'COMMAND_LOG': str(log)},
                        text=True, capture_output=True)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn(expected, result.stderr.lower())
                    commands = log.read_text()
                    for mutation in ('fetch', 'checkout', 'UNSAFE'):
                        self.assertNotIn(mutation, commands)


if __name__ == '__main__':
    unittest.main()
