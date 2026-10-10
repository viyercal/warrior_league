"""Create a textured GLB through Microsoft's public TRELLIS.2 demo.

Use a dedicated local Python environment with gradio_client installed.
The input is a project-owned character image. Gradio uses HF_TOKEN when it is
provided through the local credential helper. No paid endpoint is selected
implicitly. The public demo enforces anonymous and signed-in GPU quotas.
"""
import argparse
import hashlib
import json
import shutil
import struct
import tempfile
import time
from pathlib import Path

from gradio_client import Client, handle_file

parser = argparse.ArgumentParser()
parser.add_argument('image', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('--resolution', choices=['512', '1024', '1536'], default='1024')
parser.add_argument('--faces', type=int, choices=range(100000, 500001), default=100000, metavar='100000..500000')
parser.add_argument('--texture-size', type=int, choices=[1024, 2048, 4096], default=2048)
parser.add_argument('--seed', type=int, default=41)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
record = {
    'provider': 'https://huggingface.co/spaces/microsoft/TRELLIS.2',
    'input': str(args.image),
    'inputSha256': hashlib.sha256(args.image.read_bytes()).hexdigest(),
    'resolution': args.resolution,
    'decimationTarget': args.faces,
    'textureSize': args.texture_size,
    'seed': args.seed,
    'status': 'starting',
}
started = time.monotonic()

def stage(name):
    record['status'] = name
    record['elapsedSeconds'] = round(time.monotonic() - started, 2)
    (args.output / 'generation.json').write_text(json.dumps(record, indent=2) + '\n')
    print(name, record['elapsedSeconds'], flush=True)

def validate_glb(path):
    """Reject truncated, malformed or externally dependent model containers."""
    data = path.read_bytes()
    if len(data) < 20:
        raise ValueError('GLB is shorter than its header and first chunk')
    magic, version, length = struct.unpack_from('<4sII', data)
    if magic != b'glTF' or version != 2 or length != len(data):
        raise ValueError('Invalid GLB version or declared file length')
    offset, chunks = 12, []
    while offset < length:
        if offset + 8 > length:
            raise ValueError('Truncated GLB chunk header')
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if size % 4 or offset + size > length:
            raise ValueError('Invalid GLB chunk alignment or boundary')
        chunks.append((kind, data[offset:offset + size]))
        offset += size
    if not chunks or chunks[0][0] != 0x4E4F534A:
        raise ValueError('GLB must start with a JSON chunk')
    document = json.loads(chunks[0][1])
    if document.get('asset', {}).get('version') != '2.0' or not document.get('meshes'):
        raise ValueError('GLB does not contain a glTF 2.0 mesh')
    if any('uri' in item for item in document.get('buffers', []) + document.get('images', [])):
        raise ValueError('Expected a self-contained GLB without external resources')
    binary = next((chunk for kind, chunk in chunks if kind == 0x004E4942), None)
    if binary is None or not document.get('buffers') or len(binary) < document['buffers'][0]['byteLength']:
        raise ValueError('GLB binary mesh payload is missing or truncated')

try:
    stage('connecting')
    client = Client('microsoft/TRELLIS.2', verbose=False, download_files=str(args.output / 'downloads'))
    record['sessionHash'] = client.session_hash
    client.predict(api_name='/start_session')
    stage('preprocessing')
    image = client.predict(input=handle_file(str(args.image.resolve())), api_name='/preprocess_image')
    if isinstance(image, dict):
        image = image.get('path') or image.get('url')
    stage('generating-textured-geometry')
    preview = client.predict(image=handle_file(image), seed=args.seed, resolution=args.resolution, api_name='/image_to_3d')
    (args.output / 'provider-preview.html').write_text(preview)
    stage('extracting-glb')
    extracted, download = client.predict(decimation_target=args.faces, texture_size=args.texture_size, api_name='/extract_glb')
    target = args.output / 'character.glb'
    # Publish atomically only after validation; a provider failure must not
    # replace a previous valid asset with an incomplete download.
    with tempfile.NamedTemporaryFile(dir=args.output, suffix='.glb', delete=False) as stream:
        temporary = Path(stream.name)
    try:
        shutil.copyfile(download, temporary)
        validate_glb(temporary)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    record['output'] = str(target)
    record['outputSha256'] = hashlib.sha256(target.read_bytes()).hexdigest()
    record['bytes'] = target.stat().st_size
    stage('complete')
except Exception as error:
    record['error'] = f'{type(error).__name__}: {error}'
    stage('failed')
    raise
