export interface RecordedVoiceResult {
  dataUrl: string;
  mimeType: string;
  durationSec: number;
}

export interface ActiveVoiceRecorder {
  stop: () => Promise<RecordedVoiceResult>;
  cancel: () => void;
  mimeType: string;
}

const PREFERRED_AUDIO_MIMES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

export function getSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  for (const mime of PREFERRED_AUDIO_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // Continue checking next format
    }
  }
  return '';
}

export async function startRealVoiceRecording(): Promise<ActiveVoiceRecorder> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== 'function'
  ) {
    throw new Error(
      'Microphone access is not supported in this browser or requires an HTTPS connection.'
    );
  }

  if (typeof MediaRecorder === 'undefined') {
    throw new Error('Audio recording (MediaRecorder API) is not supported in this browser.');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new Error(
        'Microphone permission was denied. Please allow microphone access in your browser settings and try again.'
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new Error('No microphone was detected on this device.');
    }
    throw new Error(
      `Could not access microphone: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }

  const chosenMime = getSupportedAudioMimeType();
  const recorder = chosenMime
    ? new MediaRecorder(stream, { mimeType: chosenMime })
    : new MediaRecorder(stream);

  const chunks: Blob[] = [];
  const startTimeMs = Date.now();
  let canceled = false;

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const stopTracks = () => {
    stream.getTracks().forEach((tr) => tr.stop());
  };

  recorder.start(250);

  return {
    mimeType: recorder.mimeType || chosenMime || 'audio/webm',
    cancel: () => {
      canceled = true;
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {
        // Ignore
      }
      stopTracks();
    },
    stop: () =>
      new Promise<RecordedVoiceResult>((resolve, reject) => {
        if (canceled) {
          stopTracks();
          reject(new Error('Recording was canceled.'));
          return;
        }

        recorder.onerror = () => {
          stopTracks();
          reject(new Error('An error occurred while finalizing the voice recording.'));
        };

        recorder.onstop = () => {
          stopTracks();
          if (canceled) {
            reject(new Error('Recording was canceled.'));
            return;
          }
          const durationSec = Math.max(1, Math.round((Date.now() - startTimeMs) / 1000));
          const finalMime = recorder.mimeType || chosenMime || 'audio/webm';
          const blob = new Blob(chunks, { type: finalMime });

          if (blob.size === 0) {
            reject(new Error('No audio was captured. Please hold/record for at least 1 second.'));
            return;
          }

          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to encode recorded audio.'));
          reader.onload = () => {
            resolve({
              dataUrl: String(reader.result),
              mimeType: finalMime,
              durationSec,
            });
          };
          reader.readAsDataURL(blob);
        };

        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          stopTracks();
          reject(new Error('Voice recorder was not active.'));
        }
      }),
  };
}
