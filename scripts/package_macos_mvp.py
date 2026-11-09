"""Build an Apple Silicon MVP bundle from pinned Godot + CPython artifacts.
No network access or credentials. rcodesign performs local ad-hoc signing only.
"""
import argparse
import hashlib
import plistlib
import os
import stat
import shutil
import subprocess
import struct
import tarfile
import tempfile
import zipfile
from pathlib import Path

PYTHON_SHA256 = '52721745b0fa3196e4d0381fa5c06dda1d54343b90d49d90c3bba52d1171bd98'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--godot-zip', type=Path, required=True)
    parser.add_argument('--python-archive', type=Path, required=True)
    parser.add_argument('--signer', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    assert hashlib.file_digest(args.python_archive.open('rb'), 'sha256').hexdigest() == PYTHON_SHA256, 'Python archive checksum mismatch'
    root = Path(__file__).resolve().parent.parent
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=args.output.parent) as directory:
        stage = Path(directory)
        with zipfile.ZipFile(args.godot_zip) as source:
            for item in source.infolist():
                path = stage/item.filename
                if not path.resolve().is_relative_to(stage.resolve()):
                    raise ValueError('unsafe archive path')
                source.extract(item, stage)
                mode = item.external_attr >> 16
                if mode:
                    path.chmod(mode & 0o777)
        app = next(stage.glob('*.app'))
        resources = app/'Contents/Resources'
        with tarfile.open(args.python_archive) as runtime:
            runtime.extractall(resources, filter='data')
        authority = resources/'authority/server'
        authority.mkdir(parents=True)
        for source in (root/'server').glob('*.py'):
            shutil.copy2(source, authority/source.name)
        shutil.copy2(root/'docs/MVP_LOCAL.md', stage/'LEIA-ME.md')
        shutil.copy2(root/'THIRD_PARTY_NOTICES.md', resources/'THIRD_PARTY_NOTICES.md')
        info = app/'Contents/Info.plist'
        metadata = plistlib.loads(info.read_bytes())
        metadata['LSMinimumSystemVersion'] = '11.0'
        info.write_bytes(plistlib.dumps(metadata))
        executable = app/'Contents/MacOS'/metadata['CFBundleExecutable']
        binary = executable.read_bytes()
        if binary[:4] == b'\xca\xfe\xba\xbe':
            count = struct.unpack_from('>I', binary, 4)[0]
            for index in range(count):
                cpu, _subtype, offset, size, _align = struct.unpack_from('>IIIII', binary, 8+index*20)
                if cpu == 0x0100000C:
                    executable.write_bytes(binary[offset:offset+size])
                    break
            else:
                raise ValueError('Godot export has no ARM64 executable')
        executable.chmod(0o755)
        # Recursively signs the app, runtime executables and extension modules.
        subprocess.run([str(args.signer.resolve()), 'sign', str(app)], check=True)
        with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as destination:
            for path in sorted(stage.rglob('*')):
                if path.is_symlink():
                    item = zipfile.ZipInfo(str(path.relative_to(stage)))
                    item.create_system = 3
                    item.external_attr = (stat.S_IFLNK | 0o777) << 16
                    destination.writestr(item, os.readlink(path))
                elif path.is_file():
                    destination.write(path, path.relative_to(stage))
    digest = hashlib.file_digest(args.output.open('rb'), 'sha256').hexdigest()
    args.output.with_suffix('.zip.sha256').write_text(f'{digest}  {args.output.name}\n')
    print(f'Packaged {args.output}: {digest}')


if __name__ == '__main__':
    main()
