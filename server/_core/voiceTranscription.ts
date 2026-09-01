/**
 * Voice transcription using local faster-whisper
 * Falls back gracefully if model is not available.
 */
import { ENV } from "./env";
import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export type TranscribeOptions = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code: "FILE_TOO_LARGE" | "INVALID_FORMAT" | "TRANSCRIPTION_FAILED" | "UPLOAD_FAILED" | "SERVICE_ERROR";
  details?: string;
};

function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/m4a': 'm4a',
  };
  return mimeToExt[mimeType] || 'mp3';
}

async function downloadAudio(audioUrl: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get('content-type') || 'audio/mpeg';
  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > 16) {
    throw new Error(`File size is ${sizeMB.toFixed(2)}MB, maximum allowed is 16MB`);
  }
  return { buffer, mimeType };
}

export async function transcribeAudio(
  options: TranscribeOptions
): Promise<TranscriptionResponse | TranscriptionError> {
  try {
    // Download audio
    let audioBuffer: Buffer;
    let mimeType: string;
    try {
      const result = await downloadAudio(options.audioUrl);
      audioBuffer = result.buffer;
      mimeType = result.mimeType;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to fetch audio",
        code: "INVALID_FORMAT",
        details: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Save to temp file
    const ext = getFileExtension(mimeType);
    const tempDir = join(tmpdir(), 'anchor-whisper');
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true });
    }
    const tempFile = join(tempDir, `${Date.now()}.${ext}`);
    writeFileSync(tempFile, audioBuffer);

    try {
      // Run faster-whisper via Python
      const language = options.language || 'zh';
      const prompt = options.prompt || 'Personal task and time planning note';
      
      const cmd = `python -c "
from faster_whisper import WhisperModel
model = WhisperModel('tiny', device='cpu', compute_type='int8')
segments, info = model.transcribe('${tempFile.replace(/'/g, "'\\''")}', language='${language}', beam_size=5, prompt='${prompt.replace(/'/g, "'\\''")}')
print(f'{{info.language}}|{{info.language_probability}}|{{info.duration}}')
for seg in segments:
    print(f'{{seg.start}}|{{seg.end}}|{{seg.text}}')
"`;
      
      const result = execSync(cmd, { encoding: 'utf8', timeout: 60000 });
      const lines = result.trim().split('\n');
      
      if (lines.length < 1) {
        throw new Error('Empty transcription result');
      }

      const [langLine, ...segmentLines] = lines;
      const [detectedLang, langProb, duration] = langLine.split('|');
      
      const segments: WhisperSegment[] = segmentLines
        .filter(l => l.trim())
        .map((line, idx) => {
          const [start, end, text] = line.split('|');
          return {
            id: idx,
            seek: 0,
            start: parseFloat(start) || 0,
            end: parseFloat(end) || 0,
            text: text || '',
            tokens: [],
            temperature: 0.0,
            avg_logprob: 0.0,
            compression_ratio: 1.0,
            no_speech_prob: 0.0,
          };
        });

      return {
        task: "transcribe",
        language: detectedLang || 'zh',
        duration: parseFloat(duration) || 0,
        text: segmentLines.map(l => l.split('|')[2]).filter(Boolean).join(' '),
        segments,
      };
    } finally {
      // Clean up temp file
      try {
        execSync(`del "${tempFile}"`, { shell: 'cmd' });
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    return {
      error: "语音转录失败",
      code: "TRANSCRIPTION_FAILED",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
