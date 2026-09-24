"""Convert the owner's MPG pronunciation library to browser media.

Usage: python scripts/prepare-pinyin-media.py SOURCE_DIR --ffmpeg FFMPEG_EXE
The source files are read-only; provenance is written to the excluded audit folder.
"""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('source', type=pathlib.Path)
parser.add_argument('--ffmpeg', required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
dest = root / 'media/pinyin'
dest.mkdir(parents=True, exist_ok=True)
renames = {'ch1': 'ch', 'zh1': 'zh', 'sh1': 'sh', 'r1': 'r', 'ue': 've'}

def run(arguments):
    return subprocess.run([args.ffmpeg, '-hide_banner', *arguments], capture_output=True, check=True)

def describe(file):
    return {'path': file.relative_to(root).as_posix(), 'bytes': file.stat().st_size,
            'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}

files = []
for source in sorted(args.source.glob('*.mpg')):
    key = renames.get(source.stem, source.stem)
    probe = subprocess.run([args.ffmpeg, '-hide_banner', '-i', str(source)], capture_output=True).stderr.decode('utf8', errors='replace')
    match = re.search(r'Duration: (\d+):(\d+):([\d.]+)', probe)
    duration = int(match[1])*3600 + int(match[2])*60 + float(match[3])
    video, audio, poster = [dest / (key + ext) for ext in ['.mp4', '.mp3', '.webp']]
    # The legacy MPEG SAR is inconsistent with its 352x288 frame. Keep its actual
    # pixel geometry: do not stretch, crop, upscale, retouch or replace the mouth.
    run(['-v', 'error', '-y', '-i', str(source), '-map', '0:v:0', '-map', '0:a:0',
         '-vf', 'setsar=1', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
         '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', str(video)])
    run(['-v', 'error', '-y', '-i', str(source), '-map', '0:a:0', '-vn',
         '-c:a', 'libmp3lame', '-b:a', '96k', str(audio)])
    run(['-v', 'error', '-y', '-ss', str(duration/2), '-i', str(source),
         '-frames:v', '1', '-vf', 'setsar=1', '-c:v', 'libwebp', '-quality', '85', str(poster)])
    files.append({'id': key, 'sourceFile': source.name,
                  'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                  'duration': duration, 'video': describe(video), 'audio': describe(audio),
                  'poster': describe(poster)})
manifest = {'version': 1, 'sourceDirectory': str(args.source.resolve()),
            'sourceType': 'owner-provided-local-library', 'files': files,
            'conversion': 'H.264/AAC MP4, 352x288 square pixels; full duration; unchanged frame content; MP3 audio fallback from the same clip.'}
output = root / 'docs/pinyin/basic-media-manifest.json'
output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps({'videos': len(files), 'durationSeconds': round(sum(f['duration'] for f in files),2),
                  'videoBytes': sum(f['video']['bytes'] for f in files),
                  'audioBytes': sum(f['audio']['bytes'] for f in files)}, indent=2))
