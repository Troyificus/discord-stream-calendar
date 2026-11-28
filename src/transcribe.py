"""Transcribe a clip's audio into word timings for captions.

Usage: python3 transcribe.py <audio-or-video-file> [model]
Prints JSON to stdout: {"words": [{"start": 0.0, "end": 0.4, "word": "Hello"}, ...]}

Uses faster-whisper on the CPU. The model is downloaded on first use and cached
(HF_HOME, a Docker volume in docker-compose.yml), so later runs start quickly.
"""
import json
import sys

from faster_whisper import WhisperModel


def main():
    if len(sys.argv) < 2:
        print("usage: transcribe.py <file> [model]", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small.en"

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments, _info = model.transcribe(path, word_timestamps=True, vad_filter=True, beam_size=5)

    words = []
    for segment in segments:
        for w in segment.words or []:
            text = w.word.strip()
            if text:
                words.append({"start": round(w.start, 2), "end": round(w.end, 2), "word": text})

    json.dump({"words": words}, sys.stdout)


if __name__ == "__main__":
    main()
