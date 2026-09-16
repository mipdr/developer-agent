#!/usr/bin/env python3
"""
Local speech-to-text transcription using faster-whisper.
This replaces OpenAI's Whisper API with a local, self-hosted solution.
"""
import sys
import os
from faster_whisper import WhisperModel

def transcribe_audio(audio_file_path: str, model_size: str = "base") -> str:
    """
    Transcribe audio file using faster-whisper locally.

    Args:
        audio_file_path: Path to the audio file (supports ogg, mp3, wav, etc.)
        model_size: Whisper model size (tiny, base, small, medium, large)
                   Default is 'base' for a good balance of speed and accuracy.

    Returns:
        Transcribed text
    """
    if not os.path.exists(audio_file_path):
        raise FileNotFoundError(f"Audio file not found: {audio_file_path}")

    # Initialize the model (downloads on first use, cached afterward)
    # compute_type="int8" for CPU efficiency, "float16" for GPU
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    # Transcribe
    segments, info = model.transcribe(audio_file_path, beam_size=5)

    # Combine all segments into one text
    transcription = " ".join([segment.text for segment in segments])

    return transcription.strip()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: transcribe.py <audio_file_path> [model_size]", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"

    try:
        text = transcribe_audio(audio_path, model_size)
        print(text)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
