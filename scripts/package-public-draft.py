#!/usr/bin/env python3
"""Prepare a separate public-upload draft without changing private bindings."""
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'submission/public-plugin.json').read_text())
name, version = manifest['name'], manifest['version']
private_zip = root / 'dist' / f'{name}-{version}.zip'
output = root / 'dist' / f'{name}-public-draft-{version}.zip'
assert not manifest.get('apps') and not manifest['extensions']['com.openai'].get('apps')
review = manifest['extensions']['com.openai']['review']
assert len(review['test_cases']['positive']) == 5
assert len(review['test_cases']['negative']) == 3
with ZipFile(private_zip) as source, ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for info in source.infolist():
        relative = info.filename.removeprefix(name + '/')
        assert relative != '.app.json'
        data = source.read(info.filename)
        if relative == 'plugin.json':
            data = (json.dumps(manifest, indent=2) + '\n').encode()
        elif relative == '.codex-plugin/plugin.json':
            compat = json.loads(data)
            compat.pop('apps', None)
            compat['interface'] = manifest['extensions']['com.openai']['interface']
            compat['version'] = version
            data = (json.dumps(compat, indent=2) + '\n').encode()
        archive.writestr(info.filename, data)
print(output)
print('DRAFT ONLY: demo recording, reviewer access, verified identity, policy review and live review-case execution remain incomplete.')
