import pathlib
import shutil
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parents[1]
base = 'd690a8c63e161d6257e5f0b165fb3d9b6b40ea1f'
subprocess.run(['git', 'diff', '--exit-code', 'HEAD'], cwd=root, check=True)
compiled_app = root / 'packages/twenty-server/dist/app.module.js'
if not compiled_app.exists() or not compiled_app.read_text().startswith('"use strict";'):
    raise SystemExit('Build the server with nest build --path ./tsconfig.build.json before packaging')
destination = pathlib.Path(sys.argv[1]).resolve()
if destination.exists():
    raise SystemExit('Use a new empty packaging directory')
destination.mkdir(parents=True)
shutil.copy2(root / 'hypertech/Dockerfile', destination / 'Dockerfile')
changed = subprocess.check_output(
    ['git', 'diff', '--name-only', base, 'HEAD'], cwd=root, text=True
).splitlines()
server_prefix = 'packages/twenty-server/src/'
for path in changed:
    if not path.startswith(server_prefix) or not path.endswith('.ts') or path.endswith('.spec.ts') or '/__tests__/' in path:
        continue
    relative = pathlib.Path(path.removeprefix(server_prefix)).with_suffix('.js')
    source = root / 'packages/twenty-server/dist' / relative
    target = destination / 'server' / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    shutil.copy2(str(source) + ".map", str(target) + ".map")
shutil.copytree(root / 'packages/twenty-front/build', destination / 'front')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
(destination / 'source-commit').write_text(commit + '\n')
print('Packaged source commit', commit)
