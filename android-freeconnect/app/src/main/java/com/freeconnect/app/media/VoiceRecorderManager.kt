package com.freeconnect.app.media

import android.content.Context
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.util.UUID

/**
 * Offline Voice Note Recorder & Player storing AAC (.m4a) audio files strictly in app-local storage.
 * Encoded audio files are then encrypted and transmitted over Bluetooth Classic RFCOMM via
 * [BluetoothFileTransferManager].
 */
class VoiceRecorderManager(private val context: Context) {

    data class RecordedVoiceNote(
        val filePath: String,
        val fileName: String,
        val durationMs: Long,
        val sizeBytes: Long
    )

    private val voiceDir: File by lazy {
        File(context.filesDir, "freeconnect_voice").apply { mkdirs() }
    }

    private var recorder: MediaRecorder? = null
    private var player: MediaPlayer? = null
    private var currentFile: File? = null
    private var recordStartedAt: Long = 0L

    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    private val _playingFilePath = MutableStateFlow<String?>(null)
    val playingFilePath: StateFlow<String?> = _playingFilePath.asStateFlow()

    fun startRecording(): Result<File> {
        stopPlayback()
        return runCatching {
            val outFile = File(voiceDir, "voice_${UUID.randomUUID().toString().take(8)}.m4a")
            val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            mr.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(32_000) // Compact bitrate ideal for Bluetooth RFCOMM throughput
                setAudioSamplingRate(22_050)
                setOutputFile(outFile.absolutePath)
                prepare()
                start()
            }
            recorder = mr
            currentFile = outFile
            recordStartedAt = System.currentTimeMillis()
            _isRecording.value = true
            outFile
        }
    }

    fun stopRecording(): RecordedVoiceNote? {
        val mr = recorder ?: return null
        val file = currentFile ?: return null
        val duration = (System.currentTimeMillis() - recordStartedAt).coerceAtLeast(500L)
        runCatching {
            mr.stop()
            mr.release()
        }
        recorder = null
        currentFile = null
        _isRecording.value = false

        if (!file.exists() || file.length() == 0L) return null
        return RecordedVoiceNote(
            filePath = file.absolutePath,
            fileName = file.name,
            durationMs = duration,
            sizeBytes = file.length()
        )
    }

    fun cancelRecording() {
        runCatching {
            recorder?.stop()
            recorder?.release()
        }
        recorder = null
        currentFile?.delete()
        currentFile = null
        _isRecording.value = false
    }

    fun togglePlayback(filePath: String) {
        if (_playingFilePath.value == filePath) {
            stopPlayback()
            return
        }
        stopPlayback()
        runCatching {
            player = MediaPlayer().apply {
                setDataSource(filePath)
                prepare()
                setOnCompletionListener {
                    _playingFilePath.value = null
                    release()
                    player = null
                }
                start()
            }
            _playingFilePath.value = filePath
        }
    }

    fun stopPlayback() {
        runCatching {
            player?.stop()
            player?.release()
        }
        player = null
        _playingFilePath.value = null
    }
}
