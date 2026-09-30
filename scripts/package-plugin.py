#!/usr/bin/env python3
"""Build a single-root private plugin archive from explicitly allowed files."""
import json
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'plugin.json').read_text())
name, version = manifest['name'], manifest['version']
assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', name) and len(name) <= 64
assert re.fullmatch(r'\d+\.\d+\.\d+', version)
assert len(manifest['extensions']['com.openai']['interface']['shortDescription']) <= 30
compat = json.loads((root / '.codex-plugin/plugin.json').read_text())
assert (compat['name'], compat['version'], compat['interface']) == (name, version, manifest['extensions']['com.openai']['interface'])
files = [(p, p) for p in ['plugin.json', 'mcp.json', '.mcp.json', '.codex-plugin/plugin.json', 'LICENSE', 'OAUTH.md']]
files += [('PLUGIN.md', 'README.md')]
for folder in ['skills', 'assets']:
    files += [(str(p.relative_to(root)), str(p.relative_to(root))) for p in sorted((root / folder).rglob('*')) if p.is_file()]
for source, _ in files:
    path = root / source
    assert not path.is_symlink(), f'Symlink not allowed: {source}'
    assert root in path.resolve().parents
    if path.suffix in ['.json', '.md']:
        text = path.read_text()
        assert not re.search(r'pmcp_(?:sec|at|rt)_[A-Za-z0-9_-]{16,}', text), f'Possible credential: {source}'
        assert not re.search(r'[?&]apikey=[^\s"<>]+', text), f'Key in URL: {source}'
archive = root / 'dist' / f'{name}-{version}.zip'
archive.parent.mkdir(exist_ok=True)
with ZipFile(archive, 'w', ZIP_DEFLATED) as out:
    for source, dest in files:
        out.write(root / source, f'{name}/{dest}')
print(f'{archive}\n{len(files)} files, {archive.stat().st_size} bytes; no server credentials included.')
