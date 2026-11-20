package com.freeconnect.app.security

import android.content.Context
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/**
 * Local App Lock, Private Chat PIN Lock, and BiometricPrompt Security Manager.
 * Uses PBKDF2WithHmacSHA256 salted hashes inside EncryptedSharedPreferences.
 * Never transmits PINs or biometric state off-device.
 */
class SecurityLockManager(private val context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "freeconnect_lock_vault",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    fun isAppPinConfigured(): Boolean = !prefs.getString(KEY_APP_PIN_HASH, null).isNullOrBlank()

    fun isBiometricEnabled(): Boolean = prefs.getBoolean(KEY_BIOMETRIC_ENABLED, false)

    fun setBiometricEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_BIOMETRIC_ENABLED, enabled).apply()
    }

    fun isBiometricHardwareAvailable(): Boolean {
        val manager = BiometricManager.from(context)
        val status = manager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )
        return status == BiometricManager.BIOMETRIC_SUCCESS
    }

    fun setAppPin(pin: String) {
        val (salt, hash) = hashPin(pin)
        prefs.edit()
            .putString(KEY_APP_PIN_SALT, salt)
            .putString(KEY_APP_PIN_HASH, hash)
            .apply()
    }

    fun clearAppPin() {
        prefs.edit()
            .remove(KEY_APP_PIN_SALT)
            .remove(KEY_APP_PIN_HASH)
            .putBoolean(KEY_BIOMETRIC_ENABLED, false)
            .apply()
    }

    fun verifyAppPin(pin: String): Boolean {
        val salt = prefs.getString(KEY_APP_PIN_SALT, null) ?: return false
        val expected = prefs.getString(KEY_APP_PIN_HASH, null) ?: return false
        return constantTimeEquals(computeHash(pin, salt), expected)
    }

    fun setChatPin(peerNodeId: String, pin: String) {
        val (salt, hash) = hashPin(pin)
        prefs.edit()
            .putString("chat_pin_salt_$peerNodeId", salt)
            .putString("chat_pin_hash_$peerNodeId", hash)
            .apply()
    }

    fun removeChatPin(peerNodeId: String) {
        prefs.edit()
            .remove("chat_pin_salt_$peerNodeId")
            .remove("chat_pin_hash_$peerNodeId")
            .apply()
    }

    fun isChatPinProtected(peerNodeId: String): Boolean =
        !prefs.getString("chat_pin_hash_$peerNodeId", null).isNullOrBlank()

    fun verifyChatPin(peerNodeId: String, pin: String): Boolean {
        val salt = prefs.getString("chat_pin_salt_$peerNodeId", null) ?: return false
        val expected = prefs.getString("chat_pin_hash_$peerNodeId", null) ?: return false
        return constantTimeEquals(computeHash(pin, salt), expected)
    }

    fun promptBiometricUnlock(
        activity: FragmentActivity,
        title: String = "Unlock FreeConnect",
        subtitle: String = "Verify your identity to access offline encrypted chats",
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        val executor = ContextCompat.getMainExecutor(activity)
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onError(errString.toString())
                }
            }
        )
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setNegativeButtonText("Use PIN")
            .build()
        prompt.authenticate(info)
    }

    private fun hashPin(pin: String): Pair<String, String> {
        val saltBytes = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val salt = Base64.encodeToString(saltBytes, Base64.NO_WRAP)
        return salt to computeHash(pin, salt)
    }

    private fun computeHash(pin: String, saltBase64: String): String {
        val saltBytes = Base64.decode(saltBase64, Base64.NO_WRAP)
        val spec = PBEKeySpec(pin.toCharArray(), saltBytes, 65_536, 256)
        val bytes = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
        return Base64.encodeToString(bytes, Base64.NO_WRAP)
    }

    private fun constantTimeEquals(a: String, b: String): Boolean {
        if (a.length != b.length) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].code xor b[i].code)
        return diff == 0
    }

    companion object {
        private const val KEY_APP_PIN_SALT = "app_pin_salt"
        private const val KEY_APP_PIN_HASH = "app_pin_hash"
        private const val KEY_BIOMETRIC_ENABLED = "biometric_enabled"
    }
}
