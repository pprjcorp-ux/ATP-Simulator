"""Inspect the downloaded ZIP without executing macOS code.
Checks ARM64 Mach-O ad-hoc CodeDirectory pages and the resource seal.
This is not Apple's Gatekeeper or native runtime validation.
"""
import argparse
import hashlib
import plistlib
import stat
import struct
import zipfile


def verify_macho(data, special_resources=None):
    assert data[:4] == b'\xcf\xfa\xed\xfe', 'expected a thin 64-bit Mach-O'
    assert struct.unpack_from('<I', data, 4)[0] == 0x0100000C, 'not ARM64'
    count = struct.unpack_from('<I', data, 16)[0]
    cursor = 32
    signature = None
    for _ in range(count):
        command, size = struct.unpack_from('<II', data, cursor)
        if command == 0x1D:
            offset, length = struct.unpack_from('<II', data, cursor+8)
            signature = data[offset:offset+length]
        cursor += size
    assert signature, 'no LC_CODE_SIGNATURE'
    magic, _, blobs = struct.unpack_from('>III', signature)
    assert magic == 0xFADE0CC0, 'invalid superblob'
    checked = 0
    for index in range(blobs):
        kind, offset = struct.unpack_from('>II', signature, 12+index*8)
        if kind != 0 and not 0x1000 <= kind < 0x1005:
            continue
        cd = signature[offset:]
        fields = struct.unpack_from('>9I4B', cd)
        assert fields[0] == 0xFADE0C02
        assert fields[3] & 2, 'expected ad-hoc signature'
        hash_offset, slots, limit = fields[4], fields[7], fields[8]
        hash_size, hash_type, page = fields[9], fields[10], 1 << fields[12]
        algorithm = {1: 'sha1', 2: 'sha256', 3: 'sha256', 4: 'sha384'}[hash_type]
        for slot in range(slots):
            expected = cd[hash_offset+slot*hash_size:hash_offset+(slot+1)*hash_size]
            actual = hashlib.new(algorithm, data[slot*page:min((slot+1)*page, limit)]).digest()[:hash_size]
            assert actual == expected, f'invalid signed page {slot}'
        for slot, resource in (special_resources or {}).items():
            assert fields[6] >= slot, 'missing sealed special slot'
            expected = cd[hash_offset-slot*hash_size:hash_offset-(slot-1)*hash_size]
            assert hashlib.new(algorithm, resource).digest()[:hash_size] == expected, f'invalid special slot {slot}'
        checked += slots
    assert checked, 'no CodeDirectory pages'
    return checked


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('archive')
    args = parser.parse_args()
    with zipfile.ZipFile(args.archive) as archive:
        names = archive.namelist()
        app = next(x.split('/')[0] for x in names if '.app/' in x)
        contents = app+'/Contents/'
        resources = plistlib.loads(archive.read(contents+'_CodeSignature/CodeResources'))
        sealed = 0
        for name, record in resources['files2'].items():
            path = contents+name
            if 'hash2' in record:
                assert hashlib.sha256(archive.read(path)).digest() == record['hash2'], name
                sealed += 1
            if 'symlink' in record:
                info = archive.getinfo(path)
                assert stat.S_ISLNK(info.external_attr >>16), name
                assert archive.read(path).decode() == record['symlink'], name
        binaries = pages = 0
        for name in names:
            if not name.startswith(contents):
                continue
            data = archive.read(name)
            if data[:4] == b'\xcf\xfa\xed\xfe':
                special = None
                if '/Contents/MacOS/' in name:
                    special = {1: archive.read(contents+'Info.plist'), 3: archive.read(contents+'_CodeSignature/CodeResources')}
                pages += verify_macho(data, special)
                binaries += 1
        assert binaries > 2
        assert not any(x.endswith('.sqlite3') or '/session-' in x for x in names)
        print(f'Verified: {binaries} ARM64 Mach-O files, {pages} signed pages, {sealed} sealed resources')
        print('Native macOS execution and Gatekeeper assessment remain unverified.')


if __name__ == '__main__':
    main()
